# Arc-8 Enterprise Health Platform — Client UAT & User Manual

| Document Control | Details |
|---|---|
| **Platform** | Arc-8 Enterprise Health OS (Member 360, Value-Based Care & Clinical Governance) |
| **Organization / Workspace** | Prominence Health (`prominencehealth`) |
| **Document Type** | Client Handover & User Acceptance Testing (UAT) Manual |
| **Version** | 2.0 (UAT Handover Release) |
| **Date** | November 2026 |
| **Audience** | Client Stakeholders, Clinical Operations Leaders, Care Advocates, and UAT Testers |

---

## 1. Welcome & Handover Overview

Welcome to **Arc-8**, a HIPAA-conscious, multi-tenant clinical operations, Member 360, and value-based care platform built for **Prominence Health**.

Arc-8 serves as a unified **"Single Pane of Glass"** connecting Care Advocates, Care Coordinators, Nurses, Clinicians, Supervisors, Risk Adjustment Coders, Financial Analysts, Compliance Auditors, and Administrators on one shared workspace.

### Purpose of This Manual
This manual accompanies the handover of the Arc-8 platform for **Client User Acceptance Testing (UAT)**. It covers:
1. How to access the hosted testing environments and sign in across roles.
2. How to navigate the workspace, switch clinical personas, and use productivity shortcuts.
3. Role-by-role permissions and HIPAA governance boundaries.
4. Module-by-module functional walkthroughs across **Clinical Operations**, **Value-Based Care**, and **Administration**.
5. Six guided, step-by-step **UAT Test Scenarios** to validate core business workflows.
6. Scope boundaries, synthetic data rules, defect reporting standards, and a **UAT Sign-Off Checklist**.

---

## 2. Accessing the Platform & Signing In

### 2.1 Hosted Environments
Please confirm with your Project Lead which environment URL is designated for your active testing cycle. For formal client UAT, always use the **Testing (UAT)** environment unless instructed otherwise.

| Environment | URL | Purpose & Audience |
|---|---|---|
| **Client Testing (UAT)** | `https://test.arc8-mvp.site/login` | **Primary environment for Client UAT & QA validation** |
| **Staging / Production Preview** | `https://arc8-mvp.site/login` | Stable executive showcase & release candidate preview |
| **Development** | `https://dev.arc8-mvp.site/login` | Active engineering integration (subject to frequent updates) |

*Note: Login passwords and optional SSH tunnel details are provided separately in the **Confidential Client Credentials Handover Sheet** (`CLIENT_CREDENTIALS_HANDOVER.md`). Never paste passwords into defect tickets or public chat channels.*

### 2.2 Browser & Display Recommendations
- **Supported Browsers:** Latest Google Chrome, Microsoft Edge, or Mozilla Firefox (desktop/laptop viewports recommended: `1280x800` or higher).
- **Visual Themes:** Full **Light Mode** and **Dark Mode** support via the sun/moon toggle in the top header bar.

### 2.3 Three Ways to Sign In (`/login`)

When you open `https://test.arc8-mvp.site/login`, Arc-8 provides three convenient sign-in methods tailored for client testing:

1. **Method A — Standard Organizational Credentials**
   - **Healthcare Organization:** Enter `prominencehealth` (pre-filled by default).
   - **Professional Email:** Enter your assigned test account email (for example, `coordinator@prominencehealth.com` or `supervisor@prominencehealth.com`).
   - **Password:** Enter the password from your confidential credentials sheet.
   - Click **Sign In to Platform**.

2. **Method B — Instant Demo Role Logins (Single-Click UAT)**
   - At the bottom of the Sign-In panel under **Instant Demo Role Logins (Single-Click)**, click any of the **10 pre-configured persona cards** (Care Coordinator, Nurse, Supervisor, Business Admin, Compliance Auditor, System Admin, Clinician, Coder, Billing, or Member/Patient).
   - Arc-8 will authenticate that role immediately using a live JWT session so you can test role-specific menus and permissions in seconds.

