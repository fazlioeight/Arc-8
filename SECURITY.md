# Security Overview — Nexora Platform

This document summarises the application-level security controls implemented in
this repository, maps them to the HIPAA-aligned requirements they satisfy, and
lists what still requires **manual / infrastructure-level** configuration that
cannot live in application code.

The platform is a **multi-tenant healthcare analytics application** (FastAPI +
React SPA on Azure). Several controls below already existed and are, in places,
**stricter** than a generic checklist would require; this round of work filled
the genuine gaps without weakening anything. Where a requirement assumed a
different architecture (e.g. a patient-facing EHR with `provider_id` ownership,
or cookie-based sessions), it was *adapted* to this platform's real model
(tenant isolation + role + per-application permissions + bearer tokens) rather
than bolted on as a conflicting parallel system.

---

## 1. Secure HTTP headers

**Status: implemented (pre-existing, stricter than spec).**

`SecurityHeadersMiddleware` ([backend/app/middleware/security_headers.py](backend/app/middleware/security_headers.py)),
wired in [backend/app/main.py](backend/app/main.py), sets on every response:

| Header | Value |
| --- | --- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (production only) |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'; base-uri 'none'` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()` |

> The CSP is `'none'` (not `'self'`) and the Permissions-Policy is a superset of
> the requested directives. These were **kept** because the backend is JSON-only
> (the SPA ships from Azure Static Web Apps with its own CSP) — `'none'` is the
> correct, stronger choice and weakening it was explicitly avoided. HSTS is
> emitted only in production because TLS termination is guaranteed there.

---

## 2. Authentication & session security

**Status: implemented (hardened this round).**

- **15-minute access tokens.** `ACCESS_TOKEN_EXPIRES_MINUTES = 15`
  ([config.py](backend/app/core/config.py)); `create_access_token`
  ([security.py](backend/app/utils/security.py)) defaults to it.
- **Refresh-token rotation.** Opaque, single-use, hashed refresh tokens with a
  sliding idle window (`REFRESH_TOKEN_IDLE_MINUTES`) bounded by an absolute cap
  (`REFRESH_TOKEN_MAX_LIFETIME_MINUTES`). Each use rotates the token; **replay
  of a consumed token revokes the entire rotation chain** (stolen-token
  detection). See `issue_refresh_token` / `rotate_refresh_token`
  ([security.py](backend/app/utils/security.py)), the `/api/auth/refresh`
  endpoint ([main.py](backend/app/main.py)), the `refresh_tokens` table
  ([migration](backend/alembic/versions/20260613_000017_refresh_tokens.py)),
  and tests in [test_auth_refresh.py](backend/tests/test_auth_refresh.py).
- **Token revocation.** JWT `jti` blacklist on logout (Redis), plus refresh-token
  revocation on logout (`revoke_user_refresh_tokens`).
- **Brute-force protection.** Account/IP lockout after **5 failed attempts for
  15 minutes** ([auth_throttle.py](backend/app/utils/auth_throttle.py),
  `LOGIN_LOCKOUT_*` in config).
- **MFA.** TOTP enrollment/verification ([routes/auth.py](backend/app/routes/auth.py));
  admin accounts are forced to enroll (`REQUIRE_ADMIN_MFA`). A `require_mfa`
  dependency ([security.py](backend/app/utils/security.py)) gates PHI routes and
  is wired onto the member360 router; it is governed by `REQUIRE_PHI_MFA` (see
  follow-ups).

### Token storage — deliberate deviation
The spec calls for HttpOnly/Secure/SameSite cookies and "never localStorage".
This platform uses **bearer tokens** (`OAuth2PasswordBearer`) consumed by the
SPA and a staff-impersonation flow. Migrating to cookies is a large, breaking
change across frontend + backend + impersonation and was intentionally **not**
done now (decision recorded with the maintainer). Tokens were instead hardened
(short TTL + rotation + revocation). **Cookie migration is a tracked follow-up.**

---

## 3. Role-based access control (RBAC)

**Status: implemented (adapted to the real model).**

[backend/app/utils/rbac.py](backend/app/utils/rbac.py) provides:

- `Role` enum for the platform's actual roles (`user`, `analyst`, `admin`,
  `platform_admin`) and `ROLE_ALIASES` mapping the spec's clinical vocabulary
  (PATIENT/CLINICIAN/NURSE/BILLING) onto them, so callers can use spec language
  without forking the schema.
- `require_role(*roles)` — dependency; `platform_admin` is a superuser that
  satisfies any requirement.
- `require_ownership(resource_type)` and `authorize_access(...)` — see §5.
- **All failures return 403 with a single generic `"Access denied"`** — never
  404, never an existence hint.

