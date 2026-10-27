# Arc8

Arc8 delivers a HIPAA-conscious, multi-tenant analytics and coding workspace for payer groups. The repository hosts the FastAPI control plane, per-tenant data plane helpers, Streamlit prototypes, and the React portal that surfaces analytics, coding workflows, and operational dashboards.

## Highlights
- Multi-tenant control plane with async SQLAlchemy connection pooling, per-request tenant context, audit trails, and JWT issuance.
- Coding workbench APIs and dashboards covering chases, assignments, provider education, MAO-004 ingestion, and deep dives for members/providers.
- React portal with session locking, guided tours, command palette, notifications, rich job-import workflows, and a ride-booking operations workspace with partner + payments management.
- Redis-backed tenant rate limiting, structured request logging, file + database audit logging, and configurable HIPAA enforcement.
- Deterministic analytics services that drive RAF deltas, suspects funnels, provider heatmaps, and CSV exports for dashboard surfaces.
- CLI seeding, SQL bootstrapping scripts, and optional Streamlit dashboards to explore tenant data outside the SPA.

## HERO / RAT 2.0 Requirements
The HERO (RAT 2.0) rebuild described in `C:\Users\asian\Downloads\HERO High Level Requirements 2.docx` defines the next wave of coder-platform capabilities that Arc8 must support.

### Goals
- Eliminate external vendor spend by consolidating programs into one internal tool.
- Resolve known billing and claims issues earlier in the workflow.
- Unite cross-functional teams (coding, outreach, HEDIS, providers, partners) on a shared workspace.
- Commercialize the tool so it may be offered to partners outside Prominence.

### Capability themes
- **External workspaces:** Dedicated public/home entry points that present role-specific views (providers, vendors, partners) and enforce tenant/partner scoping (for example, Pinnacle-only rosters).
- **Metrics & KPIs:** Real-time dashboards for every project with customizable visualizations and exports that refresh instantly after users act.
- **BUR intelligence:** Office, provider, and member-level BUR displays with filter + export options.
- **Member intelligence:** Robust, continuously refreshed search that spans member name, DOB, ID, contracts, regions, and other roster metadata.
- **NPI directory sync:** Native linkage to the NPI registry plus tooling to associate providers with offices.

### Project delivery surfaces
- **PHA scheduling & coder dashboard:** Outreach/HEDIS/external teams record appointments that automatically generate coding queues, capture outreach status, support reassignment by priority/location, and expose coder dashboards with HCC/HEDIS gaps, history, and quality context. Completed work must export as 837 files or via metrics dashboards.
- **PCF provider & coder views:** Live, editable PCF forms for providers (with quick upload/electronic submission) that flow directly into coder queues where reviewers grade selections without extra navigation while keeping HCC history and quality views aligned.
- **Retrospective coding:** Import chase files, assign/upload charts, track ingestion progress, complete coding + audits, and emit custom export files already in use.
- **Suspecting workflows:** Target offices, build queues from the chart repository, search medical records, surface new HCCs for provider presentation, and export supporting evidence.
- **HEDIS overlays:** Flag HEDIS-related work across projects, clone visits for HEDIS review, expose open gaps, allow accept/reject per gap, link gaps to records, sync results back to MRA/PCF data, and provide custom exports.

### Shared data and automation
- Automated file imports for MRA gap, eligibility, and HEDIS feeds.
- Claims tracking and submission lifecycle management.
- A centralized chart repository that ingests all historical and future medical records with advanced search.
- An education center where program-wide documents are uploaded once and shared with all users.
- Platform-wide export coverage so coding output, PCF submissions, and reporting data remain portable.

