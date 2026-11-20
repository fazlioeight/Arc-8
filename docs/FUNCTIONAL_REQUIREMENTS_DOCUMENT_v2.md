# Functional Requirements Document (FRD) — Arc-8 (Member 360)

| | |
|---|---|
| **Project** | Arc-8 MVP — Prominence Health First Inc. (SOW No. 3) |
| **Version / Status** | v2.0 — for review by Project Lead, Finance/Payer Lead, QA, Data, DevOps |
| **Sources** | Client walkthrough (Oct 15, 2026), Commercial / Financial Payer View specification (Nov 6, 2026), UHS SFTP 17-feed specification, `docs/architecture/RTM_v0.1_and_Sprint_1_Backlog.md` |
| **Priority key** | P1 = MVP (year-end), P2 = MVP if capacity allows, P3 = deferred |

---

## 1. Introduction

### 1.1 Purpose
Defines the functional behaviour of Arc-8 (v2.0), a "single pane of glass" for Prominence Health Care Advocates, Care Coordinators, Supervisors, and Commercial / Payer Finance Executives. It is the basis for design, development, QA test cases and acceptance.

### 1.2 Business problem
- Call-center agents cannot see prior conversations with a member, so they spend about 15 minutes searching QNXT, which only shows batch data from the previous day.
- Inbound calls (about 60k/month for claim status) are missed chances to close care gaps, assign a PCP, or fix Rx issues.
- Nurses are the highest-cost resource. Routine post-discharge steps should be completable by Advocates.
- Pharmacy friction (0 refills, expired prior auths) hurts CMS Star Ratings and CAHPS.
- Payer executives and financial analysts lack an integrated macro view to track Premium Revenue, Medical Cost PMPM, Medical Loss Ratio (MLR), Operating Margin, Utilization, Star Ratings, and RAF capture across Markets and Provider Groups against Budget and Prior Year benchmarks.
- Printing costs about \$1M/year and documents sit on a legacy file share.

### 1.3 Scope
**In scope (MVP v2.0):** SSO/RBAC, member search and rising-risk roster filters, Member 360 profile and tabs, care intelligence dashboard, **Executive Plan Performance & Financial Dashboard (Payer View)**, tasks/escalation, notes, care journeys, 4-domain risk insights, documents, provider directory, audit logging, admin consoles, and 17-feed UHS SFTP data ingestion.

**Out of scope / deferred:** Talkdesk embedded voice/SMS widget (the `Messages` tab is hidden), member-facing portal (`Portal Preview` hidden), external third-party partner risk feed (internal 4-domain risk scoring is active), ride booking and other monorepo modules (hidden).

### 1.4 Users and roles
| Role | Description | Access |
|---|---|---|
| Care Advocate | Call center agent | Member 360 core tabs, notes, tasks, documents |
| Care Coordinator / Nurse | Clinical follow-up | Same as Advocate, plus Care Journeys |
| Supervisor / Ops | Team oversight | All of the above, plus Audit Log, Sharing, Settings, escalation queue, Plan Performance |
| Payer Executive / Finance | Commercial & MA financial oversight | Plan Performance & Financial Dashboard (aggregate Plan, Market, Provider Group views; restricted from patient-level PHI) |
| Tenant Admin | Prominence admin | Users, roles, tab permissions |
| Master Admin | Vendor (platform owner) | Tenant provisioning, module licensing |

### 1.5 External systems
QNXT / UHS SFTP (17 pipe-delimited feeds: eligibility, member details, PCP, claims, claim edits, accumulators, pharmacy, providers, groups, brokers, call tracking), Project Titan/MRA (HCC gaps), Abarca PBM (medications, refills, PAs), CareAdvance (care journeys), Clarity Financial Analytics (aggregate Plan/Market/Provider Group financial & quality feeds), lab feeds, Talkdesk (call metadata and AI summary).

---

## 2. Functional Requirements

