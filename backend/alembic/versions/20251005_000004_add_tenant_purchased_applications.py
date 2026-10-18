"""add tenant purchased applications

Revision ID: 20251005_000004
Revises: 20251004_000003
Create Date: 2025-10-05 00:00:04

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
import json

revision = '20251005_000004'
down_revision = '20251004_000003'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column('tenants', sa.Column('purchased_applications', sa.JSON(), nullable=False, server_default='{}'))
    conn = op.get_bind()
    purchased_payload = json.dumps({
        'coding': True,
        'ride_booking': True,
        'dashboard': True,
        'docs': True,
        'job_center': True,
    })
    conn.execute(text("UPDATE tenants SET purchased_applications = :payload"), {'payload': purchased_payload})

def downgrade() -> None:
    op.drop_column('tenants', 'purchased_applications')
