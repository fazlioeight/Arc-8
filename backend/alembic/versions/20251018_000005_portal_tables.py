"""create portal datamodel tables

Revision ID: 20251018_000005
Revises: 20251005_000004
Create Date: 2025-10-18 00:00:05

"""
from alembic import op
import sqlalchemy as sa

revision = "20251018_000005"
down_revision = "20251005_000004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "portal_saved_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("app_key", sa.String(64), nullable=True),
        sa.Column("path", sa.String(512), nullable=True),
        sa.Column("saved_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "portal_todos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.Integer(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("app_key", sa.String(64), nullable=True),
        sa.Column("assigned_by", sa.String(255), nullable=True),
        sa.Column("assigned_to", sa.String(255), nullable=True),
        sa.Column("priority", sa.String(32), nullable=False, server_default=sa.text("'low'")),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'open'")),
        sa.Column("due_at", sa.DateTime(), nullable=True),
        sa.Column("path", sa.String(512), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("portal_todos")
    op.drop_table("portal_saved_items")
