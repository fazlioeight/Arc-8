"""add staff_users table for Nexora platform staff

Revision ID: 20260611_000016
Revises: 20260525_000015
Create Date: 2026-06-11

Nexora employees (platform staff) live on the control plane outside any
tenant. They authenticate against `staff_users`, then mint a short-lived
tenant-scoped impersonation token that grants platform_admin access to a
chosen tenant.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260611_000016"
down_revision = "20260525_000015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "staff_users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("mfa_secret", sa.String(64), nullable=True),
        sa.Column("mfa_enrolled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_staff_users_email", "staff_users", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_staff_users_email", table_name="staff_users")
    op.drop_table("staff_users")
