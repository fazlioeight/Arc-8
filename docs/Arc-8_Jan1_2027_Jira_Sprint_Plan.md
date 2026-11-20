# Arc-8 January 1, 2027 Completion Plan — Jira Sprint Plan & Import Guide

- **Jira Workspace**: `https://oeightio.atlassian.net`
- **Project Key**: `A8S` (Arc-8)
- **Default Assignee**: `syed.fazli@oeight.io`
- **Import CSV**: `docs/Arc-8_Jan1_2027_Jira_Sprint_Import.csv`
- **Current Timeline Position**: **Week 1 (Nov 19 – Nov 25, 2026 — Currently Active Sprint)**
- **Target Launch Date**: **January 1, 2027** (6-Week Schedule: Nov 19, 2026 – Jan 1, 2027)

---

## 1. How to Import into Jira (`oeightio.atlassian.net`)

1. Open Jira at `https://oeightio.atlassian.net`.
2. Click **Settings (Gear Icon) -> System -> External System Import -> CSV** (or inside your `A8S` Project board: **Project Settings -> Issue Import**).
3. Upload **`docs/Arc-8_Jan1_2027_Jira_Sprint_Import.csv`**.
4. Select Project **`Arc-8 (A8S)`** and keep date format as `yyyy-MM-dd`.
5. Map the CSV columns to Jira fields:

| CSV Column | Jira Field to Map | Notes |
| :--- | :--- | :--- |
| `Issue Type` | **Issue Type** | Maps `Epic` and `Story` |
| `Summary` | **Summary** | Issue title with Gap/Feature ID prefix |
| `Description` | **Description** | Acceptance criteria, files updated, and verification details |
| `Priority` | **Priority** | `Highest`, `High`, `Medium`, `Low` |
| `Status` | **Status** | **Week 1** is active (`Done` / `In Progress`); **Weeks 2–6** are `To Do`; **V2** is `Backlog` |
| `Sprint` | **Sprint** | Groups issues into the 4 Launch Sprints + V2 Backlog |
| `Story Points` | **Story Points** | Total **123 SP** for Jan 1 Launch (`34 + 34 + 34 + 21`) |
| `Assignee` | **Assignee** | `syed.fazli@oeight.io` |
| `Labels` | **Labels** | Comma-separated tags (`Week1`, `FR-DAT-02`, `G-08`, etc.) |
| `Start Date` | **Start date** | Issue/Sprint start date (`yyyy-MM-dd`) |
| `Due Date` | **Due date** | Issue/Sprint due date (`yyyy-MM-dd`) |
| `Epic Name` | **Epic Name** | Populated on Epic rows |
| `Epic Link` | **Epic Link / Parent** | Links each Story to its parent Epic |

---

## 2. Sprint-by-Sprint Status Breakdown (Reflecting Current Position in Week 1)

### Sprint 1 (ACTIVE NOW): `Sprint W1: Core Gaps & Redis Cache (Nov 19 - Nov 25)` — 34 SP
- **Epic**: `[EPIC-W1] Week 1: Core Data/Admin Gaps (G-01..G-16) & 30-Day Redis Hot Cache (FR-DAT-02)` — **In Progress**

| Gap / ID | Summary | Priority | Points | Jira Status |
| :--- | :--- | :--- | :---: | :---: |
| `FR-DAT-02` | Wire 30-Day Redis Hot Cache for Member 360 & Live API Responses | Highest | 8 | **Done** |
| `G-01` | Unify MEM (0-100) & PROM (0-3) Risk Scores to 0-100 Scale | High | 3 | **Done** |
| `G-02` | Deduplicate Test Member Records & Enforce QNXT MPI Matching | High | 5 | **Done** |
| `G-03` | Seed Default Care Journey Templates, Risk Rules & Task Queues in Live Admin | High | 3 | **Done** |
| `G-04` | Fix Master Admin Role Validator to Accept All 12 RBAC Roles | High | 3 | **Done** |
| `G-05` | Align Dashboard (\$23k) & Care Options (\$109k) Steerage Savings SQL | Medium | 2 | **Done** |
| `G-06` | Align Overdue Tasks Count (96 vs 99) Across Dashboard & Tasks Queue | Medium | 2 | **Done** |
| `G-07` | Link 17-Feed UHS SFTP Attributed Member & Open Gap Counts to Provider Directory | Medium | 3 | **In Progress** |
| `G-09` | Replace Generic Care Gap Labels with HEDIS Measures, CMS HCC v28 & ICD-10 Codes | Medium | 2 | **In Progress** |
| `G-10` | Calibrate RAF Target (`3.00 -> 1.25`) & Fix Suspects Funnel Final-Stage Conversion % | Medium | 2 | **In Progress** |
| `G-11/12/14/16` | Cosmetic Hides, Docs Library Manual & HIPAA/SOC-2 Compliance Badge | High | 1 | **In Progress** |

