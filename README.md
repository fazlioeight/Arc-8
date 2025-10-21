# Nexora Platform

Nexora Platform delivers a HIPAA-conscious, multi-tenant analytics and coding workspace for payer groups. The repository hosts the FastAPI control plane, per-tenant data plane helpers, Streamlit prototypes, and the React portal that surfaces analytics, coding workflows, and operational dashboards.

## Highlights
- Multi-tenant control plane with async SQLAlchemy connection pooling, per-request tenant context, audit trails, and JWT issuance.
- Coding workbench APIs and dashboards covering chases, assignments, provider education, MAO-004 ingestion, and deep dives for members/providers.
- React portal with session locking, guided tours, command palette, notifications, rich job-import workflows, and a ride-booking operations workspace with partner + payments management.
- Redis-backed tenant rate limiting, structured request logging, file + database audit logging, and configurable HIPAA enforcement.
- Deterministic analytics services that drive RAF deltas, suspects funnels, provider heatmaps, and CSV exports for dashboard surfaces.
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
      routes/           # FastAPI routers (analytics, coding, dashboards, terminology, workbench, admin)
      schemas/          # Pydantic IO models for public APIs
      services/         # provisioning, analytics, Mao analysis, dashboards, coding overlays
      utils/            # auth helpers, audit logger, password hashing
    alembic/            # control-plane migrations
    dashboards/         # optional Streamlit prototypes
    scripts/
      seed_prominence.py  # bootstrap ProminenceHealth tenant + admin
      generate_synthetic_data.py  # populate demo datasets
      global/tenant/      # SQL create scripts for control + tenant engines
    tenants/            # sample SQLite tenant databases
    tests/              # pytest suite with async tenant coverage
  frontend/
    src/
      components/       # portal navigation, command palette, overlays
      context/          # Auth, notifications, user prefs, guided tours
      hooks/            # reusable API + event hooks
      pages/            # marketing site, portal, coding workspace, ride booking, admin
      services/         # API clients with tenant-aware headers
      styles/           # Tailwind extensions + feature stylesheets
      utils/            # sample data sets + formatting helpers
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

**Analytics, dashboards & terminology APIs**
- `app/services/dashboard_metrics.py` produces deterministic RAF delta timelines, suspects funnels, provider heatmaps, and CSV exports consumed by `/api/raf/*`, `/api/deadlines/*`, and `/api/providers/heatmap`.
- `routes/coding_dashboards.py` adds routes for worklist insights, provider education, group overviews, and management updates that back the new coding review dashboards in the React portal.
- `routes/terminology.py` exposes `/api/terminology/icd-map` for ICD suggestion lookups used by the workbench and coding flows.

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
   - `CONTROL_DATABASE_URL` (defaults to Postgres via `postgresql+asyncpg://`; override with `sqlite+aiosqlite:///...` for a zero-dependency quickstart)
   - `DEFAULT_TENANT_DATABASE_URL` or `TENANT_DATABASE_URL_TEMPLATE` (template accepts `{tenant_key}` for per-tenant databases)
   - `TENANT_CONNECTION_CACHE_SIZE` to tune the async engine LRU cache (default `32`)
   - `REDIS_URL` (`redis://localhost:6379/0`) to activate distributed rate limiting
   - `RATE_LIMIT_MAX_PER_MINUTE`, `RATE_LIMIT_BURST`, `RATE_LIMIT_WINDOW_SECONDS` to shape tenant throttling
   - `ALLOW_DUMMY_LOGIN` toggles the `admin@admin.com` shortcut for demos
   - Optional: `TENANT_DATABASE_SCHEMA_TEMPLATE`, `ALLOWED_TENANT_HOSTS`, `AUDIT_LOG_PATH`, `USAGE_DAILY_LIMIT`, `S3_BUCKET_PREFIX`, `BACKGROUND_QUEUE_URL`, `PORTAL_APPLICATIONS`

   ```env
   ENVIRONMENT=development
   CONTROL_DATABASE_URL=postgresql+asyncpg://nexora_control:nexora_control@localhost:5432/nexora_control
   DEFAULT_TENANT_DATABASE_URL=postgresql+asyncpg://nexora_control:nexora_control@localhost:5432/prominence_tenant
   ALLOW_DUMMY_LOGIN=true
   HIPAA_MODE=false
   ```

   For local development without Postgres, swap to SQLite paths:

   ```env
   CONTROL_DATABASE_URL=sqlite+aiosqlite:///../backend/nexora_control.db
   DEFAULT_TENANT_DATABASE_URL=sqlite+aiosqlite:///../backend/tenants/demo.db
   TENANT_DATABASE_URL_TEMPLATE=sqlite+aiosqlite:///../backend/tenants/{tenant_key}.db
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
   Run this from `backend/` so Python resolves `app.main` correctly. The API listens on `http://localhost:8000` with CORS configured for `http://localhost:3000` by default.

### Tenant Provisioning & Sample Data
- Use `app/services/provisioning.py::provision_tenant` to onboard additional tenants from application code (creates control records, hydrates tenant schemas, and merges feature flags).
- DDL helpers under `backend/scripts/global` and `backend/scripts/tenant` provide reference CREATE statements for managed deployments.
- `backend/scripts/generate_synthetic_data.py` can populate dev-friendly member, claim, and coding datasets inside a tenant database.

