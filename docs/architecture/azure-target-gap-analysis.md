# Nexora Platform — Azure-Native Target Gap Analysis

Status: 2026-05-19
Owner: Platform Architecture

This document captures the delta between the current Nexora codebase and the
target Azure-native, HIPAA-aligned architecture. It is the input to the
roadmap, the MVP RAG plan, and the GitHub issue list under this folder.

## 1. Target architecture (summary)

| Layer | Service | Purpose |
|---|---|---|
| OLTP | Azure PostgreSQL Flexible Server | Domain aggregates, RLS, event-augmented tables |
| AI semantic | Cosmos DB | Semantic objects + event snapshots |
| AI semantic | Azure AI Search | Vector + hybrid search |
| AI semantic | Azure OpenAI | Embeddings (and optionally chat) |
| Events | Azure Event Hub | CDC ingestion, fan-out to processors |
| Compute | Azure Container Apps | API + workers |
| Frontend | Azure Static Web Apps | React SPA |
| Identity | Entra ID + Managed Identity | User SSO + service-to-service auth |
| Secrets | Azure Key Vault | All secret material |
| Network | Private Endpoints + Front Door + WAF | Public surface area minimised |

## 2. Current state vs. target — by layer

### 2.1 Operational layer (OLTP)

| Item | Current | Target | Gap |
|---|---|---|---|
| Database | Postgres Flexible Server 16 (private subnet, SSL) | Same | None |
| Multi-tenancy | `Tenant.db_schema` + per-tenant connection pool ([backend/app/db/tenant_manager.py](../../backend/app/db/tenant_manager.py)) | Schema-per-tenant + **PostgreSQL RLS** as defense-in-depth | RLS policies missing on every per-tenant table |
| Aggregates — Tenant, User, AuditEvent | Present in [backend/app/models/tables.py](../../backend/app/models/tables.py) | Present | None |
| Aggregates — Member | Rich Member360 module ([backend/app/models/member360.py](../../backend/app/models/member360.py)) | Same | None |
| Aggregate — Provider | Coding sub-entity only | Top-level aggregate | Missing |
| Aggregate — Encounter | Implied via Member360 claims/notes | Top-level aggregate | Missing |
| Aggregate — Claim | Member360Claim only | Top-level aggregate with Claim360 service | Missing |
| Aggregate — Document | `Member360Document` sub-entity | Top-level aggregate, versioned, blob-backed | Missing |
| Aggregate — WorkflowInstance | None | State-machine aggregate driving Coding/Care workflows | Missing |
| Event augmentation | None | Outbox table + Postgres logical replication slot | Missing |
| Audit immutability | Application-layer only (`TenantAuditEvent`, no UPDATE/DELETE code paths) | DB trigger forbidding mutations + blob WORM cold sink | Trigger + cold sink missing |

### 2.2 AI semantic layer

| Item | Current | Target | Gap |
|---|---|---|---|
| Cosmos DB | Not provisioned | Containers: `semantic_member`, `event_snapshots`, `feature_store`, `rag_chunks` | Greenfield |
| Azure AI Search | Not provisioned | Indexes: members, clinical notes, documents, claims (all vector + text) | Greenfield |
| Azure OpenAI | Not provisioned | `text-embedding-3-large` for embeddings; optional chat models | Greenfield |
| Chat LLM | Anthropic via [backend/app/services/chat/client.py](../../backend/app/services/chat/client.py) | Keep Anthropic for chat per decision 2026-05-19 | None |
| RAG retrieval | None | Hybrid (BM25 + vector) over AI Search → Anthropic with citations | Greenfield |
| Embedding generation | None | Background worker, idempotent, per-tenant partitioning | Greenfield |

### 2.3 Event pipeline

| Item | Current | Target | Gap |
|---|---|---|---|
| Event Hub | Not provisioned (Service Bus used for ingestion queue only) | Event Hub namespace + 5 topics (member/claim/encounter/document/workflow) | Greenfield |
| CDC | None | Postgres logical replication or outbox-drain to Event Hub | Greenfield |
| Outbox | None | `event_outbox` table per tenant schema with publisher worker | Greenfield |
| Event envelope | None | Versioned envelope with `tenant_id`, `aggregate`, `version`, `occurred_at`, `payload`, `schema_version` | Greenfield |
| Processors | None | Async Event Hub consumer → embed → index → snapshot | Greenfield |

### 2.4 Frontend

