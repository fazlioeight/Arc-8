# Arc-8 Enterprise Health Platform — System User Manual

| Document Information | Details |
|---|---|
| **Platform** | Arc-8 Enterprise Health OS |
| **Modules Covered** | Member 360, Clinical Operations, Value-Based Care, Coding, Logistics & Administration |
| **Document Type** | End-User & Administrator System Guide |
| **Version** | 2.0 |
| **Last Updated** | November 2026 |

---

## 1. Introduction & Platform Overview

**Arc-8** is a HIPAA-compliant, multi-tenant healthcare operations and value-based care platform designed to give clinical, operational, financial, and administrative teams a unified **"Single Pane of Glass."**

Instead of switching between disconnected claims portals, spreadsheets, pharmacy tools, and document shares, authorized staff use Arc-8 from a single browser workspace organized around three core pillars:

1. **Clinical Operations (Member 360 Suite):** Population care intelligence, instant member search, unified Member 360 clinical charts, care gap closure, task management, multi-stage care journeys, clinical messaging, and encrypted member document management.
2. **Value-Based Care & Operations:** CMS-HCC (`v28`) risk adjustment coding worklists, suspect validation workbenches, executive RAF and quality analytics dashboards, NPI provider directory, non-emergency medical transportation (`NEMT`) ride booking, AI clinical/data chat, and batch/FHIR data ingestion.
3. **Governance & Administration:** Fine-grained HIPAA role and chart-tab privilege controls, user directory and role allotment, master application licensing, immutable audit trails, and platform settings.

---

## 2. Getting Started & Signing In

### 2.1 System Requirements
- **Web Browser:** Latest version of Google Chrome, Microsoft Edge, or Mozilla Firefox.
- **Recommended Display:** Desktop or laptop screen (`1280 x 800` resolution or higher).
- **Network:** Standard HTTPS internet connection (TLS encrypted in transit).

### 2.2 Signing In to Your Workspace
1. Open your organization's Arc-8 portal URL in your browser (for example, `https://arc8-mvp.site/login`) to open the **Enterprise Sign In** screen.
2. Authenticate using your organization's enabled sign-in method:
   - **Enterprise Single Sign-On (OIDC / SSO):** Click **Sign In with OIDC** to authenticate through your corporate Identity Provider (such as AWS Cognito, Microsoft Entra ID, or Okta). Your corporate security group automatically maps to your Arc-8 clinical or operational role.
   - **Organizational Credentials:**
     1. Confirm your **Healthcare Organization** workspace key (for example, `prominencehealth`).
     2. Enter your **Professional Email** and **Password**.
     3. Click **Sign In to Platform**.

### 2.3 First-Time Password Change
If your administrator created your account with a temporary password, Arc-8 automatically directs you to the **Change Password** screen (`/change-password`) upon first sign-in. Enter your current password and choose a strong new password to proceed into the workspace.

### 2.4 Automatic Session Lock & Signing Out
- **HIPAA Inactivity Session Lock:** To protect Protected Health Information (`PHI`) on unattended workstations, Arc-8 automatically locks your screen after **15 minutes of inactivity**. Re-enter your password on the lock screen to resume right where you left off without losing unsaved work.
- **Signing Out:** Always sign out at the end of your shift by clicking the **Log out** icon at the bottom-left of the sidebar or selecting **Sign out** from your profile menu in the top-right corner.

---

## 3. Navigating the Workspace

### 3.1 Portal Overview (`/portal`)
Upon signing in, you arrive at the **Portal Overview**—your personalized daily launchpad featuring:
- **Welcome Header & Role Badge:** Confirms your active organization workspace, assigned role, and last login timestamp.
- **Application Tiles:** One-click cards for every module enabled for your role (*Member 360*, *Coding Worklists*, *Providers*, *Ride Booking*, *Dashboard*, *Jobs / Import Data*, *Docs Library*, *Settings*, and *Master Admin*).
- **Saved Items & Open To-Dos:** Quick links to bookmarked records and assigned follow-up items.