### 2.1 Authentication, Access and Tenancy (RTM-01) — P1
| ID | Requirement |
|---|---|
| FR-AUTH-01 | The system shall authenticate users via OIDC SSO (AWS Cognito/JWKS), with a local-dev fallback only when `ALLOW_DUMMY_LOGIN` is enabled. |
| FR-AUTH-02 | The system shall resolve tenant context from `X-Tenant-Key` and isolate tenant data. |
| FR-AUTH-03 | The system shall enforce RBAC for the Coordinator, Nurse, Supervisor, Payer Executive, Billing, Coder, Compliance Auditor, and Admin personas. `/api/member360/admin/*` is Admin only, and escalation queues are Supervisor/Admin only. |
| FR-AUTH-04 | Unauthenticated or cross-tenant requests shall return 401/403 and write an audit event. |
| FR-AUTH-05 | Access tokens shall expire and refresh tokens shall enforce idle and absolute lifetimes (configurable). |
| FR-AUTH-06 | The portal shall show only in-scope modules (`PORTAL_APPLICATIONS`) and block others by route guard. |
| FR-AUTH-07 | A Care Coordinator shall land directly on the Member 360 workspace after login, and a Payer Executive shall land directly on the Plan Performance Financial Dashboard. |
| FR-AUTH-08 | Deep links `?memberId=<id>` and `?search=<q>` shall open the member profile or search results directly (Talkdesk screen-pop). |
| FR-AUTH-09 | The Payer Executive role shall be restricted to aggregate Plan Performance analytics and blocked (`403`) from accessing individual member PHI records (HIPAA Minimum Necessary policy). |

### 2.2 Member Search (RTM-02) — P1
| ID | Requirement |
|---|---|
| FR-SRCH-01 | Users shall be able to search by Member ID, first/last name, phone, or benefit plan, and filter the member roster by Risk Tier (`Critical`, `High`, `Moderate` / Rising, `Low`), active journey, or open tasks. |
| FR-SRCH-02 | Results shall return in under 500 ms (target under 1 s end-to-end). |
| FR-SRCH-03 | Selecting a result shall open the member chart directly. There shall be no separate "Chart" tab and no redundant quick-search box on the Portal Overview. |

### 2.3 Member 360 Header and Alerts (RTM-03) — P1
| ID | Requirement |
|---|---|
| FR-HDR-01 | The header shall show name, Member ID, DOB/age, gender, plan ID/name, line of business, PCP link (to the Provider Directory profile), normalized Risk Tier badge with composite score, and an amber Gaps badge with count. |
| FR-HDR-02 | If PCP is blank, the header shall show a high-visibility "Missing PCP" alert and allow in-network PCP assignment. |
| FR-HDR-03 | The header shall surface clickable alerts for open care gaps, missing HCCs, an active care journey, and Rx 0 refills or expiring PA that jump directly to the relevant tab. |
| FR-HDR-04 | The left sidebar shall show Demographics & Contact, active/termed Eligibility & Plan coverage dates, Care Team, and 4-domain risk dimension bars (`Clinical`, `Utilization`, `Cost`, `Engagement`). |

### 2.4 Member 360 Tabs
| ID | Tab | Requirement | Priority |
|---|---|---|---|
| FR-TL-01 | **Timeline** | Chronological log of all touchpoints (claim ingested, call, care plan review, journey stage, note, document). Each row shall be clickable and drill down to its claim, note, journey or task. | P1 |
| FR-NT-01 | **Notes** | Internal-only notes. Users can paste the Talkdesk AI call summary. Each note records author and time and rejects blank submissions. | P1 |
| FR-NT-02 | **Notes** | `@mention` tagging shall notify the tagged user. | P2 |
| FR-CL-01 | **Claims & Accumulators** | Show acute utilization summary (ER visits, Inpatient admissions, total billed, plan paid) and itemized claim status (paid/pending), billed, paid and member responsibility. | P1 |
| FR-CL-02 | **Claims & Accumulators** | Show Deductible and MOOP progress bars (medical and pharmacy combined). | P1 |
| FR-CG-01 | **Care Gaps & HCCs** | List suspected/open HCC gaps (Project Titan file). When a diagnosis appears on a claim, the ICD-10 moves to Problems/HCC and the gap closes. | P1 |
| FR-CG-02 | **Care Gaps & HCCs** | Show all diagnoses with accurate tab counts, a `Primary` indicator, and a `$`/star badge on CMS revenue/RAF-impact codes. | P1 |
| FR-RX-01 | **Medications** | Show active/historical Rx, days supply, dispensing pharmacy, last fill, refills remaining, prescriber, and a `Star / Adherence` badge on chronic maintenance medications. | P1 |
| FR-RX-02 | **Medications** | Highlight 0 refills and expiring PAs (especially critical drugs such as insulin). | P1 |
| FR-LB-01 | **Labs & Imaging** | Show results (HbA1c, BNP, creatinine, lipids) with High/Abnormal flags, so pre-visit lab completion can be verified. | P1 |
| FR-CJ-01 | **Care Journey** | Show journeys synced from CareAdvance (discharge intake, med reconciliation, cardiology follow-up, 30-day outcome) and SBAR tasks. | P1 |
| FR-CJ-02 | **Care Journey** | Users can Start, Pause, Resume, and Complete stages. Each change is written to the timeline. | P1 |
| FR-DC-01 | **Documents** | Per-member upload, view and download of HRAs, care forms, invoices and lab PDFs, stored encrypted. | P1 |
| FR-DC-02 | **Documents** | A "Send Document to Member" action shall email a document to the member and log the event. | P2 |
| FR-AD-01 | **Audit Log / Sharing / Settings** | Visible to Supervisor, Ops, Compliance Auditor, and Admin only. | P1 |
| FR-HID-01 | Hidden tabs | `Messages`, `Portal Preview` and `Chart` shall not appear in the UI (code retained). | P1 |

