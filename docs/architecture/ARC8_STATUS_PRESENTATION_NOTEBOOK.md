# Arc-8 (Member 360) — Sprint Status & Live System Presentation
**Client:** Prominence Health First Inc. (SOW No. 3)  
**Presenter:** Syed Sana Ul Haq Fazli (Architecture & Full-Stack Lead)  
**Project Lead:** Wayne White | **Call Center Stakeholder:** Jimmy  

---

## Slide 1: Executive Summary — Where Arc-8 Stands Today
- **Enterprise Branded & Multi-Tenant Ready:** Standardized the platform under unified **Arc-8** branding, isolated for the `prominencehealth` tenant.
- **Full Azure-to-AWS Migration Completed (`SP1-01`):** Both the **React Frontend** and **FastAPI Backend** have been completely shifted from Microsoft Azure to **AWS** with zero Azure runtime dependencies.
- **Enterprise Auth & Fine-Grained RBAC Live (`SP1-02`):** Implemented OIDC Single Sign-On (SSO), IdP group-to-role mapping (deny-by-default), and real JWT role switching across 6 core Prominence personas.
- **Scoped Navigation & Talkdesk Screen-Pop (`SP1-03`):** Care Coordinators land directly on Member 360 with nested left-sidebar menus and URL deep-linking (`?memberId=` & `?search=`).
- **QA Verified & Automated Deployment:** Resolved 10/10 QA audit items and automated deployments across AWS CloudFront, Dev (`:7777`), and QA Testing (`:7778`).

---

## Slide 2: Frontend & Backend Migration — From Azure to AWS (`SP1-01`)
- **Legacy State Removed:** Decoupled Azure Static Web Apps, Azure Key Vault, Azure Blob Storage, and Azure Entra ID.
- **Frontend Shifted to AWS:**
  - React production bundle hosted on **AWS CloudFront + S3** and dedicated AWS EC2 containers (**Dev `:7777`** and **QA Testing `:7778`**).
  - Dynamic API port resolution connects all 19 frontend services seamlessly to the AWS backend (`:8989`).
- **Backend & Storage on AWS:**
  - **FastAPI (`:8989`)** + **PostgreSQL 16** + **Redis 7** with `/health/live` and `/health/ready` returning `200 OK`.
  - Built multi-tenant **Amazon S3 Document Storage** (`S3Backend`) alongside local storage for member PDFs, forms, and EOBs.
  - Automated one-click deployment script (`deploy-aws.ps1`) builds, uploads, seeds, and verifies health checks.

---