Pre-existing complementary gates: `require_admin`, `require_platform_admin`,
`require_application(app_key, level)`. Tests: [test_rbac.py](backend/tests/test_rbac.py).

---

## 4. Input validation & parameterized queries

**Status: implemented.**

- **Validation layer.** All request bodies/queries are Pydantic models
  (`backend/app/schemas/*`). Failures return `422` with a generic body. Tests:
  [test_input_validation.py](backend/tests/test_input_validation.py).
- **Parameterized queries.** All data access goes through async SQLAlchemy ORM /
  Core constructs (bound parameters). An audit for raw string interpolation
  found only **internal, sanitized identifiers** (schema/table names) in
  `SET search_path` / DuckDB workbook setup — these interpolate `"`-escaped
  schema names ([tenant_manager.py](backend/app/db/tenant_manager.py)) and
  server-generated table names, never raw user input. No SQL is built from
  untrusted request data.

---

## 5. IDOR prevention

**Status: implemented.**

`authorize_access(session, user, tenant, resource_id, resource_type)`
([rbac.py](backend/app/utils/rbac.py)):

- Fetches the resource **scoped to the caller's tenant** (`AND tenant_id = …`) —
  a row in another tenant is indistinguishable from a non-existent one.
- Enforces per-resource ownership for non-privileged roles via a
  `ResourcePolicy` registry (owner column + value); admins/`platform_admin` may
  access any row **within their tenant**.
- Any failure (missing / wrong tenant / wrong owner) raises the same 403.

Tenant scoping is the platform's primary IDOR boundary and is enforced on every
query throughout the codebase; `authorize_access` makes object-level ownership
explicit and reusable. Tests: [test_rbac.py](backend/tests/test_rbac.py)
(`test_non_owner_is_forbidden_not_found`, `test_cross_tenant_access_is_forbidden`,
`test_missing_resource_is_forbidden_not_found`).

---

## 6. PHI audit logging

**Status: implemented.**

Two complementary trails:

1. **Business audit (queryable):** `record_audit_event`
   ([audit_logger.py](backend/app/utils/audit_logger.py)) → `tenant_audit_events`
   DB table, for in-app review.
2. **Immutable PHI access trail (system of record):** `phi_audit` /
   `record_phi_access` ([phi_audit.py](backend/app/utils/phi_audit.py)) writes
   one JSON line per PHI read/write/delete — on **success and failure** — to a
   dedicated **append-only** logger (`phi_audit`, `propagate=False`) backed by a
   separate file (`PHI_AUDIT_LOG_PATH`), **never an editable DB table**. Exact
   schema: `event, userId, patientId, recordType, action, ipAddress, userAgent,
   timestamp (ISO8601), success`.

Wired onto member360 PHI endpoints (`get_member`, `update_member`). Tests:
[test_phi_audit.py](backend/tests/test_phi_audit.py).

> **Infra requirement:** in production, `PHI_AUDIT_LOG_PATH` must point at a
> WORM / immutable-blob mount and be shipped to Azure Monitor / a SIEM. The
> append-only file alone is tamper-*evident* only with OS/storage-level
> immutability — see follow-ups.

---

## 7. Rate limiting

**Status: implemented.**

[backend/app/middleware/rate_limit.py](backend/app/middleware/rate_limit.py):

| Tier | Limit | Mechanism |
| --- | --- | --- |
| Global | 100 req/min **per IP** | `RateLimitMiddleware` (ASGI), wired in [main.py](backend/app/main.py) |
| Auth (login, refresh, password reset) | 5 req/min **per IP** | `auth_rate_limit` dependency |
| PHI | 30 req/min **per authenticated user** | `phi_rate_limit` dependency (on member360 router) |

All breaches return **429 with a `Retry-After` header**. Counters use Redis when
`REDIS_URL` is set (correct across replicas) and a per-process in-memory
fallback otherwise; the store **fails open** on error. Health probes are exempt.
Tests: [test_rate_limit.py](backend/tests/test_rate_limit.py).

---

## 8. Secrets management

**Status: implemented.**

- All secrets come from the environment / pydantic-settings
  ([config.py](backend/app/core/config.py)); a source audit found **no
  hardcoded secrets, keys, or connection strings** in application code (the only
  literal credential is the `admin@admin.com` dev login, hard-disabled in
  production via `ALLOW_DUMMY_LOGIN` validation).
- **Startup check** `assert_required_settings()` fails fast in production if
  required variables are missing, and warns on missing recommended ones (Redis,
  CORS). `SECRET_KEY` and `FIELD_ENCRYPTION_KEY` are additionally validated by
  field validators (length / rotation / Fernet validity).
- **[backend/.env.example](backend/.env.example)** lists every variable with
  placeholders.
- `.env` is gitignored (root + `frontend`) and **not tracked** (verified).

---

## 9. Dependency audit