### 2.5 Care Intelligence Dashboard (RTM-09) — P1/P2
| ID | Requirement |
|---|---|
| FR-DSH-01 | Show live counts of members in active workflows, high-risk and critical-risk members, open/overdue tasks, active journeys, and estimated/validated care savings (`$`), synchronized with sidebar badges. |
| FR-DSH-02 | Show high-priority members, top population risk drivers, recent activity, and "My To-Dos" for the logged-in user. Clicking a member or task deep-links to the member chart. |

### 2.6 Executive Plan Performance & Financial Dashboard (RTM-12) — P1/P2
| ID | Tab / View | Requirement | Priority |
|---|---|---|---|
| FR-FIN-01 | **Navigation & Access** | Expose the Plan Performance Console (`/member360/plan-performance`) in both the Member 360 sub-navigation bar and the left sidebar under Executive Dashboards. Restrict access by role (`sub:exec_financial` and per-tab permissions) to Payer Executive, Billing, Supervisor, Clinician, Business Admin, and Admin. | P1 |
| FR-FIN-02 | **Hierarchy & Baseline Filters** | Filter all financial, utilization, quality, and risk metrics across the 3-tier payer hierarchy: **Plan Total** (`~138.4k members`) to **4 Markets** (Northern Nevada, Florida, North TX, South TX) to **12 Provider Groups**. Allow toggling variance comparisons between **vs. Budget (`83% MLR Goal`)** and **vs. Prior Year (`2025`)**. | P1 |
| FR-FIN-03 | **Overview** | Show executive KPI cards with sparklines and variance deltas for **Enrollment**, **Premium Revenue (`$M` & PMPM)**, **Medical Cost (`$M` & PMPM)**, **Part A/B MLR %**, **SG&A**, and **Income from Operations (`IOI $M`)**, alongside monthly Revenue vs. Cost trend lines, the **CMS Star Rating dial (`4.0★ Target`)**, and the **Market & Provider Group Performance Table**. | P1 |
| FR-FIN-04 | **Financials** | Show full P&L statement tables (Total `$M` and PMPM `$`) comparing Actual YTD vs. Budget/Prior Year across Part A/B Revenue, Part D Revenue, Total Revenue, Medical Cost, Gross Margin, SG&A, Operating Contribution Ratio (`OCR %`), and `IOI`, plus a diverging **IOI Variance by Driver** bar chart. | P1 |
| FR-FIN-05 | **Medical Cost** | Break down Medical Cost PMPM across **Inpatient (`IP`)**, **Outpatient (`OP`)**, **Professional (`Pro`)**, **Capitation (`Cap`)**, **Part D Pharmacy (`Rx`)**, and **Other**, with YoY % trends, Institutional vs. Professional specialty toggles, and high-cost claimant concentration (`>\$50k`). | P1 |
| FR-FIN-06 | **Provider MLR** | Show Part A/B MLR %, Part D MLR %, and Total Consolidated MLR % across all Markets and Provider Groups against the `83.0%` benchmark, flagging `On track`, `Watch`, and `Off track` groups with monthly MLR trend charts. | P1 |
| FR-FIN-07 | **Utilization** | Show acute and post-acute utilization per 1,000 members: **Admits / 1,000**, **ER Visits / 1,000**, **30-Day Readmission %**, **Observation Stays / 1,000**, and **SNF Days / 1,000** with monthly sparklines and group comparisons. | P1 |
| FR-FIN-08 | **Quality & Star Ratings** | Show gauge dials and scorecards for **Overall CMS Star Rating**, **HEDIS Star**, **Medication Adherence Star (Part D)**, **CAHPS / Member Experience Star**, **HEDIS Composite % (`80% Goal`)**, and **Care Gap Closure %** by Market and Provider Group. | P1 |
| FR-FIN-09 | **Risk Adjustment** | Show **Average RAF Score**, **Existing Burden (`EBUR`)**, **Missing / Suspected Burden (`MBUR`)**, **HCC Capture %**, **Chart Review %**, and **Members Assessed** by Market and Provider Group. | P1 |
| FR-FIN-10 | **Definitions & Scenario Datasets** | Provide a financial/clinical formula dictionary and a **Scenario Dataset Manager** allowing authorized users to switch between pre-loaded scenarios (*Baseline*, *Simulated Revised Q3*), upload and validate custom JSON financial datasets, or restore defaults. | P1 |
| FR-FIN-11 | **VBC RAF & Suspect Dashboard** | Provide an executive risk-adjustment view (`/dashboard`) filterable by Model Year, Line of Business, and Provider Group, showing **Live RAF Delta** (with forecast toggle), **Suspects Funnel**, **Submission Deadline Radar** (CSV export), and **Provider Heatmap**. | P2 |