3. **Method C — Enterprise OIDC / SSO Simulation**
   - In the **Enterprise OIDC / Cognito Sign-In** card at the top of the Sign-In form, select an Identity Provider (IdP) group from the dropdown and click **Sign In with OIDC**:
     - `Prominence_Care_Coordinators` -> Maps to **Care Coordinator**
     - `Prominence_Clinical_Supervisors` -> Maps to **Supervisor**
     - `Prominence_Business_Admins` -> Maps to **Business Admin**
     - `Prominence_Compliance_Auditors` -> Maps to **Compliance Auditor**
     - `External_Contractors_Unmapped` -> **Negative Security Test:** Verifies that unmapped IdP groups are blocked with a `403` Deny-by-Default alert.

### 2.4 Session Security & Password Rotation
- **Inactivity Session Lock:** After **15 minutes** of inactivity, Arc-8 locks your screen and prompts for re-authentication on `/login` while preserving your active session context.
- **First-Login Password Rotation:** If an administrator marks an account as requiring rotation, you will be automatically guided to `/change-password` before accessing clinical screens.
- **Logging Out:** Click the **Log out** icon in the bottom-left sidebar footer or select **Sign out** from your top-right user menu when finished testing.

---

## 3. Workspace Navigation & Global Controls

After signing in, you arrive on the **Portal Overview** (`/portal`), which displays your active role badge, authorized application tiles, saved items, and open To-Dos.

### 3.1 Left Clinical Sidebar
Inside any operational workspace (such as **Member 360**), the collapsible left sidebar organizes tools into three domain groups—showing **only** the items permitted for your active role:
1. **Clinical Operations:** Care Intelligence, Patient Roster, Clinical Tasks, Care Journeys, Risk Intelligence, Care Options, Messages, and Documents.
2. **Value-Based Care & Ops:** Coding Worklist (`v28` Queue & Suspect Workbench), Executive Dashboards (`PMPM Financials` & `Quality & Star Ratings`), Provider Directory, and Ride Booking (`NEMT`).
3. **Governance & Admin:** Role & Privileges (`HIPAA`), Master Admin, and Platform Settings (`General Profile`, `Security & HIPAA`, `FHIR Integrations`).

**Tip — Instant In-App Role Switching:** Click **Switch Role ▾** at the bottom of the left sidebar at any time during testing to switch personas on the fly without returning to the login screen.

### 3.2 Top Utility Bar & Shortcuts
- **App Launcher (9-Dot Waffle Icon):** Jump directly between authorized platform modules (*Portal*, *Member 360*, *Coding Worklists*, *Providers*, *Ride Booking*, *Dashboard*, *Arc-8 Chat*, *Docs Library*, *Job Center*, *Settings*, *Master Admin*).
- **Command Palette (`Ctrl+K` or `Cmd+K`):** Open the global quick-action search bar to jump to any page or toggle themes via keyboard.
- **Notifications & Job Alerts (Bell Icon):** Inspect recent audit events, system alerts, or data import statuses.
- **Theme Toggle (Sun/Moon Icon):** Switch seamlessly between Light and Dark clinical themes.

---

## 4. User Roles & HIPAA Permission Matrix

Arc-8 enforces **two-layer authorization**: backend API role/capability enforcement (`403 Access Denied` on unauthorized actions) paired with dynamic frontend navigation and tab filtering.

