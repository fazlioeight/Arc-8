"""expand coding domain for risk operations

Revision ID: 20251004_000004
Revises: 20251004_000003
Create Date: 2025-10-04 00:00:04

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20251004_000004'
down_revision = '20251004_000003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'coding_member_eligibility',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('member_id', sa.Integer(), sa.ForeignKey('coding_members.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('plan_start', sa.Date(), nullable=True),
        sa.Column('plan_end', sa.Date(), nullable=True),
        sa.Column('medicare_effective_date', sa.Date(), nullable=True),
        sa.Column('joined_at', sa.Date(), nullable=True),
        sa.Column('is_new_to_medicare', sa.Boolean(), nullable=False, server_default=sa.sql.expression.false()),
        sa.Column('is_dual_eligible', sa.Boolean(), nullable=False, server_default=sa.sql.expression.false()),
        sa.Column('risk_tier', sa.String(length=32), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(), nullable=True),
    )

    op.create_table(
        'coding_claims',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('member_id', sa.Integer(), sa.ForeignKey('coding_members.id', ondelete='CASCADE'), nullable=False),
        sa.Column('provider_id', sa.Integer(), sa.ForeignKey('coding_providers.id', ondelete='SET NULL'), nullable=True),
        sa.Column('claim_number', sa.String(length=64), nullable=False),
        sa.Column('claim_type', sa.String(length=32), nullable=False, server_default='professional'),
        sa.Column('service_date', sa.Date(), nullable=True),
        sa.Column('diagnosis_codes', sa.JSON(), nullable=True),
        sa.Column('procedure_codes', sa.JSON(), nullable=True),
        sa.Column('hcc_codes', sa.JSON(), nullable=True),
        sa.Column('total_paid', sa.Float(), nullable=True),
        sa.Column('source', sa.String(length=64), nullable=True),
        sa.Column('chart_required', sa.Boolean(), nullable=False, server_default=sa.sql.expression.false()),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_coding_claims_member_id', 'coding_claims', ['member_id'])
    op.create_index('ix_coding_claims_claim_number', 'coding_claims', ['claim_number'])

    op.create_table(
        'coding_mao004_records',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('member_id', sa.Integer(), sa.ForeignKey('coding_members.id', ondelete='CASCADE'), nullable=False),
        sa.Column('submission_year', sa.Integer(), nullable=False),
        sa.Column('hcc_code', sa.String(length=12), nullable=False),
        sa.Column('icd10_code', sa.String(length=12), nullable=True),
        sa.Column('service_start', sa.Date(), nullable=True),
        sa.Column('service_end', sa.Date(), nullable=True),
        sa.Column('source_claim_number', sa.String(length=64), nullable=True),
        sa.Column('status', sa.String(length=16), nullable=False, server_default='open'),
        sa.Column('last_received_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_coding_mao004_records_member_id', 'coding_mao004_records', ['member_id'])
    op.create_index('ix_coding_mao004_records_submission_year', 'coding_mao004_records', ['submission_year'])

    op.create_table(
        'coding_health_assessments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('member_id', sa.Integer(), sa.ForeignKey('coding_members.id', ondelete='CASCADE'), nullable=False),
        sa.Column('assessment_date', sa.Date(), nullable=False),
        sa.Column('assessment_type', sa.String(length=64), nullable=False),
        sa.Column('provider_id', sa.Integer(), sa.ForeignKey('coding_providers.id', ondelete='SET NULL'), nullable=True),
        sa.Column('icd10_codes', sa.JSON(), nullable=True),
        sa.Column('hcc_codes', sa.JSON(), nullable=True),
        sa.Column('completion_status', sa.String(length=32), nullable=False, server_default='pending_submission'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_coding_health_assessments_member_id', 'coding_health_assessments', ['member_id'])
    op.create_index('ix_coding_health_assessments_provider_id', 'coding_health_assessments', ['provider_id'])

    op.create_table(
        'coding_member_priorities',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('member_id', sa.Integer(), sa.ForeignKey('coding_members.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('priority_score', sa.Float(), nullable=False),
        sa.Column('priority_tier', sa.String(length=16), nullable=False),
        sa.Column('hcc_opportunity_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('next_action', sa.String(length=64), nullable=True),
        sa.Column('next_action_due', sa.Date(), nullable=True),
        sa.Column('justification', sa.Text(), nullable=True),
        sa.Column('computed_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        'coding_submission_batches',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('submission_year', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('created_by', sa.String(length=255), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='draft'),
        sa.Column('record_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('payload_path', sa.String(length=512), nullable=True),
    )
    op.create_index('ix_coding_submission_batches_submission_year', 'coding_submission_batches', ['submission_year'])


def downgrade() -> None:
    op.drop_index('ix_coding_submission_batches_submission_year', table_name='coding_submission_batches')
    op.drop_table('coding_submission_batches')
    op.drop_table('coding_member_priorities')
    op.drop_index('ix_coding_health_assessments_provider_id', table_name='coding_health_assessments')
    op.drop_index('ix_coding_health_assessments_member_id', table_name='coding_health_assessments')
    op.drop_table('coding_health_assessments')
    op.drop_index('ix_coding_mao004_records_submission_year', table_name='coding_mao004_records')
    op.drop_index('ix_coding_mao004_records_member_id', table_name='coding_mao004_records')
    op.drop_table('coding_mao004_records')
    op.drop_index('ix_coding_claims_claim_number', table_name='coding_claims')
    op.drop_index('ix_coding_claims_member_id', table_name='coding_claims')
    op.drop_table('coding_claims')
    op.drop_table('coding_member_eligibility')