### 3.2 Left Navigation Sidebar
Inside operational workspaces, the left sidebar groups pages into three sections—displaying **only** the modules permitted for your role:
- **Clinical Operations:** *Care Intelligence*, *Patient Roster*, *Clinical Tasks*, *Care Journeys*, *Risk Intelligence*, *Care Options*, *Messages*, and *Documents*.
- **Value-Based Care & Ops:** *Coding Worklist* (*Worklist Queue*, *Suspect Workbench*), *Executive Dashboards* (*PMPM Financials*, *Quality & Star Ratings*), *Provider Directory*, and *Ride Booking (NEMT)*.
- **Governance & Admin:** *Role & Privileges*, *Master Admin*, and *Platform Settings* (*General Profile*, *Security & HIPAA*, *FHIR Integrations*).

Click the **collapse arrow (`<` / `>`)** at the top of the sidebar at any time to switch between the full menu and a compact icon rail for maximum screen space.

### 3.3 Top Utility Bar & Global Shortcuts
The top utility bar remains accessible across the platform:
- **App Launcher (9-Dot Waffle Icon):** Switch directly between any authorized Arc-8 application.
- **Command Palette (`Ctrl+K` on Windows / `Cmd+K` on Mac):** Open a fast keyboard-driven search bar to jump to any screen, run quick actions, or toggle visual themes.
- **Notifications & Alerts (Bell Icon):** View recent activity alerts and background data-import notifications.
- **Light / Dark Theme Toggle (Sun/Moon Icon):** Switch instantaneously between high-contrast **Light Mode** and low-glare **Dark Mode**.
- **User Profile Menu:** View your account details, manage preferences, or sign out.

---

## 4. User Roles & Access Overview

Arc-8 tailors menus, chart tabs, and action buttons according to HIPAA **Minimum Necessary** standards so each staff member sees clean, role-relevant tools:

| Role | Primary Responsibilities | Accessible Workspaces |
|---|---|---|
| **Care Coordinator / Advocate** | Member call resolution, PCP assignment, care gap outreach, notes, tasks, and transportation scheduling | Care Intelligence, Patient Roster, 7 Core Member 360 Tabs, Tasks, Care Journeys, Care Options, Messages, Documents, Providers, Ride Booking, AI Chat |
| **Clinical Care Nurse (RN)** | Post-discharge transitions, medication reconciliation, clinical pathways, and care coordination | Full Care Coordinator clinical suite with focus on Care Journeys, Tasks, and Member 360 clinical tabs |
| **Clinical / Ops Supervisor** | Team oversight, handling escalated member issues, quality monitoring, and HIPAA access reviews | All Care Coordinator tools **plus** Member 360 **Audit Log** & **Settings** tabs, Task Escalation Queue, and Operational Dashboards |
| **Clinician / Physician (MD/DO)** | Direct clinical chart review, risk stratification, care orders, and quality/financial oversight | Care Intelligence, Member 360 clinical tabs, Risk Intelligence, Care Journeys, Care Options, Executive Dashboards, Providers, AI Chat |
| **Risk Adjustment Coder (CPC/CRC)** | CMS-HCC (`v28`) medical chart review, chase queue processing, and ICD-10 suspect validation | Coding Worklist, Suspect Workbench, Chase Queues, Documents, and relevant Member 360 clinical/claims/gap tabs |
| **Billing & Capitation Specialist** | PMPM financial tracking, capitation reconciliation, and claims/accumulator review | Executive Financial Dashboards, Member 360 Timeline, Claims & Benefits, and Documents |
| **Business Administrator** | Managing organization users, role privilege matrices, operational templates, and batch data imports | Role & Privileges, User Allotment, Job & Import Center, Executive Dashboards, and non-authoring administrative views |
| **Compliance Auditor** | Conducting HIPAA privacy, security, and quality audits across member charts | **Read-Only** access to Member 360 Timeline, Documents, and Audit Log (write/edit actions are disabled) |
| **System Administrator** | Full tenant administration, module licensing, security policy, and EHR/FHIR integration setup | All Clinical, Value-Based Care, Governance, Settings, and Master Admin modules |
| **Member / Patient** | Viewing personal health documents and upcoming medical transportation | Self-service Portal landing, personal Documents, and Ride Booking |

---

## 5. Clinical Operations Guide (Member 360 Suite)

