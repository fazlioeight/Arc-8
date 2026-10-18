"""add unified data import job tracking tables

Revision ID: 20260517_000011
Revises: 20260516_000010
Create Date: 2026-05-17

Adds the unified import job log used by the Job Status Center and Import Data
pages. Covers file uploads, FHIR pulls, and any other source feeding into the
platform. Existing fhir_import_jobs continues to exist; this table is the
canonical feed for the operator-facing UI.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260517_000011"
# Merge the two open heads (member360 lab + auth hardening) here so the
# migration graph has a single head again.
down_revision = ("20260515_000010", "20260516_000010")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "data_import_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("source_type", sa.String(32), nullable=False, server_default="upload"),
        sa.Column("entity", sa.String(64), nullable=True),
        sa.Column("file_name", sa.String(512), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("file_path", sa.String(1024), nullable=True),
        sa.Column("mime_type", sa.String(128), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="queued"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("records_processed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("records_failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("initiated_by", sa.String(255), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_data_import_jobs_tenant_id", "data_import_jobs", ["tenant_id"])
    op.create_index("ix_data_import_jobs_status", "data_import_jobs", ["status"])
    op.create_index("ix_data_import_jobs_source_type", "data_import_jobs", ["source_type"])
    op.create_index("ix_data_import_jobs_entity", "data_import_jobs", ["entity"])

    op.create_table(
        "data_import_job_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("job_id", sa.String(36), sa.ForeignKey("data_import_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("level", sa.String(16), nullable=False, server_default="info"),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_data_import_job_logs_job_id", "data_import_job_logs", ["job_id"])
    op.create_index("ix_data_import_job_logs_created_at", "data_import_job_logs", ["created_at"])

    # State-transition helper. Called from the route layer to advance jobs
    # through the queued → running → completed/failed lifecycle without races.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION fn_data_import_job_transition(
            p_job_id TEXT,
            p_new_status TEXT,
            p_progress INT DEFAULT NULL,
            p_records_processed INT DEFAULT NULL,
            p_records_failed INT DEFAULT NULL,
            p_error TEXT DEFAULT NULL
        ) RETURNS data_import_jobs AS $$
        DECLARE
            v_row data_import_jobs%ROWTYPE;
        BEGIN
            UPDATE data_import_jobs
            SET status = p_new_status,
                progress = COALESCE(p_progress, progress),
                records_processed = COALESCE(p_records_processed, records_processed),
                records_failed = COALESCE(p_records_failed, records_failed),
                error = CASE WHEN p_new_status = 'failed' THEN COALESCE(p_error, error) ELSE NULL END,
                completed_at = CASE WHEN p_new_status IN ('completed', 'failed') THEN now() ELSE completed_at END,
                updated_at = now()
            WHERE id = p_job_id
            RETURNING * INTO v_row;
            RETURN v_row;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    # Per-tenant status rollup used by the Job Status Center KPI strip.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION fn_data_import_jobs_summary(p_tenant_id INT)
        RETURNS TABLE(
            total BIGINT,
            queued BIGINT,
            running BIGINT,
            completed BIGINT,
            failed BIGINT,
            in_flight BIGINT
        ) AS $$
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'queued') AS queued,
                COUNT(*) FILTER (WHERE status = 'running') AS running,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                COUNT(*) FILTER (WHERE status = 'failed') AS failed,
                COUNT(*) FILTER (WHERE status IN ('queued', 'running')) AS in_flight
            FROM data_import_jobs
            WHERE tenant_id = p_tenant_id;
        $$ LANGUAGE sql STABLE;
        """
    )

    # Append a log line to a job — used by background processors.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION fn_data_import_job_log(
            p_job_id TEXT,
            p_level TEXT,
            p_message TEXT
        ) RETURNS data_import_job_logs AS $$
        DECLARE
            v_row data_import_job_logs%ROWTYPE;
        BEGIN
            INSERT INTO data_import_job_logs(job_id, level, message, created_at)
            VALUES (p_job_id, p_level, p_message, now())
            RETURNING * INTO v_row;
            UPDATE data_import_jobs SET updated_at = now() WHERE id = p_job_id;
            RETURN v_row;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    # Recent audit events for a tenant filtered by event-type prefix.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION fn_tenant_audit_recent(
            p_tenant_id INT,
            p_event_prefix TEXT DEFAULT NULL,
            p_limit INT DEFAULT 100
        )
        RETURNS TABLE(
            id INT,
            actor VARCHAR,
            event_type VARCHAR,
            payload JSON,
            created_at TIMESTAMP WITH TIME ZONE
        ) AS $$
            SELECT ev.id, ev.actor, ev.event_type, ev.payload, ev.created_at
            FROM tenant_audit_events ev
            WHERE ev.tenant_id = p_tenant_id
              AND (p_event_prefix IS NULL OR ev.event_type LIKE p_event_prefix || '%')
            ORDER BY ev.created_at DESC
            LIMIT p_limit;
        $$ LANGUAGE sql STABLE;
        """
    )

    # User rollup by role — used by admin dashboards.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION fn_users_summary(p_tenant_id INT)
        RETURNS TABLE(
            total_users BIGINT,
            active_users BIGINT,
            admins BIGINT,
            platform_admins BIGINT,
            recent_logins BIGINT
        ) AS $$
            SELECT
                COUNT(*),
                COUNT(*) FILTER (WHERE is_active = TRUE),
                COUNT(*) FILTER (WHERE role = 'admin'),
                COUNT(*) FILTER (WHERE role = 'platform_admin'),
                COUNT(*) FILTER (WHERE last_login_at > (now() - INTERVAL '30 days'))
            FROM users
            WHERE tenant_id = p_tenant_id;
        $$ LANGUAGE sql STABLE;
        """
    )


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS fn_users_summary(INT)")
    op.execute("DROP FUNCTION IF EXISTS fn_tenant_audit_recent(INT, TEXT, INT)")
    op.execute("DROP FUNCTION IF EXISTS fn_data_import_job_log(TEXT, TEXT, TEXT)")
    op.execute("DROP FUNCTION IF EXISTS fn_data_import_jobs_summary(INT)")
    op.execute("DROP FUNCTION IF EXISTS fn_data_import_job_transition(TEXT, TEXT, INT, INT, INT, TEXT)")
    op.drop_index("ix_data_import_job_logs_created_at", table_name="data_import_job_logs")
    op.drop_index("ix_data_import_job_logs_job_id", table_name="data_import_job_logs")
    op.drop_table("data_import_job_logs")
    op.drop_index("ix_data_import_jobs_entity", table_name="data_import_jobs")
    op.drop_index("ix_data_import_jobs_source_type", table_name="data_import_jobs")
    op.drop_index("ix_data_import_jobs_status", table_name="data_import_jobs")
    op.drop_index("ix_data_import_jobs_tenant_id", table_name="data_import_jobs")
    op.drop_table("data_import_jobs")
