import { API_BASE, resolveApiBase } from '../utils/apiBase';

const shouldUseApi = (token) => {
  if (!token) return false;
  return !String(token).toLowerCase().startsWith('sample');
};

const buildHeaders = (token, tenant) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(tenant ? { 'X-Tenant-Key': tenant } : {}),
});

const handleResponse = async (response) => {
  const raw = await response.text();
  const body = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    const detail = body?.detail || response.statusText || 'Request failed';
    throw new Error(detail);
  }
  return body;
};

export const ALL_MANUAL_ROLES = [
  'platform_admin',
  'admin',
  'business_admin',
  'payer_executive',
  'supervisor',
  'coordinator',
  'compliance_auditor',
  'clinician',
  'nurse',
  'coder',
  'billing',
  'patient',
];

const CLINICAL_ROLES = [
  'platform_admin',
  'admin',
  'supervisor',
  'coordinator',
  'clinician',
  'nurse',
];

const SUPERVISOR_AUDITOR_ADMIN_ROLES = [
  'platform_admin',
  'admin',
  'business_admin',
  'supervisor',
  'compliance_auditor',
];

const CODING_ROLES = [
  'platform_admin',
  'admin',
  'supervisor',
  'clinician',
  'coder',
];

const FINANCIAL_EXEC_ROLES = [
  'platform_admin',
  'admin',
  'business_admin',
  'payer_executive',
  'supervisor',
  'clinician',
  'billing',
];

const ADMIN_INGESTION_ROLES = [
  'platform_admin',
  'admin',
  'business_admin',
];

/**
 * Full-System HIPAA-Compliant Role-Based User Manual Chapters (9 Core Chapters).
 */