### 5.1 Care Intelligence Dashboard (`/member360`)
The **Care Intelligence Dashboard** serves as the daily operational command center for clinical and outreach teams:
- **Population Summary Tiles:** View live counts of members in active workflows, **Critical-Risk** and **High-Risk** members, **Open / Overdue Tasks**, and **Active Care Journeys**.
- **Horizontal Sub-Navigation Bar:** Quickly jump between *Dashboard*, *Members*, *Tasks*, *Care Journeys*, *Risk Intelligence*, *Care Options*, *Messages*, and *Documents*.
- **Priority Queues & My To-Dos:** Click any task or member item on the dashboard to open that member's chart directly.

### 5.2 Patient Roster & Fast Member Search (`/member360/members`)
To locate a member record:
1. Open **Patient Roster** from the left sidebar (or click **Members** in the top sub-navigation).
2. Type into the search bar to find a member by **Member ID**, **First or Last Name**, **Phone Number**, or **Benefit Plan**.
3. Optionally narrow the list using **Risk Tier** (`Critical`, `High`, `Moderate`, `Low`) or **Open Gaps** filters.
4. Click anywhere on a member's row to launch their **Member 360 Clinical Chart Workspace**.

### 5.3 Working Inside a Member 360 Chart (`/member360/members/:memberId`)
The Member 360 workspace consolidates a member's entire clinical, financial, pharmacy, and operational profile onto a single screen.

#### A. Member Header & Alert Indicators
At the top of every chart, the header displays:
- **Demographics & Coverage:** Full Name, Member ID, Benefit Plan Name, Age, Gender, and Line of Business.
- **Primary Care Provider (PCP) Link:** Click the physician's name next to `PCP` to view their full profile, NPI, and clinic locations in the Provider Directory. If a member lacks an assigned PCP, you can assign an in-network provider directly.
- **Risk & Open Gaps Badges:** Displays the member's Risk Tier badge alongside an amber **Gaps** counter (e.g., `2 gaps`) indicating unclosed clinical or HCC gaps that should be addressed during outreach.

#### B. Quick Action Toolbar & AI Clinical Assistant
Across the top of the chart, authorized clinical staff can initiate workflows without navigating away from the member's record:
- **Create Task:** Schedule a follow-up task with priority (`Urgent`, `High`, `Medium`, `Low`), due date, and assignee.
- **Add Note:** Record an internal call summary or clinical progress note.
- **Start Journey:** Enroll the member into a structured multi-stage care protocol (such as *Post-Discharge Follow-Up*) or create a custom pathway.
- **Send Message:** Dispatch an outreach communication linked to the member's record.
- **Create Care Option:** Recommend a clinical program, referral, or intervention.
- **Escalate:** Flag an urgent clinical or operational issue directly into the **Supervisor Escalation Queue**.
- **AI Clinical Assistant:** Open the contextual AI side panel to ask natural-language questions about the member's history, gaps, labs, or claims—complete with clickable citation chips pointing to the underlying chart records.

#### C. Guide to the 9 Patient Chart Tabs

1. **Timeline**
   - Displays a chronological, unified feed of every member touchpoint: medical/pharmacy claims, inbound/outbound calls, notes added, care journey stage completions, and tasks.
   - Click individual entries to inspect the underlying details.

2. **Notes**
   - Used by Care Advocates, Coordinators, Nurses, and Clinicians to read prior conversation history and log new internal documentation.
   - Paste call summaries or type progress notes, and use **`@mention`** (for example, `@supervisor`) to flag a colleague. Every saved note automatically stamps the author's name and local timestamp.

3. **Care Journey**
   - Tracks step-by-step clinical protocols (such as *Discharge Intake*, *Medication Reconciliation*, *Specialist Follow-Up*, and *30-Day Outcome*) along with structured **SBAR** (*Situation, Background, Assessment, Recommendation*) panels.
   - Click **Start** or **Complete** on individual stages as milestones are finished; each update automatically posts to the member's **Timeline**.

4. **Clinical & Gaps**
   - Provides two coordinated sub-views:
     - **Problems / HCCs:** Lists active clinical diagnoses and ICD-10 conditions, highlighting codes with CMS Risk Adjustment (`RAF`) impact.
     - **Care Gaps:** Lists open preventive, HEDIS, and suspected HCC gaps so staff can schedule primary care visits and track gap closure.

5. **Medications & Labs**
   - **Medications:** Displays active and historical prescriptions, prescriber, last fill date, and remaining refills—highlighting **`0 refills`** or **expiring Prior Authorizations** so staff can prevent therapy interruptions.
   - **Labs & Imaging:** Displays diagnostic lab results (`HbA1c`, `BNP`, `Creatinine`, `Lipid Panel`, etc.) and imaging reports with clear **High / Abnormal** indicators.