| Role Persona | Test Account Email | Core Access & Capabilities | Key Restrictions (What to Verify) |
|---|---|---|---|
| **Care Coordinator / Advocate** | `coordinator@prominencehealth.com` | Care Intelligence, Patient Roster, 7 clinical Member 360 tabs, Tasks, Care Journeys, Care Options, Documents, Providers, Ride Booking, AI Chat | Cannot view **Audit Log** or **Member Settings** tabs; cannot open Admin or Role Privileges consoles |
| **Clinical Care Nurse (RN)** | `elena.nurse@prominencehealth.com` | Same clinical coordination suite as Care Coordinator + post-discharge Care Journey execution and NEMT scheduling | Denied Master Admin, Role Privileges, and Coding Worklist |
| **Clinical / Ops Supervisor** | `supervisor@prominencehealth.com` | All Care Coordinator capabilities **plus** Member 360 **Audit Log** & **Settings** tabs, Task Escalation Queue, and Executive Operational Dashboards | Cannot modify cross-tenant Master Admin licensing |
| **Clinician / Physician (MD)** | `dr.chen@prominencehealth.com` | Full clinical chart delivery, Risk Intelligence, Care Journeys, Care Options, Executive Financial & HEDIS Dashboards, Providers, AI Chat | Coding Worklist is intentionally hidden to keep physician view clinically focused |
| **Risk Adjustment Coder (CPC)** | `marcus.coder@prominencehealth.com` | **Coding Worklist (`v28`)**, Suspect Workbench, Chase Queues, and relevant Member 360 clinical/claims/gap tabs | Denied Governance/Admin consoles |
| **Billing & Capitation Analyst** | `rachel.billing@prominencehealth.com` | **Executive Dashboards** (`PMPM Financials`), Member 360 Timeline, Claims & Benefits, and Documents | Restricted from clinical care journeys and coding queues |
| **Business Administrator** | `business.admin@prominencehealth.com` | Organization administration, User Allotment, Role Privileges, Templates/Policies, Job Center, Member 360 read/audit tabs | **Blocked from authoring clinical notes/records** (`403` clinical authoring safeguard) |
| **Compliance Auditor** | `compliance.auditor@prominencehealth.com` | Read-only inspection of Member 360 Timeline, Documents, and **Audit Log** | **Strictly Read-Only:** All create, edit, upload, and task mutation actions are hidden or rejected (`403`) |
| **System Administrator** | `admin@prominencehealth.com` / `admin@admin.com` | Full tenant-wide access across all Clinical, Value-Based Care, Job Center, Role Privileges, and Master Admin modules | Full administrative authority (all actions logged to HIPAA audit trail) |
| **Member / Patient** | `james.member@prominencehealth.com` | Self-service Portal landing, personal Documents, and Ride Booking | Blocked from searching other members (`Patient Roster` hidden and API-restricted) |

---

## 5. Module-by-Module Functional Guide

### 5.1 Care Intelligence Dashboard (`/member360`)
The operational command center for clinical teams:
- **Population KPI Tiles:** Real-time counts of members in active workflows, Critical-Risk and High-Risk cohorts, Open/Overdue Tasks, and Active Care Journeys.
- **Priority Worklists & To-Dos:** Review assigned member outreach items and click any row to deep-link directly into that member's chart.

### 5.2 Patient Roster & Fast Member Search (`/member360/members`)
- **Multi-Attribute Search:** Search instantly by **Member ID**, **First/Last Name**, **Phone Number**, or **Benefit Plan**.
- **Cohort Filtering:** Filter the roster by Risk Tier (`Critical`, `High`, `Moderate`, `Low`) or open care gaps.
- **Direct Chart Launch:** Clicking any member row opens their **Member 360 Clinical Chart Workspace** directly.

### 5.3 Member 360 Clinical Chart Workspace (`/member360/members/:memberId`)
Designed so a Care Advocate or Clinician can resolve an entire member call from a single screen:

