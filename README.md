# Nexora Platform

Nexora Platform delivers a HIPAA-conscious, multi-tenant analytics and coding workspace for payer groups. The repository hosts the FastAPI control plane, per-tenant data plane helpers, Streamlit prototypes, and the React portal that surfaces analytics, coding workflows, and operational dashboards.

## Highlights
- Multi-tenant control plane with async SQLAlchemy connection pooling, per-request tenant context, audit trails, and JWT issuance.
- Coding workbench APIs for chases, assignments, attachments, MAO-004 ingestion, and provider/member drill-downs.
- React portal with session locking, guided tours, command palette, notifications, and rich job-import workflows.
- Redis-backed tenant rate limiting, structured request logging, file + database audit logging, and configurable HIPAA enforcement.
- CLI seeding, SQL bootstrapping scripts, and optional Streamlit dashboards to explore tenant data outside the SPA.

## Monorepo Layout

```
nexora-platform/
  backend/
    app/
      core/             # settings + logging bootstrap
      db/               # control + tenant session factories and LRU cache
      dependencies/     # FastAPI dependencies (tenant context, sessions)
      middleware/       # tenant resolver, rate limiter, request logging
      models/           # SQLAlchemy control-plane + tenant-plane tables
      routes/           # FastAPI routers (analytics, coding, admin, etc.)
      schemas/          # Pydantic IO models for public APIs
      services/         # provisioning, analytics, Mao analysis, submissions
      utils/            # auth helpers, audit logger, password hashing
    alembic/            # control-plane migrations
    dashboards/         # optional Streamlit prototypes
    scripts/
      seed_prominence.py  # bootstrap ProminenceHealth tenant + admin
      global/tenant/      # SQL create scripts for control + tenant engines
    tenants/            # sample SQLite tenant databases
    tests/              # pytest suite with async tenant coverage
  frontend/
    src/
      components/       # portal navigation, command palette, overlays
      context/          # Auth, notifications, user prefs, guided tours
      pages/            # marketing site, portal, coding workspace, admin
      services/         # API clients with tenant-aware headers
      __tests__/        # Jest regressions for key surfaces
    scripts/            # build helpers for the CRA + CRACO toolchain
  docs/                 # supplementary architecture notes (optional)
```

## Architecture Overview

**Control plane (FastAPI + async SQLAlchemy)**
- Manages tenants, users, feature flags, billing plans, applications, and audit events.
- Issues JWTs with tenant scoping, enforces tenant context per request, and exposes provisioning helpers via `app/services/provisioning.py`.
- Uses `TenantMiddleware` and header/subdomain resolution to guarantee tenant awareness for every request.

**Tenant data plane**
- Each tenant owns an independent database or schema. Connections are created lazily and cached with an LRU eviction strategy (`app/db/tenant_manager.py`).
- Coding, analytics, member cost/risk, utilization, and admin endpoints run against tenant-isolated models in `app/models/tables.py`.
- Schema helpers in `backend/scripts/tenant` ensure DDL consistency when onboarding new tenants.

**Cross-cutting controls**
- `RateLimitMiddleware` uses Redis (or a pluggable store) for per-tenant token buckets; headers expose remaining quota.
- `RequestLoggingMiddleware` and `utils.audit_logger` capture structured logs, persist audit events to both file (`logs/audit.log`) and the control database, and surface actor/tenant metadata.
- HIPAA mode (`HIPAA_MODE=True`) enforces known-tenant restrictions and suppresses dummy logins by default.

## Backend Setup

1. **Create a virtual environment**
   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

2. **Configure environment** (shell exports or `.env` read by `pydantic-settings`):
   - `ENVIRONMENT` (`development` | `test` | `production`)
   - `SECRET_KEY` (required for production; generated automatically in dev/test)
   - `CONTROL_DATABASE_URL` (e.g. `sqlite+aiosqlite:///../backend/nexora_control.db` for local dev)
   - `DEFAULT_TENANT_DATABASE_URL` (e.g. `sqlite+aiosqlite:///../backend/tenants/demo.db`)
   - `REDIS_URL` (`redis://localhost:6379/0`) to activate distributed rate limiting
   - `ALLOW_DUMMY_LOGIN=true` enables the `admin@admin.com` seed login for demos
   - Optional: `TENANT_DATABASE_SCHEMA_TEMPLATE`, `ALLOWED_TENANT_HOSTS`, `AUDIT_LOG_PATH`, `USAGE_DAILY_LIMIT`, `RATE_LIMIT_MAX_PER_MINUTE`

   ```env
   ENVIRONMENT=development
   CONTROL_DATABASE_URL=sqlite+aiosqlite:///../backend/nexora_control.db
   DEFAULT_TENANT_DATABASE_URL=sqlite+aiosqlite:///../backend/tenants/demo.db
   ALLOW_DUMMY_LOGIN=true
   HIPAA_MODE=false
   ```