6. **Claims & Benefits**
   - **Benefit Accumulators:** Visual progress bars at the top show real-time progress toward the member's annual **Deductible** and **Out-of-Pocket Maximum (`MOOP`)**.
   - **Claims History:** Itemized table of medical and pharmacy claims showing Date of Service, Billing Provider/Facility, Status (`Paid`, `Pending`), Billed Amount, Plan Paid, and Member Responsibility.

7. **Documents**
   - Centralized paperless repository for member-specific files (Health Risk Assessments, Patient Care Forms, Explanation of Benefits, Invoices, and Lab PDFs).
   - Authorized users can **upload** new documents, **preview/download** existing files, and trigger **paperless email delivery** to the member.

8. **Audit Log** *(Supervisors, Compliance Auditors & Administrators Only)*
   - Displays the immutable HIPAA access and modification trail for that specific member chart, showing who viewed, created, updated, or exported data and when.

9. **Settings** *(Supervisors, Business Admins & Administrators Only)*
   - Manages member-specific communication consents, authorized family/caregiver record sharing, and administrative preferences.

### 5.4 Clinical Tasks & Escalations (`/member360/tasks`)
Use **Clinical Tasks** in the left sidebar to manage your personal and team follow-up queues:
- **Saved Views:** One-click tabs for **All tasks**, **Open & in progress**, **Urgent**, **Overdue**, and **Completed**.
- **Filters & Sorting:** Filter by **Status** (*Open*, *In progress*, *Waiting*, *Completed*, *Escalated*), **Priority** (*Urgent*, *High*, *Medium*, *Low*), and **Due Window** (*Overdue*, *Due today*, *Next 7 days*), or sort by Priority, Due Date, Member Risk Tier, or Recently Updated.
- **Updating Tasks:** Change a task's status inline (for example, marking it `Completed` or `In progress`), or click the linked member name to jump straight into their chart. Supervisors monitor the `Escalated` filter to resolve complex cases.

### 5.5 Care Journeys Protocol Center (`/member360/care-journeys`)
Provides a population-level view of all enrolled care pathways across the organization:
- Browse standardized **Journey Templates** and see KPI counts for **Active**, **Paused**, and **Completed** journeys.
- Filter by status or search by member name, Member ID, template name, or assigned coordinator to monitor timely stage progression.

### 5.6 Risk Intelligence, Care Options, Messages & Global Documents
- **Risk Intelligence (`/member360/risk-intelligence`):** Analyze rising-risk cohorts, disease burden distributions, and prospective HCC opportunities across your attributed population.
- **Care Options (`/member360/care-options`):** Manage recommended clinical interventions and benefit programs ordered for members.
- **Messages (`/member360/messages`):** Review secure care-team outreach threads.
- **Global Documents (`/member360/documents`):** Search and manage clinical documents, Continuity of Care Documents (`CCDs`), and forms across the organization.

---

## 6. Value-Based Care, Coding & Operations Guide

### 6.1 Coding Worklist & Suspect Workbench (`/coding`)
Built for Risk Adjustment Coders (`CPC`/`CRC`) and Coding Leads managing CMS-HCC (`v28`) reviews:
1. Open **Coding Worklist** from the left sidebar.
2. Select a **Saved View** (*All chases*, *My chases*, *Unassigned*, *Overdue*, or *Completed*) or filter by **Status** (*Open*, *In progress*, *Pending review*, *Audit feedback*, *Query pending*, *Completed*) and **Priority**.
3. **Reviewing a Chart Chase (`/coding/chases/:chaseId`):** Click a chase item to inspect chart metadata, provider details, uploaded medical records, coder notes, and chase status transitions.
4. **Using the Suspect Workbench (`/coding/workbench/:memberId`):** Review suspected ICD-10 / HCC conditions alongside supporting clinical evidence, use terminology lookup helpers to normalize codes, record capture/rejection rationale, and click **Finalize** to commit coding outcomes.

