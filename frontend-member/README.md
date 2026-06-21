# Nexora Member Portal (member-facing SPA)

A standalone React SPA for health-plan **members** (patients), separate from the
staff portal in `../frontend`. It talks to the same FastAPI backend but only the
member-realm endpoints (`/api/member/*`) and keeps its own auth/session realm.

## Stack
- React 18 + React Router v6, CRA via CRACO, Tailwind CSS (same toolchain as the staff app).
- Axios client with `X-Tenant-Key` + member Bearer token and single-flight refresh.
- No-dependency i18n (English + Spanish) — all copy lives in `src/i18n/locales`.
- White-label theming via `REACT_APP_BRAND_*` env (CSS variables; neutral default).

## Features
- **Registration & identity proofing**, email verification, resend.
- **Login** (with MFA challenge), logout, forgot/reset password, session refresh.
- **Dashboard**: coverage & eligibility, claims (list + detail with line-items,
  denial reason, and EOB download), accumulators (individual vs family).
- **Documents**: list + secure download via short-lived signed grant.
- **Find care**: in-network provider/PCP search with a synced list + Google map.
- **Account**: change password, enable/disable two-step verification (TOTP).

## Setup
```bash
cd frontend-member
npm install
cp .env.example .env.local   # set REACT_APP_API_BASE and REACT_APP_TENANT_KEY
npm start                     # http://localhost:3000 (CRACO dev server)
npm run build                 # production build
```

## Configuration (`.env.local`)
- `REACT_APP_API_BASE` — backend base URL (e.g. `http://localhost:8000`).
- `REACT_APP_TENANT_KEY` — tenant for this deployment; if unset it is inferred
  from the host subdomain (the portal is deployed one subdomain per tenant).
- `REACT_APP_BRAND_NAME` / `REACT_APP_BRAND_PRIMARY` / `REACT_APP_BRAND_LOGO_URL`
  — optional white-label overrides.

The Google **Maps browser key** is served by the backend
(`GET /api/member/providers/map-config`) and must be HTTP-referrer restricted in
the Google console. The server-side **Geocoding key** never reaches the browser.

## Privacy & security notes
- Member identity is never sent to Google — provider search only transmits the
  specialty/name/ZIP the member typed; geocoding happens server-side.
- Documents are downloaded via a ~2-minute signed capability URL; no object keys
  are exposed. Tokens live in `localStorage` scoped per tenant; sessions refresh
  on 401 and clear on refresh failure.

## Accessibility & responsiveness
WCAG 2.1 AA-minded: semantic landmarks, labeled form fields, a skip link,
keyboard-focusable controls with visible focus rings, ARIA on live/status
regions, and a responsive layout (mobile nav collapse, fluid grids).
