"""Per-tenant chat projects.

Adds three tables to the tenant schema:

  * ``chat_projects``               — project header + soft-delete flag.
  * ``chat_project_members``        — (project_id, user_id) → role.
  * ``chat_project_conversations``  — junction: which chats live in this project.

Chats remain singly-owned by their creator; project membership grants
extra read/write access on top of ownership. See
``app/models/chat_projects.py`` for the role semantics.

Revision ID: 20260525_000015
Revises: 20260524_000014
Create Date: 2026-05-25
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "20260525_000015"
down_revision = "20260524_000014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect_name = bind.dialect.name

    # Match the chat_history migration: native UUID on Postgres, String(36)
    # on SQLite (tests). The application layer always sees Python str.
    uuid_type = (
        postgresql.UUID(as_uuid=False)
        if dialect_name == "postgresql"
        else sa.String(36)
    )
    now_default = (
        sa.text("NOW()") if dialect_name == "postgresql" else sa.text("CURRENT_TIMESTAMP")
    )

    op.create_table(
        "chat_projects",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("owner_email", sa.String(255), nullable=False),
        # Title / description go through EncryptedString in the model so the
        # SQL column just needs to be wide enough for Fernet ciphertext.
        sa.Column("title", sa.String(1024), nullable=False),
        sa.Column("description", sa.String(4096), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=now_default
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=now_default
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_chat_projects_owner_id", "chat_projects", ["owner_id"])
    op.create_index("ix_chat_projects_owner_email", "chat_projects", ["owner_email"])
    op.create_index("ix_chat_projects_archived_at", "chat_projects", ["archived_at"])

    op.create_table(
        "chat_project_members",
        sa.Column(
            "project_id",
            uuid_type,
            sa.ForeignKey("chat_projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("user_email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("added_by_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=now_default
        ),
        sa.PrimaryKeyConstraint("project_id", "user_id", name="pk_chat_project_members"),
    )
    op.create_index(
        "ix_chat_project_members_user_id", "chat_project_members", ["user_id"],
    )

    op.create_table(
        "chat_project_conversations",
        sa.Column(
            "project_id",
            uuid_type,
            sa.ForeignKey("chat_projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conversation_id",
            uuid_type,
            sa.ForeignKey("chat_conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("added_by_user_id", sa.Integer(), nullable=False),
        sa.Column(
            "added_at", sa.DateTime(timezone=True), nullable=False, server_default=now_default
        ),
        sa.PrimaryKeyConstraint(
            "project_id", "conversation_id", name="pk_chat_project_conversations"
        ),
    )
    op.create_index(
        "ix_chat_project_conversations_conversation",
        "chat_project_conversations",
        ["conversation_id"],
    )


def downgrade() -> None:
    """Drop the three tables. Destructive — project metadata is gone but the
    underlying conversations remain (chat_conversations is unaffected)."""
    op.drop_index(
        "ix_chat_project_conversations_conversation",
        table_name="chat_project_conversations",
    )
    op.drop_table("chat_project_conversations")
    op.drop_index("ix_chat_project_members_user_id", table_name="chat_project_members")
    op.drop_table("chat_project_members")
    op.drop_index("ix_chat_projects_archived_at", table_name="chat_projects")
    op.drop_index("ix_chat_projects_owner_email", table_name="chat_projects")
    op.drop_index("ix_chat_projects_owner_id", table_name="chat_projects")
    op.drop_table("chat_projects")
