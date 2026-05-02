"""add ride booking tables

Revision ID: 20251020_000007
Revises: 20251019_000006
Create Date: 2025-10-20 00:00:07

"""
from alembic import op
import sqlalchemy as sa

revision = "20251020_000007"
down_revision = "20251019_000006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ride_partners",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_name", sa.String(255), nullable=False),
        sa.Column("contact_name", sa.String(255), nullable=True),
        sa.Column("contact_email", sa.String(255), nullable=True),
        sa.Column("contact_phone", sa.String(32), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'active'")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_ride_partners_company_name", "ride_partners", ["company_name"])

    op.create_table(
        "ride_partner_schedules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("partner_id", sa.Integer(), sa.ForeignKey("ride_partners.id", ondelete="CASCADE"), nullable=False),
        sa.Column("frequency", sa.String(32), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("open_slots", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("days_of_week", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("days_of_month", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_ride_partner_schedules_partner_id", "ride_partner_schedules", ["partner_id"])

    op.create_table(
        "ride_partner_billing_profiles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "partner_id",
            sa.Integer(),
            sa.ForeignKey("ride_partners.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("pay_to_name", sa.String(255), nullable=True),
        sa.Column("payment_email", sa.String(255), nullable=True),
        sa.Column("payment_method", sa.String(64), nullable=False, server_default=sa.text("'ach'")),
        sa.Column("remit_address", sa.Text(), nullable=True),
        sa.Column("tax_id", sa.String(32), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_ride_partner_billing_profiles_partner_id", "ride_partner_billing_profiles", ["partner_id"]
    )

    op.create_table(
        "ride_bookings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "partner_id",
            sa.Integer(),
            sa.ForeignKey("ride_partners.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("member_id", sa.String(64), nullable=False),
        sa.Column("first_name", sa.String(128), nullable=False),
        sa.Column("last_name", sa.String(128), nullable=False),
        sa.Column("ride_type", sa.String(128), nullable=False),
        sa.Column("pickup", sa.String(255), nullable=False),
        sa.Column("pickup_address", sa.String(512), nullable=False),
        sa.Column("dropoff", sa.String(255), nullable=False),
        sa.Column("dropoff_address", sa.String(512), nullable=False),
        sa.Column("scheduled_pickup", sa.DateTime(), nullable=False),
        sa.Column("estimated_dropoff", sa.DateTime(), nullable=True),
        sa.Column("cost_usd", sa.Float(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'queued'")),
        sa.Column("created_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_ride_bookings_member_id", "ride_bookings", ["member_id"])
    op.create_index("ix_ride_bookings_scheduled_pickup", "ride_bookings", ["scheduled_pickup"])
    op.create_index("ix_ride_bookings_status", "ride_bookings", ["status"])

    op.create_table(
        "ride_payment_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "ride_id",
            sa.String(36),
            sa.ForeignKey("ride_bookings.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("payer_type", sa.String(32), nullable=False),
        sa.Column("counterparty_name", sa.String(255), nullable=False),
        sa.Column("invoice_number", sa.String(64), nullable=False),
        sa.Column("amount_usd", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'open'")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_ride_payment_records_ride_id", "ride_payment_records", ["ride_id"])
    op.create_index("ix_ride_payment_records_invoice_number", "ride_payment_records", ["invoice_number"])
    op.create_index("ix_ride_payment_records_status", "ride_payment_records", ["status"])

    op.create_table(
        "ride_reconciliation_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'open'")),
        sa.Column("priority", sa.String(32), nullable=False, server_default=sa.text("'medium'")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_ride_reconciliation_items_status", "ride_reconciliation_items", ["status"])

    op.create_table(
        "ride_payment_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("source", sa.String(64), nullable=False),
        sa.Column("event_type", sa.String(128), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("event_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_ride_payment_events_source", "ride_payment_events", ["source"])
    op.create_index("ix_ride_payment_events_event_at", "ride_payment_events", ["event_at"])


def downgrade() -> None:
    op.drop_index("ix_ride_payment_events_event_at", table_name="ride_payment_events")
    op.drop_index("ix_ride_payment_events_source", table_name="ride_payment_events")
    op.drop_table("ride_payment_events")

    op.drop_index("ix_ride_reconciliation_items_status", table_name="ride_reconciliation_items")
    op.drop_table("ride_reconciliation_items")

    op.drop_index("ix_ride_payment_records_status", table_name="ride_payment_records")
    op.drop_index("ix_ride_payment_records_invoice_number", table_name="ride_payment_records")
    op.drop_index("ix_ride_payment_records_ride_id", table_name="ride_payment_records")
    op.drop_table("ride_payment_records")

    op.drop_index("ix_ride_bookings_status", table_name="ride_bookings")
    op.drop_index("ix_ride_bookings_scheduled_pickup", table_name="ride_bookings")
    op.drop_index("ix_ride_bookings_member_id", table_name="ride_bookings")
    op.drop_table("ride_bookings")

    op.drop_index("ix_ride_partner_billing_profiles_partner_id", table_name="ride_partner_billing_profiles")
    op.drop_table("ride_partner_billing_profiles")

    op.drop_index("ix_ride_partner_schedules_partner_id", table_name="ride_partner_schedules")
    op.drop_table("ride_partner_schedules")

    op.drop_index("ix_ride_partners_company_name", table_name="ride_partners")
    op.drop_table("ride_partners")
