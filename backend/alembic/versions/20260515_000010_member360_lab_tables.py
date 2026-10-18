"""nexora lab member360 tables

Revision ID: 20260515_000010
Revises: 20260514_000009
Create Date: 2026-05-15

Creates the per-tenant tables backing the Nexora Lab Member360 module.
All tables are prefixed with ``m360_`` to isolate them from the existing
coding schema.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260515_000010"
down_revision = "20260514_000009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "m360_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("member_key", sa.String(64), nullable=False, unique=True),
        sa.Column("first_name", sa.String(80), nullable=True),
        sa.Column("last_name", sa.String(80), nullable=True),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("gender", sa.String(16), nullable=True),
        sa.Column("plan_name", sa.String(128), nullable=True),
        sa.Column("line_of_business", sa.String(64), nullable=True),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("address_line1", sa.String(160), nullable=True),
        sa.Column("address_city", sa.String(64), nullable=True),
        sa.Column("address_state", sa.String(2), nullable=True),
        sa.Column("address_zip", sa.String(10), nullable=True),
        sa.Column("preferred_language", sa.String(48), nullable=True),
        sa.Column("preferred_channel", sa.String(32), nullable=True),
        sa.Column("primary_care_provider", sa.String(128), nullable=True),
        sa.Column("risk_score_composite", sa.Numeric(6, 2), nullable=True),
        sa.Column("risk_tier", sa.String(16), nullable=True),
        sa.Column("clinical_risk_score", sa.Numeric(6, 2), nullable=True),
        sa.Column("utilization_risk_score", sa.Numeric(6, 2), nullable=True),
        sa.Column("cost_risk_score", sa.Numeric(6, 2), nullable=True),
        sa.Column("engagement_risk_score", sa.Numeric(6, 2), nullable=True),
        sa.Column("open_care_gaps", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("next_best_action", sa.String(255), nullable=True),
        sa.Column("last_interaction_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_m360_members_member_key", "m360_members", ["member_key"], unique=True)
    op.create_index("ix_m360_members_risk_tier", "m360_members", ["risk_tier"])

    op.create_table(
        "m360_care_journey_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(64), nullable=True),
        sa.Column("recommended_for_risk_tier", sa.String(16), nullable=True),
        sa.Column("default_stages", sa.JSON(), nullable=True),
        sa.Column("default_tasks", sa.JSON(), nullable=True),
        sa.Column("created_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "m360_risk_insights",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "member_id",
            sa.Integer(),
            sa.ForeignKey("m360_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("domain", sa.String(32), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("driver", sa.String(255), nullable=True),
        sa.Column("recommendation", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("last_updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_m360_risk_insights_member_id", "m360_risk_insights", ["member_id"])

    op.create_table(
        "m360_care_journeys",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "member_id",
            sa.Integer(),
            sa.ForeignKey("m360_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "template_id",
            sa.Integer(),
            sa.ForeignKey("m360_care_journey_templates.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default=sa.text("'active'")),
        sa.Column("created_by", sa.String(255), nullable=True),
        sa.Column("assigned_to", sa.String(255), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("target_completion_date", sa.Date(), nullable=True),
        sa.Column("source", sa.String(64), nullable=True),
        sa.Column("template_name", sa.String(160), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_m360_care_journeys_member_id", "m360_care_journeys", ["member_id"])
    op.create_index("ix_m360_care_journeys_status", "m360_care_journeys", ["status"])

    op.create_table(
        "m360_care_journey_stages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "journey_id",
            sa.Integer(),
            sa.ForeignKey("m360_care_journeys.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sequence", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_m360_care_journey_stages_journey_id", "m360_care_journey_stages", ["journey_id"])

    op.create_table(
        "m360_tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "member_id",
            sa.Integer(),
            sa.ForeignKey("m360_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "journey_id",
            sa.Integer(),
            sa.ForeignKey("m360_care_journeys.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("assigned_user", sa.String(255), nullable=True),
        sa.Column("assigned_queue", sa.String(64), nullable=True),
        sa.Column("priority", sa.String(16), nullable=False, server_default=sa.text("'medium'")),
        sa.Column("status", sa.String(16), nullable=False, server_default=sa.text("'open'")),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("sbar_situation", sa.Text(), nullable=True),
        sa.Column("sbar_background", sa.Text(), nullable=True),
        sa.Column("sbar_assessment", sa.Text(), nullable=True),
        sa.Column("sbar_recommendation", sa.Text(), nullable=True),
        sa.Column("recommended_next_action", sa.String(255), nullable=True),
        sa.Column("auto_generated_reason", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_m360_tasks_member_id", "m360_tasks", ["member_id"])
    op.create_index("ix_m360_tasks_journey_id", "m360_tasks", ["journey_id"])
    op.create_index("ix_m360_tasks_status", "m360_tasks", ["status"])
    op.create_index("ix_m360_tasks_priority", "m360_tasks", ["priority"])

    op.create_table(
        "m360_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "member_id",
            sa.Integer(),
            sa.ForeignKey("m360_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("author_email", sa.String(255), nullable=False),
        sa.Column("author_name", sa.String(255), nullable=True),
        sa.Column("channel", sa.String(32), nullable=False, server_default=sa.text("'internal'")),
        sa.Column("note_type", sa.String(64), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "related_task_id",
            sa.Integer(),
            sa.ForeignKey("m360_tasks.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "related_journey_id",
            sa.Integer(),
            sa.ForeignKey("m360_care_journeys.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_m360_notes_member_id", "m360_notes", ["member_id"])
    op.create_index("ix_m360_notes_created_at", "m360_notes", ["created_at"])

    op.create_table(
        "m360_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "member_id",
            sa.Integer(),
            sa.ForeignKey("m360_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("channel", sa.String(32), nullable=False, server_default=sa.text("'chat'")),
        sa.Column("direction", sa.String(16), nullable=False, server_default=sa.text("'outbound'")),
        sa.Column("sender", sa.String(255), nullable=True),
        sa.Column("recipient", sa.String(255), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default=sa.text("'sent'")),
        sa.Column("timestamp", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_m360_messages_member_id", "m360_messages", ["member_id"])
    op.create_index("ix_m360_messages_timestamp", "m360_messages", ["timestamp"])

    op.create_table(
        "m360_claims",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "member_id",
            sa.Integer(),
            sa.ForeignKey("m360_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("claim_number", sa.String(64), nullable=False),
        sa.Column("service_date", sa.Date(), nullable=True),
        sa.Column("provider", sa.String(160), nullable=True),
        sa.Column("category", sa.String(64), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'paid'")),
        sa.Column("billed_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("paid_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("member_responsibility", sa.Numeric(12, 2), nullable=True),
    )
    op.create_index("ix_m360_claims_member_id", "m360_claims", ["member_id"])
    op.create_index("ix_m360_claims_claim_number", "m360_claims", ["claim_number"])

    op.create_table(
        "m360_accumulators",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "member_id",
            sa.Integer(),
            sa.ForeignKey("m360_members.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("deductible", sa.Numeric(12, 2), nullable=True),
        sa.Column("deductible_met", sa.Numeric(12, 2), nullable=True),
        sa.Column("out_of_pocket_max", sa.Numeric(12, 2), nullable=True),
        sa.Column("out_of_pocket_met", sa.Numeric(12, 2), nullable=True),
        sa.Column("plan_year_start", sa.Date(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_m360_accumulators_member_id", "m360_accumulators", ["member_id"], unique=True)

    op.create_table(
        "m360_care_options",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "member_id",
            sa.Integer(),
            sa.ForeignKey("m360_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("service_type", sa.String(160), nullable=False),
        sa.Column("recommended_provider", sa.String(160), nullable=True),
        sa.Column("facility_name", sa.String(160), nullable=True),
        sa.Column("cost_estimate", sa.Numeric(12, 2), nullable=True),
        sa.Column("quality_score", sa.Float(), nullable=True),
        sa.Column("distance_miles", sa.Float(), nullable=True),
        sa.Column("network_status", sa.String(32), nullable=True),
        sa.Column("potential_savings", sa.Numeric(12, 2), nullable=True),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("member_facing_explanation", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'recommended'")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_m360_care_options_member_id", "m360_care_options", ["member_id"])
    op.create_index("ix_m360_care_options_status", "m360_care_options", ["status"])

    op.create_table(
        "m360_savings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "member_id",
            sa.Integer(),
            sa.ForeignKey("m360_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "care_option_id",
            sa.Integer(),
            sa.ForeignKey("m360_care_options.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("original_expected_cost", sa.Numeric(12, 2), nullable=True),
        sa.Column("steered_option_cost", sa.Numeric(12, 2), nullable=True),
        sa.Column("estimated_savings", sa.Numeric(12, 2), nullable=True),
        sa.Column("claim_received", sa.Boolean(), nullable=False, server_default=sa.sql.expression.false()),
        sa.Column("savings_validated", sa.Boolean(), nullable=False, server_default=sa.sql.expression.false()),
        sa.Column("validation_status", sa.String(32), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_m360_savings_member_id", "m360_savings", ["member_id"])

    op.create_table(
        "m360_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "member_id",
            sa.Integer(),
            sa.ForeignKey("m360_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("document_type", sa.String(64), nullable=True),
        sa.Column("uploaded_by", sa.String(255), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'active'")),
    )
    op.create_index("ix_m360_documents_member_id", "m360_documents", ["member_id"])


def downgrade() -> None:
    op.drop_index("ix_m360_documents_member_id", table_name="m360_documents")
    op.drop_table("m360_documents")

    op.drop_index("ix_m360_savings_member_id", table_name="m360_savings")
    op.drop_table("m360_savings")

    op.drop_index("ix_m360_care_options_status", table_name="m360_care_options")
    op.drop_index("ix_m360_care_options_member_id", table_name="m360_care_options")
    op.drop_table("m360_care_options")

    op.drop_index("ix_m360_accumulators_member_id", table_name="m360_accumulators")
    op.drop_table("m360_accumulators")

    op.drop_index("ix_m360_claims_claim_number", table_name="m360_claims")
    op.drop_index("ix_m360_claims_member_id", table_name="m360_claims")
    op.drop_table("m360_claims")

    op.drop_index("ix_m360_messages_timestamp", table_name="m360_messages")
    op.drop_index("ix_m360_messages_member_id", table_name="m360_messages")
    op.drop_table("m360_messages")

    op.drop_index("ix_m360_notes_created_at", table_name="m360_notes")
    op.drop_index("ix_m360_notes_member_id", table_name="m360_notes")
    op.drop_table("m360_notes")

    op.drop_index("ix_m360_tasks_priority", table_name="m360_tasks")
    op.drop_index("ix_m360_tasks_status", table_name="m360_tasks")
    op.drop_index("ix_m360_tasks_journey_id", table_name="m360_tasks")
    op.drop_index("ix_m360_tasks_member_id", table_name="m360_tasks")
    op.drop_table("m360_tasks")

    op.drop_index("ix_m360_care_journey_stages_journey_id", table_name="m360_care_journey_stages")
    op.drop_table("m360_care_journey_stages")

    op.drop_index("ix_m360_care_journeys_status", table_name="m360_care_journeys")
    op.drop_index("ix_m360_care_journeys_member_id", table_name="m360_care_journeys")
    op.drop_table("m360_care_journeys")

    op.drop_index("ix_m360_risk_insights_member_id", table_name="m360_risk_insights")
    op.drop_table("m360_risk_insights")

    op.drop_table("m360_care_journey_templates")

    op.drop_index("ix_m360_members_risk_tier", table_name="m360_members")
    op.drop_index("ix_m360_members_member_key", table_name="m360_members")
    op.drop_table("m360_members")