---

### Sprint 2 (UPCOMING): `Sprint W2-3: Live APIs Part 1 (Nov 26 - Dec 9)` — 34 SP
- **Epic**: `[EPIC-W2-3] Weeks 2-3: Live Client API Integration Part 1 (G-08: QNXT, Talkdesk & Prod SSO)` — **To Do**

| Gap / ID | Summary | Priority | Points | Jira Status |
| :--- | :--- | :--- | :---: | :---: |
| `G-08.1` | Build Live QNXT Core Payer API Connector (Eligibility, Claims, Accumulators & MPI) | Highest | 13 | **To Do** |
| `G-08.2` | Build Live Talkdesk CTI Screen-Pop Webhook & AI Call-Summary API Connector | Highest | 13 | **To Do** |
| `G-08.3` | Wire Client Production Enterprise SSO (OIDC / SAML 2.0 12-Role RBAC Mapping) | Highest | 8 | **To Do** |

---

### Sprint 3 (UPCOMING): `Sprint W4-5: Live APIs Part 2 (Dec 10 - Dec 22)` — 34 SP
- **Epic**: `[EPIC-W4-5] Weeks 4-5: Live Client API Integration Part 2 (G-08: Abarca PBM, CareAdvance, Labs/Titan/GL)` — **To Do**

| Gap / ID | Summary | Priority | Points | Jira Status |
| :--- | :--- | :--- | :---: | :---: |
| `G-08.4` | Build Live Abarca PBM API Connector (Rx Claims, 0-Refill Alerts & Prior Auths) | Highest | 13 | **To Do** |
| `G-08.5` | Build Live CareAdvance Two-Way Care Journey Sync API Connector | Highest | 13 | **To Do** |
| `G-08.6` | Build Live Clinical Labs, Project Titan MRA & Clarity/GL Finance API Connectors | Highest | 8 | **To Do** |

---

### Sprint 4 (UPCOMING): `Sprint W6: Real-Data E2E & Go-Live (Dec 23 - Dec 31)` — 21 SP
- **Epic**: `[EPIC-W6] Week 6: Real-Data E2E Verification, <500ms Load Test (NFR-01) & Jan 1 Go-Live` — **To Do**

| Gap / ID | Summary | Priority | Points | Jira Status |
| :--- | :--- | :--- | :---: | :---: |
| `NFR-01.1` | Execute Real-Data End-to-End Verification Across All 6 Live Client APIs | Highest | 13 | **To Do** |
| `NFR-01.2` | Execute `<500ms` Member Search & `<2s` Cockpit Redis Hot-Cache Load Test & Jan 1 Launch | Highest | 8 | **To Do** |

---

### Post-Jan 1 Backlog: `Post-Jan 1: Version 2 Backlog (Phase 2)` — 55 SP
- **Epic**: `[EPIC-V2] Post-Jan 1: Version 2 Shifted Modules (V2-F01 to V2-F09)` — **Backlog**

| Gap / ID | Summary | Priority | Points | Jira Status |
| :--- | :--- | :--- | :---: | :---: |
| `V2-F01..04` | Version 2 NEMT Medical Ride Scheduling, Partner Management & Reconciliation | Low | 13 | **Backlog** |
| `V2-F05..06` | Version 2 Member Self-Service Portal & 2-Way SMS/Browser Softphone (`F-30`) | Low | 21 | **Backlog** |
| `V2-F07..09` | Version 2 External FHIR R4 OAuth, Claims-Validated Steerage Savings & Direct CMS EDI (`F-21`) | Low | 21 | **Backlog** |