- **Member Header & Clinical Badges:** Displays Member Name, Member Key/ID, Plan Name, Age, Gender, Line of Business, Risk Badge, Amber **Open Gaps** counter, and a clickable **PCP link** that navigates straight to the physician's profile in the Provider Directory (or flags if PCP is unassigned).
- **Quick Action Toolbar:** Authorized clinical users can trigger **Create Task**, **Add Note**, **Start Journey**, **Send Message**, **Create Care Option**, or **Escalate** via slide-over drawers without leaving the chart.
- **Contextual AI Clinical Assistant:** Click the AI Assistant toggle to ask natural-language questions about the member's chart with clickable source citations.
- **Role-Gated Patient Chart Tabs:**
  1. **Timeline:** Chronological single source of truth across claims, calls, notes, tasks, and care journey stage updates.
  2. **Notes:** Author internal progress notes, paste call summaries, and use `@mention` tags to alert colleagues/supervisors; stamps author and local date/time automatically.
  3. **Care Journey:** View active multi-stage care pathways (e.g., *Post-Discharge Transition*, *Medication Reconciliation*, *30-Day Follow-Up*) and SBAR clinical summaries; start or complete individual stages.
  4. **Clinical & Gaps:** Dual view of **Problems / HCCs** (highlighting CMS revenue/RAF-impacting diagnoses) and **Care Gaps** requiring closure.
  5. **Medications & Labs:** Active prescriptions (highlighting `0 refills` or expiring Prior Authorizations) alongside **Labs & Imaging** results (`HbA1c`, `BNP`, `Creatinine`, `Lipids`) with abnormal value flags.
  6. **Claims & Benefits:** Displays **Deductible** and **Out-of-Pocket Maximum (MOOP)** progress bars above itemized medical/pharmacy claim statuses (`Paid`, `Pending`, billed vs. member responsibility).
  7. **Documents:** Upload, preview, download, and manage member-scoped PDFs/clinical forms (HRAs, EOBs, Care Forms).
  8. **Audit Log *(Supervisor / Auditor / Admin)*:** Tamper-evident HIPAA log recording every actor, timestamp, and action performed on the member's record.
  9. **Settings *(Supervisor / Business Admin / Admin)*:** Manage member consent preferences, record sharing, and administrative flags.

### 5.4 Clinical Tasks, Journeys & Outreach Modules
- **Clinical Tasks (`/member360/tasks`):** Filter tasks by priority (`urgent`, `high`, `medium`, `low`) and status (`open`, `in_progress`, `waiting`, `completed`, `escalated`). Supervisors use this view to triage escalated items.
- **Care Journeys Center (`/member360/care-journeys`):** Organization-wide tracker of all members enrolled in clinical pathways.
- **Risk Intelligence (`/member360/risk-intelligence`):** Population risk stratification, prospective HCC suspects, and disease burden breakdown.
- **Care Options (`/member360/care-options`) & Documents (`/member360/documents`):** Manage recommended clinical interventions and browse the global tenant document library.

### 5.5 Value-Based Care, Coding & Analytics Modules
- **Coding Worklist & Suspect Workbench (`/coding`):**
  - Switch between saved views: **All chases**, **My chases**, **Unassigned**, **Overdue**, and **Completed**.
  - Filter by status (`open`, `in_progress`, `pending_review`, `audit_feedback`, `query_pending`, `completed`) and priority.
  - Drill into individual chart chases (`/coding/chases/:chaseId`) or launch the **Suspect Workbench** (`/coding/workbench/:memberId`) to validate ICD-10 / CMS-HCC v28 suspects with supporting clinical evidence.
- **Executive Analytics Dashboards (`/dashboard`):**
  - Filter by Model Year, Line of Business (`MA`, etc.), Provider Group, and Cutoff Date.
  - Interactive charts: **Live RAF Delta** (with forecast toggle), **Suspects Funnel**, **Deadline Radar** (with CSV export), and **Provider Performance Heatmap**.
- **Provider Directory (`/providers`):** Search contracted physicians by name, NPI, or specialty and view associated facilities and contact details.
- **Ride Booking / NEMT Logistics (`/ride-booking`):** Schedule non-emergency medical transportation for member appointments, check partner availability, and review trip payment reconciliation.
- **Arc-8 Chat (`/chat`), Data Imports (`/jobs/import-data`), & Docs (`/docs`):** AI data/clinical assistant, drag-and-drop CSV/XLSX batch import center with **Job Status Center** (`/jobs/status-center`), and internal SOP knowledge base.

