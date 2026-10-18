"""add member-portal dashboard additive tenant tables (Feature 3)

Revision ID: 20260621_000020
Revises: 20260620_000019
Create Date: 2026-06-21

Net-new per-tenant (``TenantDataBase``) tables backing the member dashboard,
added WITHOUT altering existing m360_* tables so the tenant schema sync
(create_all / ensure_tenant_schema) deploys them idempotently everywhere:

  * m360_coverages           — coverage status, effective/term dates, tier
  * m360_member_dependents   — dependents listed under a subscriber
  * m360_claim_lines         — claim service lines + responsibility split + denial
  * m360_claim_details       — claim-level denial reason + EOB document link
  * m360_accumulator_scopes  — individual-vs-family accumulator split

Like the other m360 migrations, this also runs against the control/default DB;
separate tenant databases pick the tables up via TenantDataBase.metadata.create_all.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260621_000020"
down_revision = "20260620_000019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "m360_coverages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("m360_members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_name", sa.String(128), nullable=True),
        sa.Column("line_of_business", sa.String(64), nullable=True),
        sa.Column("coverage_status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("effective_date", sa.Date(), nullable=True),
        sa.Column("term_date", sa.Date(), nullable=True),
        sa.Column("coverage_tier", sa.String(32), nullable=True),
        sa.Column("relationship_to_subscriber", sa.String(32), nullable=False, server_default="subscriber"),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("as_of_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_m360_coverages_member_id", "m360_coverages", ["member_id"])
    op.create_index("ix_m360_coverages_coverage_status", "m360_coverages", ["coverage_status"])

    op.create_table(
        "m360_member_dependents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("subscriber_member_id", sa.Integer(), sa.ForeignKey("m360_members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("first_name", sa.String(80), nullable=True),
        sa.Column("last_name", sa.String(80), nullable=True),
        sa.Column("relationship_type", sa.String(32), nullable=True),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("member_key", sa.String(64), nullable=True),
        sa.Column("coverage_status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_m360_member_dependents_subscriber_member_id", "m360_member_dependents", ["subscriber_member_id"])

    op.create_table(
        "m360_claim_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("claim_id", sa.Integer(), sa.ForeignKey("m360_claims.id", ondelete="CASCADE"), nullable=False),
        sa.Column("line_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("service_date", sa.Date(), nullable=True),
        sa.Column("procedure_code", sa.String(32), nullable=True),
        sa.Column("procedure_description", sa.String(255), nullable=True),
        sa.Column("billed_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("allowed_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("paid_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("member_responsibility", sa.Numeric(12, 2), nullable=True),
        sa.Column("copay", sa.Numeric(12, 2), nullable=True),
        sa.Column("coinsurance", sa.Numeric(12, 2), nullable=True),
        sa.Column("deductible", sa.Numeric(12, 2), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="paid"),
        sa.Column("denial_reason", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_m360_claim_lines_claim_id", "m360_claim_lines", ["claim_id"])

    op.create_table(
        "m360_claim_details",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("claim_id", sa.Integer(), sa.ForeignKey("m360_claims.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("denial_reason", sa.Text(), nullable=True),
        sa.Column("eob_document_id", sa.Integer(), sa.ForeignKey("m360_documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("remittance_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_m360_claim_details_claim_id", "m360_claim_details", ["claim_id"], unique=True)

    op.create_table(
        "m360_accumulator_scopes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("m360_members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scope", sa.String(16), nullable=False, server_default="individual"),
        sa.Column("deductible", sa.Numeric(12, 2), nullable=True),
        sa.Column("deductible_met", sa.Numeric(12, 2), nullable=True),
        sa.Column("out_of_pocket_max", sa.Numeric(12, 2), nullable=True),
        sa.Column("out_of_pocket_met", sa.Numeric(12, 2), nullable=True),
        sa.Column("plan_year_start", sa.Date(), nullable=True),
        sa.Column("as_of_date", sa.Date(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("member_id", "scope", name="uq_m360_accumulator_scope"),
    )
    op.create_index("ix_m360_accumulator_scopes_member_id", "m360_accumulator_scopes", ["member_id"])


def downgrade() -> None:
    op.drop_index("ix_m360_accumulator_scopes_member_id", table_name="m360_accumulator_scopes")
    op.drop_table("m360_accumulator_scopes")
    op.drop_index("ix_m360_claim_details_claim_id", table_name="m360_claim_details")
    op.drop_table("m360_claim_details")
    op.drop_index("ix_m360_claim_lines_claim_id", table_name="m360_claim_lines")
    op.drop_table("m360_claim_lines")
    op.drop_index("ix_m360_member_dependents_subscriber_member_id", table_name="m360_member_dependents")
    op.drop_table("m360_member_dependents")
    op.drop_index("ix_m360_coverages_coverage_status", table_name="m360_coverages")
    op.drop_index("ix_m360_coverages_member_id", table_name="m360_coverages")
    op.drop_table("m360_coverages")