### 6.2 Executive Analytics Dashboards (`/dashboard`)
Provides leadership, clinicians, and financial analysts with interactive visibility into risk adjustment and quality performance:
- **Global Filter Bar:** Slice metrics by **Model Year**, **Line of Business** (e.g., `MA`), **Provider Group**, **Date Window**, and **Submission Cutoff Date**, and toggle **Forecast** projections or normalized views.
- **Dashboard Visualizations:**
  - **Live RAF Delta:** Tracks cumulative Risk Adjustment Factor (`RAF`) progression and projected year-end trajectory.
  - **Suspects Funnel:** Visualizes conversion stages from identified suspects through chart chase, coder review, and accepted diagnoses.
  - **Deadline Radar:** Highlights upcoming submission cutoffs by urgency bucket, with one-click **CSV Export**.
  - **Provider Performance Heatmap:** Compares open RAF opportunity and gap closure performance across provider groups and clinics.

### 6.3 Provider Directory (`/providers`)
- Search contracted in-network physicians and specialists by **Provider Name**, **NPI**, **Specialty**, or **Facility**.
- Click any provider card to open the **Provider Detail** page (`/providers/:providerId`), displaying credentials, contact metadata, associated clinic/hospital facilities, and attributed members.

### 6.4 Ride Booking — NEMT Logistics (`/ride-booking`)
Coordinates Non-Emergency Medical Transportation so members never miss critical doctor or lab appointments:
- **Rides Tab:** View scheduled, in-progress, and completed trips. Click **Book / Schedule Ride** to enter Member ID, Member Name, Ride Type (e.g., *Standard Sedan*, *Wheelchair Van*), Pickup & Dropoff Addresses, Scheduled Pickup Date/Time, and estimated cost.
- **Partners Tab:** Manage contracted transportation vendors, contact details, service schedules, and billing profiles.
- **Payments Tab:** Review trip cost summaries and partner payment reconciliation statuses.

### 6.5 AI Chat, Data Imports & Docs Library
- **Arc-8 Chat (`/chat`):** A dedicated conversational workspace where staff can ask analytical or operational questions, explore structured workbooks/datasets, generate visual summaries, and export artifacts.
- **Data Imports & Job Status Center (`/jobs/import-data` & `/jobs/status-center`):**
  - **Batch File Uploads:** Drag and drop `.csv`, `.txt`, or `.xlsx` files for **Members**, **Providers**, **Claims**, **MAO-004**, or **Charts**, preview parsed rows, and submit jobs to the processing queue.
  - **FHIR API Ingestion:** Configure a FHIR server endpoint (`Base URL`, `Token URL`, `Client ID/Secret`), click **Test Connection**, and queue automated pulls for `Patient`, `Coverage`, `Claim`, `Encounter`, and `Observation` resources.
  - **Job Status Center:** Monitor queued, running, completed, and failed background jobs with execution logs.
- **Docs Library (`/docs`):** Browse internal Standard Operating Procedures (`SOPs`), coding guidelines, and training articles—or publish new articles if you hold administrator permissions.

---

## 7. Administration, Security & Platform Settings

### 7.1 Role & Privileges Authority (`/settings#privileges`)
Available to **System Administrators** and **Business Administrators** for real-time access governance:
- **Privileges Matrix Tab:**
  1. Select any organizational role from the role selector (for example, *Care Coordinator*, *Clinician*, or *Billing Specialist*).
  2. Toggle individual **Sidebar Modules** or **Member 360 Chart Sub-Tabs** on or off. Changes take effect immediately across the interface while enforcing HIPAA guardrails.
  3. Click **Reset Permissions** at any time to restore baseline HIPAA default privileges.
- **User Directory & Role Allotment Tab:**
  - Search all active users in your organization.
  - Reassign a user's clinical or administrative role using the role dropdown.
  - Click **Add User** to provision a new staff member with email, temporary password, display name, and assigned role.

### 7.2 Master Admin Console (`/admin/master`)
Used by **Platform Administrators** and **Tenant Administrators** to oversee organization-level configuration:
- **Application Licensing:** Enable or disable purchased platform modules for the organization.
- **User Account Lifecycle:** Create new users, edit application-specific access tiers (*None*, *User*, *Manager*, *Admin*), or deactivate departing staff accounts immediately.

