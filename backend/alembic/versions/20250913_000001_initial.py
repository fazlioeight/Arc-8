"""initial control plane tables

Revision ID: 20250913_000001
Revises:
Create Date: 2025-09-13 00:00:01.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = '20250913_000001'
down_revision = None
branch_labels = None
depends_on = None


def _json_type():
    try:
        return JSONB()
    except Exception:  # pragma: no cover
        return sa.JSON()


def upgrade() -> None:
    op.create_table(
        'tenants',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('key', sa.String(length=64), nullable=False, unique=True),
        sa.Column('slug', sa.String(length=128), nullable=False, unique=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='active'),
        sa.Column('created_by', sa.String(length=255), nullable=True),
        sa.Column('region', sa.String(length=64), nullable=True),
        sa.Column('db_connection_uri', sa.String(length=512), nullable=False),
        sa.Column('db_schema', sa.String(length=128), nullable=True),
        sa.Column('billing_plan', sa.String(length=64), nullable=False, server_default='standard'),
        sa.Column('feature_flags', _json_type(), nullable=True, server_default='{}'),
        sa.Column('sso_metadata', sa.Text(), nullable=True),
        sa.Column('phi_data_classification', sa.String(length=64), nullable=False, server_default='restricted'),
        sa.Column('data_residency', sa.String(length=64), nullable=True),
        sa.Column('encryption_key_id', sa.String(length=128), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_tenants_key', 'tenants', ['key'], unique=True)
    op.create_index('ix_tenants_slug', 'tenants', ['slug'], unique=True)

    op.create_table(
        'tenant_audit_events',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('actor', sa.String(length=255), nullable=False),
        sa.Column('event_type', sa.String(length=128), nullable=False),
        sa.Column('payload', _json_type(), nullable=True, server_default='{}'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_tenant_audit_events_tenant_id', 'tenant_audit_events', ['tenant_id'])

    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=64), nullable=True, server_default='user'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('last_login_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_users_tenant_id', 'users', ['tenant_id'])
    op.create_index('ix_users_email', 'users', ['email'])


def downgrade() -> None:
    op.drop_index('ix_users_email', table_name='users')
    op.drop_index('ix_users_tenant_id', table_name='users')
    op.drop_table('users')
    op.drop_index('ix_tenant_audit_events_tenant_id', table_name='tenant_audit_events')
    op.drop_table('tenant_audit_events')
    op.drop_index('ix_tenants_slug', table_name='tenants')
    op.drop_index('ix_tenants_key', table_name='tenants')
    op.drop_table('tenants')
