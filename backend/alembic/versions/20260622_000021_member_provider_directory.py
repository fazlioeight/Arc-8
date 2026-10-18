"""add member-portal provider directory + geocode cache (Feature 6)

Revision ID: 20260622_000021
Revises: 20260621_000020
Create Date: 2026-06-22

New per-tenant tables backing member-facing provider/PCP search (m360 has no
provider tables). All new tables (no ALTERs) so create_all / ensure_tenant_schema
deploys them everywhere. Geocodes are cached on the location row and in
m360_geocode_cache so addresses are sent to Google at most once.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260622_000021"
down_revision = "20260621_000020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "m360_providers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("npi", sa.String(15), nullable=True, unique=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("specialty", sa.String(120), nullable=True),
        sa.Column("is_pcp", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("accepting_new_patients", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("gender", sa.String(16), nullable=True),
        sa.Column("languages", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_m360_providers_npi", "m360_providers", ["npi"], unique=True)
    op.create_index("ix_m360_providers_name", "m360_providers", ["name"])
    op.create_index("ix_m360_providers_specialty", "m360_providers", ["specialty"])
    op.create_index("ix_m360_providers_is_pcp", "m360_providers", ["is_pcp"])
    op.create_index("ix_m360_providers_status", "m360_providers", ["status"])

    op.create_table(
        "m360_provider_locations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider_id", sa.Integer(), sa.ForeignKey("m360_providers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("address_line1", sa.String(160), nullable=True),
        sa.Column("address_line2", sa.String(160), nullable=True),
        sa.Column("city", sa.String(64), nullable=True),
        sa.Column("state", sa.String(2), nullable=True),
        sa.Column("postal_code", sa.String(10), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("geocode_status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("geocoded_at", sa.DateTime(), nullable=True),
        sa.Column("phone", sa.String(32), nullable=True),
    )
    op.create_index("ix_m360_provider_locations_provider_id", "m360_provider_locations", ["provider_id"])
    op.create_index("ix_m360_provider_locations_geocode_status", "m360_provider_locations", ["geocode_status"])

    op.create_table(
        "m360_provider_networks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider_id", sa.Integer(), sa.ForeignKey("m360_providers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan_name", sa.String(128), nullable=True),
        sa.Column("line_of_business", sa.String(64), nullable=True),
        sa.Column("network_status", sa.String(24), nullable=False, server_default="in_network"),
    )
    op.create_index("ix_m360_provider_networks_provider_id", "m360_provider_networks", ["provider_id"])
    op.create_index("ix_m360_provider_networks_line_of_business", "m360_provider_networks", ["line_of_business"])

    op.create_table(
        "m360_geocode_cache",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("query_text", sa.String(255), nullable=False, unique=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="ok"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_m360_geocode_cache_query_text", "m360_geocode_cache", ["query_text"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_m360_geocode_cache_query_text", table_name="m360_geocode_cache")
    op.drop_table("m360_geocode_cache")
    op.drop_index("ix_m360_provider_networks_line_of_business", table_name="m360_provider_networks")
    op.drop_index("ix_m360_provider_networks_provider_id", table_name="m360_provider_networks")
    op.drop_table("m360_provider_networks")
    op.drop_index("ix_m360_provider_locations_geocode_status", table_name="m360_provider_locations")
    op.drop_index("ix_m360_provider_locations_provider_id", table_name="m360_provider_locations")
    op.drop_table("m360_provider_locations")
    op.drop_index("ix_m360_providers_status", table_name="m360_providers")
    op.drop_index("ix_m360_providers_is_pcp", table_name="m360_providers")
    op.drop_index("ix_m360_providers_specialty", table_name="m360_providers")
    op.drop_index("ix_m360_providers_name", table_name="m360_providers")
    op.drop_index("ix_m360_providers_npi", table_name="m360_providers")
    op.drop_table("m360_providers")