| Item | Current | Target | Gap |
|---|---|---|---|
| Build | CRA + Craco | Same (or Vite later) | None for MVP |
| Language | JavaScript only (~150 files) | TypeScript for new modules | TS scaffolding for new code |
| Routing | `react-router-dom@6` | Same | None |
| Member360 | Implemented ([frontend/src/pages/platform/member360-lab/](../../frontend/src/pages/platform/member360-lab/)) | Same + inline AI insights | AI insights missing |
| Claim360 | Not built | New module | Missing |
| Workflow UI | `WorkspaceDrawer` pattern only | Kanban + state machine viewer | Missing |
| AI Assistant | Chat page exists ([frontend/src/pages/platform/chat/ChatPage.js](../../frontend/src/pages/platform/chat/ChatPage.js)) | Side panel with RAG citations linked to source records | Missing |
| Data fetching | Hand-rolled fetch services | TanStack Query for new code | New code only |
| Auth | Custom JWT with PKCE for Entra ID ([frontend/src/context/AuthContext.js](../../frontend/src/context/AuthContext.js)) | MSAL React for new flows; existing JWT remains for tenant token | MSAL not installed |
| Static Web App | `staticwebapp.config.json` present | Same + role-based route guards | Role config missing |

### 2.5 Security

| Item | Current | Target | Gap |
|---|---|---|---|
| Managed identity | System-assigned MI on Container App; used for Blob | Used for **all** Azure services (KV, Cosmos, AI Search, Event Hub, Postgres) | Wider adoption |
| Entra ID | Optional single-tenant SSO ([backend/app/services/azure_auth.py](../../backend/app/services/azure_auth.py)) | Multi-tenant validator | Single-tenant only |
| Key Vault | Secrets stored, injected at deploy as env vars | Live retrieval at startup with cached, rotatable secrets | No runtime KV client |
| Private endpoints | Postgres on private subnet only | Private endpoints for KV, Storage, Service Bus, Event Hub, Cosmos, AI Search | Missing for everything but Postgres |
| WAF | None | Front Door Premium + WAF policies | Missing |
| CMK / BYOK | Microsoft-managed only | CMK for Postgres, Storage, Cosmos, AI Search | Missing |
| Dockerfile | Runs as root | Non-root `USER appuser` | Missing |
| Image scanning | None in CI | Trivy gate on PR | Missing |
| Secret scanning | None | `trufflehog` in pre-commit | Missing |

### 2.6 Observability

| Item | Current | Target | Gap |
|---|---|---|---|
| Logs | Structured JSON, request-id, audit log file | Same, plus Log Analytics + Sentinel | Sentinel missing |
| Traces | `azure-monitor-opentelemetry` declared, not wired | Auto-instrumented FastAPI + manual spans on RAG/embed paths | Wiring missing |
| Metrics | None custom | Container Apps default + custom AI metrics | Missing |
| Compliance reports | None | Log Analytics workbook + HIPAA evidence bundle | Missing |

### 2.7 IaC

| Item | Current | Target | Gap |
|---|---|---|---|
| Tooling | PowerShell scripts ([infra/azure/](../../infra/azure/)) | Bicep modules with `main.bicep` orchestrator | Conversion required |
| State | None | Bicep is stateless; deployments tracked via ARM history | None once converted |
| Policy | None | `Microsoft.Authorization/policyAssignments` for HIPAA initiative | Missing |

## 3. Compliance gap shortlist (highest risk)

1. **No PostgreSQL RLS** — application bug could leak cross-tenant data.
2. **No private endpoints** for KV/Storage/Service Bus.
3. **Container runs as root**.
4. **No image scanning** in CI.
5. **No PHI masking** in App Insights telemetry.
6. **Audit log is logically immutable only** — needs a Postgres trigger.
7. **Anthropic API path lacks BAA acknowledgment** in repo documentation.
8. **No automated secret rotation** — runbook is manual.

## 4. Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-19 | Azure OpenAI for embeddings + retrieval; Anthropic kept for chat | Existing Claude integration works; embedding integrations in AI Search expect Azure OpenAI; minimises rewrite |
| 2026-05-19 | TypeScript only for new frontend modules | Avoid blocking refactor; new Claim360/Workflow/AI Assistant gain type safety from day one |
| 2026-05-19 | Bicep over Terraform | Azure-native, no separate state backend, fits team's PowerShell + ARM familiarity |

## 5. Companion documents

- [Roadmap (6–8 weeks)](./roadmap.md)
- [Minimum Viable RAG plan](./rag-mvp.md)
- [Recommended GitHub issues](./github-issues.md)
- [PR structure](./pr-structure.md)
- [Service dependency graph](./dependency-graph.md)
