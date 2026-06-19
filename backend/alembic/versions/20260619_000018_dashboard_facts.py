"""add dashboard fact tables

Revision ID: 20260619_000018
Revises: 20260613_000017
Create Date: 2026-06-19 00:00:18

"""
from alembic import op
import sqlalchemy as sa

revision = "20260619_000018"
down_revision = "20260613_000017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dashboard_raf_meta",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("model_year", sa.Integer(), nullable=False),
        sa.Column("lob", sa.String(32), nullable=False),
        sa.Column("provider_group", sa.String(64), nullable=False, server_default=sa.text("'All'")),
        sa.Column("target", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("cutoff_date", sa.Date(), nullable=False),
        sa.Column("breakdown", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.create_index("ix_dashboard_raf_meta_model_year", "dashboard_raf_meta", ["model_year"])
    op.create_index("ix_dashboard_raf_meta_lob", "dashboard_raf_meta", ["lob"])
    op.create_index("ix_dashboard_raf_meta_provider_group", "dashboard_raf_meta", ["provider_group"])

    op.create_table(
        "dashboard_raf_series",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("model_year", sa.Integer(), nullable=False),
        sa.Column("lob", sa.String(32), nullable=False),
        sa.Column("provider_group", sa.String(64), nullable=False, server_default=sa.text("'All'")),
        sa.Column("as_of_date", sa.Date(), nullable=False),
        sa.Column("realized", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("daily_add", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_forecast", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("realized_p50", sa.Float(), nullable=True),
        sa.Column("lo80", sa.Float(), nullable=True),
        sa.Column("hi80", sa.Float(), nullable=True),
    )
    op.create_index("ix_dashboard_raf_series_model_year", "dashboard_raf_series", ["model_year"])
    op.create_index("ix_dashboard_raf_series_lob", "dashboard_raf_series", ["lob"])
    op.create_index("ix_dashboard_raf_series_provider_group", "dashboard_raf_series", ["provider_group"])
    op.create_index("ix_dashboard_raf_series_as_of_date", "dashboard_raf_series", ["as_of_date"])
    op.create_index("ix_dashboard_raf_series_is_forecast", "dashboard_raf_series", ["is_forecast"])

    op.create_table(
        "dashboard_funnel_stage",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("stage_key", sa.String(48), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("median_days", sa.Float(), nullable=False, server_default=sa.text("0")),
    )
    op.create_index("ix_dashboard_funnel_stage_stage_key", "dashboard_funnel_stage", ["stage_key"])

    op.create_table(
        "dashboard_funnel_contributor",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("stage_key", sa.String(48), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.create_index("ix_dashboard_funnel_contributor_stage_key", "dashboard_funnel_contributor", ["stage_key"])

    op.create_table(
        "dashboard_deadline_bucket",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("stage", sa.String(48), nullable=False),
        sa.Column("range_label", sa.String(16), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("count", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.create_index("ix_dashboard_deadline_bucket_stage", "dashboard_deadline_bucket", ["stage"])

    op.create_table(
        "dashboard_provider_metric",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lob", sa.String(32), nullable=False),
        sa.Column("provider_group", sa.String(64), nullable=False, server_default=sa.text("'All'")),
        sa.Column("provider", sa.String(128), nullable=False),
        sa.Column("metric", sa.String(48), nullable=False),
        sa.Column("value", sa.Float(), nullable=True),
        sa.Column("sparkline", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.create_index("ix_dashboard_provider_metric_lob", "dashboard_provider_metric", ["lob"])
    op.create_index("ix_dashboard_provider_metric_provider_group", "dashboard_provider_metric", ["provider_group"])
    op.create_index("ix_dashboard_provider_metric_provider", "dashboard_provider_metric", ["provider"])
    op.create_index("ix_dashboard_provider_metric_metric", "dashboard_provider_metric", ["metric"])


def downgrade() -> None:
    for idx in (
        "ix_dashboard_provider_metric_metric",
        "ix_dashboard_provider_metric_provider",
        "ix_dashboard_provider_metric_provider_group",
        "ix_dashboard_provider_metric_lob",
    ):
        op.drop_index(idx, table_name="dashboard_provider_metric")
    op.drop_table("dashboard_provider_metric")

    op.drop_index("ix_dashboard_deadline_bucket_stage", table_name="dashboard_deadline_bucket")
    op.drop_table("dashboard_deadline_bucket")

    op.drop_index("ix_dashboard_funnel_contributor_stage_key", table_name="dashboard_funnel_contributor")
    op.drop_table("dashboard_funnel_contributor")

    op.drop_index("ix_dashboard_funnel_stage_stage_key", table_name="dashboard_funnel_stage")
    op.drop_table("dashboard_funnel_stage")

    for idx in (
        "ix_dashboard_raf_series_is_forecast",
        "ix_dashboard_raf_series_as_of_date",
        "ix_dashboard_raf_series_provider_group",
        "ix_dashboard_raf_series_lob",
        "ix_dashboard_raf_series_model_year",
    ):
        op.drop_index(idx, table_name="dashboard_raf_series")
    op.drop_table("dashboard_raf_series")

    for idx in (
        "ix_dashboard_raf_meta_provider_group",
        "ix_dashboard_raf_meta_lob",
        "ix_dashboard_raf_meta_model_year",
    ):
        op.drop_index(idx, table_name="dashboard_raf_meta")
    op.drop_table("dashboard_raf_meta")
