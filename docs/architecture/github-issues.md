# Recommended GitHub Issues

Copy these into the project tracker. They are scoped to the smallest reviewable
unit and reference the PR they belong to in [pr-structure.md](./pr-structure.md).

## Epic — Azure-Native Foundation

### Bicep IaC

- **issue/bicep-cosmos-with-pe** — Provision Cosmos DB account with capacity mode `serverless`, geo-redundant backup, customer-managed keys, and a private endpoint. Containers: `semantic_member`, `event_snapshots`, `feature_store`, `rag_chunks`. Acceptance: `az deployment group validate` passes; public network access disabled.
- **issue/bicep-ai-search-with-pe** — Provision Azure AI Search (Standard tier S1, replicas=1, partitions=1 initially) with private endpoint. Identity: managed identity. Acceptance: index APIs reachable only from VNet.
- **issue/bicep-event-hub-with-pe** — Provision Event Hub namespace (Standard) with 5 topics, 4 partitions each, 7-day retention. Private endpoint. Acceptance: Container App MI has `Azure Event Hubs Data Sender` + `Data Receiver` roles.
- **issue/bicep-azure-openai-with-pe** — Provision Azure OpenAI account in `eastus` with `text-embedding-3-large` deployment. Private endpoint. Disable public access. Acceptance: `BlockedByPolicy` for non-MI callers.
- **issue/bicep-private-dns-zones** — Create private DNS zones for `privatelink.documents.azure.com`, `privatelink.search.windows.net`, `privatelink.servicebus.windows.net`, `privatelink.openai.azure.com`. Link to VNet.

## Epic — Event Pipeline

- **issue/outbox-table-migration** — Alembic migration `20260519_000012_event_outbox.py` creates `event_outbox` per tenant schema with: `id`, `event_id (uuid)`, `aggregate_type`, `aggregate_id`, `event_type`, `payload (jsonb)`, `occurred_at`, `published_at`, `schema_version`. Add immutability trigger forbidding UPDATE/DELETE. Idx on `(published_at NULL FIRST, id)`.
- **issue/event-envelope** — Define versioned CloudEvents-compatible envelope in `backend/app/events/envelope.py`. Include `event_id`, `tenant_id`, `aggregate_type`, `aggregate_id`, `version`, `occurred_at`, `payload`, `schema_version`. Pydantic model.
- **issue/event-hub-publisher** — Background task that drains `event_outbox` to Event Hub. At-least-once. Checkpoint by `published_at` set in a single SQL UPDATE per batch. Backoff on transient errors.
- **issue/event-processor-worker** — `python -m app.workers.event_processor` consumes Event Hub. For each member event: chunk content → embed via Azure OpenAI → upsert AI Search doc + Cosmos snapshot. Idempotent on `event_id`.

## Epic — RAG Retrieval

- **issue/azure-openai-client** — `app/services/ai/embeddings.py` with `embed_batch(texts)` using `DefaultAzureCredential` + `AzureOpenAI` SDK. Cached singleton.
- **issue/ai-search-client** — `app/services/ai/search.py` with `ensure_index()`, `upsert(documents)`, `hybrid_search(query, tenant_id, top_k)`. Vector field uses `Collection(Edm.Single)` with HNSW algorithm.
- **issue/cosmos-client** — `app/services/ai/cosmos.py` with `upsert_snapshot(...)` and `get_snapshot(...)`. Partition key `/tenant_id`.
- **issue/retrieval-service** — `app/services/ai/retrieval.py` orchestrates hybrid search → context window assembly → Anthropic chat call with system prompt + citations.
- **issue/ai-ask-route** — `POST /api/v1/ai/ask` returns `{answer, citations}`. Audited as `ai.ask.success` / `ai.ask.failed`. Rate-limited per-user.

## Epic — Frontend RAG UI

- **issue/typescript-scaffold** — Add `tsconfig.json` and `tsconfig.base.json`. Enable TS compilation in CRACO for `.tsx` files only — do not touch existing `.js`.
- **issue/ai-assistant-panel** — `frontend/src/components/ai/AiAssistantPanel.tsx`. Composes question input + answer area + citations. Uses `useAiAssistant` hook.
- **issue/citation-chip** — `frontend/src/components/ai/CitationChip.tsx`. Anchor element with deep-link to Member360 sub-tab keyed by `source_id`.
- **issue/ai-service-ts** — Typed fetch wrapper in `frontend/src/services/aiService.ts`.
- **issue/wire-ai-panel-on-member360** — Mount `AiAssistantPanel` inside `Member360LabWorkspace` behind a feature flag.

## Epic — Compliance Hardening

- **issue/pg-rls-policies** — Alembic migration applies `ENABLE ROW LEVEL SECURITY` + per-table policy `tenant_isolation` keyed on `app.current_tenant_id` GUC. `set_config('app.current_tenant_id', :id, true)` in tenant session factory.
- **issue/audit-immutability-trigger** — Postgres trigger blocking `UPDATE` and `DELETE` on `tenant_audit_events` and `event_outbox` (post-publish).
- **issue/dockerfile-nonroot** — Multi-stage Dockerfile; run as `appuser` uid 1000.
- **issue/ci-trivy-scan** — Add `trivy image` step to `deploy-backend.yml` gating on `HIGH` and `CRITICAL`.
- **issue/precommit-trufflehog** — Add `trufflehog` hook to `.pre-commit-config.yaml`.
- **issue/keyvault-runtime-client** — `app/core/secrets.py` with `DefaultAzureCredential` + `SecretClient`. Cache 5 minutes. Use for `SECRET_KEY`, `FIELD_ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, DB URLs.

## Epic — Observability

- **issue/otel-instrumentation** — Wire `azure-monitor-opentelemetry` in `main.py`. Auto-instrument FastAPI, asyncpg, httpx. Add manual span around RAG retrieval.
- **issue/otel-phi-scrubber** — Custom span processor that drops/masks PHI fields (member IDs, emails, free text) before export.
- **issue/audit-blob-export** — Nightly job exports new `tenant_audit_events` to immutable blob container (WORM policy, 6-year retention).
- **issue/sentinel-rules** — Microsoft Sentinel analytics rules: anomalous login geography, mass export, RAG question count spike.

## Epic — Multi-tenant Entra ID

- **issue/multitenant-entra** — Update `azure_auth.py` to accept tokens issued by multiple tenants validated against an allowlist. Token exchange records `tid` claim.
- **issue/msal-react** — Add `@azure/msal-react` to frontend with multi-tenant authority `https://login.microsoftonline.com/organizations`. Issue PR side-by-side with `multitenant-entra`.

## Labels to set up

`area:backend`, `area:frontend`, `area:infra`, `area:security`, `area:ai`,
`priority:p0`, `priority:p1`, `priority:p2`, `compliance:hipaa`, `compliance:soc2`,
`size:s`, `size:m`, `size:l`.