export const DEFAULT_MANUAL_ARTICLES = [
  {
    id: 101,
    title: '1. Getting Started, Enterprise SSO & HIPAA Workstation Security',
    summary:
      'Platform sign-in guide covering Enterprise OIDC/SAML 2.0 SSO, organizational credentials, first-time password rotation, and the 15-minute HIPAA inactivity lock.',
    category: 'Getting Started & HIPAA Security',
    app_key: 'portal',
    allowed_roles: ALL_MANUAL_ROLES,
    hipaa_classification: 'HIPAA All-Role General Guide',
    tags: ['manual', 'getting-started', 'sso', 'hipaa', 'security', 'session-lock'],
    content: `### 1.1 Platform Overview & Architecture
**Arc-8 Enterprise Health OS** is a HIPAA-compliant, multi-tenant clinical operations, value-based care (VBC), and financial intelligence platform providing a unified **Single Pane of Glass** across three core pillars:
- **Clinical Operations (Member 360 Suite):** Population Care Intelligence, fast member search (<500ms via 30-day Redis Hot Cache), 9-tab Member 360 chart workspace, SBAR clinical tasks, multi-stage Care Journeys, Care Options cost-redirection, and encrypted Documents.
- **Value-Based Care & Operations:** CMS-HCC (\`v28\`) Coding Worklist, M.E.A.T. Suspect Workbench, Executive RAF (calibrated \`1.25\` target) & Star Quality Dashboards, NPI Provider Directory, and Non-Emergency Medical Transportation (\`NEMT\`) Ride Booking.
- **Governance & Administration:** 12-Role HIPAA Minimum-Necessary RBAC matrix, immutable PHI audit logs, 17-feed UHS SFTP & FHIR ingestion, and 6 live enterprise API connectors.

### 1.2 Signing In (\`/login\`)
1. **Enterprise OIDC / SAML 2.0 SSO:** Click **Sign In with OIDC** to authenticate via your corporate Identity Provider (Microsoft Entra ID, Okta, or AWS Cognito). Your IdP security group maps automatically to one of Arc-8's 12 canonical roles. Unmapped external contractor groups are blocked by default (\`403 Access Denied\`).
2. **Organizational Credentials:** Confirm your Healthcare Organization key (e.g., \`prominencehealth\`), enter your email and password, and complete MFA challenge when prompted for PHI routes.
3. **First-Time Password Change (\`/change-password\`):** Accounts provisioned with a temporary password automatically redirect to rotate credentials prior to accessing clinical screens.

### 1.3 HIPAA Workstation Safeguards & Global Shortcuts
- **15-Minute HIPAA Inactivity Session Lock:** Unattended sessions lock automatically after 15 minutes of inactivity (\`SessionLockOverlay\`). Re-enter your password to resume without losing unsaved chart context.
- **Global Site Search & Command Palette (\`Ctrl+K\` / \`Cmd+K\`):** Instant search across Patients, Providers, Clinical Tasks, Coding Chases, System Pages, and Knowledge Base guides.
- **9-Dot App Launcher:** Switch between authorized modules in the top utility bar.`,
  },
  {
    id: 102,
    title: '2. Arc-8 Member 360 & Care Coordinator Clinical Manual (v2.0)',
    summary:
      'Complete clinical operations guide covering Care Intelligence KPIs, Patient Roster filters, Member 360 Cockpit tabs, SBAR Tasks, Care Journeys, and Guided In-Call Triage.',
    category: 'Clinical Operations (Member 360)',
    app_key: 'member360',
    allowed_roles: [...CLINICAL_ROLES, 'compliance_auditor', 'coder', 'billing'],
    hipaa_classification: 'HIPAA Minimum-Necessary Scoped',
    tags: ['manual', 'pdf', 'member360', 'care-coordinator', 'training', 'hedis', 'sbar'],
    content: `### 2.1 Care Intelligence Command Center (\`/member360\` — F-01..F-04)
- **Operational KPI Tiles:** Live counts of Attributed Population, Critical/High-Risk cohorts, Open & Overdue Tasks, Active Care Journeys, and Estimated Care Option Savings.
- **4-Domain Risk Drivers:** Unified \`0.0–10.0\` composite and clinical risk scoring normalized across QNXT (\`MEM-*\`) and Prominence (\`PROM-*\`) feeds.

### 2.2 Patient Roster & Fast Member Search (\`/member360/members\` — F-05..F-07)
- Search by **Member ID**, **First/Last Name**, **DOB**, **Phone**, or **Benefit Plan** with \`<500ms\` response powered by QNXT Master Patient Index (MPI) deduplication and the 30-day Redis Hot Cache.
- Filter by **Risk Tier** (\`Critical\`, \`High\`, \`Moderate\`, \`Low\`), **Open Care Gaps**, **Active Care Journeys**, or **Assigned PCP**.

### 2.3 Member 360 Clinical Chart Cockpit (\`/member360/members/:memberId\` — F-08..F-20)
1. **Timeline Tab:** Unified chronological feed of inpatient/ED claims, Talkdesk CTI calls, clinical notes, journey stage transitions, and tasks.
2. **Notes Tab:** Author progress notes or review Talkdesk AI Call Summaries. Use \`@mention\` (e.g., \`@Sarah Chen, RN\` or \`@supervisor\`) to notify colleagues.
3. **Care Journey Tab:** Track multi-stage clinical protocols (*Post-Discharge 30-Day Transition*, *CHF Disease Management*, *Diabetes Care Pathway*) with structured **SBAR** panels and two-way CareAdvance sync.
4. **Clinical & Gaps Tab:** Inspect active ICD-10 problems alongside open **HEDIS** quality measures and **CMS-HCC v28** risk gaps.
5. **Medications & Labs Tab:** Live Abarca PBM feed highlighting **\`0 Refills Remaining\`** and **\`Pending Prior Authorization\`** alerts, paired with Clinical Labs (\`HbA1c\`, \`eGFR\`, \`BNP\`, \`LDL\`) and abnormal flags.
6. **Claims & Benefits Tab:** Real-time QNXT **Deductible** and **Out-of-Pocket Maximum (\`MOOP\`)** accumulator progress bars and itemized medical/Rx claims.
7. **Documents Tab:** Upload, preview, download, or trigger **1-click paperless PDF email delivery** of HRAs, EOBs, and Care Plans.`,
  },
  {
    id: 103,
    title: '3. Clinical Tasks, SBAR Escalation Queues & Care Options Guide',
    summary:
      'Standard operating procedures for managing personal/team clinical task queues, supervisor escalations, multi-stage Care Journeys, and lower-cost Care Options.',
    category: 'Clinical Operations (Member 360)',
    app_key: 'member360',
    allowed_roles: CLINICAL_ROLES,
    hipaa_classification: 'HIPAA Minimum-Necessary Scoped',
    tags: ['tasks', 'escalation', 'care-journeys', 'care-options', 'sbar', 'manual'],
    content: `### 3.1 Clinical Tasks & Supervisor Escalations (\`/member360/tasks\` — F-22..F-24)
- **Saved Queue Views:** Switch between *All Tasks*, *Open & In Progress*, *Urgent*, *Overdue*, and *Completed*.
- **SBAR Task Creation:** Schedule follow-up outreach with Priority (\`Urgent\`, \`High\`, \`Medium\`, \`Low\`), Due Date, and Assignee.
- **Supervisor Escalation Queue:** Clicking **Escalate** inside any Member 360 chart routes the case into the \`Escalated\` filter monitored by Clinical/Ops Supervisors.

### 3.2 Care Journeys Protocol Center (\`/member360/care-journeys\` — F-25..F-26)
- Monitor population-wide enrollment across standardized clinical pathways.
- Completing or advancing a journey stage automatically logs a Timeline event and triggers an outbound webhook push to **CareAdvance**.

### 3.3 Care Options Cost & Site-of-Care Redirection (\`/member360/care-options\` — F-27)
- Recommend high-value, in-network freestanding imaging, ambulatory surgical centers, or specialty clinics.
- Tracks **Cost Estimate** vs. **Potential Savings**, rolling directly into the Care Intelligence Dashboard's *Estimated Savings* KPI.`,
  },
  {
    id: 104,
    title: '4. VBC Risk Adjustment Coding Worklist & Suspect Workbench Guide',
    summary:
      'Standard operating procedures for CPC/CRC coders reviewing HCC v28 suspects, MEAT criteria validation, chase queues, and RAF analytics (1.25 target).',
    category: 'Value-Based Care & Coding',
    app_key: 'coding',
    allowed_roles: CODING_ROLES,
    hipaa_classification: 'HIPAA Minimum-Necessary Scoped',
    tags: ['coding', 'hcc-v28', 'meat', 'raf', 'manual'],
    content: `### 4.1 Coding Worklist & Chase Queues (\`/coding\` — F-32..F-33)
- Filter medical record chases by **Saved View** (*All chases*, *My chases*, *Unassigned*, *Overdue*, *Completed*), **Status** (*Open*, *In progress*, *Pending review*, *Audit feedback*, *Query pending*, *Completed*), and **Priority**.
- Open any chase (\`/coding/chases/:chaseId\`) to inspect chart metadata, rendering provider NPI, uploaded clinical PDFs, and coder audit notes.

### 4.2 Suspect Workbench & M.E.A.T. Validation (\`/coding/workbench/:memberId\` — F-34)
- Review AI- and Project Titan MRA-surfaced ICD-10 / CMS-HCC (\`v28\`) suspects alongside clinical evidence snippets.
- **Mandatory M.E.A.T. Criteria Verification:** Every captured diagnosis requires documented verification of:
  - **M**onitored (signs, symptoms, disease progression/regression)
  - **E**valuated (test results, medication effectiveness, physical exam response)
  - **A**ssessed (ordering tests, discussion, review of records, counseling)
  - **T**reated (medications, therapies, surgical/clinical interventions, referrals)
- Click **Finalize** to commit validated codes, recalculate member RAF impact, and log an immutable coding audit event.

### 4.3 RAF & Coding Analytics (F-35)
- Track realized vs. suspect RAF progression against the calibrated **\`1.25\` Medicare Advantage RAF target** and inspect the Suspect-to-Recapture conversion funnel.`,
  },
  {
    id: 105,
    title: '5. Executive RAF, PMPM Financials & Star Quality Dashboards Manual',
    summary:
      'Guide for Payer Executives, Billing Specialists, and Clinical Leaders analyzing Live RAF Delta, PMPM capitation trends, Suspects Funnel, and Provider Heatmaps.',
    category: 'Executive & Financial Analytics',
    app_key: 'dashboard',
    allowed_roles: FINANCIAL_EXEC_ROLES,
    hipaa_classification: 'HIPAA Minimum-Necessary Scoped',
    tags: ['dashboard', 'raf', 'pmpm', 'financials', 'payer-executive', 'billing', 'manual'],
    content: `### 5.1 Global Analytics Filter Bar (\`/dashboard\` & \`/member360/plan-performance\`)
- Slice population and financial metrics by **Model Year**, **Line of Business** (\`Medicare Advantage\`, \`Commercial\`, \`Medicaid\`), **Provider Group**, **Date Window**, and **CMS Submission Cutoff Date**.
- Toggle **Forecast Projections** to model year-end revenue and risk score trajectories.

### 5.2 Core Executive Visualizations
1. **Live RAF Delta Chart:** Tracks cumulative realized Risk Adjustment Factor against the **\`1.25\` benchmark target**.
2. **Suspects Conversion Funnel:** Visualizes volume across *Identified Suspects* -> *Chart Chase Queued* -> *Coder Reviewed* -> *CMS Accepted*.
3. **CMS Submission Deadline Radar:** Buckets open chases by urgency window with **1-Click CSV Export** for operational standups.
4. **Provider Performance Heatmap:** Benchmarks contracted provider groups by attributed member volume, open HCC/HEDIS gaps, and recapture rate.
5. **Clarity / GL Financial & PMPM Reconciliation:** Tracks medical/Rx PMPM cost trends, Medical Loss Ratio (\`MLR\`), and capitation settlement balances.`,
  },
  {
    id: 106,
    title: '6. Provider Directory (NPI) & NEMT Ride Booking Logistics Manual',
    summary:
      'Operational guide for searching contracted in-network NPI providers, verifying member attribution, and booking Non-Emergency Medical Transportation (NEMT) rides.',
    category: 'Provider Network & NEMT Logistics',
    app_key: 'providers',
    allowed_roles: [...CLINICAL_ROLES, 'payer_executive', 'billing', 'patient'],
    hipaa_classification: 'HIPAA Minimum-Necessary Scoped',
    tags: ['providers', 'npi', 'ride-booking', 'nemt', 'logistics', 'manual'],
    content: `### 6.1 Contracted NPI Provider Directory (\`/providers\` — G-07)
- Search in-network primary care physicians (\`PCPs\`) and specialists by **Provider Name**, **10-Digit NPI**, **Specialty**, or **Clinic/Facility**.
- **Live SFTP Attribution Metrics:** Each provider card displays live **Attributed Member Count** and **Open Care Gaps** rolled up from the 17-feed UHS SFTP eligibility roster.
- Click any provider row (\`/providers/:providerId\`) to inspect credentials, clinic locations, phone/fax details, and attributed patient panels.

### 6.2 NEMT Ride Booking & Partner Reconciliation (\`/ride-booking\`)
- **Rides Tab:** Schedule Non-Emergency Medical Transportation (*Uber Health*, *Lyft Healthcare*, *Wheelchair Van*, *BLS Stretcher*) by entering Member ID, Pickup/Dropoff addresses, and appointment date/time.
- **Partners Tab *(Staff Only)*:** View contracted transportation vendors, service coverage windows, and SLA metrics.
- **Payments Tab *(Staff & Billing Only)*:** Reconcile trip invoices against scheduled ride estimates.`,
  },
  {
    id: 107,
    title: '7. 17-Feed UHS SFTP Data Ingestion & 6 Live Client API Connectors Guide',
    summary:
      'Technical reference for the 17-feed UHS SFTP parser, 30-Day Redis Hot Cache, and live API integrations (QNXT, Talkdesk, Enterprise SSO, Abarca PBM, CareAdvance, Labs/Titan/GL).',
    category: 'Data Ingestion & Enterprise APIs',
    app_key: 'job_center',
    allowed_roles: [...ADMIN_INGESTION_ROLES, 'supervisor'],
    hipaa_classification: 'HIPAA Minimum-Necessary Scoped',
    tags: ['apis', 'qnxt', 'talkdesk', 'abarca', 'careadvance', 'redis', 'sftp', 'fhir'],
    content: `### 7.1 30-Day Redis Hot Cache Architecture (FR-DAT-02)
- Caches Member 360 and live API responses for **30 days (\`2,592,000\` seconds)** with automatic write-through invalidation on any clinical mutation.
- Guarantees **\`<500ms\` member roster search** and **\`<2.0s\` Member 360 cockpit load**.

### 7.2 6 Live Enterprise Client API Connectors (G-08)
1. **Live QNXT Core Payer API (\`/api/integrations/qnxt/sync\`):** Real-time Eligibility, Benefit Accumulators (\`Deductible\`/\`MOOP\`), Claims, and Master Patient Index (\`MPI\`) deduplication.
2. **Live Talkdesk CTI Webhook & AI Call Summary (\`/api/integrations/talkdesk/webhook\`):** Inbound screen-pop lookup, automated AI call summary note creation, \`@mention\` parsing, and follow-up task generation.
3. **Enterprise OIDC / SAML 2.0 SSO (\`/api/integrations/sso/verify-claims\`):** Maps corporate IdP groups across all 12 canonical HIPAA RBAC roles with deny-by-default security.
4. **Live Abarca PBM API (\`/api/integrations/abarca/sync\`):** Real-time pharmacy claims, **\`0-Refill\`** alerts, and **\`Pending Prior Authorization\`** task triggers.
5. **Live CareAdvance Two-Way Journey Sync (\`/api/integrations/careadvance/sync\`):** Bi-directional care plan enrollment and stage completion webhook sync.
6. **Clinical Labs, Project Titan MRA & Clarity/GL Finance APIs:** Automated LOINC lab ingestion with critical-value flags, prospective HCC v28 suspects, and GL PMPM financial feeds.

### 7.3 Batch File Uploads & FHIR R4 Pulls (\`/jobs/import-data\` & \`/jobs/status-center\`)
- Upload \`.csv\`, \`.txt\`, or \`.xlsx\` feeds (17-Feed UHS SFTP schema, MAO-004, Claims, Providers) or trigger SMART-on-FHIR R4 pulls (\`Patient\`, \`Coverage\`, \`Claim\`, \`Encounter\`, \`Observation\`).`,
  },
  {
    id: 108,
    title: '8. HIPAA Governance, 12-Role RBAC Matrix & Audit Log Compliance Manual',
    summary:
      'Compliance and administration reference for HIPAA Minimum-Necessary role scoping, Member 360 Audit Log inspection, user allotment, and security policies.',
    category: 'HIPAA Governance & Administration',
    app_key: 'settings',
    allowed_roles: SUPERVISOR_AUDITOR_ADMIN_ROLES,
    hipaa_classification: 'HIPAA Minimum-Necessary Scoped',
    tags: ['hipaa', 'rbac', 'audit-log', 'compliance', 'admin', 'security', 'manual'],
    content: `### 8.1 HIPAA Minimum-Necessary 12-Role RBAC Enforcement
Arc-8 enforces **dual-layer authorization**—combining backend FastAPI role/application guards (\`403 Access Denied\`) with frontend sidebar and chart-tab filtering across 12 canonical roles:
- **Leadership & Admin:** \`platform_admin\`, \`admin\` (System Admin), \`business_admin\` (denied clinical authoring), \`payer_executive\`.
- **Clinical & Care Delivery:** \`supervisor\` (Clinical/Ops Supervisor), \`coordinator\` (Care Coordinator), \`clinician\` (MD/DO), \`nurse\` (RN).
- **Specialized & Oversight:** \`compliance_auditor\` (Strict Read-Only across Timeline, Documents & Audit Log), \`coder\` (CPC/CRC), \`billing\`, and \`patient\` (Self-Service Member Portal).

### 8.2 Immutable HIPAA PHI Audit Trail (\`Audit Log\` Tab & \`tenant_audit_events\`)
- Every PHI read, search, note creation, task update, document download, and role change is stamped with:
  - **Actor Email & Active Role**
  - **Tenant ID & IP/Session Metadata**
  - **Event Type** (e.g., \`phi.member.view\`, \`docs.manual.query\`, \`docs.manual.download_pdf\`)
  - **UTC Timestamp**
- **Supervisors, Compliance Auditors, and Administrators** can inspect per-member access trails under the Member 360 **Audit Log** tab.

### 8.3 Role & Privileges Authority (\`/settings#privileges\`) & Master Admin (\`/admin/master\`)
- Dynamically toggle module or chart-tab privileges per role or configure per-user overrides while preserving HIPAA guardrails.
- Provision users, enforce password rotation, and manage tenant application licensing.`,
  },
  {
    id: 109,
    title: '9. Member Self-Service Portal Guide (My Health Documents & Medical Rides)',
    summary:
      'Patient-friendly guide for viewing personal health summaries, downloading paperless care documents/EOBs, and checking scheduled medical transportation.',
    category: 'Member Self-Service Portal',
    app_key: 'portal',
    allowed_roles: ALL_MANUAL_ROLES,
    hipaa_classification: 'HIPAA All-Role General Guide',
    tags: ['patient', 'member-portal', 'documents', 'rides', 'hipaa', 'manual'],
    content: `### 9.1 Welcome to Your Personal Health Portal
As a Prominence Health member, your Arc-8 account is strictly isolated to your own personal records under **HIPAA Privacy & Security Rules**.

### 9.2 Viewing & Downloading Your Health Documents
1. Open **Documents** from your portal home screen.
2. View or download your **Explanation of Benefits (\`EOB\`)**, **Personalized Care Plan**, **Preventive Visit Summaries**, and **Health Risk Assessments**.

### 9.3 Checking Your Medical Transportation (\`Ride Booking\`)
1. Open **Ride Booking** to see upcoming Non-Emergency Medical Transportation (\`NEMT\`) trips scheduled by your Care Coordinator.
2. Verify your **Pickup Time**, **Pickup Address**, **Clinic Destination**, and **Vehicle Type** (*Sedan* or *Wheelchair-Accessible Van*).
3. Need to reschedule a ride or ask a question about your benefits? Contact your assigned Care Coordinator directly from your portal dashboard.`,
  },
];

