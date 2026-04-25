"""add docs and user preference support tables

Revision ID: 20251019_000006
Revises: 20251018_000005
Create Date: 2025-10-19 00:00:06

"""
from alembic import op
import sqlalchemy as sa

revision = "20251019_000006"
down_revision = "20251018_000005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_preferences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("preference_key", sa.String(128), nullable=False),
        sa.Column("value", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "user_id", "preference_key", name="uq_user_preference_key"),
    )
    op.create_index("ix_user_preferences_tenant_id", "user_preferences", ["tenant_id"])
    op.create_index("ix_user_preferences_user_id", "user_preferences", ["user_id"])

    op.create_table(
        "docs_articles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("app_key", sa.String(64), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'published'")),
        sa.Column("created_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_docs_articles_tenant_id", "docs_articles", ["tenant_id"])
    op.create_index("ix_docs_articles_status", "docs_articles", ["status"])


def downgrade() -> None:
    op.drop_index("ix_docs_articles_status", table_name="docs_articles")
    op.drop_index("ix_docs_articles_tenant_id", table_name="docs_articles")
    op.drop_table("docs_articles")
    op.drop_index("ix_user_preferences_user_id", table_name="user_preferences")
    op.drop_index("ix_user_preferences_tenant_id", table_name="user_preferences")
    op.drop_table("user_preferences")
