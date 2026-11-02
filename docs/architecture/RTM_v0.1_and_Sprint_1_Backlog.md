# [A8S-28] Requirements Traceability Matrix (RTM v0.1) & Prioritized Sprint 1 Backlog

**Project:** Arc8 MVP — Prominence Health First Inc. (SOW No. 3)  
**Deliverable:** Sprint 0 Exit Deliverable `A8S-28` (Input to Deliverable D2)  
**Owner:** Syed Sana Ul Haq Fazli (Architecture & Full-Stack Lead)  
**Co-Reviewers:** Wayne White (Project Lead), Shahzad Sultan (Sr. QA Engineer), Ramesh B (Data Lead), Shaheer Sarwar (Sr. DevOps)  
**Date:** October 15, 2026  
**Status:** Ready for Sprint 1 Planning  

---

## 1. Requirements Traceability Matrix (`RTM v0.1`)

This matrix maps the **10 SOW Core Capabilities** (and Prominence CAHPS / Member Journey drivers) to their 3R technical implementation path, target sprint, and verification method.

| RTM ID | SOW Capability | Priority | Functional Requirement & CAHPS / Strategy Link | Codebase Asset & 3R Classification | Target Sprint | Verification / QA Method |
| :--- | :--- | :---: | :--- | :--- | :---: | :--- |
| **RTM-01** | **Portal Shell & Access (SSO & RBAC)** | **P1** | Single sign-on via OIDC (AWS Cognito), role-based access (`Coordinator`, `Supervisor`, `Admin`), tenant context (`X-Tenant-Key: prominencehealth`), and hiding out-of-scope monorepo modules via `PORTAL_APPLICATIONS`. | **Refactor:** `backend/app/routes/auth.py`, `middleware/tenant.py`, `frontend/src/context/AuthContext.js` | **Sprint 1** | Unit + Integration + E2E Role Gate Test |
| **RTM-02** | **Multi-Attribute Member Search** | **P1** | Fast (<500ms) search and filtering by Member ID, First/Last Name, Phone (for Talkdesk screen-pop), or Benefit Plan against PostgreSQL `m360_members`. | **Reuse/Refactor:** `backend/app/routes/member360.py` (`GET /api/member360/members`), `Member360Dashboard.js` | **Sprint 2** | API Integration + Perf Baseline Test |
| **RTM-03** | **Member 360 Unified Profile** | **P1** | Consolidated single-pane cockpit displaying Demographics, Eligibility/Coverage, Care Team/PCP, Chronic Conditions, Acute Utilization (ER/IP from QNXT), Pharmacy/Rx fills & rejections (Abarca), and recent touchpoints. | **Reuse/Refactor:** `GET /api/member360/members/{id}`, `m360_*` tables, `frontend/src/pages/platform/member360-lab/` | **Sprint 2** | E2E UI + Data Reconciliation Test |
| **RTM-04** | **Risk Scores & Stratification** | **P1** | Normalized member risk score gauge with explainable clinical drivers (e.g., ER visits, Rx adherence gaps) and filterable rising-risk cohort queues. | **Reuse/Refactor:** `GET /api/member360/risk-insights`, `m360_risk_insights`, `memberRiskService.js` | **Sprint 3** | Data Validation + Risk Rules Unit Test |
| **RTM-05** | **Care Journeys** | **P1** | Structured care pathways (Post-Discharge Transition of Care, Diabetes, CHF), stage progression, clinical goals, milestones, and coordinator assignment. | **Reuse/Refactor:** `GET/POST /api/member360/care-journeys`, `m360_care_journeys`, `m360_care_journey_templates` | **Sprint 3** | API Integration + E2E Workflow Test |
| **RTM-06** | **Escalation Workflows & Tasks** | **P1** | Task creation/assignment, coordinator worklist, configurable escalation triggers (missed 48-hr post-discharge follow-up, sudden risk spike), and supervisor queue. | **Refactor:** `GET/POST/PATCH /api/member360/tasks`, `m360_tasks` | **Sprint 4** | API Integration + Trigger Rule Test |
| **RTM-07** | **Communication Log** | **P1** | Manual logging of calls, clinical notes, and outreach attempts displayed chronologically on the Member 360 timeline for First-Contact Resolution. | **Reuse/Refactor:** `POST /api/member360/members/{id}/notes`, `m360_notes`, `m360_messages` | **Sprint 4** | E2E Coordinator Workflow Test |
| **RTM-08** | **HIPAA Audit Logging** | **P1** | Tamper-evident record of every view, modification, or export of member records (`actor_id`, `tenant`, `member_id`, `action`, `ip`, `timestamp`) persisted to DB and shipped to AWS CloudWatch. | **Refactor:** `GET /api/member360/admin/audit`, `tenant_audit_events` immutability trigger | **Sprint 1 & 4** | Security & Compliance Audit Test |
| **RTM-09** | **Coordinator Dashboard** | **P2** | Aggregated workspace widgets showing My Assigned Members, Open/Overdue Tasks, Rising-Risk Alerts, and Saved Items. | **Reuse/Refactor:** `GET /api/member360/dashboard`, `Member360LabPage.js` | **Sprint 4** | UI Component & API Test |
| **RTM-10** | **Provider Directory & Basic Admin** | **P2** | In-network provider lookup linked to member care teams and basic admin role/threshold configuration. | **Reuse:** `GET /api/member360/care-options`, `/api/admin/users` | **Sprint 4** | Functional QA Verification |