/**
 * Role-Scoped Step-by-Step Operational Playbooks (SOPs) for the Knowledge Base Hub.
 */
export const KNOWLEDGE_BASE_SOP_PLAYBOOKS = [
  {
    id: 'sop-1',
    title: 'SOP-01: Resolving an Inbound Member Call (Talkdesk CTI & Member 360)',
    category: 'Clinical Care Coordination',
    duration: '3–5 mins',
    allowed_roles: CLINICAL_ROLES,
    route: '/member360/members',
    routeLabel: 'Open Patient Roster',
    steps: [
      'Use the top-right Global Site Search box (or Patient Roster) to find the caller by Member ID, Name, DOB, or Phone.',
      'Check the Member 360 Header for unassigned PCP alerts, Risk Tier badge (Critical/High), and open HEDIS/HCC care gaps.',
      'For copay or accumulator questions, open the Claims & Benefits tab to inspect real-time QNXT Deductible and MOOP progress bars.',
      'For medication refills, open Medications & Labs to check Abarca PBM 0-Refill alerts or pending Prior Authorizations.',
      'Click Add Note to save your call summary (or verify the auto-posted Talkdesk AI Call Summary) and @mention a Nurse or Supervisor if escalation is needed.',
    ],
  },
  {
    id: 'sop-2',
    title: 'SOP-02: 48-Hour Post-Discharge Transition of Care Outreach',
    category: 'Transitional Care Management (TCM)',
    duration: '10–15 mins',
    allowed_roles: CLINICAL_ROLES,
    route: '/member360/care-journeys',
    routeLabel: 'Open Care Journeys',
    steps: [
      'Open Clinical Tasks (/member360/tasks) and filter by Urgent or Due Today to locate newly discharged inpatient/ED members.',
      'Launch the member chart and open the Care Journey tab to view the active Post-Discharge 30-Day Transition pathway and SBAR notes.',
      'Perform Medication Reconciliation in the Medications & Labs tab, confirming discharge prescriptions against active Abarca PBM fills.',
      'Schedule a 7-day follow-up PCP visit and book transportation in Ride Booking (/ride-booking) if the member lacks transit.',
      'Mark the Discharge Intake stage Completed (which syncs automatically two-way with CareAdvance).',
    ],
  },
  {
    id: 'sop-3',
    title: 'SOP-03: CMS-HCC v28 Suspect Validation & M.E.A.T. Documentation',
    category: 'Value-Based Care & Risk Adjustment',
    duration: '5–8 mins per chart',
    allowed_roles: CODING_ROLES,
    route: '/coding',
    routeLabel: 'Open Coding Worklist',
    steps: [
      'Open Coding Worklist (/coding) and filter by My Chases or Overdue priority queue.',
      'Click into the Chase detail or launch the Suspect Workbench (/coding/workbench/:memberId) to review Project Titan MRA and AI-surfaced ICD-10 suspects.',
      'Verify clinical chart evidence against all four M.E.A.T. criteria (Monitored, Evaluated, Assessed, Treated).',
      'Select the normalized CMS-HCC v28 ICD-10 code, attach supporting encounter citation notes, and click Finalize.',
      'Verify updated RAF impact on the Executive RAF Delta chart against the calibrated 1.25 MA benchmark target.',
    ],
  },
  {
    id: 'sop-4',
    title: 'SOP-04: Executive Plan Performance, MLR & PMPM Financial Review',
    category: 'Executive & Actuarial Analytics',
    duration: '5 mins',
    allowed_roles: FINANCIAL_EXEC_ROLES,
    route: '/member360/plan-performance',
    routeLabel: 'Open Plan Performance Console',
    steps: [
      'Open Executive Dashboards -> Plan Performance Console (/member360/plan-performance).',
      'Select Model Year, Line of Business (Medicare Advantage), Market, and Provider Group from the global filter bar.',
      'Review Plan Financials (PMPM) and Medical Cost Analytics tabs to compare Inpatient, Outpatient, Professional, and Pharmacy spend against budget.',
      'Open Provider MLR & Benchmarks to identify high-MLR provider groups with open HCC recapture or site-of-care redirection opportunities.',
      'Export deadline or cohort summaries to CSV for monthly actuarial and clinical leadership review.',
    ],
  },
  {
    id: 'sop-5',
    title: 'SOP-05: HIPAA Access Audit Review & Role Privilege Governance',
    category: 'HIPAA Compliance & Security',
    duration: '5 mins',
    allowed_roles: SUPERVISOR_AUDITOR_ADMIN_ROLES,
    route: '/settings#privileges',
    routeLabel: 'Open Role & Privileges Matrix',
    steps: [
      'To audit a specific patient chart, open the Member 360 chart and select the Audit Log tab (restricted to Supervisors, Compliance Auditors, and Admins).',
      'Inspect actor emails, timestamps, access reasons, and event types (phi.member.view, document download, note creation).',
      'To adjust role capabilities, open Role & Privileges (/settings#privileges) and select any of the 12 canonical roles.',
      'Toggle sidebar modules or Member 360 chart tabs on/off, or click Reset Permissions to restore baseline HIPAA Minimum-Necessary defaults.',
    ],
  },
  {
    id: 'sop-6',
    title: 'SOP-06: 17-Feed UHS SFTP Batch Upload & Live API Connector Sync',
    category: 'Data Engineering & Integrations',
    duration: '5 mins',
    allowed_roles: [...ADMIN_INGESTION_ROLES, 'supervisor'],
    route: '/jobs/import-data',
    routeLabel: 'Open Data Imports',
    steps: [
      'Open Data Imports (/jobs/import-data) to upload batch .csv, .txt, or .xlsx files for Members, Providers, Claims, MAO-004, or Charts.',
      'Verify that QNXT Master Patient Index (MPI) deduplication merges duplicate records sharing First Name + Last Name + DOB + Zip.',
      'Monitor background execution and row validation logs in the Job Status Center (/jobs/status-center).',
      'Confirm that the 30-Day Redis Hot Cache (2,592,000s TTL) refreshes automatically on write-through mutations.',
    ],
  },
];

