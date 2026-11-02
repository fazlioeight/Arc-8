#!/bin/bash
set -e

echo "Running database migrations / seeding..."
python scripts/seed_prominence.py
python scripts/seed_prominence_demo.py

echo "Starting Backend API on port 8000..."
exec gunicorn -w 2 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000 app.main:app