---

## 2. Prioritized Sprint 1 Backlog (`Oct 19 – Oct 30, 2026`)

**Sprint 1 Goal:** Deploy the Member 360 walking skeleton to **AWS Dev** exclusively through the GitHub Actions OIDC CI/CD pipeline, decoupled from Azure runtime dependencies, backed by PostgreSQL with Alembic-managed schemas, and protected by OIDC/RBAC authentication.

| Story ID | Workstream & Owner | Story Title | Priority | Story Points | Traces To |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **SP1-01** | **Full-Stack / Arch (Syed)** | Decouple Backend & Frontend Runtime from Azure Dependencies (Walking Skeleton) | **Urgent (P1)** | 5 | `RTM-01` |
| **SP1-02** | **Full-Stack / Arch (Syed)** | Implement OIDC/Cognito Auth Middleware & RBAC Personas (`Coordinator`, `Supervisor`, `Admin`) | **Urgent (P1)** | 5 | `RTM-01`, `RTM-08` |
| **SP1-03** | **Full-Stack / Arch (Syed)** | Configure Portal Shell to Scope Navigation Strictly to Member 360 & Support URL Screen-Pop | **High (P1)** | 3 | `RTM-01`, `RTM-02` |
| **SP1-04** | **Full-Stack / Arch (Syed)** | Submit Deliverable D2 (Solution Design, Security Architecture & RTM v1.0) | **Urgent (P1)** | 3 | `Deliverable D2` |
| **SP1-05** | **DevOps (Shaheer)** | Provision AWS Dev Environment via Terraform (VPC, ECS/Lambda, RDS Postgres, S3+CloudFront) | **Urgent (P1)** | 8 | `M4`, `D3` |
| **SP1-06** | **DevOps (Shaheer)** | Enforce GitHub Actions CI/CD Gates (Lint, Unit Tests, SAST, Trivy, SBOM) & AWS OIDC Deploy | **Urgent (P1)** | 5 | `M4`, `D7` |
| **SP1-07** | **Data Arch (Ramesh)** | Bring `m360_*` Tenant Tables Under Formal Alembic Migrations on PostgreSQL & Seed Synthetic v1 | **Urgent (P1)** | 5 | `RTM-02`, `RTM-03` |
| **SP1-08** | **QA & Testing (Shahzad)** | Wire Automated Pytest (167 Backend Tests) & Jest Member 360 Suite into CI & Verify AWS Dev | **High (P1)** | 5 | `M4`, `RTM-01` |

---

## 3. Detailed Acceptance Criteria for Syed's Sprint 1 Stories

### Story `SP1-01`: Decouple Backend & Frontend Runtime from Azure Dependencies
* **Description:** Remove runtime coupling to Azure Key Vault, Azure Blob Storage, and Azure Entra ID in `backend/app/core/config.py` and `frontend/` so the application boots cleanly in AWS Dev using AWS Secrets Manager / environment config and S3-compatible storage abstractions.
* **Acceptance Criteria:**
  1. `GET /health/live` and `GET /health/ready` return HTTP `200 OK` on AWS Dev.
  2. Zero unhandled exceptions when `AZURE_*` environment variables are unset.
  3. Committed git artifacts (`frontend/node_modules`, local `.db` files, `.log` files) are cleaned from tracking and added to `.gitignore`.

### Story `SP1-02`: Implement OIDC/Cognito Auth Middleware & RBAC Personas
* **Description:** Standardize JWT validation in FastAPI to verify OIDC tokens (AWS Cognito / standard JWKS) alongside local dev fallback, and enforce the three Prominence personas (`Coordinator`, `Supervisor`, `Admin`).
* **Acceptance Criteria:**
  1. Valid OIDC JWT with `X-Tenant-Key: prominencehealth` authenticates and resolves tenant context.
  2. Role decorators restrict `/api/member360/admin/*` routes to `Admin` and supervisor escalation queues to `Supervisor` / `Admin`.
  3. Unauthenticated or cross-tenant requests return `401 Unauthorized` / `403 Forbidden` and write an entry to `tenant_audit_events`.

### Story `SP1-03`: Configure Portal Shell to Scope Navigation Strictly to Member 360
* **Description:** Configure `PORTAL_APPLICATIONS` and frontend router guards so only the in-scope **Member 360** staff workspace (`frontend/src/pages/platform/member360-lab/`) and Admin settings are exposed in the navigation shell, hiding out-of-scope monorepo modules (ride-booking, marketing website, Streamlit, etc.).
* **Acceptance Criteria:**
  1. Logging in as a Care Coordinator lands directly on the Member 360 workspace.
  2. Out-of-scope modules are hidden from the sidebar and blocked by route guards.
  3. Deep-linking via `?memberId=<id>` or `?search=<query>` opens the target member profile directly (supporting Talkdesk screen-pop).

---

## 4. Definition of Done (DoD) Enforced on Every Sprint 1 Story
1. Acceptance criteria met and linked to a `RTM` ID above.
2. PR reviewed and approved by Tech Lead (**Syed Sana Fazli**); CI pipeline 100% green (build, lint, unit tests, SAST/secret scan).
3. Deployed to **AWS Dev** via GitHub Actions OIDC (no static AWS keys) and verified by QA (**Shahzad**).
4. Zero open Severity 1 or Severity 2 defects; zero real PHI (100% synthetic data).
5. Relevant documentation / ADR updated in `docs/architecture/`.