/**
 * Searchable Clinical, VBC, Financial & Technical Glossary for the Knowledge Base Hub.
 */
export const KNOWLEDGE_BASE_GLOSSARY = [
  {
    term: 'CMS-HCC v28',
    category: 'Risk Adjustment & Coding',
    allowed_roles: ALL_MANUAL_ROLES,
    definition:
      'Centers for Medicare & Medicaid Services Hierarchical Condition Category Version 28 model used to calculate Risk Adjustment Factor (RAF) scores from validated ICD-10 diagnosis codes.',
  },
  {
    term: 'M.E.A.T. Criteria',
    category: 'Risk Adjustment & Coding',
    allowed_roles: CODING_ROLES,
    definition:
      'Mandatory medical record documentation standard for risk adjustment coding: Monitored, Evaluated, Assessed, and Treated. All 4 elements must be verified in the Suspect Workbench before finalizing an HCC code.',
  },
  {
    term: 'Calibrated RAF Target (1.25)',
    category: 'Executive & Financial Analytics',
    allowed_roles: [...FINANCIAL_EXEC_ROLES, ...CODING_ROLES],
    definition:
      'Prominence Health Medicare Advantage benchmark Risk Adjustment Factor target (calibrated to 1.25 on the Live RAF Delta dashboard) tracking realized vs. projected year-end risk capture.',
  },
  {
    term: 'SBAR Clinical Framework',
    category: 'Clinical Operations',
    allowed_roles: CLINICAL_ROLES,
    definition:
      'Situation, Background, Assessment, Recommendation—structured clinical handoff format used inside Member 360 Care Journeys and escalated clinical tasks.',
  },
  {
    term: 'HEDIS Care Gaps',
    category: 'Clinical Operations & Quality',
    allowed_roles: [...CLINICAL_ROLES, ...CODING_ROLES, ...FINANCIAL_EXEC_ROLES],
    definition:
      'Healthcare Effectiveness Data and Information Set quality measures (e.g., HbA1c Control, Breast Cancer Screening, Annual Wellness Visit) surfaced alongside ICD-10 candidates in the Clinical & Gaps tab.',
  },
  {
    term: 'Deductible & MOOP Accumulators',
    category: 'Claims & Benefits',
    allowed_roles: ALL_MANUAL_ROLES,
    definition:
      'Real-time QNXT benefit accumulators displayed in the Member 360 Claims & Benefits tab showing year-to-date progress toward annual Deductible and Maximum Out-of-Pocket (MOOP) limits.',
  },
  {
    term: 'Abarca PBM 0-Refill & Prior Auth Alerts',
    category: 'Pharmacy & Medications',
    allowed_roles: CLINICAL_ROLES,
    definition:
      'Live pharmacy benefit manager alerts in the Medications & Labs tab flagging active maintenance prescriptions with 0 refills remaining or pending Prior Authorization (PA) status.',
  },
  {
    term: 'QNXT MPI Deduplication',
    category: 'Data Ingestion & APIs',
    allowed_roles: [...ADMIN_INGESTION_ROLES, ...CLINICAL_ROLES],
    definition:
      'Master Patient Index matching logic that automatically deduplicates member records across MEM-* and PROM-* feeds using (First Name, Last Name, Date of Birth, Zip Code) and unifies risk scores onto a 0.0–10.0 scale.',
  },
  {
    term: '30-Day Redis Hot Cache (FR-DAT-02)',
    category: 'Platform Architecture',
    allowed_roles: [...ADMIN_INGESTION_ROLES, 'supervisor'],
    definition:
      'High-speed caching layer with a 30-day TTL (2,592,000 seconds) and automatic write-through invalidation guaranteeing <500ms member roster searches and <2.0s Member 360 chart loads.',
  },
  {
    term: 'HIPAA Minimum Necessary Standard',
    category: 'HIPAA Governance',
    allowed_roles: ALL_MANUAL_ROLES,
    definition:
      'Federal HIPAA Privacy Rule requirement enforced by Arc-8’s 12-role RBAC matrix so each user only sees the modules, patient chart tabs, site search results, and manual documentation required for their job function.',
  },
];