### Coder platform use cases
- **Persona-specific external workspaces (providers, vendors, partners):** A configurable landing page ensures every external user views only the empaneled members, projects, and documents relevant to their organization (for example, a Pinnacle-only roster).
- **Realtime KPI cockpit:** Project-level dashboards refresh immediately after activity, allow ad-hoc filters, and export the same data set for downstream analytics.
- **BUR explorer:** BUR metrics surface at the office, provider, and member level with sorting, filtering, and CSV export support so operations can triage quickly.
- **Member 360 search:** Fast search across name, DOB, member ID, contracts, regions, and other roster fields keeps coders and outreach aligned on the same source of truth.
- **NPI + office relationship graph:** Native NPI registry sync plus bidirectional linking between providers and offices eliminates duplicate lookups during coding or scheduling.
- **PHA scheduling pipeline:** Outreach/HEDIS/external teams schedule appointments inside RAT, track outreach state, reassign lists by UBUR/open gaps/location, and auto-create coding queues for the downstream teams.
- **PHA coder dashboard:** Coders review every scheduled appointment with visibility into open HCC/HEDIS gaps, historical coding, quality checkpoints, and can export completed work as 837 files or via reporting dashboards.
- **PCF provider submissions:** Providers edit live PCF forms, upload supporting evidence, and submit directly into the coder queue without leaving the tool.
- **PCF coder grading:** Coder-side view renders the uploaded PCF/record inline so reviewers can grade each selection, maintain HCC history, and keep quality status in lockstep.
- **Retrospective chase management:** RAT ingests chase files, assigns/upload charts, tracks processing progress, stores source documents, and outputs the custom export file already used in production.
- **Suspecting queue:** Operations target offices, assemble review queues from the chart repository, search across medical records, and send newly identified HCCs to providers for capture with exportable audit trails.
- **HEDIS overlay:** Any visit with HEDIS implications is cloned into a dedicated queue where reviewers see all open gaps, accept/reject at the gap level, link evidence, sync outcomes back to the MRA gap file/PCF, and export custom reports.
- **Automated file ingestion:** Scheduled jobs pull MRA gap, eligibility, and HEDIS files, reconcile deltas, and surface discrepancies to both analytics and coding work queues.
- **Claims tracking + submissions:** Coders and billers track claim lifecycle inside the platform to close the loop between coding, submission, and payment resolution.
- **Centralized chart repository:** Every historical and future medical record lands in a single searchable library that powers suspecting, retrospective coding, and quality reviews.
- **Education hub:** Program leaders drop training decks, policies, and reference guides into an accessible knowledge center so every persona shares the same guidance.

### Internal Programs Module (PHA, PCF, PCPE)
`C:\Users\asian\Downloads\HERO Internal Programs Module (PHA, PCF, PCPE).xlsx` defines the next iteration of the internal coder workspace (formerly "Coder Dashboard") and introduces three pillars: a reactive dashboard, richer filtering/search, and a modernized coding view.

**Dashboard composition**
- Rebrand the surface to "Internal Coding Programs," keep every program in a single board, and drive conditional visibility from the `Visit Type` (PHA initial/follow-up/commercial, PCF submission, PCPE wellness, misc chart review).
- Add an Archive tab for prior program years and per-row assignment bubbles that allow single or bulk assignment without drilling into charts.
- Top filter/search bar covers assigned user (auto-default to the logged-in coder), chart ID, DOS, completed/submitted/audit dates, project year, visit type, chart status, rendering group, and rendering provider. All dropdowns sort alphabetically, function independently (no tied columns), and persist across the project mix.
- Data grid shows `Chart ID (link)`, patient name, visit type, rendering group/provider, DOS, assigned user, chart status, header query preview, submitted/completed dates, auditor, audit date, and paging controls (25/50/100/150/200 rows per page).

**Filtering & metrics behavior**
- Default login view filters the board to the signed-in user's charts across all programs; saved searches include assigned-user slices, date windows, and rendering group/provider combos.
- Every table column supports multi-filtering; entering a chart ID should work via free-text paste.
- High-level KPIs should summarize each program: for PHA/PCPE show counts of Post Review Completed, Audit Completed, Audit Feedback, Query Pending, and Pending; for PCF show totals for payable/not payable plus audit/query/pending counts. Present these widgets near the top of the dashboard so leadership can read trends without exporting.

**Coding workspace expectations**
- Coding view must be responsive, minimize wasted space, and remove autosave; coders enter selections (chart metadata, CPT/CPT II, ICD-10, quality inputs) and explicitly click Save to commit.
- ICD-10 libraries switch automatically based on DOS (CMS model year runs Oct 1-Sep 30) and preload MRA history plus schedule-derived suspects. Code categories default from MRA logic (Section 1/2 -> Recapture, Section 3/coder suspect -> New); code source/category/status fields are required before saving.
- CPT picker surfaces frequently used bundles (e.g., `99397` AWV variants, `3075F/3078F/1126F/1160F`, etc.) with multiselect adds/removes, always ordering 99-series codes first.
- Quality pane shows only active HEDIS gaps for the member, lets coders enter values that auto-populate service + recommended CPTs, and defaults abstractor review to Pending (future abstractor dashboard).
- Chart metadata auto-populates when visits originate from the scheduler (rendering group/provider, DOS); PCF visits remain manual until provider submission surfaces ship.
- Documents section supports unlimited uploads (no size or naming limits) with columns for file name, created date, notes, uploader, and upload date.
- Chart history collapses via caret, sorts by appointment date (newest first), and records every status change, query note, and audit action in an immutable audit log.

