# Deliverable D1: Codebase Discovery, 3R Assessment & Target AWS Baseline

| Document Metadata | Details |
| :--- | :--- |
| **Project** | Arc-8 MVP — Prominence Health First Inc. (SOW No. 3) |
| **Deliverable ID** | **Deliverable D1** (Codebase Assessment, 3R Matrix & Target Architecture Baseline) |
| **Submission Date** | October 20, 2026 |
| **Author / Owner** | Syed Sana Ul Haq Fazli (Architecture & Full-Stack Lead) |
| **Co-Reviewers** | Wayne White (Project Lead), Shaheer Sarwar (Sr. DevOps Lead), Ramesh Muralasetty (Data Lead), Shahzad Sultan (Sr. QA Engineer) |
| **Status** | **Submitted & Approved** |
| **Related Artifacts** | [ARCHITECTURE_ASSESSMENT_MEMO.md](./ARCHITECTURE_ASSESSMENT_MEMO.md), [ADR-001-aws-target-architecture.md](./ADR-001-aws-target-architecture.md), [FUNCTIONAL_REQUIREMENTS_DOCUMENT.md](../FUNCTIONAL_REQUIREMENTS_DOCUMENT.md) |

---

## 1. Executive Summary

**Deliverable D1** establishes the technical baseline for the **Arc-8 (Member 360)** platform for **Prominence Health First Inc.** Following a comprehensive walkthrough of the inherited `Nexora Lab` monorepo and alignment with Prominence Health's operational leadership (Daniel Silva, 58-minute live system walkthrough), the architecture team audited the repository across backend services, frontend SPAs, database schemas, and infrastructure scripts.

### Key Findings & Strategic Decisions
1. **Operational Positioning ("Single Pane of Glass"):** Arc-8 is positioned strictly as the internal **Member 360 Care Advocacy & Care Coordination Command Center** (NOC) for Prominence Health's call center advocates (~60,000 claim-status calls/month), nurses, and supervisors. External member/provider portals remain in **AaNeel**.
2. **The 3R Disposition (`40% Reuse / 35% Refactor / 25% Rebuild`):**
   - **Reuse (~40%):** FastAPI Member 360 domain routes (`backend/app/routes/member360.py`), SQLAlchemy `m360_*` relational models (`backend/app/models/member360.py`), multi-tenant context resolution (`backend/app/middleware/tenant.py`), and the React portal shell (`frontend/src/pages/platform/member360-lab/`).
   - **Refactor (~35%):** Decouple runtime configuration (`backend/app/core/config.py`) from Azure Key Vault/Blob/Entra ID; standardize authentication on OIDC/JWT + RBAC (`backend/app/utils/rbac.py`); bring `m360_*` tables under formal PostgreSQL Alembic migrations; consolidate Member 360 UI into 8 role-gated operational tabs; rebrand `Nexora Lab` to `Arc-8`.
   - **Rebuild (~25%):** Replace legacy Azure Bicep/PowerShell scripts (`infra/azure/`) with HIPAA-eligible **AWS Infrastructure** (Amazon S3 + CloudFront, EC2/ECS compute, RDS PostgreSQL 16, ElastiCache Redis 7, AWS Secrets Manager, CloudWatch WORM logs) and build automated SFTP/batch ETL & 10-year CMS cold archival pipelines.

---

## 2. Inherited Repository Audit & Topology

```text
Arc-8/
├── backend/                        # FastAPI async service (Python 3.12+ / SQLAlchemy 2.0)
│   ├── alembic/                    # Control & Tenant schema migrations
│   ├── app/
│   │   ├── core/                   # Settings (config.py), logging_config.py, redis.py
│   │   ├── db/                     # Control plane & per-tenant async session managers
│   │   ├── dependencies/           # FastAPI DI for TenantContext & RBAC
│   │   ├── events/                 # CloudEvents envelope, transactional outbox & publisher
│   │   ├── middleware/             # tenant.py, rate_limit.py, request_logging.py, security_headers.py
│   │   ├── models/                 # SQLAlchemy ORM models (member360.py, tables.py, coding.py)
│   │   ├── routes/                 # Domain routers (member360.py, auth.py, admin.py, etc.)
│   │   ├── schemas/                # Pydantic v2 request/response contracts
│   │   ├── services/               # Domain business logic, storage abstractions, analytics
│   │   └── utils/                  # rbac.py, security.py, encryption.py, phi_audit.py, audit_logger.py
│   └── tests/                      # 167+ automated Pytest unit/integration/security tests
├── frontend/                       # Internal Staff Portal SPA (React 18 + CRACO + Bootstrap)
│   └── src/
│       ├── components/             # PortalPageLayout, PortalNav, CommandPalette, RBAC guards
│       ├── context/                # AuthContext.js, ThemeContext.js
│       ├── pages/platform/         # member360-lab/ (Cockpit, Roster, Care Intelligence, Admin)
│       └── services/               # API clients with dynamic port/origin resolution
├── deploy-aws.ps1                  # Automated AWS deployment & environment provisioning script
├── docker-compose.yml              # Multi-container orchestration (Backend, Frontend, Postgres 16, Redis 7)
└── docs/                           # SOW Deliverables, FRD, ADRs, Runbooks & Tester User Manual
```

---

## 3. Comprehensive 3R Component Matrix (Reuse / Refactor / Rebuild)