/**
 * Searchable Troubleshooting & FAQs for the Knowledge Base Hub.
 */
export const KNOWLEDGE_BASE_FAQS = [
  {
    id: 'faq-1',
    question: 'Why was my screen automatically locked after 15 minutes?',
    answer:
      'To protect Protected Health Information (PHI) on unattended workstations, Arc-8 enforces a 15-minute HIPAA inactivity lock (SessionLockOverlay). Re-enter your password on the lock overlay to resume without losing unsaved notes or chart state.',
    allowed_roles: ALL_MANUAL_ROLES,
  },
  {
    id: 'faq-2',
    question: 'Why can’t I see the Audit Log or Settings tab inside a patient’s Member 360 chart?',
    answer:
      'Under HIPAA Minimum-Necessary rules, the Member 360 Audit Log and Settings tabs are restricted to Clinical Supervisors, Compliance Auditors, Business Administrators, and System Administrators. Standard Care Coordinators and Coders see the 7 core clinical tabs.',
    allowed_roles: ALL_MANUAL_ROLES,
  },
  {
    id: 'faq-3',
    question: 'Why are "Add Note", "Create Task", or "Start Journey" buttons disabled for my account?',
    answer:
      'Strict Read-Only roles (Compliance Auditor) and non-clinical administrative roles (Business Administrator, Payer Executive) are prevented from authoring clinical encounter records to maintain clinical separation of duties.',
    allowed_roles: ALL_MANUAL_ROLES,
  },
  {
    id: 'faq-4',
    question: 'How does the top-right Global Site Search work across the platform?',
    answer:
      'Typing into the top-right Global Site Search box searches live across your role-authorized Patients, Contracted Providers, Clinical Tasks, System Screens, and Knowledge Base articles. Clicking "Explore Full Knowledge Base & Site Search" (or the Knowledge Base button) opens the full multi-tab Knowledge Base in a separate window.',
    allowed_roles: ALL_MANUAL_ROLES,
  },
  {
    id: 'faq-5',
    question: 'Why was my new documentation SOP blocked when I clicked Publish?',
    answer:
      'Arc-8 enforces an automated HIPAA Zero-PHI Guardrail on documentation publishing. Any article containing unmasked Social Security Numbers (XXX-XX-XXXX) or raw patient identifiers is rejected with HTTP 400.',
    allowed_roles: SUPERVISOR_AUDITOR_ADMIN_ROLES,
  },
];