**Workflow safeguards**
- Completed dates stamp when coders choose terminal statuses, while audit dates stamp only when auditors set `Audit Feedback` or `Audit Complete`; the fields never overwrite one another.
- Assignments default to "Unassigned" and reflect the assignee chosen on the dashboard; internal chart feedback is a free-text area (no character cap) for coder-to-coder communication and is never exposed externally.

## Monorepo Layout

```
Arc8-platform/
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
   - `REDIS_URL` (`redis://localhost:6379/0`) for shared Redis-backed state (audit throttle, etc.)
   - `ALLOW_DUMMY_LOGIN` toggles the `admin@admin.com` shortcut for demos
   - Optional: `TENANT_DATABASE_SCHEMA_TEMPLATE`, `ALLOWED_TENANT_HOSTS`, `AUDIT_LOG_PATH`, `USAGE_DAILY_LIMIT`, `S3_BUCKET_PREFIX`, `BACKGROUND_QUEUE_URL`, `PORTAL_APPLICATIONS`

   ```env
   ENVIRONMENT=development
   CONTROL_DATABASE_URL=postgresql+asyncpg://Arc8_control:Arc8_control@localhost:5432/Arc8_control
   DEFAULT_TENANT_DATABASE_URL=postgresql+asyncpg://Arc8_control:Arc8_control@localhost:5432/prominence_tenant
   ALLOW_DUMMY_LOGIN=true
   HIPAA_MODE=false
   ```

   For local development without Postgres, swap to SQLite paths:

   ```env
   CONTROL_DATABASE_URL=sqlite+aiosqlite:///../backend/Arc8_control.db
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
- `settings.PORTAL_APPLICATIONS` defines the modules exposed in the React shell (`portal`, `dashboard`, `coding`, `member360`, `ride_booking`, `job_center`, `docs`, `settings`, `admin_console`). Override it via a JSON `PORTAL_APPLICATIONS` env variable to relabel or hide surfaces.
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
   - Ride Booking at `/rideBooking` coordinates transportation requests, partner availability, payments, and internal knowledge content using the `rideBookingService` + `ridePartnerService` local stores and styles in `src/styles/rideBooking.css`.
   - Dashboard pages source deterministic data from `dashboardSeedData.js` and the new `/api/raf/*`, `/api/deadlines/*`, and `/api/providers/heatmap` endpoints for RAF tracking, suspects funnels, and provider performance heatmaps.

## Testing
- **Backend**: `cd backend && pytest` - spins control + tenant databases (SQLite by default via fixtures) and exercises multi-tenant isolation, analytics, coding dashboards, and security behaviours.
- **Frontend**: `cd frontend && npm test` - executes the CRACO-powered Jest + React Testing Library suites that cover login flows, coding worklists, dashboard transforms, and portal utilities.

## Key API Surface
> All routes require an authenticated user and tenant context unless noted.

**Authentication & tenancy**
- `POST /api/login` - issues JWT + tenant-scoped application permissions (supports dummy login in development).
- `GET /api/auth/azure/config` - returns runtime Entra ID login configuration for the React login page.
- `POST /api/auth/azure/exchange` - exchanges an Entra authorization-code callback for a Arc8 JWT after matching the Azure email to an active tenant user.
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

**Portal, ride booking, docs & settings**
- `GET /api/portal/overview` - tenant-aware application registry, profile summary, saved items, and open to-dos.
- `GET/POST /api/ride-booking/rides`, `GET/POST /api/ride-booking/partners`, `POST /api/ride-booking/partners/{partner_id}/schedules`, `PATCH /api/ride-booking/partners/{partner_id}/billing-profile` - persisted transportation scheduling and partner management.
- `GET /api/ride-booking/ride-options`, `GET /api/ride-booking/partners/available`, `GET /api/ride-booking/payments` - ride dropdown options, availability, and payment/reconciliation summaries.
- `GET/POST /api/docs/articles` - tenant-scoped docs search and admin article creation.
- `GET/PATCH /api/settings/preferences` - user-scoped workspace preferences and memories.

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