### 5.6 Governance, Role Privileges & Master Admin
- **Role & Privileges Authority (`/settings#privileges`):**
  - **Privileges Matrix Tab:** Toggle access to any sidebar module or Member 360 chart sub-tab per role in real time, or reset to HIPAA defaults.
  - **User Directory & Role Allotment Tab:** Search active organization users, reassign a user's clinical/operational role via dropdown, or click **Add User** to onboard a new team member.
- **Master Admin Console (`/admin/master`):** Manage tenant-purchased module entitlements, user active/inactive status, and per-application permission levels (`User`, `Manager`, `Admin`).
- **Platform Settings (`/settings`):** Configure Light/Dark theme defaults, interface language, notification preferences, HIPAA audit policies, and FHIR/HL7 integration endpoints.

---

## 6. Guided Client UAT Test Scenarios

We recommend running through these **six structured scenarios (~60 minutes total)** during your initial UAT session to verify end-to-end functionality.

### Scenario 1: Login, SSO Simulation & Deny-by-Default Security (~10 min)
1. Navigate to `https://test.arc8-mvp.site/login`.
2. In the **Enterprise OIDC / Cognito Sign-In** box, select `External_Contractors_Unmapped` and click **Sign In with OIDC**.
   - **Expected Result:** Sign-in is blocked with a clear `403` Authentication & Authorization Alert (Deny-by-Default verified).
3. Select `Prominence_Care_Coordinators` and click **Sign In with OIDC**.
   - **Expected Result:** You are authenticated as a **Care Coordinator** and routed into the workspace.
4. Log out, then test a **Single-Click Demo Role Login** card (e.g., **Clara Diaz, RN — Care Coordinator**).
   - **Expected Result:** Immediate sign-in with role-scoped menus.

### Scenario 2: Inbound Member Call — Care Coordinator Workflow (~15 min)
1. Signed in as **Care Coordinator** (`coordinator@prominencehealth.com`), open **Patient Roster** (`/member360/members`).
2. Search for a test member by name, Member ID, or benefit plan, and click the member row to open **Member 360**.
3. Verify the **Member Header** displays demographics, plan name, open gap count badge, and PCP link (click the PCP name to confirm the Provider Directory profile loads, then return to the member chart).
4. Step through the 7 visible clinical tabs:
   - **Timeline:** Confirm chronological events load cleanly.
   - **Claims & Benefits:** Verify Deductible/MOOP progress bars and claim status rows display.
   - **Clinical & Gaps:** Inspect active Problems/HCCs and open Care Gaps.
   - **Medications & Labs:** Check prescription refill counts and lab results (`HbA1c`, lipids, etc.).
   - **Care Journey:** Review active care journey stages; start or update a stage if open.
   - **Documents:** Upload a small test PDF (synthetic content only) and verify it appears in the document list and downloads properly.
5. Click **Add Note** in the top action bar, enter a sample call summary (including an `@mention`), and save.
   - **Expected Result:** The note appears immediately under **Notes** and logs a new touchpoint on the **Timeline**.
6. Verify that the **Audit Log** and **Settings** tabs are **hidden** from the Care Coordinator view.

### Scenario 3: Task Escalation & Supervisor Audit Review (~10 min)
1. Still signed in as **Care Coordinator** inside a member's chart, click **Escalate** (or **Create Task** with high/urgent priority) and submit an escalation item.
2. In the bottom-left sidebar footer, click **Switch Role ▾** and select **Marcus Vance, MHA — Clinical Operations Supervisor** (`supervisor@prominencehealth.com`).
3. Open **Clinical Tasks** (`/member360/tasks`) and verify the escalated/created task is visible in the queue; update its status.
4. Open the same member's chart in **Member 360** and click the **Audit Log** tab.
   - **Expected Result:** Both **Audit Log** and **Settings** tabs are now visible to the Supervisor, and your prior Coordinator note/task/view actions are recorded with actor and timestamp.