/**
 * Catalog of system screens/modules for live Global Site Search.
 */
export const SITE_NAVIGATION_CATALOG = [
  {
    id: 'nav-care-intelligence',
    title: 'Care Intelligence Command Center',
    summary: 'Population KPIs, high-risk cohorts, open/overdue tasks, and estimated Care Option savings.',
    path: '/member360',
    badge: 'Clinical Ops',
    permission: 'menu:care_intelligence',
    denyRoles: ['payer_executive', 'patient'],
  },
  {
    id: 'nav-patient-roster',
    title: 'Patient Roster & Member 360 Search',
    summary: 'Search attributed members (<500ms) by ID, name, DOB, risk tier, or open care gaps.',
    path: '/member360/members',
    badge: 'Clinical Ops',
    permission: 'menu:patient_roster',
    denyRoles: ['payer_executive', 'patient'],
  },
  {
    id: 'nav-clinical-tasks',
    title: 'Clinical Tasks & SBAR Escalation Queue',
    summary: 'Manage open, urgent, overdue, and supervisor-escalated care coordination tasks.',
    path: '/member360/tasks',
    badge: 'Clinical Ops',
    permission: 'menu:tasks',
    denyRoles: ['payer_executive', 'patient'],
  },
  {
    id: 'nav-care-journeys',
    title: 'Care Journeys Protocol Center',
    summary: 'Post-discharge transitions, disease management pathways, and two-way CareAdvance sync.',
    path: '/member360/care-journeys',
    badge: 'Clinical Ops',
    permission: 'menu:care_journeys',
    denyRoles: ['payer_executive', 'patient'],
  },
  {
    id: 'nav-risk-intelligence',
    title: 'Population Risk Intelligence',
    summary: '4-domain unified 0–10 risk stratification and rising-risk cohort analytics.',
    path: '/member360/risk-intelligence',
    badge: 'Clinical Ops',
    permission: 'menu:risk_intelligence',
    denyRoles: ['payer_executive', 'patient'],
  },
  {
    id: 'nav-care-options',
    title: 'Care Options & Site-of-Care Redirection',
    summary: 'Recommend lower-cost in-network imaging, ambulatory centers, and specialty programs.',
    path: '/member360/care-options',
    badge: 'Clinical Ops',
    permission: 'menu:care_options',
    denyRoles: ['payer_executive', 'patient'],
  },
  {
    id: 'nav-coding-worklist',
    title: 'CMS-HCC v28 Coding Worklist & Suspect Workbench',
    summary: 'Medical chart chases, M.E.A.T. criteria verification, and ICD-10 to HCC v28 validation.',
    path: '/coding',
    badge: 'VBC & Coding',
    permission: 'menu:coding_worklist',
    denyRoles: ['payer_executive', 'patient'],
  },
  {
    id: 'nav-plan-performance',
    title: 'Executive Plan Performance Console (PMPM, MLR & RAF)',
    summary: 'Medicare Advantage PMPM financials, Medical Loss Ratio, Star Ratings, and 1.25 RAF target.',
    path: '/member360/plan-performance',
    badge: 'Executive Analytics',
    permission: 'menu:executive_dashboards',
  },
  {
    id: 'nav-providers',
    title: 'Contracted NPI Provider Directory',
    summary: 'Search in-network PCPs and specialists with attributed member and open gap counts.',
    path: '/providers',
    badge: 'Provider Network',
    permission: 'menu:provider_directory',
  },
  {
    id: 'nav-ride-booking',
    title: 'Ride Booking (NEMT Medical Transportation)',
    summary: 'Schedule Uber Health, Lyft, and wheelchair van rides and reconcile vendor payments.',
    path: '/ride-booking',
    badge: 'NEMT Logistics',
    permission: 'menu:ride_booking',
  },
  {
    id: 'nav-import-data',
    title: '17-Feed UHS SFTP & FHIR Data Imports',
    summary: 'Batch CSV/XLSX ingestion, SMART-on-FHIR R4 pulls, and Job Status Center logs.',
    path: '/jobs/import-data',
    badge: 'Data & APIs',
    permission: 'menu:master_admin',
  },
  {
    id: 'nav-role-privileges',
    title: 'HIPAA Role & Privileges Matrix (12-Role RBAC)',
    summary: 'Configure role permissions, Member 360 chart-tab visibility, and user role allotments.',
    path: '/settings#privileges',
    badge: 'HIPAA Governance',
    permission: 'menu:role_privileges',
  },
];

