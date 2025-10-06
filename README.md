# Nexora Platform

Nexora Platform is a healthcare analytics solution for payer groups, now hardened for HIPAA-compliant, multi-tenant SaaS operation. The system is split between a control plane (FastAPI + PostgreSQL/SQLite) that manages tenants, users, and audit trails, and isolated tenant data planes where PHI lives in per-tenant schemas or databases. A React SPA consumes the public APIs, and optional Streamlit dashboards can be layered on top of the API for ad-hoc analytics.

## Architecture Overview

- **Control Plane (FastAPI + SQLAlchemy async)**
  - Stores tenants, users, billing plans, feature flags, and audit events.
  - Issues JWTs with tenant scoping and enforces per-request tenant context.
  - Exposes provisioning helpers (`app/services/provisioning.py`) to onboard new tenants and hydrate their data stores.
- **Tenant Data Plane**
  - Each tenant has an independent schema or database. SQLAlchemy connects dynamically per request using the resolved tenant context.
  - PHI endpoints (`/member/*`, analytics) run against the tenant-bound `Member` and `Claim` tables.
- **Cross-cutting controls**
  - Redis-backed rate limiting middleware (`RateLimitMiddleware`) applies token-bucket throttles per tenant.
  - Structured logging + dedicated audit logger persist immutable audit trails to both file (`logs/audit.log`) and the control plane.
  - Tenant-aware request logging middleware stamps log lines with tenant and user identity for observability.

## Project Structure

```
nexora-platform/
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ backend/
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ app/
Ã¢â€â€š   Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ core/                # settings, logging, redis helpers
Ã¢â€â€š   Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ db/                  # async control + tenant session managers
Ã¢â€â€š   Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ dependencies/        # FastAPI dependencies (tenant context, sessions)
Ã¢â€â€š   Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ middleware/          # tenant resolver, rate limiting, request logging
Ã¢â€â€š   Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ models/              # control-plane + tenant-plane SQLAlchemy models
Ã¢â€â€š   Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ routes/              # FastAPI routers (analytics, member endpoints)
Ã¢â€â€š   Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ services/            # analytics, tenant registry, provisioning helpers
Ã¢â€â€š   Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ utils/               # security helpers, audit logging
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ scripts/seed_demo.py     # Async control/tenant seeding for demo data
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ alembic/                 # Control plane migrations
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ tests/                   # pytest + httpx async tests for tenant isolation
Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ frontend/
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ src/context/AuthContext.js          # stores token + tenant context
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ src/pages/Login.js                  # multi-tenant aware login flow
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ src/services/memberCostService.js   # tenant-authenticated API calls
    Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ src/__tests__/                      # Jest tests
```

## Backend Setup

1. **Environment**
   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

2. **Configuration** (set in shell or `.env`):
   - `ENVIRONMENT` (`development` | `test` | `production`)
   - `SECRET_KEY` (required in production; auto-generated for dev/tests)
   - `CONTROL_DATABASE_URL` (e.g. `postgresql+asyncpg://user:pass@host/db` or `sqlite+aiosqlite:///./nexora_control.db`)
   - `DEFAULT_TENANT_DATABASE_URL` or `TENANT_DATABASE_URL_TEMPLATE` (e.g. `postgresql+asyncpg://.../{tenant_key}`)
   - `TENANT_DATABASE_SCHEMA_TEMPLATE` (optional; e.g. `tenant_{tenant_slug}`)
   - `REDIS_URL` (`redis://localhost:6379/0`) to enable rate limiting
   - Optional: `CANONICAL_HOST_DOMAIN`, `ALLOWED_TENANT_HOSTS`, `AUDIT_LOG_PATH`, `USAGE_DAILY_LIMIT`, `RATE_LIMIT_MAX_PER_MINUTE`

3. **Database migrations**
   ```powershell
   cd backend
   alembic upgrade head
   ```

4. **Seed demo tenant (control + tenant DB):**
   ```powershell
   python scripts/seed_demo.py
   ```

5. **Run API (async Uvicorn):**
   ```powershell
   python -m uvicorn app.main:app --reload
   ```

### Tenant Provisioning

Use `app/services/provisioning.py::provision_tenant` inside an async control-plane session to create new tenants. The helper merges global feature flags, writes tenant metadata, and ensures tenant schemas/databases are created before returning.

### Compliance & Observability

- All API calls must include both `Authorization: Bearer <JWT>` and `X-Tenant-Key` headers. Tenant context can also be inferred from subdomains when deployed.
- Sensitive endpoints append audit events to the control database and `logs/audit.log` with actor, tenant, and payload metadata.
- Rate limiting headers (`X-RateLimit-*`) surface token bucket state to clients.

## Frontend Setup

1. Install & run:
   ```powershell
   cd frontend
   npm install
   npm start
   ```
2. Configure `REACT_APP_API_BASE` (defaults to `http://localhost:8000`).
3. The login view now sends `X-Tenant-Key` and persists `{ token, tenant, role }` in `AuthContext`. Service calls use those values when hitting backend APIs.

### Import & Job Monitoring

- Launch the importer at `/jobs/import-data` to upload members, providers, claims, MAO-004, or chart manifest files.
- Each dataset card supports drag-and-drop or file browser uploads for `.txt`, `.csv`, and `.xlsx` sources and surfaces the first 900 characters of text files so you can verify formatting (spreadsheets note that previews are unavailable).
- Queueing an import adds it to the on-page activity table and records audit events; progress is simulated locally until a backend pipeline is connected.
- Use the `View Job Status Center` button (or directly visit `/jobs/status-center`) to review import progress, download logs, retry jobs, and take advantage of the new `Go to Import Data` shortcut back to the uploader.

## Testing

- **Backend**: `cd backend && pytest` (uses async httpx client, bootstraps control + tenant test databases under `backend/tests/`).
- **Frontend**: `cd frontend && npm test`.

## Key API Endpoints

> All endpoints expect `X-Tenant-Key` and a valid JWT unless noted.

- `POST /api/login` Ã¢â€ â€™ `{ token, email, tenant, role }`
- `GET /api/tenant/self` Ã¢â€ â€™ tenant metadata, feature flags, current user context
- `GET /api/analytics/summary`
- `GET /member/{member_id}/costs`
- `GET /member/{member_id}/risk`
- `GET /overutilization/?threshold=`

Unauthorized or cross-tenant attempts return `401/403`. Excessive calls return `429` with rate-limit headers.

## Streamlit Dashboards

Dashboards remain optional; ensure `Authorization` header and `X-Tenant-Key` are forwarded when invoking API calls inside Streamlit apps.

## Troubleshooting

- Missing Redis: rate limiting gracefully degrades but is required for production hard-limits.
- Tenant resolution errors: verify DNS/host mappings (`ALLOWED_TENANT_HOSTS`) or include `X-Tenant-Key` explicitly.
- Async database drivers: install `asyncpg` for Postgres or `aiosqlite` for SQLite (included in `requirements.txt`).

## License

Apache License 2.0
