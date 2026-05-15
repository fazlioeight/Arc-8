"""merge expand_coding branch into main

Revision ID: 20260514_000009
Revises: 20251004_000004, 20251020_000008
Create Date: 2026-05-14

Two parallel migration heads diverged from 20251004_000003:
  - 20251004_000004 (expand_coding_domain)
  - 20251020_000008 (icd_codes table, via the portal/docs/ride_booking chain)

This empty merge revision unifies them so 'alembic upgrade head' resolves to a
single head and applies both branches.
"""
from __future__ import annotations


revision = "20260514_000009"
down_revision = ("20251004_000004", "20251020_000008")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
