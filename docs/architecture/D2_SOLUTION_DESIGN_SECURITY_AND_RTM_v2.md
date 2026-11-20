# Deliverable D2 (v2.0): Solution Design, Data Flows, Security Design & RTM v2.0

| Document Metadata | Details |
| :--- | :--- |
| **Project** | Arc-8 MVP — Prominence Health First Inc. (SOW No. 3) |
| **Deliverable ID** | **Deliverable D2 — Version 2.0** (`A8S-39` / `A8S-59` / `A8S-60`: Solution Design, Data Flows, Security Architecture & `RTM v2.0`) |
| **Version & Date** | **v2.0** — November 17, 2026 *(Supersedes v1.0 from October 23, 2026)* |
| **Author / Owner** | Syed Sana Ul Haq Fazli (Architecture & Full-Stack Lead) |
| **Co-Authors & Reviewers** | Wayne White (Project Lead), Shaheer Sarwar (Sr. DevOps Lead), Ramesh Muralasetty (Data Architecture Lead), Shahzad Sultan (Sr. QA Engineer) |
| **Status** | **Ready for D2 Approval & D3 Handover (`A8S-59` / `A8S-60`)** |
| **Inputs & References** | [D1 Baseline](./D1_ARCHITECTURE_DISCOVERY_AND_3R_ASSESSMENT.md), [D2 v1.0](./D2_SOLUTION_DESIGN_SECURITY_AND_RTM_v1.md), [UHS SFTP Mapping](../uhs-sftp-schema/UHS_SFTP_to_Arc8_Database_Mapping_Report.md), [FRD v2.0](../FUNCTIONAL_REQUIREMENTS_DOCUMENT_v2.md) |

> [!IMPORTANT]
> **What Changed in Deliverable D2 v2.0 (Aligned with Agreed DevOps & Data Implementation):**
> 1. **Agreed AWS Infrastructure Scope (`A8S-30`, `A8S-50`, `A8S-72`):** Updated architecture diagrams and component specifications to reflect our agreed Terraform-provisioned **AWS EC2 + Docker Compose (`arc8-frontend`, `arc8-backend`, `postgres:16`, `redis:7`) + CloudFront (TLS 1.3)** topology across Dev (`16.59.20.139`) and Test (`3.130.110.51`). Separate managed RDS/S3 services are deferred in non-prod to stay strictly within SOW monthly budget guardrails.
> 2. **Client-Provided UHS SFTP Ingestion (`A8S-49`, `uhs_sftp_importer.py`):** Replaced theoretical AWS S3 SFTP diagrams with the actual **Prominence / UHS 17-file pipe-delimited QNXT SFTP feed** (`PHP_To_OEight_*.txt` & `PHP_CallTracking*.txt`) ingested directly into PostgreSQL 16 via `uhs_sftp_importer.py`.
> 3. **CI/CD & Operational Readiness (`A8S-31`, `A8S-32`, `A8S-55`):** Aligned DevSecOps and security sections with Shaheer's implemented **GitHub Actions OIDC CI/CD pipeline** and **Deliverable D3** logging, monitoring, secrets, and encrypted EBS backup controls.
> 4. **RTM v2.0 Status Updates:** Updated implementation statuses across Member 360 v1 (`A8S-48`, `A8S-53`), Rising-Risk Stratification (`A8S-64`, `A8S-65`), Executive Plan Performance (`A8S-118`), and UHS SFTP ETL.

---

## 1. Solution Design Architecture

### 1.1 Architectural Vision & Business Alignment
**Arc-8 (Member 360)** is designed as Prominence Health's high-speed, HIPAA-compliant **Single Pane of Glass** for Care Advocates (~60,000 inbound claim-status calls/month), Care Coordinators/Nurses, and Operations Supervisors. It consolidates member data from six disconnected enterprise silos (**QNXT**, **Project Titan / MRA**, **Abarca PBM**, **CareAdvance**, **Clinical Labs**, and **Talkdesk**) into a unified sub-second workspace hosted on **AWS**.

### 1.2 Agreed AWS System Architecture (Terraform EC2 + Docker + CloudFront Baseline)

Per SOW cost guardrails (`A8S-23`, `A8S-30`, `A8S-50`, `A8S-72`), the Dev (`16.59.20.139`) and QA Test (`3.130.110.51`) environments are provisioned via **Terraform** as dedicated **Amazon EC2** instances running the multi-container **Docker Compose** stack (`arc8-frontend`, `arc8-backend`, `postgres:16`, `redis:7`) on encrypted EBS volumes, fronted by **Amazon CloudFront (TLS 1.3)** and deployed via **GitHub Actions (AWS OIDC)**. Separate managed RDS/S3 services are out of scope for Dev/Test so non-prod environments stay strictly within agreed budget guardrails.

```mermaid
flowchart TB
    subgraph Users["Prominence Health Internal Staff"]
        CA["Care Advocates<br/>(Call Center / Jimmy's Team)"]
        CC["Care Coordinators & Nurses<br/>(Clinical Follow-Up)"]
        SUP["Supervisors, Ops & Admins<br/>(Escalations, RBAC, Compliance)"]
    end

    subgraph Edge["AWS Edge & Identity Tier (Terraform Managed)"]
        CF["Amazon CloudFront CDN<br/>(TLS 1.3 HTTPS Edge Distribution)"]
        AUTH["OIDC / JWT Authentication<br/>(RBAC + Session Control)"]
    end

    subgraph EC2["AWS EC2 Host Tier — Dev (16.59.20.139) & Test (3.130.110.51)"]
        SPA["arc8-frontend Container<br/>React 18 Staff Portal SPA (:7777 / :7778)"]
        API["arc8-backend Container (:8989)<br/>FastAPI Async Workers<br/>RBAC + Tenant + PHI Audit Middleware"]
        IMP["UHS SFTP Batch Importer<br/>(uhs_sftp_importer.py)"]
        PG[("PostgreSQL 16 Container<br/>arc8_control + prominence_tenant (m360_*)<br/>Encrypted EBS Volume")]
        REDIS[("Redis 7 Container<br/>30-Day Hot Cache + Rate Limit + JWT Blacklist")]
        VOL[("Encrypted Host Volume<br/>Member PDFs, HRAs & Audit Snapshots")]
    end

    subgraph ClientSFTP["Client-Provided SFTP Source (Prominence / UHS)"]
        SFTP["Prominence / UHS SFTP Server<br/>(17 Pipe-Delimited QNXT Feeds:<br/>PHP_To_OEight_*.txt & PHP_CallTracking*.txt)"]
    end

    subgraph SecObs["DevSecOps, Secrets & Observability (D3 Scope — A8S-31/32/55)"]
        GHA["GitHub Actions CI/CD<br/>(AWS OIDC — Zero Static Keys)"]
        SM["Secrets & Env Management<br/>(SECRET_KEY, FIELD_ENCRYPTION_KEY)"]
        CW["Logging, Monitoring, Alerting<br/>& Automated Backups (D3)"]
    end

    CA & CC & SUP -->|"HTTPS (TLS 1.3)"| CF
    CF --> SPA
    CF -->|"/api/*"| API
    CA & CC & SUP <-->|"JWT / OIDC"| AUTH
    API <-->|"Async SQLAlchemy (asyncpg)"| PG
    API <-->|"Hot Profile Cache & Rate Limit"| REDIS
    API <-->|"Encrypted File I/O"| VOL
    API -->|"Append-Only phi_audit + Metrics"| CW
    API -.->|"Runtime Secrets"| SM
    SFTP -->|"17 UHS Batch Feeds"| IMP
    IMP -->|"Idempotent Upsert (m360_*)"| PG
    IMP -->|"Warm/Refresh Cache"| REDIS
    GHA -->|"OIDC Deploy & Rollback"| EC2
```

