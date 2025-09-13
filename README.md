# Nexora Platform

Nexora Platform is a healthcare analytics solution for payer groups, providing tools for risk management, cost optimization, and member insights. It comprises a FastAPI backend, a React frontend, and optional Streamlit dashboards.

## Features

- Risk analytics and member stratification
- Cost analysis backed by claims CSV data
- Simple JWT-based authentication for protected APIs
- Utilization flags via tunable thresholds

## Project Structure

```
nexora-platform/
- backend/
  - app/
    - __init__.py
    - main.py                 # FastAPI app, mounts routers and handles login
    - routes/
      - __init__.py
      - analytics.py          # /api/analytics/dashboard (JWT-protected)
      - member_cost.py        # /member/{member_id}/costs (CSV-backed)
      - member_risk.py        # /member/{member_id}/risk (JWT-protected, stub)
      - utilization.py        # /overutilization/ (public for Streamlit)
    - models/
      - analytics_models.py   # (placeholder)
    - utils/
      - __init__.py
      - audit_logger.py
      - security.py           # JWT create/verify helpers
  - dashboards/
    - utilization_dashboard.py
    - member_cost_dashboard.py (placeholder)
    - member_risk_dashboard.py (placeholder)
    - main_dashboard.py (placeholder)
  - claims_data.csv
  - requirements.txt
- frontend/
  - public/
  - src/
    - App.js, index.js, index.css
    - components/ (Navbar, DarkModeToggle, ProtectedRoute)
    - context/ (AuthContext)
    - pages/ (Home, About, Products, Insights, Contact, Signup, Login, etc.)
    - services/ (memberCostService, ...)
    - __tests__/ (Jest tests)
  - package.json, jest.config.js, babel.config.js
- LICENSE
```

## Prerequisites

- Python 3.9+
- Node.js 16+ and npm
- Local PostgreSQL (optional for login), default credentials used by the app:
  - DB: `nexora`, User: `admin`, Password: `admin`, Host: `localhost`

## Backend Setup

From repo root:

- Create and activate a virtual environment (Windows PowerShell):
  - `cd backend`
  - `python -m venv .venv`
  - `.\\.venv\\Scripts\\Activate.ps1`
  - If blocked: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

- Install dependencies:
  - `pip install -r requirements.txt`

- Run the API (dev):
  - `python -m uvicorn app.main:app --reload`

Notes
- CORS is configured for `http://localhost:3000` in `app/main.py`.
- Login issues a JWT and returns `{ token, email, tenant }`.
- Member cost endpoint now queries the database; use the seed script to load sample claims from `backend/claims_data.csv`.

### Database Setup

- Configure `DATABASE_URL` (Postgres recommended) in environment or `.env` at `backend/`.
  - Example: `DATABASE_URL=postgresql://admin:admin@localhost:5432/nexora`
  - If not set, the app uses a local SQLite file `backend/nexora.db` for development.
- Create tables via Alembic:
  - `cd backend`
  - `alembic upgrade head`
- Seed demo data (tenant `demo`, user `admin@admin.com` / `admin`, and claims from CSV):
  - `python scripts/seed_demo.py`

## Frontend Setup

From repo root:

- `cd frontend`
- `npm install`
- `npm start`

The app runs at `http://localhost:3000`.

## Tests (Frontend)

- Run tests: `cd frontend && npm test`
- Jest runs in `jsdom`. Tests avoid extra libs by using server-rendering and virtual mocks.

## API Endpoints

- `POST /api/login`
  - Body: `{ "email": string, "password": string }`
  - Returns: `{ "token": string, "email": string }`
- `GET /api/analytics/dashboard` (Bearer token required)
  - Header: `Authorization: Bearer <JWT>`
  - Returns example metrics
- `GET /api/analytics/summary` (Bearer token required)
  - Returns: `{ tenant, total_claims, total_cost }`
- `GET /member/{member_id}/costs`
  - Returns: `{ member_id, total_cost }` (from database; seed with `scripts/seed_demo.py`)
- `GET /member/{member_id}/risk` (Bearer token required)
  - Returns: `{ member_id, risk_score }` (stub)
- `GET /overutilization/?threshold=<int>`
  - Returns: flagged members above threshold (stub), now requires bearer token

## Streamlit Dashboards

- Utilization demo (with auth):
  - `streamlit run backend/dashboards/utilization_dashboard.py`
  - Provide a JWT token in the dashboard (obtain via `POST /api/login`).
  - Requires the FastAPI server running on `http://localhost:8000`.

## Tests (Backend)

- Install backend dev deps: `cd backend && pip install -r requirements.txt`
- Run: `pytest`
- Tests cover JWT roundtrip and analytics summary contract. For richer tests, set `DATABASE_URL` and run the seed script.

## Configuration

- Secrets: `backend/app/utils/security.py` uses a hardcoded `SECRET_KEY` for development. For production, load from environment variables.
- Database: `app/main.py` connects to Postgres per request for login. Replace with pooled connections and `.env` config for production.

## Troubleshooting

- uvicorn not found:
  - Use `python -m uvicorn app.main:app --reload` from `backend`, or activate the virtualenv first.
- CORS errors:
  - Update `allow_origins` in `backend/app/main.py` to match your frontend origin.
- CSV not found:
  - Ensure `backend/claims_data.csv` exists. A synthetic generator script is available at `backend/scripts/generate_synthetic_data.py`.

## License

Apache License 2.0
