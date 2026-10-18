"""Add per-tenant branding JSON column.

Stores the visual identity a tenant applies to chat artifact exports
(PPTX/DOCX/PDF generated via the ``build_artifact`` tool). Schema is
intentionally open — a JSON object with keys consumed by
``services/chat/export.py::theme_from_branding``:

    {
      "primary_color":    "#RRGGBB",
      "secondary_color":  "#RRGGBB",
      "palette":          ["#...", ...],
      "eyebrow":          "ACME",
      "caption":          "Acme Health · Restricted",
      "logo_png_base64":  "<base64 png>"   (optional, <=2 MB)
    }

Empty object preserves the Nexora default look. Missing keys fall through
to defaults — partial configs are safe.

Revision ID: 20260524_000014
Revises: 20260521_000013
Create Date: 2026-05-24
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260524_000014"
down_revision = "20260521_000013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("branding", sa.JSON(), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("tenants", "branding")
