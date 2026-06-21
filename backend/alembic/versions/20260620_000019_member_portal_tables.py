"""add member-portal auth realm tables

Revision ID: 20260620_000019
Revises: 20260619_000018
Create Date: 2026-06-20

Net-new control-plane persistence for the member-facing portal (Feature 1+2):
member accounts bound to (tenant_id, member_key), identity-verification attempt
log (anti-abuse), and single-use email-verification / password-reset / rotating
refresh tokens. Entirely separate from the staff ``users`` auth realm.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260620_000019"
down_revision = "20260619_000018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "member_portal_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_key", sa.String(64), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending_verification"),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("mfa_secret", sa.String(64), nullable=True),
        sa.Column("mfa_enrolled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_login_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "member_key", name="uq_member_account_member"),
        sa.UniqueConstraint("tenant_id", "email", name="uq_member_account_email"),
    )
    op.create_index("ix_member_portal_accounts_tenant_id", "member_portal_accounts", ["tenant_id"])
    op.create_index("ix_member_portal_accounts_member_key", "member_portal_accounts", ["member_key"])
    op.create_index("ix_member_portal_accounts_email", "member_portal_accounts", ["email"])

    op.create_table(
        "member_identity_verification_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("submitted_member_key", sa.String(64), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("outcome", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_member_idv_attempts_tenant_id", "member_identity_verification_attempts", ["tenant_id"])
    op.create_index("ix_member_idv_attempts_member_key", "member_identity_verification_attempts", ["submitted_member_key"])
    op.create_index("ix_member_idv_attempts_ip", "member_identity_verification_attempts", ["ip_address"])
    op.create_index("ix_member_idv_attempts_created_at", "member_identity_verification_attempts", ["created_at"])

    op.create_table(
        "member_email_verification_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("member_portal_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_member_email_tokens_tenant_id", "member_email_verification_tokens", ["tenant_id"])
    op.create_index("ix_member_email_tokens_account_id", "member_email_verification_tokens", ["account_id"])
    op.create_index("ix_member_email_tokens_token_hash", "member_email_verification_tokens", ["token_hash"])

    op.create_table(
        "member_password_reset_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("member_portal_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requested_ip", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_member_reset_tokens_tenant_id", "member_password_reset_tokens", ["tenant_id"])
    op.create_index("ix_member_reset_tokens_account_id", "member_password_reset_tokens", ["account_id"])
    op.create_index("ix_member_reset_tokens_token_hash", "member_password_reset_tokens", ["token_hash"])

    op.create_table(
        "member_refresh_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("member_portal_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("max_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_ip", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_member_refresh_tokens_tenant_id", "member_refresh_tokens", ["tenant_id"])
    op.create_index("ix_member_refresh_tokens_account_id", "member_refresh_tokens", ["account_id"])
    op.create_index("ix_member_refresh_tokens_session_id", "member_refresh_tokens", ["session_id"])
    op.create_index("ix_member_refresh_tokens_token_hash", "member_refresh_tokens", ["token_hash"])


def downgrade() -> None:
    for ix in (
        "ix_member_refresh_tokens_token_hash",
        "ix_member_refresh_tokens_session_id",
        "ix_member_refresh_tokens_account_id",
        "ix_member_refresh_tokens_tenant_id",
    ):
        op.drop_index(ix, table_name="member_refresh_tokens")
    op.drop_table("member_refresh_tokens")

    for ix in (
        "ix_member_reset_tokens_token_hash",
        "ix_member_reset_tokens_account_id",
        "ix_member_reset_tokens_tenant_id",
    ):
        op.drop_index(ix, table_name="member_password_reset_tokens")
    op.drop_table("member_password_reset_tokens")

    for ix in (
        "ix_member_email_tokens_token_hash",
        "ix_member_email_tokens_account_id",
        "ix_member_email_tokens_tenant_id",
    ):
        op.drop_index(ix, table_name="member_email_verification_tokens")
    op.drop_table("member_email_verification_tokens")

    for ix in (
        "ix_member_idv_attempts_created_at",
        "ix_member_idv_attempts_ip",
        "ix_member_idv_attempts_member_key",
        "ix_member_idv_attempts_tenant_id",
    ):
        op.drop_index(ix, table_name="member_identity_verification_attempts")
    op.drop_table("member_identity_verification_attempts")

    op.drop_index("ix_member_portal_accounts_email", table_name="member_portal_accounts")
    op.drop_index("ix_member_portal_accounts_member_key", table_name="member_portal_accounts")
    op.drop_index("ix_member_portal_accounts_tenant_id", table_name="member_portal_accounts")
    op.drop_table("member_portal_accounts")