### Portal Applications & Feature Flags
- `settings.PORTAL_APPLICATIONS` defines the modules exposed in the React shell (`portal`, `dashboard`, `coding`, `ride_booking`, `docs`, `settings`, `admin_console`). Override it via a JSON `PORTAL_APPLICATIONS` env variable to relabel or hide surfaces.
- Tenant purchase state (`tenant.purchased_applications`) is added during migrations, hydrated by seed scripts, and returned by `/api/tenant/self`; the frontend gates navigation based on these flags.
- The new `ride_booking` application unlocks transportation scheduling, partner availability, payment reconciliation, and knowledge articles in the portal.

### Compliance & Observability Notes
- All application endpoints require both `Authorization: Bearer <JWT>` and `X-Tenant-Key` headers. Subdomain tenant inference is available when `ALLOWED_TENANT_HOSTS` is configured.
- Audit events persist to the control database and optionally to `logs/audit.log`. Ensure the path exists and is writable in your environment.
- When Redis is unavailable, rate limiting downgrades gracefully but enforcement is disabled; use it in production for HIPAA throttling guarantees.
- `HIPAA_MODE` now defaults to `True`; toggle it off during local development if you want to allow unknown-tenant or dummy-login flows.

## Frontend Setup

1. **Install dependencies & run CRA dev server**
   ```powershell
   cd ../frontend
   npm install
   npm start
   ```
   The portal uses CRACO to layer Tailwind and custom aliases on top of Create React App; `npm run build` and `npm test` map to the same CRACO pipeline.

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
   - Ride Booking at `/RideBooking` coordinates transportation requests, partner availability, payments, and internal knowledge content using the `rideBookingService` + `ridePartnerService` local stores and styles in `src/styles/rideBooking.css`.
   - Dashboard pages source deterministic data from `dashboardSeedData.js` and the new `/api/raf/*`, `/api/deadlines/*`, and `/api/providers/heatmap` endpoints for RAF tracking, suspects funnels, and provider performance heatmaps.

## Testing
- **Backend**: `cd backend && pytest` - spins control + tenant databases (SQLite by default via fixtures) and exercises multi-tenant isolation, analytics, coding dashboards, and security behaviours.
- **Frontend**: `cd frontend && npm test` - executes the CRACO-powered Jest + React Testing Library suites that cover login flows, coding worklists, dashboard transforms, and portal utilities.

## Key API Surface
> All routes require an authenticated user and tenant context unless noted.

**Authentication & tenancy**
- `POST /api/login` - issues JWT + tenant-scoped application permissions (supports dummy login in development).
- `GET /api/tenant/self` - returns tenant metadata, purchased applications, feature flags, and the authenticated user's permissions.

**Analytics & operational dashboards**
- `GET /api/analytics/summary` - aggregated clinical + financial metrics for tenant dashboards.
- `GET /api/raf/delta` and `GET /api/deadlines/radar` - RAF progress tracking and deadline radar buckets, with CSV export at `GET /api/deadlines/radar/export`.
- `GET /api/suspects/funnel` - suspects pipeline with contributor breakdowns and stage timing.
- `GET /api/providers/heatmap` - provider performance heatmap + sparkline trends across metrics.
- `GET /api/utilization/overutilization` - utilization outliers with threshold filters.

**Coding workbench & dashboards**
- `GET /api/coding/members`, `GET /api/coding/providers` - worklists with prioritization, filtering, and assignment scope.
- `GET /api/coding/worklist`, `GET /api/coding/review/dashboard`, `GET /api/coding/groups/overview`, `GET /api/coding/providers/education`, `GET /api/coding/providers/management` - dashboards powering review throughput, education interventions, group summaries, and partner oversight.
- `PATCH /api/coding/providers/{provider_id}` - updates provider contact metadata surfaced in the dashboards.
- `POST /api/coding/chases`, `POST /api/coding/notes`, `POST /api/coding/attachments` - workflow management endpoints for the coding workbench.
- `GET /api/coding/assignments/overview`, `GET /api/coding/mao-records` - admin dashboards and MAO-004 insights.
- `GET /api/workbench/suspects`, `POST /api/workbench/finalize` - fetch and finalize coding workbench payloads with suspect evidence.

**Member analytics & risk**
- `GET /api/member/{member_id}/costs`, `GET /api/member/{member_id}/risk` - member deep dives and risk scoring detail.

**Terminology & reference**
- `GET /api/terminology/icd-map` - ICD code normalization, alternative suggestions, and note prompts for workbench suggestions.

Unauthorized or cross-tenant attempts return `401/403`. Rate limiting failures surface `429` with informative `X-RateLimit-*` headers.

## Streamlit Dashboards
Prototype dashboards under `backend/dashboards` can be launched with:
```powershell
streamlit run dashboards/utilization_dashboard.py
```
Forward the `Authorization` header and `X-Tenant-Key` when calling backend APIs from Streamlit to stay within compliance boundaries.

## Troubleshooting
- **Tenant resolution**: confirm `X-Tenant-Key` is present or configure `ALLOWED_TENANT_HOSTS` for subdomain mapping.
- **Database configuration**: verify both `CONTROL_DATABASE_URL` and `DEFAULT_TENANT_DATABASE_URL`/`TENANT_DATABASE_URL_TEMPLATE` point to writable targets (Postgres via `asyncpg` by default, or SQLite paths when overridden); missing or read-only DSNs prevent seeding and tenant APIs from booting.
- **Redis optionality**: set `REDIS_URL` to enable rate limiting; otherwise middleware runs in no-op mode.
- **Audit log path**: create the `logs/` directory or update `AUDIT_LOG_PATH` if the default is not writable.

## License
Apache License 2.0