## Slide 3: Aligning with Jimmy's Simplified Care Coordinator Vision
- **Business Goal (Wayne & Jimmy's Feedback):**
  - Call-center Care Coordinators handle ~60,000 calls/month and are not doctors—their initial screen must be **clean, fast, and non-complex at the start** (Eligibility, PCP on file, Open Cases, Demographics, Recent Call History).
- **Why Arc-8 Is Already Ahead of the Game:**
  - **Left-Sidebar Nesting Built:** Out-of-scope and complex modules (Coding Worklist, Master Admin, Audit Logs) are already hidden from Care Coordinators.
  - **Dynamic Sub-Tab Filtering Built:** Every horizontal tab in Member 360 is controlled by live role permissions.
  - **Zero-Code Simplification:** Using our **Role & Privileges Manager**, we can turn off clinical-heavy tabs for Care Coordinators on Day 1 so they only see **Overview, Claims, Notes/Timeline, and Documents**, while Nurses and Supervisors still see the full clinical chart.

---

## Slide 4: End-to-End Call Center Workflow (`RTM-02` to `RTM-09`)
1. **Care Intelligence Dashboard (`RTM-09`):** Command center showing active workflows, high-risk cohorts, open tasks, and "My To-Dos".
2. **Sub-Second Search & Screen-Pop (`RTM-02`, `SP1-03`):** Instant lookup by Member ID, Name, Phone, or Benefit Plan + automatic Talkdesk URL screen-pop (`?memberId=`).
3. **Member 360 Alert Header (`RTM-03`):** Surfaces Plan/Eligibility, PCP link, **Missing PCP alert**, **Open Care Gaps count**, and **0-Refill Rx warnings** on one screen.
4. **Everyday Agent Tabs (`RTM-03`, `RTM-06`, `RTM-07`):**
   - **Overview & Timeline:** Chronological history of calls, claims, and touchpoints so the next agent has full context.
   - **Encounters / Claims:** Paid/pending claim status plus Deductible and Out-of-Pocket (MOOP) accumulators.
   - **Notes & Tasks:** Log call notes / Talkdesk AI summaries, create follow-up tasks, or escalate to Supervisors.
   - **Documents:** Upload, inline browser preview, and download of member documents backed by AWS S3.

---

## Slide 5: Live Role-Based Personas in Arc-8 (`SP1-02`, `RTM-08`, `RTM-10`)
- **1. Clara Diaz, RN — Care Coordinator / Advocate (`coordinator`)**
  - Lands directly on Member 360. Sees clean Patient Roster, Overview, Timeline, Claims, Notes, Tasks, and Documents. Blocked from Admin, Coding, and Audit Logs.
- **2. Elena Rostova, RN — Clinical Care Nurse (`nurse`)**
  - Unlocks full clinical depth: **Care Journeys** (`RTM-05`), post-discharge milestones, **Medications & Labs**, and **Risk & HCC Care Gaps** (`RTM-04`).
- **3. Marcus Vance, MHA — Clinical Operations Supervisor (`supervisor`)**
  - Unlocks **Supervisor Escalation Queue**, **Sharing Controls**, **HIPAA Audit Log** (`RTM-08`), and workspace Settings.
- **4. David Hayes, CHC — HIPAA & Compliance Auditor (`compliance_auditor`)**
  - Full visibility into HIPAA Audit Logs, sharing trails, and member records, with **strict backend read-only enforcement** (all write/edit API calls blocked with HTTP 403).
- **5. Victoria Reed — Business Administrator (`business_admin`)**
  - Manages user allotments, routing policies, and operational templates; **strictly blocked from authoring clinical records**.
- **6. Alexandra Vance — System Administrator (`admin`)**
  - Full access to the **User Directory** and interactive **Role & Privileges Manager** (`RTM-10`) to toggle any sidebar menu or Member 360 tab per role in real time.

---

## Slide 6: UI Polish, Accessibility & Documentation (`SP1-04`)
- **Clean Light & Dark Mode:** High-contrast **Light Mode** (matching Jimmy's clean call-center aesthetic) and **Dark Mode** selectable under `Settings -> General`.
- **Multi-Language Support (i18n):** Live UI translation across **English**, **Spanish**, and **French** for diverse care teams.
- **Completed Architecture & QA Documentation (`SP1-04`):**
  - Architecture Assessment Memo (`#104`) & Target AWS Architecture ADR (`#4889`).
  - Requirements Traceability Matrix & Sprint 1 Backlog (`A8S-28`).
  - Functional Requirements Document (FRD), Prominence Role Validation Brief, and QA Tester User Manual.

---

## Slide 7: Decisions & Next Steps with Leadership
1. **Default Care Coordinator Preset (Jimmy's Request):** Confirm turning off advanced clinical sub-tabs by default for `Clara Diaz` (Care Coordinator) so agents start with the simplified 4–5 tab Member Overview, while keeping full tabs enabled for Nurses (`Elena`) and Supervisors (`Marcus`).
2. **Client Data Feeds (ETL / SFTP):** Finalize sample schemas with Prominence SMEs for QNXT (claims/eligibility), Abarca (pharmacy), and CareAdvance (care journeys).
3. **Sensitive-Record Rules:** Confirm 42 CFR Part 2 / restricted record visibility rules between Member Services and Clinical staff.
