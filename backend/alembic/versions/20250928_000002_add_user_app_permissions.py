"""add per-application permissions to users

Revision ID: 20250928_000002
Revises: 20250913_000001
Create Date: 2025-09-28 00:00:02

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20250928_000002'
down_revision = '20250913_000001'
branch_labels = None
depends_on = None


def _json_type():
    try:
        return postgresql.JSONB()
    except Exception:  # pragma: no cover
        return sa.JSON()


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('app_permissions', _json_type(), nullable=True, server_default='{}'),
    )
    op.execute("UPDATE users SET app_permissions = '{}' WHERE app_permissions IS NULL")


def downgrade() -> None:
    op.drop_column('users', 'app_permissions')

