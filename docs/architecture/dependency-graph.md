# Service Dependency Graph

## High level

```
                                  +---------------------+
                                  | Entra ID (Identity) |
                                  +----------+----------+
                                             |
                                  validates  |  validates
                                             v
                          +------------------+------------------+
                          |                                     |
                          v                                     v
              +-----------+------------+         +--------------+-------------+
              | Static Web App (React) |         | Container App: nexora-api  |
              | + AI Assistant Panel   |  HTTPS  |   (FastAPI)                |
              +------------------------+-------->+----+--------+--------+-----+
                                                      |        |        |
                                                      |        |        |
                                  +-------------------+        |        +---------------------+
                                  |                            |                              |
                                  v                            v                              v
                       +----------+----------+      +----------+----------+         +---------+---------+
                       | Postgres Flexible   |      | Redis Enterprise    |         | Azure Key Vault   |
                       | Server (control +   |      | (rate limit + cache)|         | (secrets at start)|
                       | tenant data)        |      +---------------------+         +-------------------+
                       +----+-----------+----+
                            |           |
                outbox poll |           | logical replication (future)
                            v           v
                   +--------+-----------+------+
                   | Container App: event_     |
                   | publisher (in-process     |
                   | task inside nexora-api)   |
                   +-----------+---------------+
                               |
                               v
                       +-------+--------+
                       | Event Hub      |
                       | (member topic) |
                       +-------+--------+
                               |
                               v
                  +------------+-------------+
                  | Container App: event_    |
                  | processor (worker)       |
                  +------+--------+----------+
                         |        |
              embedding  |        |  indexing + snapshot
                         v        v
              +----------+-+   +--+-------------+   +----------------+
              | Azure      |   | Azure AI       |   | Cosmos DB      |
              | OpenAI     |   | Search (idx-*) |   | (snapshots,    |
              | (embed-3)  |   |                |   |  features)     |
              +-----+------+   +-------+--------+   +--------+-------+
                    ^                  ^                     ^
                    |                  | hybrid search       | read snapshots
                    |                  |                     |
                    +-------- nexora-api: RAG retrieval -----+
                                       |
                                       v
                                +------+------+
                                | Anthropic   |
                                | Chat API    |
                                +-------------+

                          (telemetry / audit)
                                       |
                                       v
                  +--------------------+---------------------+
                  | Application Insights / Log Analytics     |
                  +------------------------------------------+
```

## Read paths

| Request | Hits |
|---|---|
| `GET /api/v1/member360/...` | nexora-api → Postgres (tenant schema) → Redis (cache) |
| `POST /api/v1/ai/ask` | nexora-api → AI Search (hybrid) → Anthropic chat → returns to client |
| Click citation chip | Browser → Static Web App → nexora-api → Postgres |

## Write paths

| Event | Hits |
|---|---|
| Member create/update | nexora-api → Postgres (txn: member row + outbox row) → returns 201 |
| Outbox publish | Outbox poller → Postgres (UPDATE published_at) → Event Hub |
| Indexing | Event processor → Azure OpenAI (embed) → AI Search (upsert) → Cosmos (upsert snapshot) |
| Audit | nexora-api → Postgres `tenant_audit_events` → (nightly) → Blob WORM |

## Required network paths

Every connection below must traverse a **private endpoint** in the target state.

| Source | Destination | Protocol |
|---|---|---|
| nexora-api (Container App MI) | Postgres | TCP 5432 |
| nexora-api | Redis | TCP 6380 (TLS) |
| nexora-api | Key Vault | HTTPS |
| nexora-api | Event Hub | AMQP 5671 |
| nexora-api | Azure AI Search | HTTPS |
| nexora-api | Cosmos DB | HTTPS |
| nexora-api | Azure OpenAI | HTTPS |
| nexora-api | Anthropic API | HTTPS (egress to public Internet — covered by BAA) |
| event_processor | Event Hub | AMQP 5671 |
| event_processor | Azure OpenAI | HTTPS |
| event_processor | AI Search | HTTPS |
| event_processor | Cosmos DB | HTTPS |
| Front Door | Container App ingress | HTTPS |
| Static Web App | nexora-api ingress | HTTPS (rewrite proxy) |

## Failure modes

- **Event Hub unavailable** → outbox grows, no data loss; alarms fire on `event_outbox` queue depth.
- **Cosmos unavailable** → snapshots stale; AI Search still serves; degraded answers.
- **AI Search unavailable** → `/ai/ask` returns 503 with retry-after; user-facing error explains.
- **Azure OpenAI rate-limited** → embedding backlog grows; alarms on `embed_lag_seconds`.
- **Anthropic unavailable** → `/ai/ask` returns 503; UI shows fallback message.

## Identity assignments (target)

| Identity | Roles |
|---|---|
| Container App nexora-api MI | KV Secrets User; Storage Blob Data Contributor (m360 containers only); Search Index Data Reader; Cognitive Services OpenAI User; Event Hubs Data Sender; Cosmos Built-in Data Reader |
| event_processor MI (same MI or distinct) | Event Hubs Data Receiver; Search Index Data Contributor; Cosmos Built-in Data Contributor; Cognitive Services OpenAI User |
| CI service principal | Contributor on RG (scoped); KV Secrets Officer |
| Postgres Flexible Server MI | KV Crypto User (for CMK at rest) |