### 2.7 Tasks and Escalation (RTM-06) — P1
| ID | Requirement |
|---|---|
| FR-TSK-01 | Users can create, assign, filter, update and close tasks linked to a member (with SBAR support and queue capacity up to 500+ tasks). |
| FR-TSK-02 | Coordinators shall have a worklist, and Supervisors a queue of escalated or unresolved tasks requiring a documented escalation reason. |
| FR-TSK-03 | Configurable triggers shall auto-escalate (for example, a missed 48-hour post-discharge follow-up). |

### 2.8 Risk Insights (RTM-04) — P1
| ID | Requirement |
|---|---|
| FR-RSK-01 | Provide a normalized composite risk score and 4 domain scores (`Clinical`, `Utilization`, `Cost`, `Engagement`) with explainable drivers, domain filters, and filterable rising-risk cohorts (`/member360/risk-intelligence`). |

### 2.9 Provider Directory (RTM-10) — P2
| ID | Requirement |
|---|---|
| FR-PRV-01 | Searchable in-network directory keyed by NPI, specialty, and location. |
| FR-PRV-02 | The data model and UI shall support a many-to-many Provider↔Facility/Location relationship. Claims shall carry the billing facility. |
| FR-PRV-03 | PCP assignment shall link a member to a provider profile, and Care Option creation shall validate numeric quality ratings (`0.0–5.0`), cost, and distance. |

### 2.10 Administration — P1/P2
| ID | Requirement |
|---|---|
| FR-ADM-01 | The Master Admin console shall control which modules each tenant has purchased. |
| FR-ADM-02 | The Tenant Admin console shall manage users, role allotment, and module/sub-tab permissions via explicit toggle switches. |
| FR-ADM-03 | The UI shall be branded "Arc-8" across all portals, headers, navigation, and documents (all legacy prototype references removed), with Light and Dark mode support. |

### 2.11 Audit and Compliance (RTM-08) — P1
| ID | Requirement |
|---|---|
| FR-AUD-01 | Every view, modification and export of member data shall record actor, tenant, member, action, IP and timestamp. |
| FR-AUD-02 | Audit records shall be tamper-evident (immutable at the DB level) and written to an append-only PHI audit stream. |
| FR-AUD-03 | Notes, tasks, uploaded documents and journey updates created in Arc-8 shall be retained 10 years (monthly archival snapshots). Source data is not archived by Arc-8. |
| FR-AUD-04 | Only synthetic data shall be used in non-production environments. |