### 7.3 Platform Settings (`/settings`)
Accessible from the left sidebar or top utility menu to customize personal and organizational preferences:
- **General & Appearance:** Choose **Light** or **Dark** mode and select your preferred interface **Language**.
- **Notifications:** Configure desktop and email alert preferences for task assignments, `@mentions`, and job completions.
- **Security & HIPAA Policy *(Admins)*:** Review session timeout rules, MFA settings, and audit logging policies.
- **FHIR & EHR Integrations *(Admins)*:** Manage SMART-on-FHIR and HL7 interface configurations.

---

## 8. Common Daily Workflows (Quick Reference)

### Workflow A: Resolving an Inbound Member Call
1. Go to **Patient Roster** (`/member360/members`), search the caller by **Member ID**, **Name**, or **Phone**, and click their row to open **Member 360**.
2. Scan the **Member Header** for unassigned **PCP** or open **Gaps** badges.
3. Address the member's primary question using the chart tabs:
   - *Claim or copay question:* Open **Claims & Benefits** to check Deductible/MOOP bars and claim status.
   - *Prescription refill issue:* Open **Medications & Labs** to check remaining refills and Prior Authorization status.
   - *Form or EOB request:* Open **Documents** to upload, download, or email the requested document.
4. Before wrapping up the call, click **Add Note** to save a summary of the conversation (using `@mention` if colleague input is needed) and click **Create Task** (or **Escalate**) if follow-up action is required.

### Workflow B: Managing Post-Discharge Member Outreach
1. Open **Care Intelligence** (`/member360`) or **Clinical Tasks** (`/member360/tasks` -> **Urgent** / **Due today** view).
2. Click the member's name to open their **Member 360** chart and select the **Care Journey** tab.
3. Review the active post-discharge pathway and **SBAR** notes, complete the scheduled outreach steps (such as *Medication Reconciliation* or *Follow-Up Appointment Scheduled*), and book a ride in **Ride Booking** (`/ride-booking`) if the member needs transportation to their follow-up visit.
4. Mark the corresponding stage and task as **Completed**.

### Workflow C: Validating Suspect HCC Codes
1. Open **Coding Worklist** (`/coding`) and select the **My chases** or **Overdue** saved view.
2. Open an assigned chase to inspect uploaded clinical documentation, or launch the **Suspect Workbench** for the member.
3. Verify each suspected ICD-10 diagnosis against clinical chart evidence, document code status/notes, and click **Finalize** to update RAF tracking on the **Executive Dashboard**.

### Workflow D: Onboarding a New Team Member (Administrators)
1. Navigate to **Role & Privileges** (`/settings#privileges`) -> **User Directory & Role Allotment** (or open **Master Admin** at `/admin/master`).
2. Click **Add User**, enter the staff member's organizational email, name, temporary password, and select their **Role** (e.g., *Care Coordinator*, *Nurse*, *Coder*, or *Supervisor*).
3. Save the user record; the new team member can immediately sign in and will receive the exact menus and chart tabs authorized for their role.

---

## 9. Frequently Asked Questions & Troubleshooting

| Question / Situation | Solution |
|---|---|
| **Why was I redirected to the login screen while working?** | Arc-8 automatically locks idle sessions after **15 minutes** to comply with HIPAA workstation security rules. Re-enter your password to unlock and continue. |
| **Why can't I see a specific sidebar menu or Member 360 tab (such as Audit Log)?** | Navigation items and chart tabs are dynamically filtered based on your role's HIPAA permissions. For example, **Audit Log** and **Settings** are restricted to Supervisors, Auditors, and Administrators. Contact your Business or System Administrator if your role requires additional access. |
| **Why are "Add Note" or "Create Task" buttons unavailable on my screen?** | Read-only roles (such as **Compliance Auditor**) and non-clinical administrative roles (**Business Administrator**) are prevented from authoring clinical records to preserve clinical governance integrity. |
| **How do I quickly jump between pages without clicking through menus?** | Press `Ctrl+K` (Windows) or `Cmd+K` (Mac) from any screen to open the **Command Palette**, or click the **9-dot App Launcher** in the top-left utility bar. |
| **Which file formats are supported in Data Imports?** | Batch file uploads at `/jobs/import-data` accept `.csv`, `.txt`, and `.xlsx` files. Individual member clinical attachments in the **Documents** tab support PDF and standard clinical document formats. |
| **How do I switch between Light Mode and Dark Mode?** | Click the **Sun / Moon** icon in the top header bar, or update your default preference under **Platform Settings** (`/settings`). |