| Layer | Subsystem / File Path | 3R Decision | Technical Rationale & Sprint 1 Action Taken |
| :--- | :--- | :---: | :--- |
| **Backend Core** | `backend/app/core/config.py` | **REFACTOR** | Removed hard runtime failures when `AZURE_*` env vars are absent; added AWS S3, Secrets Manager, and dynamic CORS/origin support. |
| **Multi-Tenancy** | `backend/app/middleware/tenant.py`, `db/tenant_manager.py` | **REUSE** | Per-request `X-Tenant-Key` (`prominencehealth`) resolution and isolated database routing work reliably under asyncpg. |
| **Auth & RBAC** | `backend/app/routes/auth.py`, `utils/rbac.py`, `utils/security.py` | **REFACTOR** | Standardized OIDC/JWKS + JWT validation; implemented deny-by-default `ROLE_CAPABILITIES` matrix for `coordinator`, `supervisor`, `business_admin`, `compliance_auditor`, `analyst`, and `admin`. |
| **Member 360 API** | `backend/app/routes/member360.py`, `services/member360.py` | **REUSE / REFACTOR** | Preserved rich domain endpoints (search, profile, claims, accumulators, gaps, meds, labs, journeys, tasks, notes, documents) while adding strict capability gates and PHI audit hooks. |
| **Data Model** | `backend/app/models/member360.py` (`m360_*` tables) | **REUSE / REFACTOR** | 16 normalized `m360_*` tables cover 90%+ of Prominence Health requirements; transitioning from runtime `create_all` to formal Alembic migrations + Provider $\leftrightarrow$ Facility $M:N$ mapping. |
| **Security & PHI** | `backend/app/utils/encryption.py`, `utils/phi_audit.py` | **REUSE** | `MultiFernet` column-level `EncryptedString` and dual-sink append-only HIPAA audit logging (`phi_audit` + `tenant_audit_events`) meet HIPAA §164.312(a)(2)(iv) & §164.312(b). |
| **Document Storage** | `backend/app/services/member360_storage.py` | **REFACTOR** | Decoupled from Azure Blob Storage; supports local encrypted volume and AWS S3 SSE-KMS buckets for member PDFs/HRAs. |
| **Staff Frontend** | `frontend/src/pages/platform/member360-lab/` | **REFACTOR** | Rebranded to **Arc-8**; hidden out-of-scope modules (`Ride Booking`, `Coding Worklist` for non-coding roles, `Messages`, `Portal Preview`, redundant `Chart` tab); filtered horizontal sub-tabs by role permissions. |
| **External Portal** | `frontend-member/`, `edge/member-portal/` | **DEFER (OUT OF SCOPE)** | Excluded from AWS deployment per SOW No. 3 because Prominence uses **AaNeel** for external member/provider portals. |
| **Cloud Infra** | `infra/azure/*` $\rightarrow$ AWS CloudFront / EC2 / ECS / RDS | **REBUILD** | Replaced Azure Bicep topology with AWS CloudFront (`https://dmp0wwecjzzmr.cloudfront.net`), AWS compute environments (`:7777` Dev, `:7778` Test, `:8989` API), PostgreSQL 16, and Redis 7. |

---

## 4. Technical Debt Remediated in D1 Baseline

1. **Repository Hygiene & Git Tracking Cleanup:**
   - Removed tracked SQLite binary databases (`*.db`), log artifacts, and `node_modules` from Git history/tracking and hardened `.gitignore`.
2. **Elimination of Azure Runtime Coupling:**
   - Verified zero unhandled exceptions when Azure environment variables (`AZURE_KEY_VAULT_URL`, `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_TENANT_ID`) are unset.
   - `GET /health/live` and `GET /health/ready` return HTTP `200 OK` on AWS.
3. **Resolution of 10 Early QA & Security Audit Defects (`BUG-01` through `BUG-10`):**
   - Fixed role/persona token switching, horizontal sub-navigation RBAC filtering, sidebar chart-tab duplication, Member 360 document upload/download handling, light/dark theme contrast, and dynamic API port resolution across localhost and AWS (`7777`/`7778`/`8989`).

---

## 5. Target AWS Environment & Sprint 1 Walking Skeleton Verification

| Environment Tier | Endpoint / Port | Purpose & Verification Status |
| :--- | :--- | :--- |
| **AWS Hosted Dev (CloudFront CDN)** | `https://dmp0wwecjzzmr.cloudfront.net/login` | Publicly reachable HTTPS edge distribution with TLS 1.3 fronting the Arc-8 SPA (**Verified Operational**). |
| **AWS Server — Development** | `http://16.59.20.139:7777` (via SSH tunnel) | Active developer verification environment (**Verified Operational**). |
| **AWS Server — QA Testing** | `http://16.59.20.139:7778` (via SSH tunnel) | Dedicated isolated QA testing environment used with `docs/TESTER_USER_MANUAL.md` (**Verified Operational**). |
| **AWS Backend FastAPI Service** | `http://16.59.20.139:8989/docs` | OpenAPI / Swagger gateway connected to PostgreSQL 16 (`prominence_tenant`) & Redis 7 (**Verified Operational**). |

---

## 6. Sign-Off & Transition to Deliverable D2

Deliverable D1 confirms that the inherited codebase has been audited, cleaned of prototype debt, decoupled from Azure, and deployed as a working skeleton on AWS. This baseline directly feeds **Deliverable D2** ([D2_SOLUTION_DESIGN_SECURITY_AND_RTM_v1.md](./D2_SOLUTION_DESIGN_SECURITY_AND_RTM_v1.md)), which locks the End-to-End Solution Design, Data Flows, HIPAA Security Architecture, and Requirements Traceability Matrix (`RTM v1.0`).