### 2.12 Data Ingestion and Caching — P1
| ID | Requirement |
|---|---|
| FR-DAT-01 | Ingest the 17 pipe-delimited Prominence/UHS QNXT and Call Tracking SFTP feeds (`PHP_To_OEight_*` and `PHP_CallTracking*`), Project Titan/MRA, Abarca, CareAdvance, and lab data via batch ETL into a common data model (PostgreSQL). Import jobs shall be tracked with status and errors. |
| FR-DAT-02 | Data active in the last 30 days shall be served from a Redis hot cache. |
| FR-DAT-03 | Schema changes shall be managed through Alembic migrations. |
| FR-DAT-04 | Events shall be published reliably through the outbox pattern. |

---

## 3. Key Workflows

### 3.1 Inbound Call (Care Advocate / Coordinator)
1. The member calls via Talkdesk. The Advocate opens Arc-8 by screen-pop or search.
2. The Member 360 header loads. The Advocate checks the PCP, Risk Tier, Gaps, Journey and Rx alerts.
3. The Advocate resolves the call driver: Claims & Accumulators, Timeline/Notes, Documents, Care Journey, or Labs/Problems.
4. Before the call ends, the Advocate pastes the AI summary into Notes (with `@mention` if needed) and creates a follow-up task or escalates.
5. The system appends a timeline touchpoint and writes an audit event.

### 3.2 Executive Financial & Plan Performance Review (Payer View)
1. The Payer Executive or Financial Analyst opens the **Plan Performance Console** (`/member360/plan-performance`).
2. The user selects a scenario dataset (*Baseline* or *Simulated Revised Q3*) and filters by **Market** (4 markets), **Provider Group** (12 groups), and **Comparison Mode** (*vs. Budget 83% Goal* or *vs. Prior Year*).
3. The user reviews **Overview**, **Financials**, **Medical Cost**, and **Provider MLR** to identify variance drivers and provider groups exceeding the `83.0%` MLR target, then correlates them with **Utilization**, **Quality & Star Ratings**, and **Risk Adjustment (RAF / MBUR)**.
4. Clinical Supervisors use these macro insights to filter **Risk Intelligence** and the **Member Roster** for rising-risk cohorts and open HCC gaps while Payer Executives remain isolated from patient-level PHI.

## 4. Non-Functional Requirements
| ID | Requirement |
|---|---|
| NFR-01 | **Performance:** search under 500 ms, member profile load within 2 s from hot cache, and Plan Performance tab/filter switches under 100 ms. |
| NFR-02 | **Security:** HIPAA controls, TLS 1.3 in transit, field-level and volume encryption at rest, security headers, rate limiting, MFA readiness, and Payer Executive PHI isolation. |
| NFR-03 | **Availability:** health endpoints `/health/live` and `/health/ready` on AWS Dev and Test, with automated monitoring and backups. |
| NFR-04 | **Portability:** no runtime dependency on Azure services; deployed on AWS EC2 + Docker Compose + CloudFront within SOW budget guardrails. |
| NFR-05 | **Quality:** CI gates for lint, unit tests, SAST, Trivy and SBOM. Deploys via GitHub Actions OIDC with no static keys. |
| NFR-06 | **Usability:** the Advocate completes the core call workflow within a single screen without re-fetching, and Executives navigate all 8 Plan Performance views with persistent filters. |

## 5. Assumptions, Dependencies and Open Items
- Source-system SFTP feed schedules are owned by Prominence/UHS (17 pipe-delimited QNXT and Call Tracking feeds mapped and ingested).
- The Plan Performance Console operates on aggregate entity datasets (Plan $\rightarrow$ Market $\rightarrow$ Provider Group) with zero patient-level PHI coupling required.
- The Talkdesk embedded voice widget is deferred; call summaries are pasted into Notes and URL screen-pop is active.
- Internal 4-domain composite risk scoring and rising-risk filters are active; external partner (*Virgin*) risk feed remains post-MVP.

## 6. Traceability
| FRD section | RTM |
|---|---|
| 2.1 | RTM-01 |
| 2.2 | RTM-02 |
| 2.3, 2.4 | RTM-03, RTM-05, RTM-07 |
| 2.5 | RTM-09 |
| 2.6 | RTM-12 (Executive Plan Performance & Financial Dashboard) |
| 2.7 | RTM-06 |
| 2.8 | RTM-04 |
| 2.9, 2.10 | RTM-10 |
| 2.11 | RTM-08 |
| 2.12 | RTM-11 |

## 7. Acceptance
Each requirement is accepted when it is verified by the method in RTM v2.0 (unit, integration, E2E, perf, security audit). Zero Sev-1/Sev-2 defects are open.
