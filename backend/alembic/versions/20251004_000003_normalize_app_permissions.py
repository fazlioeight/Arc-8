"""normalize app permissions defaults

Revision ID: 20251004_000003
Revises: 20250928_000002
Create Date: 2025-10-04 00:00:03

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
import json

# revision identifiers, used by Alembic.
revision = '20251004_000003'
down_revision = '20250928_000002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(text('SELECT id, role, app_permissions FROM users'))
    for row in result:
        role = (row.role or 'user').lower()
        raw = row.app_permissions
        if isinstance(raw, dict):
            permissions = dict(raw)
        else:
            try:
                permissions = json.loads(raw) if raw else {}
            except (TypeError, json.JSONDecodeError):
                permissions = {}
        changed = False
        if 'portal' not in permissions:
            permissions['portal'] = 'admin' if role == 'admin' else 'user'
            changed = True
        if role == 'admin' and permissions.get('admin_console') != 'admin':
            permissions['admin_console'] = 'admin'
            changed = True
        if changed:
            conn.execute(
                text('UPDATE users SET app_permissions = :apps WHERE id = :id'),
                {'apps': json.dumps(permissions), 'id': row.id},
            )


def downgrade() -> None:
    # No-op: data migration only
    pass
