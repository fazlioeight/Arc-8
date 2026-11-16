# Deliverable: Risk Stratification Views & Member 360 Risk Display (A8S-64 & A8S-65)

**Jira Story:** [A8S-64](https://oeightio.atlassian.net/browse/A8S-64) — *Risk display on Member 360; rising-risk lists with filters*  
**Jira Deliverable Subtask:** [A8S-65](https://oeightio.atlassian.net/browse/A8S-65) — *Deliverable: Stratification views*  
**Sprint:** Sprint 3 - Risk & Care Journeys  
**Environment (Development):**
- Member 360 Risk Display: `https://dev.arc8-mvp.site/member360/members/1`
- Population Stratification Views: `https://dev.arc8-mvp.site/member360/risk-intelligence`
- Rising-Risk Roster & Filters: `https://dev.arc8-mvp.site/member360/members`

---

## 1. Executive Summary

**A8S-64 & A8S-65** deliver end-to-end clinical risk visibility across both the individual **Member 360 Workspace** and population-level **Stratification & Rising-Risk Worklists**:

1. **Member 360 Risk Display (`/member360/members/:id`):**
   - **Record Header Risk Badge:** Displays the normalized risk tier pill (`Critical`, `High`, `Moderate`, `Low`) alongside the numeric composite risk score (`risk_score_composite`).
   - **Left-Rail Quick Stats & 4-Domain Risk Dimensions:** Renders the member's composite score and color-coded progress bars across **Clinical**, **Utilization**, **Cost**, and **Engagement** risk dimensions (`0.0–10.0` scale).
   - **Right-Rail Explainable Risk Insights Card:** Surfaces the primary clinical/operational drivers behind the member's risk score (`domain`, `score`, `confidence %`, `driver` explanation, and actionable `recommendation`).
2. **Population Stratification Views (`/member360/risk-intelligence`):**
   - **Population Tier KPIs & Risk Distribution:** Displays member counts and population share percentages across `Critical`, `High`, `Moderate` (Rising), and `Low` tiers.
   - **Average Score by Domain:** Computes population-wide average risk scores and high-risk member counts across `Clinical`, `Utilization`, `Cost`, and `Engagement`.
   - **Top Risk Drivers with Domain Filter:** Aggregates population risk drivers with a case-insensitive **Domain Filter** (`All domains`, `Clinical`, `Utilization`, `Cost`, `Engagement`), displaying member count, average score, confidence %, and recommended care intervention.
   - **Highest Composite Risk & Rising-Risk Cohort Table:** Ranks members by composite risk score with all 4 domain scores, `Next best action`, live search, and a **Risk Cohort Filter** (`Rising risk (High & Moderate)`, `Critical`, `High`, `Moderate`, `Low`) with 1-click drill-down into the Member 360 chart.
3. **Filterable Rising-Risk Member Roster (`/member360/members`):**
   - **Saved Cohort Views:** 1-click saved view pills for **`All members`**, **`Critical & High`**, **`Rising risk`** (`Moderate` & `High`), **`In a journey`**, and **`Open tasks`**.
   - **Multi-Attribute Filters & Sorting:** Server-side filtering by **Risk Tier** (`Critical`, `High`, `Moderate`, `Low` — with backend synonym expansion for `rising`, `moderate`, `medium`, `critical`, `complex`), **Active Care Journey**, **Open Tasks**, and sorting by **Risk score (desc)**.

---

## 2. Requirements Traceability Matrix (RTM Mapping)

| Requirement ID | Domain | Requirement Description | Implementation Status |
| :--- | :--- | :--- | :--- |
| **RTM-04 / FR-RSK-01** | Risk Scores & Stratification | Normalized member risk score display with explainable clinical drivers and filterable rising-risk cohort queues | **Implemented & Verified** |
| **FR-HDR-01** | Member 360 Header Risk | Display canonical Risk Tier badge (`Critical`, `High`, `Moderate`, `Low`) and Composite Risk Score in Member 360 header | **Implemented & Verified** |
| **FR-RSK-02** | 4-Domain Risk Breakdown | Display domain-specific risk scores (`Clinical`, `Utilization`, `Cost`, `Engagement`) on Member 360 left rail and population tables | **Implemented & Verified** |
| **FR-RSK-03** | Explainable Risk Drivers | Display itemized risk insights with domain, score, confidence %, driver description, and recommended next action | **Implemented & Verified** |
| **FR-RSK-04** | Stratification & Rising-Risk Filters | Provide population tier distribution, domain filter, rising-risk saved view, and multi-tier roster filtering | **Implemented & Verified** |

---

## 3. Architecture & Code Components

### Backend (`backend/app/`)
- **[`backend/app/services/member360.py`](file:///d:/OnStak-Projects/Arc-8/backend/app/services/member360.py)**:
  - `_canonical_risk_tier()` & `_expand_risk_tiers()`: Normalizes raw feed tiers (`complex` → `Critical`, `rising`/`medium` → `Moderate`) and expands tier filter queries so selecting `Moderate` or `Rising` matches all underlying rising-risk records.
  - `_summarize_member()` & `get_member_detail()`: Serializes `risk_score_composite`, `risk_tier`, `clinical_risk_score`, `utilization_risk_score`, `cost_risk_score`, `engagement_risk_score`, `next_best_action`, and `risk_insights`.
  - `list_risk_insights_all()` & `build_dashboard()`: Serves population-wide risk insights (`GET /api/member360/risk-insights`) and top risk driver rollups (`GET /api/member360/dashboard`).

### Frontend (`frontend/src/pages/platform/member360-lab/`)
- **[`components.js`](file:///d:/OnStak-Projects/Arc-8/frontend/src/pages/platform/member360-lab/components.js)**:
  - `RiskBadge`: Color-coded tier pill with optional composite score display.
  - `MemberSummaryCard` & `RiskMini`: Left-rail **Quick stats** (Composite risk) and **Risk dimensions** (`Clinical`, `Utilization`, `Cost`, `Engagement` mini progress bars).
  - `RiskInsightsCard`: Right-rail explainable risk drivers card on the Member 360 workspace.
- **[`Member360LabRiskIntelligencePage.js`](file:///d:/OnStak-Projects/Arc-8/frontend/src/pages/platform/member360-lab/Member360LabRiskIntelligencePage.js)**:
  - Population stratification dashboard (`/member360/risk-intelligence`) with 4 tier KPI tiles, **Risk distribution** bars, **Average score by domain** card, **Top drivers** table with `Domain` filter, and **Highest composite risk & rising-risk cohorts** table with `Risk cohort` filter and search.
- **[`Member360LabMembersPage.js`](file:///d:/OnStak-Projects/Arc-8/frontend/src/pages/platform/member360-lab/Member360LabMembersPage.js)**:
  - Member roster (`/member360/members`) with `Rising risk` and `Critical & High` saved views, multi-select `Risk tier` filter dropdown, `Journey` and `Tasks` filters, and `Sort: Risk score (desc)`.

---

## 4. QA Verification Guide

1. **Verify Risk Display on Member 360 (`/member360/members/1`):**
   - Open `https://dev.arc8-mvp.site/member360/members/1`.
   - Confirm the top header displays the **Risk Tier** badge and **Composite Risk Score**.
   - In the left rail under **Quick stats** and **Risk dimensions**, confirm **Composite risk** and the 4 domain bars (**Clinical**, **Utilization**, **Cost**, **Engagement**) display numeric scores.
   - In the right rail under **Risk insights**, confirm the composite score, tier badge, and explainable driver cards (domain, score, confidence %, driver text, and recommendation) render.
2. **Verify Stratification Views (`/member360/risk-intelligence`):**
   - Open `https://dev.arc8-mvp.site/member360/risk-intelligence`.
   - Confirm the 4 KPI tiles (**Critical risk**, **High risk**, **Moderate risk**, **Low risk**), **Risk distribution** card, and **Average score by domain** card render non-zero population metrics.
   - In **Top drivers**, use the **Domain** filter dropdown (`Clinical`, `Utilization`, `Cost`, `Engagement`) and verify the driver rows filter accurately.
   - In **Highest composite risk & rising-risk cohorts**, use the **Risk cohort** filter (`Rising risk (High & Moderate)`, `Critical`, etc.) and click any member row to open their Member 360 chart.
3. **Verify Rising-Risk Lists & Filters on Member Roster (`/member360/members`):**
   - Open `https://dev.arc8-mvp.site/member360/members`.
   - Click the **`Rising risk`** or **`Critical & High`** saved view pills at the top, or use the **Risk tier** multi-select dropdown alongside **Journey** and **Tasks** filters, and verify the member list updates and sorts by composite risk score.