3. **Run migrations**
   ```powershell
   alembic upgrade head
   ```

4. **Seed a tenant + admin**
   ```powershell
   python scripts/seed_prominence.py
   ```
   The script ensures the control-plane schema, provisions the `prominencehealth` tenant, and creates an administrator at `admin@prominencehealth.com` with password `admin`.

5. **Start the API**
   ```powershell
   python -m uvicorn app.main:app --reload
   ```
   The API listens on `http://localhost:8000` with CORS configured for `http://localhost:3000` by default.

### Tenant Provisioning & Sample Data
- Use `app/services/provisioning.py::provision_tenant` to onboard additional tenants from application code (creates control records, hydrates tenant schemas, and merges feature flags).
- DDL helpers under `backend/scripts/global` and `backend/scripts/tenant` provide reference CREATE statements for managed deployments.
- `backend/scripts/generate_synthetic_data.py` can populate dev-friendly member, claim, and coding datasets inside a tenant database.

### Compliance & Observability Notes
- All application endpoints require both `Authorization: Bearer <JWT>` and `X-Tenant-Key` headers. Subdomain tenant inference is available when `ALLOWED_TENANT_HOSTS` is configured.
- Audit events persist to the control database and optionally to `logs/audit.log`. Ensure the path exists and is writable in your environment.
- When Redis is unavailable, rate limiting downgrades gracefully but enforcement is disabled; use it in production for HIPAA throttling guarantees.

## Frontend Setup

1. **Install dependencies & run CRA dev server**
   ```powershell
   cd ../frontend
   npm install
   npm start
   ```

2. **Configure API base**
   Create `frontend/.env.local` (CRA will auto-load) and override the default if necessary:
   ```env
   REACT_APP_API_BASE=http://localhost:8000
   ```

3. **Login flows**
   - With seeded data, authenticate using `admin@prominencehealth.com` / `admin`.
   - When `ALLOW_DUMMY_LOGIN=true`, the React portal exposes a shortcut login (`admin@admin.com` / `admin`) to accelerate UI smoke tests.

4. **Portal features**
   - The command palette (`Cmd+K` or `Ctrl+K`) surfaces quick actions and navigation shortcuts.
   - Guided tours, notifications, and session locking are delivered via context providers in `src/context`.
   - Job importers at `/jobs/import-data` support drag-and-drop CSV/TXT/XLSX uploads, surface previews, and synchronize with the Job Status Center.

## Testing
- **Backend**: `cd backend && pytest` - starts async httpx clients, spins control + tenant SQLite databases, and validates multi-tenant isolation, analytics, coding, and security behaviour.
- **Frontend**: `cd frontend && npm test` - runs Jest + React Testing Library suites for authentication guards, portal utilities, and coding UI scaffolding.

## Key API Surface
> All routes require an authenticated user and tenant context unless noted.

- `POST /api/login` - issues JWT + tenant-scoped application permissions.
- `GET /api/tenant/self` - returns tenant metadata, purchased apps, and user permissions.
- `GET /api/analytics/summary` - aggregated clinical + financial metrics.
- `GET /api/member/{member_id}/costs`, `/api/member/{member_id}/risk` - member deep dives.
- `GET /api/utilization/overutilization` - utilization outliers with threshold filters.
- `GET /api/coding/members`, `/api/coding/providers` - coding worklists with prioritization.
- `POST /api/coding/chases`, `/api/coding/notes`, `/api/coding/attachments` - workflow management endpoints.
- `GET /api/coding/assignments/overview`, `/api/coding/mao-records` - admin dashboards and MAO-004 insights.

Unauthorized or cross-tenant attempts return `401/403`. Rate limiting failures surface `429` with informative `X-RateLimit-*` headers.

## Streamlit Dashboards
Prototype dashboards under `backend/dashboards` can be launched with:
```powershell
streamlit run dashboards/utilization_dashboard.py
```
Forward the `Authorization` header and `X-Tenant-Key` when calling backend APIs from Streamlit to stay within compliance boundaries.

## Troubleshooting
- **Tenant resolution**: confirm `X-Tenant-Key` is present or configure `ALLOWED_TENANT_HOSTS` for subdomain mapping.
- **Database configuration**: ensure `DEFAULT_TENANT_DATABASE_URL` points to a writable SQLite/Postgres database; without it, seeding and tenant APIs fail.
- **Redis optionality**: set `REDIS_URL` to enable rate limiting; otherwise middleware runs in no-op mode.
- **Audit log path**: create the `logs/` directory or update `AUDIT_LOG_PATH` if the default is not writable.

## License
Apache License 2.0