export const filterManualArticlesLocally = ({
  articles = DEFAULT_MANUAL_ARTICLES,
  query = '',
  role = 'coordinator',
  category = 'all',
  appKey = '',
} = {}) => {
  const qLower = (query || '').trim().toLowerCase();
  const roleKey = (role || '').trim().toLowerCase();
  const catLower = (category || 'all').trim().toLowerCase();
  const appLower = (appKey || '').trim().toLowerCase();

  return articles.filter((art) => {
    if (roleKey && roleKey !== 'all') {
      const allowed = Array.isArray(art.allowed_roles) && art.allowed_roles.length
        ? art.allowed_roles
        : ALL_MANUAL_ROLES;
      if (!allowed.includes(roleKey)) return false;
    }
    if (catLower && catLower !== 'all') {
      if ((art.category || '').toLowerCase() !== catLower) return false;
    }
    if (appLower && appLower !== 'all') {
      if ((art.app_key || '').toLowerCase() !== appLower) return false;
    }
    if (qLower) {
      const haystack = [
        art.title,
        art.summary,
        art.content,
        art.category,
        art.app_key,
        ...(art.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(qLower)) return false;
    }
    return true;
  });
};

export const searchDocsArticles = async ({
  token,
  tenant,
  query,
  role,
  category,
  appKey,
} = {}) => {
  if (!shouldUseApi(token)) {
    const filtered = filterManualArticlesLocally({
      articles: DEFAULT_MANUAL_ARTICLES,
      query,
      role,
      category,
      appKey,
    });
    return {
      articles: filtered,
      total: filtered.length,
      active_role: role || 'coordinator',
      hipaa_compliant: true,
      audit_logged: true,
    };
  }
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (role) params.set('role', role);
  if (category && category !== 'all') params.set('category', category);
  if (appKey && appKey !== 'all') params.set('app_key', appKey);
  const qs = params.toString();
  const response = await fetch(`${API_BASE}/api/docs/articles${qs ? `?${qs}` : ''}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(response);
};

export const createDocsArticle = async ({ token, tenant, payload } = {}) => {
  if (!shouldUseApi(token)) {
    return {
      id: Date.now(),
      ...payload,
      hipaa_classification: 'HIPAA Minimum-Necessary Scoped',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  const response = await fetch(`${API_BASE}/api/docs/articles`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

/**
 * Unified Role-Scoped Site-Wide Search across Live Patients, Providers, Clinical Tasks,
 * System Screens, SOP Playbooks, Glossary Terms, and User Manual Chapters.
 */
export const performUnifiedSiteSearch = async ({
  query = '',
  token,
  tenant = 'prominencehealth',
  role = 'coordinator',
  can = () => true,
  limitPerGroup = 5,
} = {}) => {
  const term = String(query || '').trim();
  const termLower = term.toLowerCase();
  const roleKey = (role || 'coordinator').toLowerCase();
  const apiBase = resolveApiBase();
  const headers = buildHeaders(token, tenant);

  const canSearchPatients =
    roleKey !== 'patient' &&
    roleKey !== 'payer_executive' &&
    can('menu:patient_roster');
  const canSearchProviders = can('menu:provider_directory');
  const canSearchTasks =
    roleKey !== 'patient' &&
    roleKey !== 'payer_executive' &&
    can('menu:tasks');

  // 1. Filter System Screens / Modules
  const screens = SITE_NAVIGATION_CATALOG.filter((item) => {
    if (item.denyRoles?.includes(roleKey)) return false;
    if (item.permission && !can(item.permission)) return false;
    if (!termLower) return true;
    return `${item.title} ${item.summary} ${item.badge}`.toLowerCase().includes(termLower);
  }).slice(0, limitPerGroup);

  // 2. Filter User Manual Chapters
  const manuals = filterManualArticlesLocally({
    query: term,
    role: roleKey,
  }).slice(0, limitPerGroup);

  // 3. Filter SOP Playbooks
  const playbooks = KNOWLEDGE_BASE_SOP_PLAYBOOKS.filter((sop) => {
    if (roleKey !== 'all' && !sop.allowed_roles.includes(roleKey)) return false;
    if (!termLower) return true;
    return `${sop.title} ${sop.category} ${sop.steps.join(' ')}`.toLowerCase().includes(termLower);
  }).slice(0, limitPerGroup);

  // 4. Filter Glossary Terms
  const glossary = KNOWLEDGE_BASE_GLOSSARY.filter((g) => {
    if (roleKey !== 'all' && !g.allowed_roles.includes(roleKey)) return false;
    if (!termLower) return true;
    return `${g.term} ${g.category} ${g.definition}`.toLowerCase().includes(termLower);
  }).slice(0, limitPerGroup);

  let members = [];
  let providers = [];
  let tasks = [];

  if (term.length >= 2 && shouldUseApi(token)) {
    const requests = [];

    if (canSearchPatients) {
      requests.push(
        fetch(
          `${apiBase}/api/member360/members?search=${encodeURIComponent(term)}&page_size=${limitPerGroup}`,
          { headers }
        )
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            members = (data?.items || []).slice(0, limitPerGroup).map((m) => ({
              id: m.id,
              memberKey: m.member_key || m.external_id || `MEM-${m.id}`,
              name: `${m.first_name || ''} ${m.last_name || ''}`.trim() || `Member #${m.id}`,
              riskTier: m.risk_tier || 'Moderate',
              pcp: m.primary_care_provider || 'Unassigned PCP',
              openGaps: m.open_care_gaps ?? 0,
              path: `/member360/members/${m.id}`,
            }));
          })
          .catch(() => {})
      );
    }

    if (canSearchProviders) {
      requests.push(
        fetch(
          `${apiBase}/api/coding/providers?search=${encodeURIComponent(term)}&limit=${limitPerGroup}`,
          { headers }
        )
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            const items = Array.isArray(data) ? data : data?.items || data?.providers || [];
            providers = items.slice(0, limitPerGroup).map((p) => ({
              id: p.id,
              name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Provider',
              npi: p.npi || 'N/A',
              specialty: p.specialty || 'Primary Care / Specialist',
              memberCount: p.member_count ?? 0,
              openGaps: p.open_gaps ?? 0,
              path: p.id ? `/providers/${p.id}` : '/providers',
            }));
          })
          .catch(() => {})
      );
    }

    if (canSearchTasks) {
      requests.push(
        fetch(`${apiBase}/api/member360/tasks?limit=30`, { headers })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            const allTasks = data?.items || [];
            tasks = allTasks
              .filter((t) =>
                `${t.title || ''} ${t.description || ''} ${t.member_name || ''} ${t.status || ''}`
                  .toLowerCase()
                  .includes(termLower)
              )
              .slice(0, limitPerGroup)
              .map((t) => ({
                id: t.id,
                title: t.title,
                status: t.status || 'open',
                priority: t.priority || 'medium',
                memberName: t.member_name || (t.member_id ? `Member #${t.member_id}` : 'General'),
                path: t.member_id ? `/member360/members/${t.member_id}` : '/member360/tasks',
              }));
          })
          .catch(() => {})
      );
    }

    await Promise.all(requests);
  }

  return {
    query: term,
    role: roleKey,
    members,
    providers,
    tasks,
    screens,
    manuals,
    playbooks,
    glossary,
    totalCount:
      members.length +
      providers.length +
      tasks.length +
      screens.length +
      manuals.length +
      playbooks.length +
      glossary.length,
  };
};

export const downloadUserManualPdfUrl = () => `${API_BASE}/api/docs/manual.pdf`;
