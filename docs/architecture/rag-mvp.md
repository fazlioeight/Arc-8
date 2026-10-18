# Minimum Viable RAG Pipeline — Implementation Plan

This is the thin end-to-end slice that proves the AI semantic layer for Nexora.
It will land in week 1 (this engagement) and is the foundation for week 5's
inline AI insights and Claim360 explainability.

## 1. Slice scope

> When a Member is updated in Postgres, the change reaches Azure AI Search and
> Cosmos DB within 60 seconds. A clinician can ask "What changed for member
> 12345 this week?" in the AI Assistant panel and receive an answer with
> clickable citations linking back to Member360.

Out of scope for the MVP: clinical notes ingestion, FHIR document chunking,
streaming responses, multi-modal embeddings, citation feedback loop.

## 2. Data flow

```
+----------------+   commit   +----------------+   poll   +-----------+
| API request    |----------->| Postgres       |--------->| Outbox    |
| (FastAPI)      |  txn + INSERT INTO event_outbox        | publisher |
+----------------+            +----------------+          +-----+-----+
                                                                |
                                                                v
                                                          +-----+-----+
                                                          | Event Hub |
                                                          | topic     |
                                                          +-----+-----+
                                                                |
                                          fan-out (consumer group: rag)
                                                                |
                                                                v
                                                          +-----+-----+
                                                          | Event     |
                                                          | processor |
                                                          | worker    |
                                                          +-----+-----+
                                                                |
                              +---------------------------------+---------------------------+
                              |                                                             |
                              v                                                             v
                       +------+------+                                              +-------+-------+
                       | Azure       |    embeds via                                | Cosmos DB     |
                       | OpenAI      | <----------- chunks -----------------------> | snapshot doc  |
                       | embeddings  |                                              +---------------+
                       +------+------+
                              |
                              v
                       +------+------+
                       | Azure AI    |
                       | Search idx  |
                       +-------------+

Query side:

   Browser                                  FastAPI                              Azure AI Search
+------------+   POST /api/v1/ai/ask    +-----------+                          +----------------+
| AI panel   |------------------------->| ai route  | --- hybrid search -----> | idx-members-v1 |
+------------+                          +-----+-----+                          +-------+--------+
                                              |                                        |
                                              | top-k chunks + cite ids                |
                                              v                                        |
                                        +-----+-----+   compose prompt                 |
                                        | RAG svc   |<---------------------------------+
                                        +-----+-----+
                                              |
                                              v
                                        +-----+-----+
                                        | Anthropic |
                                        | chat API  |
                                        +-----------+
```

## 3. Components and file layout

```
backend/
  alembic/versions/
    20260519_000012_event_outbox.py            # outbox table + immutability trigger
  app/
    core/
      config.py                                # NEW SETTINGS appended
    events/
      __init__.py
      envelope.py                              # CloudEvents-compatible envelope
      outbox.py                                # SQLAlchemy model + publisher
    services/
      ai/
        __init__.py
        embeddings.py                          # Azure OpenAI client
        search.py                              # Azure AI Search client (index + query)
        cosmos.py                              # Cosmos DB client
        retrieval.py                           # Hybrid search + prompt assembly
    routes/
      ai.py                                    # POST /api/v1/ai/ask
    workers/
      __init__.py
      event_processor.py                       # Event Hub consumer entry point

frontend/
  src/
    components/
      ai/
        AiAssistantPanel.tsx                   # Side panel with citations
        CitationChip.tsx
    services/
      aiService.ts                             # Typed fetch wrapper
    hooks/
      useAiAssistant.ts

infra/
  azure/
    bicep/
      main.bicep                               # Orchestrator
      modules/
        cosmos.bicep
        ai-search.bicep
        event-hub.bicep
        azure-openai.bicep
        private-endpoint.bicep
        private-dns-zone.bicep
```

## 4. Acceptance criteria

### Backend
- `pytest backend/tests/test_event_outbox.py` passes; outbox insert is in the same transaction as the domain mutation; trigger blocks UPDATE/DELETE.
- `python -m app.workers.event_processor --dry-run` connects to Event Hub, claims a partition, and exits cleanly without committing offsets.
- `POST /api/v1/ai/ask` returns `{"answer": "...", "citations": [{"source_id": "...", "url": "..."}]}` in under 4 seconds p95 on a warm path.
- All Azure SDK clients authenticate via `DefaultAzureCredential` only — no connection strings or keys in code.
- Idempotency: replaying the same outbox event produces the same Cosmos document version and the same AI Search index entry (upsert by `event_id`).

### Frontend
- `AiAssistantPanel.tsx` renders, accepts a free-text question scoped to the current Member360 context, and shows ≥1 citation chip per answer.
- Clicking a citation chip navigates to the originating Member360 sub-tab.
- No console errors in dev or production builds.

### Infrastructure
- `az deployment group validate -f main.bicep` passes.
- Cosmos, AI Search, Event Hub, Azure OpenAI are reachable **only** via private endpoint from inside the VNet.
- The Container App's managed identity has: `Cosmos DB Data Contributor`, `Search Index Data Contributor`, `Azure Event Hubs Data Sender/Receiver`, `Cognitive Services OpenAI User` — no broader roles.

## 5. Open questions

| Question | Owner | Resolution by |
|---|---|---|
| Embedding model: `text-embedding-3-large` (3072 dims) vs `3-small` (1536)? | Architecture | Week 1 day 2 — pick based on AI Search vector dim cost |
| Cosmos partition key for `event_snapshots` — `tenant_id` or `tenant_id + aggregate_type`? | Architecture | Week 1 day 2 — compound preferred if traffic skews to Member360 |
| Anthropic BAA — confirm coverage of PHI in prompt context | Compliance | Before any PHI flows through Anthropic chat |
| Should AI Assistant write its Q/A pairs back as audit events? | Security | Yes — log to `tenant_audit_events` as `ai.ask.success` / `ai.ask.failed` |

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Embedding cost spikes on bulk member backfill | Throttle embedding worker to N tokens/sec; checkpoint progress; resume after rate-limit |
| PHI leakage via embeddings cached at Azure OpenAI | Use Azure OpenAI with `data_use=NoTrainOrSubprocess`; private endpoint; BAA in place |
| Outbox table grows unbounded | Publisher deletes (or moves to `event_outbox_archive`) rows older than 7 days post-acknowledgment |
| Event Hub partition skew | Use `tenant_id` as partition key — small tenants under-utilise; revisit if hot tenants saturate one partition |
| AI Search index drift between schema and code | Index definitions live in code; CI re-applies on deploy with `idempotent` upsert |
