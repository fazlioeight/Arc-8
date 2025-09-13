"""initial tables

Revision ID: 20250913_000001
Revises: 
Create Date: 2025-09-13 00:00:01.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20250913_000001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'tenants',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('key', sa.String(length=64), nullable=False, unique=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_tenants_key', 'tenants', ['key'], unique=True)

    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_users_tenant_id', 'users', ['tenant_id'])
    op.create_index('ix_users_email', 'users', ['email'])

    op.create_table(
        'members',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('member_key', sa.String(length=64), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=True),
    )
    op.create_index('ix_members_tenant_id', 'members', ['tenant_id'])
    op.create_index('ix_members_member_key', 'members', ['member_key'])

    op.create_table(
        'claims',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('member_key', sa.String(length=64), nullable=False),
        sa.Column('service_date', sa.Date(), nullable=True),
        sa.Column('cost', sa.Numeric(12, 2), nullable=False),
    )
    op.create_index('ix_claims_tenant_member', 'claims', ['tenant_id', 'member_key'])


def downgrade() -> None:
    op.drop_index('ix_claims_tenant_member', table_name='claims')
    op.drop_table('claims')
    op.drop_index('ix_members_member_key', table_name='members')
    op.drop_index('ix_members_tenant_id', table_name='members')
    op.drop_table('members')
    op.drop_index('ix_users_email', table_name='users')
    op.drop_index('ix_users_tenant_id', table_name='users')
    op.drop_table('users')
    op.drop_index('ix_tenants_key', table_name='tenants')
    op.drop_table('tenants')

