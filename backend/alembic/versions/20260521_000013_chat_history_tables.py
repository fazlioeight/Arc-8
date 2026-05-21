"""Per-tenant chat conversation history.

Creates ``chat_conversations`` and ``chat_messages`` in the tenant schema so a
user's chat history inherits Member360-style tenant isolation. Both content
columns (title, message body) are stored as Fernet ciphertext via the
application's ``EncryptedString`` decorator — the migration just declares
them as wide ``String`` columns; the encryption happens above the SQL layer.

Retention model: soft-delete via ``archived_at IS NOT NULL``. The composite
partial index on the active set keeps the sidebar list cheap regardless of
historical row volume.

Revision ID: 20260521_000013
Revises: 20260519_000012
Create Date: 2026-05-21
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "20260521_000013"
down_revision = "20260519_000012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect_name = bind.dialect.name

    # Use the native UUID type on Postgres; fall back to String(36) for
    # SQLite (tests). Application code only sees Python str either way.
    uuid_type = (
        postgresql.UUID(as_uuid=False)
        if dialect_name == "postgresql"
        else sa.String(36)
    )

    op.create_table(
        "chat_conversations",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("user_email", sa.String(255), nullable=False),
        # ``title`` and ``content`` are wide because Fernet ciphertext is
        # ~1.5x the plaintext. A 200-char title can land near 400-500 chars
        # of ciphertext; we cap conservatively at 1024.
        sa.Column("title", sa.String(1024), nullable=True),
        sa.Column("model", sa.String(64), nullable=True),
        sa.Column("message_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()") if dialect_name == "postgresql" else sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()") if dialect_name == "postgresql" else sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_chat_conversations_user_id", "chat_conversations", ["user_id"],
    )
    op.create_index(
        "ix_chat_conversations_user_email", "chat_conversations", ["user_email"],
    )
    op.create_index(
        "ix_chat_conversations_archived_at", "chat_conversations", ["archived_at"],
    )

    if dialect_name == "postgresql":
        # Partial composite index: the sidebar's hot query is
        #   "this user's most-recently-updated active conversations".
        # The WHERE clause prunes archived rows from the index entirely, so
        # the index size stays proportional to active history, not lifetime
        # row count.
        op.execute(
            "CREATE INDEX ix_chat_conversations_user_active "
            "ON chat_conversations (user_id, updated_at DESC) "
            "WHERE archived_at IS NULL"
        )

    op.create_table(
        "chat_messages",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column(
            "conversation_id",
            uuid_type,
            sa.ForeignKey("chat_conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(16), nullable=False),
        # Cap at 1 MB of ciphertext. That's well below the 5 MB Fernet limit
        # most deployments comfortably handle, and roughly matches what
        # Claude can produce in a single response after generous slack.
        sa.Column("content", sa.String(1_000_000), nullable=False),
        sa.Column("model", sa.String(64), nullable=True),
        sa.Column("attached_file_name", sa.String(256), nullable=True),
        sa.Column("workbook_id", sa.String(64), nullable=True),
        sa.Column("tokens_in", sa.Integer(), nullable=True),
        sa.Column("tokens_out", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()") if dialect_name == "postgresql" else sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index(
        "ix_chat_messages_conversation_id", "chat_messages", ["conversation_id"],
    )
    op.create_index(
        "ix_chat_messages_created_at", "chat_messages", ["created_at"],
    )


def downgrade() -> None:
    """Drop the two tables. Note: this is destructive — chat history is
    gone. Operators should export first if the data is needed elsewhere."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_chat_conversations_user_active")
    op.drop_index("ix_chat_messages_created_at", table_name="chat_messages")
    op.drop_index("ix_chat_messages_conversation_id", table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_index("ix_chat_conversations_archived_at", table_name="chat_conversations")
    op.drop_index("ix_chat_conversations_user_email", table_name="chat_conversations")
    op.drop_index("ix_chat_conversations_user_id", table_name="chat_conversations")
    op.drop_table("chat_conversations")
