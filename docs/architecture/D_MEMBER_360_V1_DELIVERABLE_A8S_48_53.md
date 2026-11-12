# Deliverable: Member 360 v1 (A8S-48 & A8S-53)

**Jira Story:** [A8S-48](https://oeightio.atlassian.net/browse/A8S-48) — *Member 360: demographics, eligibility/plan, care team, conditions, utilization, pharmacy, recent touches*  
**Jira Deliverable Subtask:** [A8S-53](https://oeightio.atlassian.net/browse/A8S-53) — *Deliverable: Member 360 v1*  
**Sprint:** Sprint 2 - Member 360  
**Environment (Development):** `https://dev.arc8-mvp.site/member360/members/1`

---

## 1. Executive Summary

**Member 360 v1** delivers a unified, single-pane clinical and operational chart for care coordinators, registered nurses, member advocates, and medical coders. It consolidates **7 core domains** of a member's longitudinal record into one screen with sub-second response times, interactive alert badges, and drill-down navigation:

1. **Demographics & Contact** — Full member identity, DOB & calculated age, gender, phone, email, street address, city/state/zip, preferred communication channel, and primary language, with in-place profile editing (`PATCH /api/member360/members/{id}`).
2. **Eligibility & Plan Coverage** — Active/termed coverage status badge (`ELIGIBLE · ACTIVE`), plan name, line of business (Medicare Advantage, Medicaid, Commercial), effective & termination dates (`2026-01-01 → 2026-12-31`), coverage tier, and subscriber relationship.
3. **Care Team & Missing PCP Alert** — Assigned Primary Care Provider (PCP) with quick-edit and in-network provider directory lookup, Care Coordinator, Care Network specialists, and a high-visibility header alert (`⚠️ Missing PCP — Assign In-Network PCP`) when no PCP is assigned.
4. **Conditions (Problems / HCC)** — Active, chronic, and resolved ICD-10 diagnoses with **`★ Primary`** indicator, **`$ HCC`** CMS risk-adjustment revenue-impact badge, severity pill, onset date, and `Recorded by` attribution.
5. **Utilization (Claims & Benefits)** — Top 4-card utilization summary strip (**Plan & Eligibility**, **Acute Utilization** ER visits & Inpatient admissions count, **Total Billed**, and **Plan Paid**), Deductible & Out-of-Pocket Max progress accumulators, and filterable medical/pharmacy/behavioral claims table.
6. **Pharmacy (Medications)** — Active prescriptions with RX number, strength/form, quantity, days supply (`Supply`), prescriber, dispensing `Pharmacy`, **`Star / Adherence`** badge for chronic maintenance therapies (diabetes, statin, RAS hypertension), and high-visibility **`⚠️ 0 refills · Renew / PA`** banner and header badge.
7. **Recent Touches (Interactive Unified Timeline)** — Chronological activity feed combining medical/Rx claims, clinical notes, outbound/inbound SMS & email messages, care tasks, lab results, uploaded documents, care journey enrollments, and completed journey stages, with clickable **`Open →`** deep-link navigation to the corresponding tab.

---

## 2. Requirements Traceability Matrix (RTM Mapping)

| Requirement ID | Domain | Requirement Description | Implementation Status |
| :--- | :--- | :--- | :--- |
| **RTM-03** | Member 360 Workspace | Unified longitudinal chart displaying demographics, eligibility/plan, care team, conditions, utilization, pharmacy, and recent touches | **Implemented & Verified** |
| **FR-HDR-01** | Record Header & Identity | Display Member Name, Member Key, DOB & Age, Gender, Plan, Line of Business, Risk Tier badge, and Composite Risk Score | **Implemented & Verified** |
| **FR-HDR-02** | Missing PCP Alert | Render warning badge (`⚠️ Missing PCP — Assign In-Network PCP`) in header when `primary_care_provider` is unassigned | **Implemented & Verified** |
| **FR-HDR-03** | Interactive Header Alerts | Clickable header pills for Open Care Gaps, Missing HCCs, Active Care Journeys, and `0 refills` prescriptions that deep-link to their respective tabs | **Implemented & Verified** |
| **FR-ELG-01** | Eligibility & Plan | Serialize `coverages` collection on `GET /api/member360/members/{id}` with active/termed status, effective/term dates, coverage tier, and subscriber relationship | **Implemented & Verified** |
| **FR-CG-02** | Conditions & HCC | Display ICD-10 diagnoses with `★ Primary` and `$ HCC` CMS risk-adjustment revenue impact badges | **Implemented & Verified** |
| **FR-CLM-01** | Utilization & Benefits | Display Acute Utilization summary (ER & Inpatient counts, Total Billed, Plan Paid) alongside Deductible & Out-of-Pocket Max progress bars | **Implemented & Verified** |
| **FR-RX-01 / 02** | Pharmacy & Refill Alerts | Display days supply, pharmacy, `Star / Adherence` maintenance drug indicator, and urgent `0 refills` alert banner & row badges | **Implemented & Verified** |
| **FR-TL-01 / CJ-02** | Recent Touches Timeline | Aggregate claims, notes, messages, tasks, labs, documents, and care journey stage completions into an interactive timeline with tab drill-down | **Implemented & Verified** |

---

## 3. Architecture & Code Components

### Backend (`backend/app/`)
- **[`backend/app/schemas/member360.py`](file:///d:/OnStak-Projects/Arc-8/backend/app/schemas/member360.py)**:
  - `Coverage` response schema (`id`, `member_id`, `plan_name`, `line_of_business`, `coverage_status`, `effective_date`, `term_date`, `coverage_tier`, `relationship_to_subscriber`, `is_primary`).
  - `MemberDetailResponse` extended with `coverages: list[Coverage]`.
  - `MemberUpdate` extended with `date_of_birth` alongside contact and care team fields.
- **[`backend/app/services/member360.py`](file:///d:/OnStak-Projects/Arc-8/backend/app/services/member360.py)**:
  - `get_member_detail()` eager-loads `Member360Member.coverages`, serializes coverage spans, and synthesizes an active primary coverage span (`2026-01-01` to `2026-12-31`) from the member's plan and benefit accumulator when `m360_coverages` has no explicit rows.
  - `update_member()` supports updating `date_of_birth`, `phone`, `email`, `address_line1`, `city`, `state`, `zip_code`, `preferred_channel`, `language`, `primary_care_provider`, and `care_coordinator`.

### Frontend (`frontend/src/pages/platform/member360-lab/`)
- **[`Member360LabWorkspace.js`](file:///d:/OnStak-Projects/Arc-8/frontend/src/pages/platform/member360-lab/Member360LabWorkspace.js)**:
  - Orchestrates the Member 360 Workspace (`/member360/members/:memberId`), sub-tab deep-linking (`handleTabChange(newTab, subTab)`), RBAC action guards, and the 4-card **Eligibility, Plan & Acute Utilization** summary strip on the **Claims & Benefits** tab.
- **[`components.js`](file:///d:/OnStak-Projects/Arc-8/frontend/src/pages/platform/member360-lab/components.js)**:
  - `RecordHeader`: Member identity bar, DOB/age, Missing PCP indicator, and clickable alert badges.
  - `MemberSummaryCard`: Left-rail summary organized into **Demographics & Contact**, **Eligibility & Plan**, **Care Team**, **Quick Stats**, and **Risk Dimensions**.
  - `MemberTimeline`: Unified chronological **Recent Touches** feed with filter pills and clickable `Open →` navigation.
- **[`chart/ProblemsHCCPage.jsx`](file:///d:/OnStak-Projects/Arc-8/frontend/src/pages/platform/member360-lab/chart/ProblemsHCCPage.jsx)**:
  - Diagnosed Conditions & HCC table with `★ Primary` and `$ HCC` revenue badges, status/severity pills, and `Recorded by` column.
- **[`chart/MedicationsPage.jsx`](file:///d:/OnStak-Projects/Arc-8/frontend/src/pages/platform/member360-lab/chart/MedicationsPage.jsx)**:
  - Pharmacy & Medications view with `Supply` (`days_supply`), `Pharmacy`, `Star / Adherence` indicator, and `⚠️ 0 refills · Renew / PA` alert banner and badges.

---

## 4. QA Verification Guide

1. **Navigate to Development:** Open `https://dev.arc8-mvp.site/member360/members/1` (Login: `admin@prominencehealth.com` / `admin`, Tenant: `prominencehealth`).
2. **Verify Header & Alerts:**
   - Confirm member name (**Elliot Adams**), DOB & age (`1955-03-30 · 71 yrs`), plan, and risk tier badge render.
   - Click any header alert pill (e.g., **Open Care Gaps**, **Active Journeys**, or **`Rx alert: w/ 0 refills`**) and confirm it navigates directly to the target tab.
3. **Verify Left Sidebar (Demographics, Eligibility/Plan, Care Team):**
   - Confirm **Demographics & Contact** shows DOB/Age, Gender, Phone, Email, Address, City/State/Zip, Channel, and Language.
   - Confirm **Eligibility & Plan** displays `ELIGIBLE · ACTIVE`, Plan Name, Line of Business, Effective Dates (`2026-01-01 → 2026-12-31`), and `Individual (subscriber)`.
   - Confirm **Care Team** displays Primary Care Provider (with **Edit** button), Care Coordinator, and Care Network specialists.
4. **Verify Recent Touches (Timeline Tab):**
   - Confirm recent touches (claims, notes, messages, tasks, labs, documents, care journey stage completions) appear in reverse chronological order.
   - Click **`Open →`** on any timeline row and verify it switches to the matching tab.
5. **Verify Conditions (Clinical & Gaps → Problems / HCC):**
   - Confirm ICD-10 diagnoses display with **`★ Primary`** and **`$ HCC`** badges, severity/status pills, and `Recorded by`.
6. **Verify Pharmacy (Medications & Labs → Medications):**
   - Confirm `Supply` (days supply), `Pharmacy`, **`Star / Adherence`** badges, and **`⚠️ 0 refills · Renew / PA`** alerts render.
7. **Verify Utilization (Claims & Benefits):**
   - Confirm the top 4-card summary strip displays **Plan & Eligibility**, **Acute Utilization** (ER visits & Inpatient admissions), **Total Billed**, and **Plan Paid** above the Deductible / OOP Max accumulators and claims table.
