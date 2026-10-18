# Recommended PR Structure

PRs should be small, mergeable in isolation, and reversible. Each row below maps
to an issue in [github-issues.md](./github-issues.md). PRs are listed in the
order they should land — later PRs depend on earlier ones.

## Sequence

| # | Branch | Title | Depends on | Size | Reviewer hint |
|---|---|---|---|---|---|
| 1 | `feat/architecture-docs` | Architecture docs and gap analysis | — | S | Architecture lead |
| 2 | `feat/config-azure-ai` | Add Azure OpenAI/Cosmos/Search/Event Hub settings | — | S | Backend lead |
| 3 | `feat/event-envelope` | Versioned event envelope (Pydantic) | 2 | S | Backend lead |
| 4 | `feat/event-outbox-migration` | Alembic: `event_outbox` + immutability trigger | 3 | M | DBA + Backend |
| 5 | `feat/azure-clients-skeleton` | Embedding, Search, Cosmos, Event Hub client modules | 2 | M | Backend lead |
| 6 | `feat/event-publisher` | Outbox-to-Event-Hub publisher (background task) | 4, 5 | M | Backend lead |
| 7 | `feat/event-processor-worker` | `app.workers.event_processor` Event Hub consumer | 5, 6 | L | Backend lead + Compliance |
| 8 | `feat/ai-retrieval-service` | Hybrid search + prompt assembly | 5 | M | Backend lead |
| 9 | `feat/ai-ask-route` | `POST /api/v1/ai/ask` with audit | 8 | S | Backend lead + Security |
| 10 | `feat/frontend-typescript` | TypeScript scaffold for new `.tsx` only | — | S | Frontend lead |
| 11 | `feat/ai-assistant-panel` | AI Assistant React panel with citations | 9, 10 | M | Frontend lead |
| 12 | `infra/bicep-rag-resources` | Bicep modules: Cosmos, AI Search, Event Hub, OpenAI + PE | — | L | Platform/Infra |
| 13 | `infra/bicep-private-dns` | Private DNS zones + VNet links | 12 | M | Platform/Infra |
| 14 | `infra/managed-identity-roles` | Role assignments for Container App MI | 12 | S | Security |
| 15 | `ci/trivy-scan` | Image scan gate in `deploy-backend.yml` | — | S | DevSecOps |
| 16 | `ci/trufflehog-precommit` | Secret-scan pre-commit hook | — | S | DevSecOps |
| 17 | `feat/pg-rls-policies` | RLS on per-tenant tables | — | L | DBA + Security |
| 18 | `feat/audit-immutability-trigger` | Postgres trigger | 17 | S | DBA |
| 19 | `feat/keyvault-runtime-client` | Live secret retrieval from KV | — | M | Backend lead + Security |
| 20 | `feat/otel-wiring` | Auto-instrumentation + PHI scrubber | — | M | Backend lead + Security |

## PR template

Every PR opened against `main` must include:

1. **Why** — link to issue and 1–3 sentence motivation
2. **What changed** — bulleted list of file-level changes
3. **Test plan** — exact commands + expected output for the reviewer to verify locally
4. **Risk** — blast radius if reverted (data loss? user impact? cost?)
5. **Rollout** — feature flag if any; migration order; manual steps required
6. **Compliance checklist** — does it touch PHI? secrets? auth? IAM? if yes, add `compliance:hipaa` label

## Rules of engagement

- **No squash-and-force-push to `main`.** Merge commits via the GitHub UI.
- **Migrations must include a downgrade.** Even if it raises `NotImplementedError`,
  the downgrade comment must explain why.
- **Bicep PRs require `az deployment group what-if`** output in the description.
- **Frontend PRs touching auth or RAG require a screenshot.**
- **Any new Azure resource must have a private endpoint** unless explicitly waived
  with `compliance:hipaa-waiver` and a written justification.
- **Tests are mandatory** for new logic. Coverage gate: 70% on changed files.
- **PRs older than 7 days** without activity get auto-marked stale and pinged.
