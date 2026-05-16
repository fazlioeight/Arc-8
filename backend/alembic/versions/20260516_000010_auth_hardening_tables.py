"""add password reset tokens + user MFA columns + widen fhir_connectors.client_secret

Revision ID: 20260516_000010
Revises: 20260514_000009
Create Date: 2026-05-16

Supports the Path 2 BAA-milestone work:
  - password_reset_tokens for the self-serve reset flow
  - users.must_change_password for forced rotation on first login
  - users.mfa_secret / mfa_enrolled_at for TOTP MFA on admin accounts
  - fhir_connectors.client_secret widened to hold Fernet ciphertext (was 255)
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260516_000010"
down_revision = "20260514_000009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("users", sa.Column("mfa_secret", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("mfa_enrolled_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requested_ip", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_password_reset_tokens_tenant_id", "password_reset_tokens", ["tenant_id"])
    op.create_index("ix_password_reset_tokens_user_id", "password_reset_tokens", ["user_id"])
    op.create_index("ix_password_reset_tokens_token_hash", "password_reset_tokens", ["token_hash"])

    op.alter_column(
        "fhir_connectors",
        "client_secret",
        existing_type=sa.String(255),
        type_=sa.String(1024),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "fhir_connectors",
        "client_secret",
        existing_type=sa.String(1024),
        type_=sa.String(255),
        existing_nullable=True,
    )
    op.drop_index("ix_password_reset_tokens_token_hash", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_user_id", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_tenant_id", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
    op.drop_column("users", "mfa_enrolled_at")
    op.drop_column("users", "mfa_secret")
    op.drop_column("users", "must_change_password")
