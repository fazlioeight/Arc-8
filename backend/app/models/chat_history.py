"""Per-tenant chat history.

Conversations and their messages are persisted in the tenant schema (NOT the
control plane) so PHI-containing chats inherit the same isolation as
Member360 data. Cross-schema foreign keys are not supported in our setup, so
``user_id`` is stored as a plain integer alongside a denormalized
``user_email`` — the email survives user-deletion in the control plane,
which keeps history pages from going blank if a user is decommissioned.

Encryption: ``title`` and ``content`` go through ``EncryptedString`` so the
on-disk representation is Fernet ciphertext keyed by the tenant's
``FIELD_ENCRYPTION_KEY``. The key sits in Key Vault in production; an
operator with raw DB access can't read chat content without it.

Retention: deletes are soft (``archived_at IS NOT NULL``). Hard delete is a
separate ops procedure to satisfy right-to-erasure on demand.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..utils.encryption import EncryptedString
from .tables import TenantDataBase


# Cross-dialect UUID column. Postgres has a native ``uuid`` type but SQLite
# (used in tests) doesn't, so we store as String(36) at the model level and
# let the Alembic migration upgrade to the native type on Postgres. Either
# way the application layer sees a Python str.
def _uuid_str() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ChatConversation(TenantDataBase):
    """One conversation between a user and the assistant.

    The denormalized ``message_count`` lets the sidebar list query the table
    without a per-row aggregate; the trade-off is the service layer must
    bump it on every append (and decrement on undo, when we add that).
    """

    __tablename__ = "chat_conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    user_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    title: Mapped[Optional[str]] = mapped_column(EncryptedString(1024), nullable=True)
    # Last model used, useful for the sidebar to badge older conversations
    # with the model that produced them.
    model: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    message_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
    # Soft-delete timestamp. NULL means active. Sidebar list filters this out.
    archived_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    messages: Mapped[list["ChatHistoryMessage"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="ChatHistoryMessage.created_at",
    )


# Composite index for the sidebar list: "give me this user's most-recently-
# updated active conversations". Postgres can use it for both the WHERE and
# the ORDER BY in one scan.
Index(
    "ix_chat_conversations_user_active",
    ChatConversation.user_id,
    ChatConversation.updated_at.desc(),
    postgresql_where=ChatConversation.archived_at.is_(None),
)


class ChatHistoryMessage(TenantDataBase):
    """One turn of a conversation.

    The model class is named ``ChatHistoryMessage`` (not ``ChatMessage``) to
    avoid collision with the in-route ``ChatMessage`` Pydantic schema in
    ``app/routes/chat.py``.
    """

    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    conversation_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("chat_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    # ``content`` is encrypted at-rest. Plaintext can be very large (assistant
    # replies of tens of thousands of characters are normal), so we use
    # ``EncryptedString`` with a generous cap; Postgres TEXT can hold up to
    # 1 GB but Fernet ciphertext is ~1.5x the input plus framing overhead.
    content: Mapped[str] = mapped_column(EncryptedString(1_000_000), nullable=False)
    # Which Claude model produced this turn (only set for assistant rows).
    model: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Optional metadata the chat surfaces today: an attached file or an
    # active workbook id. Both are scoped to the originating turn — keeping
    # them lets us replay the exact conversation in the sidebar.
    attached_file_name: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    workbook_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Token accounting from the Anthropic response — useful for usage panels
    # and per-tenant quota tracking (Week 5 backlog).
    tokens_in: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tokens_out: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, index=True
    )

    conversation: Mapped[ChatConversation] = relationship(back_populates="messages")
