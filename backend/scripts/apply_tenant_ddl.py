"""Apply scripts/tenant/create_tables.sql to the tenant database.

Run inside the platform Docker image (psycopg is bundled). Expects the
TENANT_DATABASE_URL_PSYCOPG env var to hold a psycopg-format DSN
(postgresql://user:pass@host:port/db?sslmode=require).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg

dsn = os.environ.get("TENANT_DATABASE_URL_PSYCOPG")
if not dsn:
    raise SystemExit("TENANT_DATABASE_URL_PSYCOPG is required (psycopg-format DSN)")

sql_path = Path(__file__).parent / "tenant" / "create_tables.sql"
if not sql_path.exists():
    raise SystemExit(f"DDL file not found: {sql_path}")

sql = sql_path.read_text(encoding="utf-8")

with psycopg.connect(dsn) as conn:
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()

print(f"Applied {sql_path.name} to tenant database.", flush=True)
