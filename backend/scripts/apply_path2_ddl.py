"""Idempotent Path 2 DDL: column adds + audit-immutability trigger + width fix.

The prod deploy uses ControlBase.metadata.create_all (see apply_control_ddl.py)
which handles NEW tables but cannot add columns to EXISTING ones. This script
applies the column-level changes from Path 2:

  - users.must_change_password
  - users.mfa_secret
  - users.mfa_enrolled_at
  - fhir_connectors.client_secret widened to VARCHAR(1024)
  - tenant_audit_events: BEFORE DELETE / BEFORE UPDATE triggers that reject
    modifications (HIPAA §164.312(c)(1) integrity controls)

Idempotent: re-running on a fully-migrated database is a no-op.

Expects CONTROL_DATABASE_URL in the env (psycopg DSN).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


COLUMN_ADDS = (
    ("users", "must_change_password", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("users", "mfa_secret", "VARCHAR(64)"),
    ("users", "mfa_enrolled_at", "TIMESTAMP WITH TIME ZONE"),
    # Chat artifact export theming. Stored as JSON on the tenant row;
    # consumed by services/chat/export.py::theme_from_branding. Defaults
    # to an empty object so existing tenants keep the Nexora look until
    # they configure their own palette + caption.
    ("tenants", "branding", "JSON NOT NULL DEFAULT '{}'"),
)

WIDEN_COLUMN = (
    "fhir_connectors",
    "client_secret",
    "VARCHAR(1024)",
)

PASSWORD_RESET_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    requested_ip VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_tenant_id ON password_reset_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);
"""

AUDIT_IMMUTABILITY_SQL = """
CREATE OR REPLACE FUNCTION reject_audit_modification() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Audit events are append-only and cannot be modified or deleted (HIPAA §164.312(c)(1))';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tenant_audit_events_no_delete ON tenant_audit_events;
CREATE TRIGGER tenant_audit_events_no_delete
    BEFORE DELETE ON tenant_audit_events
    FOR EACH ROW EXECUTE FUNCTION reject_audit_modification();

DROP TRIGGER IF EXISTS tenant_audit_events_no_update ON tenant_audit_events;
CREATE TRIGGER tenant_audit_events_no_update
    BEFORE UPDATE ON tenant_audit_events
    FOR EACH ROW EXECUTE FUNCTION reject_audit_modification();
"""


def _column_exists(cur, table: str, column: str) -> bool:
    cur.execute(
        """
        SELECT 1 FROM information_schema.columns
        WHERE table_name = %s AND column_name = %s
        """,
        (table, column),
    )
    return cur.fetchone() is not None


def main() -> None:
    dsn = os.environ.get("CONTROL_DATABASE_URL_PSYCOPG") or os.environ.get("CONTROL_DATABASE_URL")
    if not dsn:
        raise SystemExit("CONTROL_DATABASE_URL[_PSYCOPG] is required")

    import psycopg

    # Strip asyncpg suffix if present.
    sync_dsn = dsn.replace("+asyncpg", "").replace("+psycopg", "")

    with psycopg.connect(sync_dsn) as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            for table, column, ddl in COLUMN_ADDS:
                if not _column_exists(cur, table, column):
                    print(f"  + ALTER TABLE {table} ADD COLUMN {column} {ddl}")
                    cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
                else:
                    print(f"  = {table}.{column} already present")

            table, column, ddl = WIDEN_COLUMN
            print(f"  ~ widening {table}.{column} -> {ddl}")
            cur.execute(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE {ddl}")

            print("  + password_reset_tokens (if missing)")
            cur.execute(PASSWORD_RESET_TABLE_SQL)

            print("  + audit-immutability triggers on tenant_audit_events")
            cur.execute(AUDIT_IMMUTABILITY_SQL)

        conn.commit()
    print("Path 2 DDL applied.")


if __name__ == "__main__":
    main()