### 1.3 Component Design Breakdown

| Tier | Component | Codebase Implementation | Design Responsibilities |
| :--- | :--- | :--- | :--- |
| **Presentation (SPA)** | **Arc-8 Staff Portal** | `frontend/src/pages/platform/member360-lab/` | Role-gated navigation shell (`PortalPageLayout`), Care Intelligence NOC Dashboard, Instant Member Search, Member 360 Header & Alert Bar, Plan Performance Console (`A8S-118`), and 8 consolidated clinical/operational tabs. Supports Talkdesk URL screen-pop (`?memberId=<id>`, `?search=<q>`). |
| **API Gateway & Middleware** | **FastAPI Middleware Pipeline** | `backend/app/main.py`, `app/middleware/*` | Enforces `SecurityHeadersMiddleware` (CSP, HSTS, X-Frame-Options), `RateLimitMiddleware` (Redis-backed sliding window), `TenantMiddleware` (`X-Tenant-Key` resolution), and `RequestLoggingMiddleware` (correlation IDs). |
| **Domain Services** | **Member 360 & Admin Services** | `backend/app/routes/member360.py`, `app/services/member360.py`, `app/services/member360_admin.py` | Orchestrates Member 360 profile aggregation, Claims & Accumulator progress bars (Deductible + combined Medical/Rx MOOP), Care Gaps & HCC `$` badges, Rx 0-refill/PA alerts, CareAdvance Care Journey stage transitions, SBAR tasks, supervisor escalation queues, and `@mention` internal notes. |
| **UHS SFTP ETL Engine** | **17-File QNXT Batch Importer** | `backend/app/services/uhs_sftp_importer.py`, `docs/uhs-sftp-schema/` | Ingests the 17 pipe-delimited (`\|`) files provided by Prominence/UHS SFTP (`PHP_To_OEight_*` & `PHP_CallTracking*`), unpivoting wide QNXT rows (e.g., 176-column `ClaimDetails`) into normalized `m360_*` tables. |
| **Data Persistence** | **Multi-Tenant PostgreSQL 16** | `backend/app/db/tenant_manager.py`, `app/models/member360.py` | Dual-database topology running on encrypted EC2 EBS storage: `arc8_control` (tenants, users, roles, module licenses, `tenant_audit_events`) and isolated per-tenant database `prominence_tenant` (`m360_*` tables managed via Alembic migrations). |
| **Search & Caching** | **30-Day Redis Hot Cache & Indexed Search** | `backend/app/core/redis.py`, `app/services/provider_search.py` | Caches active member profiles in Redis 7 (`TTL=30d`, invalidated on write/ETL) and leverages PostgreSQL composite indexes (`member_key`, `last_name`, `phone`, `plan_name`) for `<500ms` lookup. |
| **Event & Outbox Layer** | **Transactional Outbox** | `backend/app/events/outbox.py`, `envelope.py`, `publisher.py` | Persists domain events (`CloudEvents` envelope) in the same database transaction as state mutations (`event_outbox`), guaranteeing at-least-once downstream delivery for timeline updates, notifications, and cache invalidation. |

### 1.4 Consolidated Member 360 UI & Tab Architecture
To eliminate horizontal tab scrolling and cognitive overload during live calls, the 15 legacy prototype tabs are consolidated into **8 role-gated operational tabs** plus **3 Supervisor/Admin tabs**, while out-of-scope tabs (`Messages`, `Portal Preview`, `Chart`) are hidden:

1. **`Timeline`** *(All Roles)* — Clickable chronological feed of all member touchpoints (claims ingested, calls, care journey stage changes, tasks, notes).
2. **`Notes`** *(All Roles)* — Internal-only call documentation where Care Advocates paste Talkdesk AI Call Summaries and tag colleagues via `@mention`.
3. **`Claims & Accumulators`** *(All Roles)* — Adjudication status (`Paid`, `Pending`, Billed vs. Paid vs. Member Responsibility) paired with **Deductible** and **Combined Medical + Rx MOOP** progress bars.
4. **`Care Gaps & HCCs`** *(All Roles / Coding)* — Combines open/suspected **Project Titan** MRA gaps with active **Problems / HCCs**, badging CMS revenue-impacting diagnoses with a **`$` / Star indicator**.
5. **`Medications`** *(All Roles)* — Active/historical prescriptions from **Abarca PBM**, highlighting **0 Refills** and **Expiring Prior Authorizations** (e.g., insulin).
6. **`Labs & Imaging`** *(All Roles)* — Pre-visit lab results (`HbA1c`, `BNP`, `Creatinine`, `Lipids`) with High/Abnormal flags.
7. **`Care Journey`** *(Coordinator / Nurse / Supervisor)* — Post-discharge pathways synced from **CareAdvance** (`Discharge intake`, `Medication reconciliation`, `Cardiology follow-up`, `30-day outcome`) with interactive `Start` / `Complete` stage actions and SBAR tasks.
8. **`Documents`** *(All Roles)* — Encrypted member document vault (HRAs, Care Forms, EOBs, Lab PDFs) with a 1-click **"Send Document to Member" (Email)** action to eliminate print costs.
9. **`Audit Log` / `Sharing` / `Settings`** *(Supervisor, Compliance Auditor & Admin Only)* — Restricted governance tabs hidden from standard Care Advocates.

---

## 2. End-to-End Data Flows

### 2.1 Data Flow 1: Client-Provided UHS SFTP (17 QNXT Feeds) Batch ETL Ingestion & Hot Cache Population
Prominence Health / UHS provides the SFTP feed containing 17 pipe-delimited (`|`) QNXT extract files (`PHP_To_OEight_*` and `PHP_CallTracking*`). The Arc-8 UHS SFTP importer (`uhs_sftp_importer.py`) reads the batch files, translates and normalizes wide QNXT records into PostgreSQL 16 (`m360_*` tables), and warms the 30-day Redis hot cache.

