# Architecture Assessment & Codebase Walkthrough Memo

**Project:** Arc-8 Platform (Prominence Health)  
**Deliverable:** [Week 1] Repo Walkthrough & Architecture Assessment Memo (Jira Task #104)  
**Author:** Syed Sana Fazli (Architecture Lead)  
**Date:** October 2026  
**Status:** Published  

---

## 1. Executive Summary

This assessment evaluates the inherited "pseudo-MVP" codebase for **Arc-8 /  Platform**. The platform is intended to serve as a multi-tenant, HIPAA-ready healthcare analytics, risk adjustment, and member intelligence platform for payers, ACOs, and MSOs.

The codebase represents a functional prototype with substantial business logic already codified in **FastAPI** (backend) and **React** (frontend). However, it exhibits characteristic "prototype debt":
- Dual frontend apps (`frontend` and `frontend-member`) built with JavaScript and CRA/CRACO rather than typed, performant enterprise tooling.
- Azure-specific deployment scripts (`infra/azure`, Bicep, PowerShell) that conflict with the target **AWS architecture** (ECS/EKS, RDS Aurora, S3, Cognito).
- Hardcoded local SQLite databases committed to git (`tests/tenants/*.db`, `test_control.db`) instead of an orchestrated, reproducible database provisioning pipeline.
- Ad-hoc data fetching patterns lacking modern server-state caching (e.g., TanStack Query).

### Summary Recommendation (The 3Rs)
- **Reuse (~40%):** Core FastAPI domain routing, Pydantic schemas, tenant context resolver middleware, analytical math services (RAF, risk stratification), and reusable UI primitives/layouts.
- **Refactor (~35%):** Convert frontend to TypeScript + TanStack Query; transition from SQLite to PostgreSQL schema-per-tenant with Alembic; decouple authentication to AWS Cognito/OIDC.
- **Rebuild (~25%):** Infrastructure layer (replace Azure Bicep with Terraform/CDK for AWS); ingestion pipeline (claims 837/FHIR/MRA ETL); separate member edge proxy into clean API Gateway / CloudFront distribution.

---

## 2. Codebase Topology & Current State

```
Arc-8/
├── backend/                  # FastAPI 2.0 async service
│   ├── app/
│   │   ├── core/             # Configuration, logging, HIPAA checks
│   │   ├── db/               # Control plane & Tenant connection managers
│   │   ├── middleware/       # Tenant, rate-limit, logging, edge guards
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── routes/           # 25+ domain route modules
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   ├── services/         # Analytics, risk, coding, auth services
│   │   └── workers/          # Background event processors
│   └── tests/                # Pytest suites + committed SQLite fixtures
├── frontend/                 # Staff/Admin Portal (React 18 + CRACO + Bootstrap)
│   ├── src/
│   │   ├── components/       # Layouts, breadcrumbs, command palette, charts
│   │   ├── pages/platform/   # Member-360, coding, ride-booking, admin
│   │   └── services/         # Axios API clients
├── frontend-member/          # Separate Member Portal SPA
├── edge/member-portal/       # Express/Node edge proxy for member traffic
├── infra/azure/              # Legacy Azure Bicep & PowerShell deployment scripts
└── docs/                     # Architecture specifications & runbooks
```

---

## 3. The 3R Assessment: Reuse, Refactor, Rebuild

### 3.1. Detailed Component Categorization

| Subsystem | Component | Assessment | Rationale & Action Plan |
| :--- | :--- | :--- | :--- |
| **Backend** | `app/middleware/tenant.py` & `tenant_manager.py` | **REUSE** | Solid per-request tenant context resolution using request headers/tokens. |
| **Backend** | `app/routes/member360.py` & `member_risk.py` | **REUSE** | High domain value for Epic 3 & 4. Keep route logic, integrate with refreshed Postgres models. |
| **Backend** | `app/services/analytics.py` & `coding.py` | **REUSE** | Complex RAF calculation and HCC gap logic are already written and verified. |
| **Backend** | `app/db/session.py` (SQLite fallback) | **REFACTOR** | Remove SQLite fallback entirely in production. Enforce PostgreSQL async engine with connection pooling. |
| **Backend** | `app/routes/auth.py` | **REFACTOR** | Shift from custom JWT/Azure AD endpoints to AWS Cognito / enterprise OIDC provider. |
| **Backend** | Background Tasks (`app/workers/`) | **REFACTOR / REBUILD** | Currently basic async/event hub worker; needs durable Celery/SQS for large claims and 837 ingestion. |
| **Frontend** | Layouts (`PortalPageLayout`, `PortalNav`, `CommandPalette`) | **REUSE** | Highly functional navigation and accessibility shell. |
| **Frontend** | `frontend/src/pages/platform/Member-360` | **REUSE / REFACTOR** | Keep page workflow and wireframes; convert from `.js` to typed TypeScript (`.tsx`). |
| **Frontend** | Data Fetching (`services/api.js` + raw `axios`) | **REFACTOR** | Replace imperative `useEffect` data fetching with TanStack Query (caching, retry, invalidation). |
| **Frontend** | Build Tooling (`craco`, `react-scripts 5`) | **REFACTOR** | Migrate to Vite or modern Next.js for faster HMR, better bundle sizes, and native TypeScript support. |
| **Frontend** | `frontend-member` & `edge/member-portal` | **REBUILD** | Currently duplicated boilerplate. Integrate as clean monorepo packages or unified portal with RBAC gating. |
| **Infra** | `infra/azure/*` & `deploy-to-azure.ps1` | **REBUILD** | Must be replaced with AWS Terraform / CDK targeting ECS Fargate, RDS Aurora, S3, ElastiCache. |
| **Data** | `tests/tenants/*.db` & `test_control.db` | **REBUILD** | Remove committed binaries. Replace with synthetic data generators (`Faker`/`Synthea`) in Task #108. |

---

## 4. Technical Debt & Refactoring Hotspots

1. **Committed SQLite Binaries:**  
   Database files (`test_control.db`, `northwind.db`, `prominencehealth.db`) are tracked in git. This bloats repo size, poses risk of schema divergence, and violates CI/CD best practices.
2. **Dual Frontend Duplication:**  
   `frontend` and `frontend-member` have duplicated styling, component code, and authentication wrappers.
3. **Hardcoded Azure Footprint:**  
   Scripts assume Azure Container Apps, Azure Key Vault, Azure Blob, and Azure OpenAI. Arc-8 target is AWS.
4. **Lack of Frontend Type Safety:**  
   Nearly all core platform pages (`Member-360`, `coding`, `ride-booking`) are untyped `.js`, creating runtime regression risks during rapid sprint feature additions.
5. **Ingestion Bottlenecks:**  
   Synchronous or lightly buffered ingestion routes will choke on real-world 837 files or multi-megabyte MRA gap reports.

---

## 5. Sprint Alignment Matrix

| Arc-8 Epic | Target Features | Reused / Refactored Code Assets |
| :--- | :--- | :--- |
| **Epic 2: Foundation & AWS** | AWS IaC, CI/CD, Cognito SSO, RDS Aurora | Refactor `backend/app/core/config.py`, Rebuild `infra/` with Terraform |
| **Epic 3: Member 360** | Fast search, 360 cockpit, demographics, conditions | Reuse `backend/app/routes/member360.py`, Refactor `frontend/src/pages/platform/Member-360` to TS |
| **Epic 4: Risk & Care Journeys** | Risk stratification, rising risk, care plans | Reuse `backend/app/routes/member_risk.py` & `analytics.py`, build Care Journey models |
| **Epic 5: Escalations & Tasks** | Worklists, supervisor queue, audit logs | Reuse `app/utils/audit_logger.py`, extend `app/routes/workbench.py` |

---

## 6. Recommended Immediate Next Steps

1. **Publish this memo** to the engineering team and link it to Jira Issue #104.
2. **Coordinate with DevOps (Shaheer Sarwar - Task #105/#106)** to hand over the Azure dependency inventory for AWS service mapping.
3. **Coordinate with Data Lead (Ramesh Muralasetty - Task #107/#108)** to replace committed SQLite databases with the new synthetic domain model.
4. **Establish Frontend Standards (Sprint 1)**: Set up TypeScript strict mode and TanStack Query before writing new Member 360 features in Sprint 2.