**Status: implemented in CI.**

[.github/workflows/security-audit.yml](.github/workflows/security-audit.yml)
runs on every PR, on pushes to `main`, and weekly:

- **`pip-audit`** on `backend/requirements.txt` — **blocking** on HIGH/CRITICAL.
  Current result: **no known vulnerabilities**.
- **`npm audit`** on the frontend — reports all advisories; **blocks only on
  CRITICAL advisories outside the known CRA build toolchain**.

> **Frontend findings (documented, accepted with mitigation):** Create React App
> pins `react-scripts` as a *production* dependency, so its build-time toolchain
> (`shell-quote` [critical], `nth-check`/`svgo` [high], `webpack-dev-server`/
> `sockjs`/`ws` [moderate], `bfj`, etc.) surfaces as prod advisories that
> `--omit=dev` cannot remove and that cannot be fixed without ejecting/migrating
> CRA. **These are build-time only and do not ship to the browser bundle.**
> Remediation = migrate the frontend off CRA (e.g. to Vite); tracked as a
> follow-up. Until then CI surfaces the full report without permanently failing
> on the unavoidable CRA noise, while still failing on any *new* critical
> outside that toolchain.

---

## 10. Database security

**Status: implemented (least-priv script) + pre-existing pooling.**

- **Least-privilege app role.** [backend/scripts/create_app_db_user.sql](backend/scripts/create_app_db_user.sql)
  creates a login role with `SELECT, INSERT, UPDATE, DELETE` on tables +
  `USAGE, SELECT` on sequences, `NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOBYPASSRLS`, **no DDL**, and `ALTER DEFAULT PRIVILEGES` so future migration
  tables inherit the same minimal grants. Schema changes use a **separate**
  migration role whose connection string is not shipped to the running app.
- **Connection pooling.** Already configured in
  [session.py](backend/app/db/session.py): `pool_size=20, max_overflow=40,
  pool_recycle=3600, pool_pre_ping=True` for Postgres (SQLite dev/test paths
  skip sizing). Tune `pool_size`/`max_overflow` to the Container App replica
  count × Postgres `max_connections` budget.

---

## What still requires manual / infra-level configuration

These are out of scope for application code and must be handled by ops / legal:

1. **Cookie-based session migration** — move bearer tokens to HttpOnly/Secure/
   SameSite=Strict cookies across SPA + backend + staff impersonation (deferred,
   tracked).
2. **Enable `REQUIRE_PHI_MFA=true`** once every PHI user has completed MFA
   enrollment. It defaults `false` so existing non-enrolled users aren't locked
   out; the enforcement code path is already wired.
3. **Immutable audit storage** — back `PHI_AUDIT_LOG_PATH` with WORM /
   immutable-blob storage and forward to Azure Monitor / a SIEM with alerting.
4. **WAF** — front the Container App / Static Web App with Azure Front Door +
   WAF (OWASP rule set, bot protection, IP allow/deny).
5. **KMS / key management** — store `SECRET_KEY`, `FIELD_ENCRYPTION_KEY`, and DB
   credentials in Azure Key Vault; enable automated rotation. Configure TDE /
   CMK on Postgres and storage accounts.
6. **TLS everywhere** — enforce HTTPS-only + `?ssl=require` on all DB URLs;
   verify HSTS preload eligibility.
7. **Run the least-privilege DB script** (§10) against the control DB and every
   tenant DB/schema, and confirm the app's runtime connection string uses the
   restricted role, not an admin role.
8. **BAA agreements** — execute Business Associate Agreements with every
   subprocessor that can touch PHI (Azure/Microsoft, Anthropic, any email
   sender, SIEM vendor) before enabling those paths in production.
9. **Penetration testing & periodic risk assessment** — independent pen test +
   HIPAA §164.308(a)(1)(ii)(A) risk analysis before go-live and annually.
10. **Frontend CRA → Vite migration** to clear the build-toolchain advisories
    (§9).
11. **Email delivery for password reset** — currently stubbed; wire a
    BAA-eligible sender (Azure Communication Services / SendGrid + BAA) before
    relying on self-serve reset in production.
12. **Log/PHI retention enforcement** — `AUDIT_LOG_RETENTION_DAYS` documents the
    6-year HIPAA retention; enforce it with storage lifecycle policies.

---

## Test coverage for security controls

`backend/tests/`: `test_rbac.py` (RBAC + IDOR), `test_phi_audit.py` (audit
schema + emission), `test_input_validation.py` (validation rejection),
`test_rate_limit.py` (limiter + 429/Retry-After), `test_auth_refresh.py`
(refresh rotation + reuse revocation), plus the pre-existing
`test_auth_security.py` / `test_security.py` / `test_multi_tenancy.py` /
`test_field_encryption.py`. Full suite: **112 passing**.
