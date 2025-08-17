# Nexora Platform

Nexora Platform is a healthcare analytics solution for payer groups, providing advanced tools for risk management, cost optimization, and member health insights. The platform includes a React frontend, FastAPI backend, and interactive dashboards.

## Features

- **Risk Analysis Dashboard:** Real-time risk scoring, predictive modeling, and member stratification.
- **Cost & Capitation Analyzer:** Cost breakdowns, capitation forecasting, and savings identification.
- **Member Health Insights:** Personalized analytics for member health trends and interventions.
- **Integration Suite:** API integrations with EHRs, claims data, and third-party systems.
- **Utilization Management:** Flag overutilization and manage visit thresholds.

## Project Structure

nexora-analytics-website/
├── backend/                # Python backend (API, auth, data analytics)
│   ├── app/                # Main app code
│   │   ├── __init__.py
│   │   ├── main.py         # Entry point (e.g., FastAPI app)
│   │   ├── routes/         # API endpoints (e.g., auth, dashboard data)
│   │   │   ├── __init__.py
│   │   │   ├── auth.py     # Login/signup endpoints
│   │   │   └── analytics.py # Endpoints for risk/cost data
│   │   └── models/         # Data models (e.g., Pydantic for validation)
│   ├── requirements.txt    # Python dependencies (e.g., fastapi, uvicorn, pydantic)
│   ├── .env                # Environment variables (e.g., API keys, DB URL)
│   └── run.sh              # Script to start the backend
├── frontend/               # React frontend
│   ├── public/             # Static assets (e.g., index.html, favicon)
│   ├── src/                # React source code
│   │   ├── components/     # Reusable UI components (e.g., Navbar, Hero)
│   │   │   ├── Navbar.js
│   │   │   ├── Hero.js     # Adapted from the hero section
│   │   │   └── Card.js     # For features, testimonials, etc.
│   │   ├── pages/          # Page components (e.g., Home, About, Products)
│   │   │   ├── Home.js     # Main index page
│   │   │   ├── About.js
│   │   │   ├── Products.js
│   │   │   ├── Blog.js     # Or Insights
│   │   │   ├── Contact.js
│   │   │   ├── Signup.js
│   │   │   └── Login.js
│   │   ├── App.js          # Main app with routing (using React Router)
│   │   ├── index.js        # Entry point
│   │   └── styles/         # CSS files (or use styled-components)
│   │       └── App.css
│   ├── package.json        # React dependencies (e.g., react, react-dom, bootstrap, react-router-dom)
│   ├── .env                # Frontend env vars (e.g., API base URL)
│   └── yarn.lock           # Or package-lock.json if using npm
├── docs/                   # Optional: Documentation, wireframes, or API specs
├── .gitignore              # Ignore node_modules, .env, etc.
├── README.md               # Project overview, setup instructions, tech stack
└── LICENSE                 # Your chosen license

## Getting Started

### Backend

1. **Install dependencies:**
   ```sh
   cd backend
   pip install -r requirements.txt

2. **Generate synthetic data:**
   ```sh
   python scripts/generate_synthetic_data.py

3. **Run FastAPI server:**
   ```sh
   uvicorn app.main:app --reload

### Frontend

1. **Install dependencies:**
   ```sh
   cd frontend
   npm install

2. **Start React app:**
   ```sh
   npm start

### Dashboards

1. **Run Streamlit dashboards:**
   ```py
   streamlit run backend/dashboards/member_cost_dashboard.py
   streamlit run backend/dashboards/member_risk_dashboard.py
   streamlit run backend/dashboards/utilization_dashboard.py

**API Endpoints**

  - GET /member/{member_id}/costs — Get total costs for a member.
  - POST /api/login — Authenticate user (returns JWT).

**Technologies**

  - Frontend: React, Bootstrap, React Router
  - Backend: FastAPI, Pandas, PyJWT
  - Dashboards: Streamlit
  - Data Generation: Faker, Pandas, NumPy

**License**
  - Apache License 2.0. See LICENSE.