### Scenario 4: Compliance Auditor Read-Only Enforcement (~5 min)
1. Use **Switch Role ▾** (or `/login`) to sign in as **David Hayes, CHC — Compliance Auditor** (`compliance.auditor@prominencehealth.com`).
2. Open a member chart from **Patient Roster**.
   - **Expected Result:** Only read/audit tabs (**Timeline**, **Documents**, **Audit Log**) are displayed. Clinical write buttons (*Create Task*, *Add Note*, *Start Journey*, *Escalate*) are hidden, and any direct write attempt is rejected as read-only.

### Scenario 5: Risk Adjustment Coding (v28) & Executive Analytics (~10 min)
1. Switch role to **Marcus Vance, CPC — Risk Adjustment Coding Lead** (`marcus.coder@prominencehealth.com`).
2. Navigate to **Coding Worklist** (`/coding`).
3. Test the saved view tabs (**All chases**, **My chases**, **Unassigned**, **Overdue**, **Completed**) and priority/status filters.
4. Open a chase item or launch the **Suspect Workbench** to inspect suspect HCC codes and clinical evidence.
5. Switch role to **System Administrator** (`admin@admin.com`) or **Clinician** (`dr.chen@prominencehealth.com`) and open **Executive Dashboards** (`/dashboard`).
   - **Expected Result:** **Live RAF Delta**, **Suspects Funnel**, **Deadline Radar**, and **Provider Heatmap** charts render and respond to Model Year / LOB filters.

### Scenario 6: Role Privileges Governance & User Management (~10 min)
1. Sign in as **System Administrator** (`admin@admin.com`) or **Business Administrator** (`business.admin@prominencehealth.com`).
2. Navigate to **Role & Privileges** (`/settings#privileges`).
3. Select a role (e.g., **Care Coordinator**), toggle a module or chart tab permission off and back on, and observe the confirmation toast.
4. Switch to the **User Directory / Role Allotment** view to verify existing users load and role assignments can be managed, or open **Master Admin** (`/admin/master`) to inspect tenant application entitlements.

---

## 7. Known MVP Scope Boundaries

To keep UAT focused on delivered capabilities, please note the following intentional design boundaries for this release (do **not** log these as defects unless behavior differs from below):

- **Synthetic Data Only:** All pre-loaded members, claims, labs, prescriptions, and chases are synthetic test records. Live production feeds (QNXT, Abarca PBM, CareAdvance SFTP) are represented via seeded datasets and batch import tools during UAT.
- **Talkdesk Telephony Integration:** Live embedded voice/SMS telephony is scheduled for a post-MVP phase; during UAT, call summaries are documented via the **Notes** tab (`Add Note`).
- **Role-Hidden Modules:** Certain roles intentionally do not see modules outside their clinical or operational scope (for example, Physicians do not see *Coding Worklist*, and Care Coordinators do not see *Audit Log* or *Master Admin*). This is expected HIPAA minimum-necessary behavior.

---

## 8. Test Data Rules, Troubleshooting & Bug Reporting

### 8.1 Mandatory UAT Data Safety Rules (Zero PHI)
- **NEVER enter real patient data (PHI or PII)**—including real member names, SSNs, dates of birth, phone numbers, or real clinical PDFs—into the UAT, Dev, or Demo environments.
- Feel free to create notes, tasks, care journeys, and synthetic PDF uploads during testing, but **do not delete shared baseline seed users or core demo rosters**.