```mermaid
sequenceDiagram
    autonumber
    participant SRC as Prominence / UHS SFTP<br/>(17 Pipe-Delimited QNXT Files)
    participant VOL as EC2 SFTP Staging Folder<br/>(docs/uhs-sftp-schema / data)
    participant ETL as Arc-8 UHS SFTP Importer<br/>(uhs_sftp_importer.py)
    participant PG as PostgreSQL 16 Container<br/>(prominence_tenant)
    participant CACHE as Redis 7 Hot Cache<br/>(30-Day Active Members)
    participant AUD as Audit & Import Job Tracker

    SRC->>VOL: Deliver 17 pipe-delimited feeds (MemberDetails, Enrollment, PCP,<br/>AccumDetails, ClaimDetails [176 cols], Pharmacy [92 cols], Providers, CallTracking)
    VOL->>ETL: Trigger batch import job (uhs_sftp_importer.py)
    ETL->>ETL: Parse pipe-delimited rows, link NPI M:N provider/locations & unpivot DiagCode1..40
    ETL->>PG: Idempotent upsert into m360_members, m360_coverages, m360_accumulators,<br/>m360_claims, m360_claim_lines, m360_problems, m360_medications, m360_notes
    ETL->>PG: Write transactional event_outbox records
    ETL->>CACHE: Warm Redis 30-day hot cache for active members
    ETL->>AUD: Record import status, row counts & reconciliation summary
```

### 2.2 Data Flow 2: Real-Time Inbound Call, Screen-Pop & Care Advocate Resolution
When a member calls via Talkdesk, the Care Advocate opens Arc-8 via URL screen-pop or instant search, resolves the inquiry, acts on header alerts, and logs the call summary.

```mermaid
sequenceDiagram
    autonumber
    actor ADV as Care Advocate
    participant SPA as Arc-8 React SPA
    participant API as FastAPI Backend<br/>(Auth + Tenant + RBAC)
    participant REDIS as Redis 7 Hot Cache
    participant PG as PostgreSQL 16
    participant PHI as Dual-Sink Audit<br/>(PostgreSQL + phi_audit Stream)

    ADV->>SPA: Click Talkdesk Screen-Pop (?memberId=M1001) or Search Member
    SPA->>API: GET /api/member360/members/M1001 (Bearer JWT, X-Tenant-Key: prominencehealth)
    API->>API: Verify JWT signature/JTI, resolve TenantContext, check capability "m360:read"
    API->>REDIS: Check 30-day Hot Cache for M1001 cockpit payload
    alt Cache Hit (<50ms)
        REDIS-->>API: Return cached Member 360 profile + alerts
    else Cache Miss (<500ms)
        API->>PG: Query m360_members + coverages + claims + gaps + meds + journeys
        PG-->>API: Return relational aggregate
        API->>REDIS: Populate 30-day hot cache
    end
    API->>PHI: Emit phi_access event (actor, patientId=M1001, action=read, ip, userAgent)
    API-->>SPA: 200 OK (Header Alerts: Missing PCP, 2 Care Gaps, 0-Refill Rx, Active Journey)
    ADV->>SPA: Review Claims/MOOP, complete Care Journey step, paste Talkdesk AI Summary in Notes (@Supervisor)
    SPA->>API: POST /api/member360/members/M1001/notes & PATCH /api/member360/tasks
    API->>PG: Persist m360_notes, m360_tasks, append Timeline touchpoint & event_outbox row
    API->>REDIS: Invalidate/refresh M1001 hot cache entry
    API->>PHI: Emit phi_update event (action=write, success=true)
    API-->>SPA: 201 Created (Updated Timeline & Task Queue)
```

### 2.3 Data Flow 3: Escalation Workflow & Supervisor Queue
1. **Trigger Sources:**
   - **Manual Escalation:** Care Advocate or Coordinator flags an unresolved issue or tags `@supervisor` in Notes/Tasks (`POST /api/member360/tasks` with `escalation_flag=True` or priority=`Urgent`).
   - **Automated SLA Rule:** Background worker evaluates configurable triggers (e.g., missed **48-hour post-discharge follow-up** from CareAdvance or sudden clinical risk spike) and transitions the task to `escalated`.
2. **Routing & Resolution:**
   - Escalated items surface immediately in the **Supervisor Escalation Queue** (protected by capability `tasks:escalations` in `backend/app/utils/rbac.py`).
   - Supervisors reassign, resolve, or close the escalation; every state change writes an immutable timeline entry and HIPAA audit event.

### 2.4 Data Flow 4: 10-Year CMS Medicare Advantage Retention & Archival Policy
Per Prominence Health compliance rules established during the walkthrough:
- **Source System Data** (QNXT claims, eligibility, Abarca Rx, external labs) is already retained by Prominence's core systems of record and is **not** duplicated into 10-year cold storage by Arc-8.
- **Arc-8 System-Authored Data** (`m360_notes`, `m360_tasks`, `m360_documents`, Care Journey stage completions authored in Arc-8, and `tenant_audit_events` / `phi_audit` logs) constitutes original Medicare Advantage documentation and **must be retained for 10 years**:
  1. In the current Dev/Test EC2 baseline (`A8S-55`), encrypted EBS snapshots and append-only `phi_audit` / database backups preserve all system-authored records.
  2. For long-term production compliance, monthly archival snapshots of system-authored records (`3,650-day` retention) are exported in encrypted JSONL/Parquet format.

### 2.5 Common Data Model (ERD) — Provider $\leftrightarrow$ Facility $M:N$ & Member 360

```mermaid
erDiagram
    M360_MEMBERS ||--o{ M360_COVERAGES : "eligibility (QNXT)"
    M360_MEMBERS ||--o{ M360_CLAIMS : "medical claims (QNXT)"
    M360_MEMBERS ||--|| M360_ACCUMULATORS : "deductible & MOOP"
    M360_MEMBERS ||--o{ M360_PROBLEMS : "diagnoses & HCC ($) gaps (Titan)"
    M360_MEMBERS ||--o{ M360_MEDICATIONS : "Rx fills, 0-refill & PA (Abarca)"
    M360_MEMBERS ||--o{ M360_LABS : "lab results & abnormal flags"
    M360_MEMBERS ||--o{ M360_CARE_JOURNEYS : "post-discharge plans (CareAdvance)"
    M360_MEMBERS ||--o{ M360_TASKS : "SBAR tasks & escalations"
    M360_MEMBERS ||--o{ M360_NOTES : "internal notes & @mentions"
    M360_MEMBERS ||--o{ M360_DOCUMENTS : "encrypted PDFs & email log"
    M360_PROVIDERS }o--o{ M360_FACILITIES : "M:N via provider_facilities (NPI)"
    M360_FACILITIES ||--o{ M360_CLAIMS : "billed at facility"
    M360_PROVIDERS ||--o{ M360_MEMBERS : "assigned PCP"
```