### 8.2 Quick Troubleshooting
| Symptom | Resolution |
|---|---|
| **"Invalid credentials" on `/login`** | Verify **Healthcare Organization** is set to `prominencehealth` (lowercase, no spaces) and check password case sensitivity. |
| **`401` or `403 Access Denied` message** | Confirm your active persona in the bottom-left sidebar has permission for that route/action (e.g., Compliance Auditor cannot save edits; Coordinator cannot access `/admin/master`). |
| **Redirected to `/login` mid-session** | The 15-minute HIPAA inactivity lock or token expiration triggered; re-enter your password to resume. |
| **Missing menu item after testing privileges** | If you modified role switches in `/settings#privileges`, click **Reset to Default** in the Role & Privileges manager as an Admin. |

### 8.3 How to Report UAT Feedback or Defects
When logging an issue in the shared project tracker, please include:
1. **Short Title:** Clear summary of the issue (e.g., *"Claims tab MOOP bar does not update on filter change"*).
2. **Environment & URL:** Full browser URL (e.g., `https://test.arc8-mvp.site/member360/members/12`) + Date, Time, and Time Zone.
3. **Active Role / Account Used:** Email or persona name (e.g., `coordinator@prominencehealth.com`).
4. **Numbered Steps to Reproduce:** Step 1, Step 2, Step 3...
5. **Expected vs. Actual Result:** What should happen vs. what occurred.
6. **Severity Level:**
   - **Blocker (Sev-1):** Environment unreachable, login broken, or data corruption preventing testing. *(Notify Project Lead & DevOps immediately!)*
   - **Critical (Sev-2):** Core clinical or RBAC feature broken with no workaround.
   - **Major (Sev-3):** Feature partially impaired, workaround exists.
   - **Minor / Cosmetic (Sev-4):** UI alignment, wording, or minor visual polish.
7. **Supporting Evidence:** Screenshot or short screen recording (with browser Console `F12 -> Console` / `Network` error details if applicable; ensure no passwords are visible).

---

## 9. Client UAT Sign-Off Checklist

Use the table below to track functional acceptance across each workstream prior to formal sign-off:

| # | Functional Area | Test Scenario Reference | Status (Pass / Fail / Pending) | Reviewer Name & Date | Notes / Ticket IDs |
|---|---|---|---|---|---|
| 1 | Authentication, OIDC Group Mapping & Session Lock | Scenario 1 | Pending | | |
| 2 | Patient Roster Search & Filters | Scenario 2 | Pending | | |
| 3 | Member 360 Header, PCP Link & Clinical Tabs | Scenario 2 | Pending | | |
| 4 | Clinical Notes, `@mentions`, Care Journeys & Docs | Scenario 2 | Pending | | |
| 5 | Tasks Workflow & Supervisor Escalation Queue | Scenario 3 | Pending | | |
| 6 | HIPAA Audit Log & Supervisor/Auditor Visibility | Scenarios 3 & 4 | Pending | | |
| 7 | RBAC Minimum-Necessary & Read-Only Safeguards | Scenarios 1–4 | Pending | | |
| 8 | Coding Worklist (`v28`) & Suspect Workbench | Scenario 5 | Pending | | |
| 9 | Executive Analytics Dashboards (RAF, Funnel, Heatmap) | Scenario 5 | Pending | | |
| 10 | Provider Directory & Ride Booking (`NEMT`) | Module 5.5 | Pending | | |
| 11 | Role & Privileges Manager + Master Admin Console | Scenario 6 | Pending | | |

---

## 10. Project Contacts & Support

| Role | Contact Person | Responsibility |
|---|---|---|
| **Project Lead** | Wayne White / Project Management | UAT coordination, scope inquiries, sign-off |
| **Architecture & Technical Lead** | Syed Sana Ul Haq Fazli | Application workflows, RBAC, clinical & VBC features |
| **DevOps & Cloud Infrastructure** | Shaheer Sarwar | `arc8-mvp.site` HTTPS environments, AWS availability, access |
| **Quality Assurance Lead** | Shahzad Sultan | Defect triage, test case execution, regression verification |
| **Data Engineering Lead** | Ramesh Muralasetty | Synthetic datasets, ETL pipelines, schema & reporting data |