---

## 3. Security & HIPAA Compliance Design

### 3.1 Defense-in-Depth Security Architecture
Arc-8 implements a 6-layer Defense-in-Depth security posture aligned with the **HIPAA Security Rule (45 CFR §164.308, §164.312)** and **CMS Medicare Advantage** standards:

| Security Layer | Control Mechanism | Implementation Reference | HIPAA Control Mapping |
| :--- | :--- | :--- | :--- |
| **1. Perimeter & Transport** | TLS 1.3 everywhere (CloudFront edge + HTTPS); strict HTTP security headers (`HSTS`, `CSP`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`). | `backend/app/middleware/security_headers.py` | §164.312(e)(1) Transmission Security |
| **2. Authentication & Session Control** | OIDC / JWKS validation (`RS256`) + signed JWT access/refresh tokens; Redis `jti` token revocation blacklist on logout; configurable idle/absolute session timeouts; brute-force login throttling. | `backend/app/routes/auth.py`, `app/utils/security.py`, `app/utils/auth_throttle.py` | §164.312(a)(2)(iii) Automatic Logoff & §164.312(d) Person Authentication |
| **3. Multi-Tenant Isolation** | Mandatory `X-Tenant-Key` validation against user's licensed tenant (`prominencehealth`); isolated tenant database connection pool (`TenantContext`) preventing cross-tenant SQL queries or IDOR enumeration. | `backend/app/middleware/tenant.py`, `app/db/tenant_manager.py` | §164.308(a)(4) Information Access Management |
| **4. Deny-by-Default RBAC & Anti-Enumeration** | Granular capability checks (`require_capability`, `require_role`) returning generic `403 Access denied` (never leaking whether a resource ID exists). Frontend route guards + sub-tab filtering match backend privileges. | `backend/app/utils/rbac.py`, `frontend/src/context/AuthContext.js` | §164.312(a)(1) Access Control (Minimum Necessary) |
| **5. Encryption at Rest & Field-Level Crypto** | Encrypted EC2 EBS storage volumes (AES-256) + automated snapshots; sensitive application fields encrypted at the ORM layer using `MultiFernet` (`EncryptedString` SQLAlchemy TypeDecorator) with zero-downtime key rotation support. | `backend/app/utils/encryption.py` | §164.312(a)(2)(iv) Encryption and Decryption |
| **6. Tamper-Evident Dual-Sink Audit Trail** | Every PHI read, write, export, and auth failure is logged to both `tenant_audit_events` (with PostgreSQL immutability trigger blocking `UPDATE`/`DELETE`) and the dedicated append-only `phi_audit` JSONL stream (`A8S-55`). | `backend/app/utils/phi_audit.py`, `app/utils/audit_logger.py` | §164.312(b) Audit Controls |

### 3.2 Role-Based Access Control (RBAC) Capability Matrix
Enforced in [`backend/app/utils/rbac.py`](../../backend/app/utils/rbac.py) via `ROLE_CAPABILITIES` and frontend navigation guards:

| Capability / Module Scope | Care Advocate / Coordinator (`coordinator`) | Nurse / Clinician (`analyst` / `clinician`) | Supervisor / Ops (`supervisor`) | Business / Tenant Admin (`business_admin`) | Compliance Auditor (`compliance_auditor`) | Platform / Master Admin (`platform_admin` / `admin`) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Member Search & 360 Profile (`m360:read`)** | ✅ | ✅ | ✅ | ✅ | ✅ (Read-Only) | ✅ |
| **Timeline & Internal Notes (`timeline:*`, `notes:*`)** | ✅ (Read/Write) | ✅ (Read/Write) | ✅ (Read/Write) | ❌ | ✅ (Read-Only) | ✅ |
| **Claims, Accumulators, Gaps & Labs (`gaps:read`, `labs:read`)** | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Care Journeys (`journey:read`, `journey:write`)** | ✅ (Routine Steps) | ✅ (Full Clinical) | ✅ | ❌ | ❌ | ✅ |
| **Tasks & Worklists (`tasks:read`, `tasks:write`)** | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Documents Upload / Email (`documents:read`, `documents:write`)** | ✅ | ✅ | ✅ | ❌ | ✅ (Read-Only) | ✅ |
| **Supervisor Escalation Queue (`tasks:escalations`)** | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| **Audit Log & Compliance (`audit:read`, `audit:export`)** | ❌ | ❌ | ✅ (`audit:read`) | ✅ (`audit:read`) | ✅ (Read + Export) | ✅ |
| **Tenant Settings & User/Role Admin (`admin:users`, `settings:manage`)** | ❌ | ❌ | ✅ (`settings:manage`) | ✅ (Full Tenant Admin) | ❌ | ✅ (Multi-Tenant Licensing) |

### 3.3 Canonical HIPAA PHI Audit Schema
Implemented in [`backend/app/utils/phi_audit.py`](../../backend/app/utils/phi_audit.py), every PHI access or mutation emits a structured JSON record:

```json
{
  "event": "phi_access | phi_update | phi_delete",
  "userId": "coordinator@prominencehealth.com",
  "patientId": "M1001",
  "recordType": "member360.profile | member360.claims | member360.notes | member360.documents",
  "action": "read | write | delete",
  "ipAddress": "16.59.20.139",
  "userAgent": "Mozilla/5.0 ...",
  "timestamp": "2026-11-17T00:20:00.000000+00:00",
  "success": true
}
```

### 3.4 DevSecOps & CI/CD Security Gates (`A8S-31` & `A8S-32`)
1. **Zero Static Cloud Credentials:** GitHub Actions authenticates to AWS exclusively via short-lived **OIDC Web Identity Federation** (`A8S-32`).
2. **Automated PR Security Scanning (`A8S-31`):**
   - **SAST & Linting:** `flake8` / `ruff` / `bandit` on Python backend; `eslint` on React frontend.
   - **Container & Dependency Scanning:** `Trivy` vulnerability scanner gating on `HIGH`/`CRITICAL` CVEs; `npm audit` and `pip-audit`.
   - **Secret Detection:** `trufflehog` / secret scanning blocks accidental commit of keys or tokens.
   - **SBOM Generation:** CycloneDX Software Bill of Materials generated per release build.
3. **100% Synthetic Data Policy in Non-Prod:** Dev (`16.59.20.139:7777`), Test (`3.130.110.51:7778`), and CI environments use strictly synthetic member datasets (`Faker`/`Synthea` & synthetic UHS SFTP feeds); zero real PHI is permitted outside Production.

---

## 4. Requirements Traceability Matrix (`RTM v2.0`)

`RTM v2.0` traces **all 10 SOW Capabilities**, **all Functional Requirements (`FR-*`)**, and **all Non-Functional Requirements (`NFR-*`)** defined in the [Functional Requirements Document](../FUNCTIONAL_REQUIREMENTS_DOCUMENT.md) directly to their **Codebase Implementation Assets**, **API Endpoints / DB Models**, **Target Sprint**, **Current Status (Nov 17)**, and **QA Verification Method**.

### 4.1 Functional Requirements Traceability Matrix (`RTM v2.0`)

| RTM ID | FRD ID | Requirement Summary | Priority | Codebase Implementation (Routes, Services, Models, UI) | Target Sprint | Status (v2.0) | Verification / QA Gate |
| :--- | :--- | :--- | :---: | :--- | :---: | :---: | :--- |
| **RTM-01.1** | `FR-AUTH-01` | Authenticate via OIDC SSO (JWKS) with controlled dev fallback (`ALLOW_DUMMY_LOGIN`). | **P1** | `backend/app/routes/auth.py`, `backend/app/utils/security.py`, `frontend/src/context/AuthContext.js` | Sprint 1 | **Implemented** | Pytest Auth Suite + E2E Login Test |
| **RTM-01.2** | `FR-AUTH-02` | Resolve tenant context from `X-Tenant-Key` (`prominencehealth`) and isolate tenant DB sessions. | **P1** | `backend/app/middleware/tenant.py`, `backend/app/db/tenant_manager.py` | Sprint 1 | **Implemented** | Multi-Tenant Isolation Integration Test |
| **RTM-01.3** | `FR-AUTH-03` | Enforce RBAC personas (`Coordinator`, `Supervisor`, `Admin`, `Clinician`, `Compliance Auditor`, `Payer Executive`). | **P1** | `backend/app/utils/rbac.py` (`ROLE_CAPABILITIES`), `backend/app/routes/member360.py` | Sprint 1 | **Implemented** | Pytest RBAC Matrix Test + QA Role Gate (`A8S-35`) |
| **RTM-01.4** | `FR-AUTH-04` | Unauthenticated/cross-tenant requests return `401`/`403` ("Access denied") and log an audit event. | **P1** | `backend/app/utils/rbac.py` (`_forbidden`), `backend/app/utils/phi_audit.py` | Sprint 1 | **Implemented** | Negative Security & IDOR Pytest Suite |
| **RTM-01.5** | `FR-AUTH-05` | Access token expiry, refresh token lifecycle, and Redis `jti` blacklist revocation on logout. | **P1** | `backend/app/routes/auth.py`, `backend/app/core/redis.py` | Sprint 1 | **Implemented** | Token Expiry & Revocation Integration Test |
| **RTM-01.6** | `FR-AUTH-06` | Expose only in-scope modules (`PORTAL_APPLICATIONS`) and block out-of-scope routes via guards. | **P1** | `backend/app/core/config.py`, `frontend/src/components/PortalNav.js`, `App.js` | Sprint 1 | **Implemented** | E2E Route Guard Verification |
| **RTM-01.7** | `FR-AUTH-07` | Care Coordinator lands directly on the Member 360 workspace upon login. | **P1** | `frontend/src/pages/LoginPage.js`, `frontend/src/context/AuthContext.js` | Sprint 1 | **Implemented** | E2E Persona Landing Verification |
| **RTM-01.8** | `FR-AUTH-08` | Deep links `?memberId=<id>` and `?search=<q>` open target member chart/search directly (Talkdesk screen-pop). | **P1** | `frontend/src/pages/platform/member360-lab/Member360LabWorkspace.js` (`A8S-45`) | Sprint 1 | **Implemented** | E2E Deep-Link Screen-Pop Test |
| **RTM-02.1** | `FR-SRCH-01` | Multi-attribute member search by Member ID, First/Last Name, Phone, or Benefit Plan. | **P1** | `GET /api/member360/members` (`backend/app/routes/member360.py`), `m360_members` (`A8S-45`, `A8S-47`) | Sprint 2 | **Implemented** | API Integration & Search Filter QA Test |
| **RTM-02.2** | `FR-SRCH-02` | Search results return in `<500ms` (backed by indexed PostgreSQL + Redis hot cache). | **P1** | `backend/app/services/member360.py`, PostgreSQL indexes on `m360_members` | Sprint 2 | **Implemented** | Performance Baseline Benchmark (`<500ms`) |
| **RTM-02.3** | `FR-SRCH-03` | Selecting a member opens the chart directly; redundant `Chart` sub-tab and Portal quick-search removed. | **P1** | `frontend/src/pages/platform/member360-lab/`, commit `4317db1` | Sprint 1–2 | **Implemented** | UI Navigation QA Walkthrough |
| **RTM-03.1** | `FR-HDR-01` | Member 360 Header displays Name, Member ID, Plan ID/Name, Age, Gender, PCP hyperlink, and Amber Gaps badge. | **P1** | `GET /api/member360/members/{id}`, `Member360LabWorkspace.js` (`A8S-48`, `A8S-53`) | Sprint 2 | **Implemented** | E2E UI Header & Data Reconciliation Test |
| **RTM-03.2** | `FR-HDR-02` | High-visibility "Missing PCP" alert when `primary_care_provider` is blank, linking to PCP assignment. | **P1** | `frontend/src/pages/platform/member360-lab/`, `m360_members.primary_care_provider` | Sprint 2 | **Implemented** | Functional UI Alert Verification |
| **RTM-03.3** | `FR-HDR-03` | Header alert indicators for Open Care Gaps (`>0`), Active Care Journey, and Rx `0 refills` / Expiring PA. | **P1** | `backend/app/services/member360.py`, `Member360LabWorkspace.js` | Sprint 2–3 | **Implemented** | Clinical Alert Rule Test |
| **RTM-03.4** | `FR-HDR-04` | Hide header risk stratification score badge until external partner (*Virgin*) risk integration is finalized. | **P1** | `frontend/src/pages/platform/member360-lab/` | Sprint 2 | **Implemented** | UI Regression Check |
| **RTM-03.5** | `FR-TL-01` | **Timeline Tab:** Chronological log of all touchpoints (claims, calls, journeys, notes) with clickable drill-down. | **P1** | `GET /api/member360/members/{id}`, `m360_notes`, `m360_claims`, `m360_tasks` | Sprint 2 | **Implemented** | E2E Timeline Drill-Down Test |
| **RTM-07.1** | `FR-NT-01` | **Notes Tab:** Internal-only call notes supporting pasted Talkdesk AI Call Summaries with author & timestamp. | **P1** | `POST /api/member360/members/{id}/notes`, `m360_notes` (`backend/app/models/member360.py`) | Sprint 2 & 4 | **Implemented** | Coordinator Call Wrap-Up E2E Test |
| **RTM-07.2** | `FR-NT-02` | **Notes Tab:** `@mention` tagging in notes notifies the tagged colleague/supervisor. | **P2** | `backend/app/services/member360.py`, `m360_notes` | Sprint 4 | **Implemented** | Integration Notification Test |
| **RTM-03.6** | `FR-CL-01` | **Claims & Accumulators Tab:** Display claim status (`Paid`/`Pending`), billed, paid, and member responsibility. | **P1** | `GET /api/member360/members/{id}/claims`, `m360_claims` | Sprint 2 | **Implemented** | Claims Data Reconciliation Test |
| **RTM-03.7** | `FR-CL-02` | **Claims & Accumulators Tab:** Deductible and combined Medical + Pharmacy MOOP progress bars. | **P1** | `m360_accumulators`, `m360_accumulator_scopes`, `Member360LabWorkspace.js` | Sprint 2 | **Implemented** | Accumulator Math & UI Progress Bar Test |
| **RTM-03.8** | `FR-CG-01` | **Care Gaps & HCCs Tab:** List open Project Titan HCC gaps; auto-close gap when diagnosis appears on a claim. | **P1** | `m360_problems`, `m360_members.open_care_gaps`, `backend/app/services/member360.py` | Sprint 2–3 | **Implemented** | Gap Closure State Transition Test |
| **RTM-03.9** | `FR-CG-02` | **Care Gaps & HCCs Tab:** Display all diagnoses with a `$` / Star badge on CMS revenue/RAF-impacting HCC codes. | **P1** | `m360_problems`, `frontend/src/pages/platform/member360-lab/` | Sprint 2–3 | **Implemented** | UI Badge & HCC Mapping Verification |
| **RTM-03.10** | `FR-RX-01` | **Medications Tab:** Display active/historical prescriptions, last fill date, refills remaining, and prescriber (Abarca). | **P1** | `m360_medications` (`backend/app/models/member360.py`), `GET /api/member360/members/{id}` | Sprint 2 | **Implemented** | PBM Data Mapping Test |
| **RTM-03.11** | `FR-RX-02` | **Medications Tab:** Highlight `0 refills` and expiring Prior Authorizations (critical drugs e.g. insulin). | **P1** | `m360_medications`, `frontend/src/pages/platform/member360-lab/` | Sprint 2–3 | **Implemented** | Star Rating Rx Alert Verification |
| **RTM-03.12** | `FR-LB-01` | **Labs & Imaging Tab:** Display lab results (`HbA1c`, `BNP`, `Creatinine`, `Lipids`) with High/Abnormal flags. | **P1** | `m360_labs` (`backend/app/models/member360.py`), `GET /api/member360/members/{id}` | Sprint 2 | **Implemented** | Clinical Lab Flag Verification |
| **RTM-05.1** | `FR-CJ-01` | **Care Journey Tab:** Sync CareAdvance pathways (discharge intake, med rec, cardiology follow-up, 30-day outcome) + SBAR. | **P1** | `m360_care_journeys`, `m360_care_journey_templates`, `GET/POST /api/member360/care-journeys` | Sprint 3 | **Implemented** | Care Journey Workflow Integration Test |
| **RTM-05.2** | `FR-CJ-02` | **Care Journey Tab:** Start, Pause, Resume, and Complete journey stages during calls and auto-append events to Timeline. | **P1** | `PATCH /api/member360/care-journeys/{id}`, `backend/app/services/member360.py` (`A8S-113`, `A8S-114`) | Sprint 3 | **Implemented** | E2E Stage Progression Test |
| **RTM-03.13** | `FR-DC-01` | **Documents Tab:** Per-member encrypted upload, view, and download of HRAs, care forms, invoices, and lab PDFs. | **P1** | `backend/app/services/member360_storage.py`, `m360_documents` | Sprint 2 | **Implemented** | Document Upload/Download & Encryption QA Test |
| **RTM-03.14** | `FR-DC-02` | **Documents Tab:** 1-click "Send Document to Member" (Email) action with audit & timeline logging. | **P2** | `backend/app/services/email.py`, `backend/app/routes/member360.py` | Sprint 4 | **Implemented** | Email Dispatch & Audit Log Test |
| **RTM-08.1** | `FR-AD-01` | **Audit Log / Sharing / Settings Tabs:** Visible strictly to Supervisor, Ops, Compliance Auditor, and Admin roles. | **P1** | `backend/app/utils/rbac.py` (`audit:read`, `settings:manage`), commit `7f372b9` | Sprint 1 | **Implemented** | Horizontal Sub-Nav RBAC Test |
| **RTM-01.9** | `FR-HID-01` | **Hidden Tabs:** `Messages`, `Portal Preview`, and `Chart` removed from UI navigation (code retained). | **P1** | `frontend/src/pages/platform/member360-lab/`, commit `4317db1` | Sprint 1 | **Implemented** | UI Inspection & Route Test |
| **RTM-09.1** | `FR-DSH-01` | **Care Intelligence Dashboard:** Counts of active workflows, high/critical-risk members, open/overdue tasks, and journeys. | **P1** | `GET /api/member360/dashboard`, `Member360LabDashboard.js` (`A8S-108`, `A8S-109`) | Sprint 2 & 4 | **Implemented** | Dashboard Metric Reconciliation Test |
| **RTM-09.2** | `FR-DSH-02` | **Care Intelligence Dashboard:** "My To-Dos" worklist for logged-in user; clicking a task deep-links to member chart. | **P1** | `GET /api/member360/tasks`, `Member360LabTasksPage.js` | Sprint 2 & 4 | **Implemented** | E2E Worklist Deep-Link Test |
| **RTM-06.1** | `FR-TSK-01` | **Tasks & Escalation:** Create, assign, update, and close tasks linked to a member (with SBAR support). | **P1** | `GET/POST/PATCH /api/member360/tasks`, `m360_tasks` | Sprint 2 & 4 | **Implemented** | Task Lifecycle CRUD Integration Test |
| **RTM-06.2** | `FR-TSK-02` | **Tasks & Escalation:** Coordinator worklist and Supervisor queue (`tasks:escalations`) for escalated/unresolved tasks. | **P1** | `backend/app/routes/member360.py`, `backend/app/utils/rbac.py` | Sprint 4 | **Implemented** | Supervisor Queue RBAC & Workflow Test |
| **RTM-06.3** | `FR-TSK-03` | **Tasks & Escalation:** Configurable auto-escalation triggers (e.g., missed 48-hr post-discharge follow-up). | **P1** | `backend/app/services/member360_admin.py`, `m360_tasks` | Sprint 4 | **Implemented** | Escalation Trigger Rule Unit Test |
| **RTM-04.1** | `FR-RSK-01` | **Risk Insights:** Normalized risk score with explainable clinical drivers and filterable rising-risk cohorts (`A8S-64`, `A8S-65`). | **P1** | `GET /api/member360/risk-insights`, `m360_risk_insights`, `Member360LabRiskIntelligencePage.js` | Sprint 3 | **Implemented** | Risk Attribution Unit & API Test (`A8S-64`, `A8S-65`) |
| **RTM-10.1** | `FR-PRV-01` | **Provider Directory:** Searchable in-network provider directory keyed by NPI. | **P2** | `GET /api/member360/care-options`, `backend/app/services/provider_search.py` | Sprint 4 | **Implemented** | Provider Search Functional QA Test |
| **RTM-10.2** | `FR-PRV-02` | **Provider Directory:** Many-to-Many ($M:N$) Provider $\leftrightarrow$ Facility relationship; claims carry billing facility. | **P2** | `m360_providers`, `m360_provider_locations`, `m360_provider_networks` (`uhs_sftp_importer.py`) | Sprint 3–4 | **Implemented** | Data Model & UI Facility Filter Test |
| **RTM-10.3** | `FR-PRV-03` | **Provider Directory:** PCP assignment links member directly to an in-network provider profile. | **P2** | `PATCH /api/member360/members/{id}`, `m360_members.primary_care_provider` | Sprint 4 | **Implemented** | PCP Assignment E2E Test |
| **RTM-10.4** | `FR-ADM-01` | **Master Admin Console:** Controls which modules each tenant has licensed (`PORTAL_APPLICATIONS` / tenant registry). | **P1** | `backend/app/services/tenant_registry.py`, `backend/app/routes/admin.py` | Sprint 1 & 4 | **Implemented** | Master Admin Module Gate Test |
| **RTM-10.5** | `FR-ADM-02` | **Tenant Admin Console:** Manage users, interactive role allotment, and sub-tab permissions. | **P1** | `backend/app/routes/admin.py`, `RolePrivilegesManager.js` (`A8S-107`, `A8S-127`) | Sprint 1 | **Implemented** | Admin User & Role Allotment QA Test |
| **RTM-10.6** | `FR-ADM-03` | **Global Branding:** UI branded "Arc-8" across headers, login, documents, and navigation (all legacy prototype references removed). | **P1** | `frontend/src/` global branding updates | Sprint 1 | **Implemented** | Visual UI Inspection |
| **RTM-08.2** | `FR-AUD-01` | **HIPAA Audit Logging:** Record actor, tenant, member, action (`read`/`write`/`delete`), IP, user-agent, and timestamp. | **P1** | `backend/app/utils/phi_audit.py`, `backend/app/utils/audit_logger.py` | Sprint 1 & 4 | **Implemented** | Pytest PHI Audit Schema Verification |
| **RTM-08.3** | `FR-AUD-02` | **Audit Immutability:** Tamper-evident DB trigger on `tenant_audit_events` + append-only `phi_audit` stream. | **P1** | `backend/app/utils/phi_audit.py`, Alembic audit immutability trigger | Sprint 1 & 4 | **Implemented** | DB `UPDATE`/`DELETE` Rejection Test |
| **RTM-08.4** | `FR-AUD-03` | **10-Year CMS Retention:** Monthly archival of Arc-8 authored data (notes, tasks, docs, journey updates) with encrypted snapshots. | **P1** | `backend/app/services/member360_storage.py`, encrypted backup policy (`A8S-55`) | Sprint 4 | **Implemented / Designed** | Archival Snapshot & Backup Verification |
| **RTM-08.5** | `FR-AUD-04` | **Synthetic Data Mandate:** 100% synthetic data in all non-production environments (zero real PHI). | **P1** | `backend/app/services/member360.py` seeders, `uhs_sftp_importer.py` synthetic feeds | Sprint 1 | **Implemented** | Compliance Data Audit |
| **RTM-11.1** | `FR-DAT-01` | **Data Ingestion:** Client-provided UHS SFTP batch ETL (17 QNXT feeds) + CareAdvance/Titan/Labs with job status tracking. | **P1** | `backend/app/services/uhs_sftp_importer.py`, `data_imports.py`, `routes/imports.py` | Sprint 2–3 | **Implemented** | Batch ETL Pipeline Integration Test |
| **RTM-11.2** | `FR-DAT-02` | **30-Day Hot Cache:** Serve members active within the last 30 days from Redis hot cache. | **P1** | `backend/app/core/redis.py`, `backend/app/services/member360.py` | Sprint 2–3 | **Implemented** | Cache Hit/Miss & Latency Test |
| **RTM-11.3** | `FR-DAT-03` | **Schema Governance:** Manage all control and `m360_*` schema changes via formal Alembic migrations. | **P1** | `backend/alembic/versions/` | Sprint 1 | **Implemented** | `alembic upgrade head` CI Gate |
| **RTM-11.4** | `FR-DAT-04` | **Reliable Event Publishing:** Transactional outbox pattern (`event_outbox`) with CloudEvents envelope. | **P1** | `backend/app/events/outbox.py`, `envelope.py`, `publisher.py` | Sprint 2 | **Implemented** | Outbox Publisher Unit & Integration Test |
| **RTM-12.1** | `FR-FIN-01`, `FR-AUTH-09` | **Plan Performance Navigation & Payer Executive PHI Isolation:** Dual entry (`/member360/plan-performance` & Executive Dashboards); `payer_executive` role restricted from patient-level PHI (`403`). | **P1** | `Member360LabPlanPerformancePage.js`, `backend/app/routes/member360.py` (`_deny_payer_executive_phi`) (`A8S-118`) | Sprint 3 | **Implemented** | RBAC & HIPAA Minimum Necessary Pytest + E2E Gate |
| **RTM-12.2** | `FR-FIN-02` | **Macro Hierarchy & Baseline Filters:** Dynamic filtering across Plan Total $\rightarrow$ 4 Markets (*NNV*, *FL*, *NTX*, *STX*) $\rightarrow$ 12 Provider Groups; toggle vs. Budget (`83% MLR`) or Prior Year (`2025`). | **P1** | `Member360LabPlanPerformancePage.js`, `planPerformanceService.js` (`A8S-118`) | Sprint 3 | **Implemented** | E2E Filter & URL Query Sync Verification |
| **RTM-12.3** | `FR-FIN-03`, `FR-FIN-04` | **Executive Overview & Financials (`overview`, `fin`):** Enrollment, Premium Revenue (`$M`/PMPM), Medical Cost, Part A/B & D MLR %, SG&A, Operating Margin (`IOI`), P&L tables, and IOI Variance by Driver chart. | **P1** | `planPerformanceConsoleEngine.js` (`buildConsoleModel`, `renderConsoleTab`) (`A8S-118`) | Sprint 3 | **Implemented** | Financial KPI & P&L Reconciliation Test |
| **RTM-12.4** | `FR-FIN-05`, `FR-FIN-06` | **Medical Cost PMPM & Provider MLR (`cost`, `mlr`):** Service category PMPM breakdown (`IP`, `OP`, `Pro`, `Cap`, `Rx`), high-cost claimants (`>$50k`), and Provider Group MLR benchmark heatmaps. | **P1** | `planPerformanceConsoleEngine.js`, `planPerformanceData.json` (`A8S-118`) | Sprint 3 | **Implemented** | Cost Category & Provider MLR Verification |
| **RTM-12.5** | `FR-FIN-07`, `FR-FIN-08` | **Utilization & CMS Star Quality (`util`, `qual`):** Acute Admits/1k, ER Visits/1k, 30-Day Readmits, SNF Days/1k, Overall Star Rating gauge dial (`4.0★ Target`), HEDIS, Adherence, and CAHPS scorecards. | **P1** | `planPerformanceConsoleEngine.js` (`A8S-118`) | Sprint 3 | **Implemented** | Utilization & Star Rating Dial QA Check |
| **RTM-12.6** | `FR-FIN-09`, `FR-FIN-10` | **Risk Adjustment (`risk`), Definitions (`defs`) & Scenario Manager:** Avg RAF, EBUR, MBUR, HCC capture %, Data Dictionary, and multi-scenario JSON dataset upload/validation modal. | **P1** | `Member360LabPlanPerformancePage.js`, `planPerformanceService.js` (`validateDataset`) (`A8S-118`) | Sprint 3 | **Implemented** | Scenario Upload & RAF Metric Verification |
| **RTM-12.7** | `FR-FIN-11` | **VBC Executive RAF & Suspect Analytics (`/dashboard`):** Live RAF Delta (with forecast toggle), CMS-HCC v28 Suspects Funnel, Deadline Radar (CSV export), and Provider Heatmap. | **P2** | `backend/app/routes/dashboard.py`, `backend/app/services/dashboard_metrics.py`, `frontend/src/pages/DashboardPage.js` | Sprint 3–4 | **Implemented** | Executive Dashboard API & UI Verification |

---

### 4.2 Non-Functional Requirements Traceability (`NFR-01` – `NFR-06`)

| NFR ID | Category | Requirement | Architectural & Codebase Realization | Verification Gate |
| :--- | :--- | :--- | :--- | :--- |
| **NFR-01** | **Performance** | Member search `<500ms`; Member 360 profile load `<2s` from hot cache. | Indexed PostgreSQL 16 queries (`member_key`, `risk_tier`, `last_name`) and Redis 7 30-day hot cache. | API latency assertions & load test baseline |
| **NFR-02** | **Security** | HIPAA controls, TLS 1.3 in transit, Fernet + EBS encryption at rest, security headers, rate limiting, MFA readiness. | `SecurityHeadersMiddleware`, `RateLimitMiddleware`, `EncryptedString` (`MultiFernet`), `phi_audit.py`, and `rbac.py`. | Security test suite (`pytest`) + OWASP header check |
| **NFR-03** | **Availability** | Health check endpoints `/health/live` and `/health/ready` returning HTTP `200 OK` on AWS Dev/Test. | Implemented in `backend/app/main.py` checking DB & Redis connectivity; verified on AWS Dev (`16.59.20.139:8989`) and Test (`3.130.110.51:8989`). | Automated deployment smoke test (`deploy-aws.ps1`) |
| **NFR-04** | **Portability** | Zero runtime dependency on Azure services; clean execution on AWS EC2 + Docker Compose + CloudFront. | Refactored `backend/app/core/config.py` and `member360_storage.py`; verified running on AWS EC2/CloudFront (`https://dmp0wwecjzzmr.cloudfront.net`, `dev.arc8-mvp.site`, `test.arc8-mvp.site`). | Boot verification with `AZURE_*` unset |
| **NFR-05** | **Quality & CI/CD** | Automated CI gates for lint, unit tests (167+ backend tests), SAST, Trivy, SBOM, and GitHub Actions OIDC deploy. | Validated CI/CD pipeline (`A8S-31`, `A8S-32`), `backend/tests/`, and zero-static-key AWS OIDC role assumption. | 100% green CI pipeline & zero open Sev-1/Sev-2 bugs |
| **NFR-06** | **Usability** | Care Advocate completes the entire inbound call workflow within a single screen without re-fetching. | Consolidated 8-tab Member 360 cockpit with sticky Header Alert Bar and inline Notes/Task creation. | UAT / QA Walkthrough per `docs/TESTER_USER_MANUAL.md` |

---

## 5. Governance, Open Items & Next Milestones

| Item ID | Topic | Owner | Target Resolution | Current Status / Mitigation in D2 v2.0 |
| :--- | :--- | :--- | :--- | :--- |
| **OPEN-01** | **Client-Provided UHS SFTP Feeds (17 QNXT Files)** (`PHP_To_OEight_*` & `PHP_CallTracking*`) | Daniel Silva (Prominence) / Ramesh B (Data) / Syed (Arch) | Sprint 2–3 | **Resolved in Code:** 17 header schemas mapped in `docs/uhs-sftp-schema/` and ingested via `backend/app/services/uhs_sftp_importer.py` into `m360_*` tables on both Dev and Test EC2 servers. |
| **OPEN-02** | **C-SNP & Rising-Risk Cohort Definition** | Prominence Clinical SMEs / Syed (Arch) | Sprint 3 | **Resolved (`A8S-64`/`A8S-65`):** Rising-risk cohort filter and configurable stratification rules implemented in `risk_prioritization.py` and `Member360LabRiskIntelligencePage.js`. |
| **OPEN-03** | **External Risk Score Integration (*Virgin*)** | Prominence Partner Team | Deferred (Post-MVP) | Per `FR-HDR-04`, the header risk score badge is hidden via configuration until partner feed specs are finalized. |
| **OPEN-04** | **Deliverable D3 Operational Evidence & Cost Controls** (`A8S-55`, `A8S-56`, `A8S-72`) | Shaheer Sarwar (Sr. DevOps Lead) | Sprint 2–3 | Terraform EC2 + Docker + CloudFront (`A8S-30`, `A8S-50`), GitHub OIDC CI/CD (`A8S-31`, `A8S-32`), and logging/monitoring/backups (`A8S-55`) completed within SOW budget guardrails. |
