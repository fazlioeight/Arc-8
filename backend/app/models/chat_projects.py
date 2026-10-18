"""Per-tenant chat projects.

A project groups one or more ``chat_conversations`` together and can be
shared with other users in the same tenant via ``chat_project_members``.
Conversations themselves remain owned by a single user; project membership
grants additional read/write access on top of ownership.

Like ``chat_conversations`` these tables live in the tenant schema so
project metadata never crosses tenant boundaries. ``user_id`` columns are
plain integers pointing at the control-plane ``users`` table — same
pattern as ``ChatConversation.user_id`` — because cross-schema foreign
keys aren't supported.

Roles:
  * ``owner``    — full control: rename, delete, manage members.
  * ``editor``   — attach/detach chats, send messages in member chats.
  * ``viewer``   — read-only access to the project + its chats.

The project's creator is always inserted as an ``owner`` member when the
project is created; the service layer enforces "exactly one owner" by
rejecting role changes / additions that would create a second.
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
    PrimaryKeyConstraint,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..utils.encryption import EncryptedString
from .tables import TenantDataBase


def _uuid_str() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Role values are kept as plain strings (not a SQL ENUM) so role changes
# in code don't require a destructive migration.
PROJECT_ROLES = ("owner", "editor", "viewer")
WRITER_ROLES = {"owner", "editor"}


class ChatProject(TenantDataBase):
    __tablename__ = "chat_projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    # Creator. They get an owner row in chat_project_members at create time;
    # owner_id stays denormalized so the project header can render without
    # joining the member table.
    owner_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    owner_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    title: Mapped[str] = mapped_column(EncryptedString(1024), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(EncryptedString(4096), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
    # Soft-delete. Archived projects are hidden from list endpoints; the
    # join rows survive so a recovered project still has its chats + members.
    archived_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    members: Mapped[list["ChatProjectMember"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )
    conversation_links: Mapped[list["ChatProjectConversation"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )


class ChatProjectMember(TenantDataBase):
    __tablename__ = "chat_project_members"
    __table_args__ = (
        PrimaryKeyConstraint("project_id", "user_id", name="pk_chat_project_members"),
        # The "what projects can this user see?" query joins on user_id and
        # filters on archived_at — index user_id alone since project_id is
        # already part of the PK ordering.
        Index("ix_chat_project_members_user_id", "user_id"),
    )

    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("chat_projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    user_email: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    # Who invited this member. NULL for the auto-inserted owner row.
    added_by_user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    project: Mapped[ChatProject] = relationship(back_populates="members")


class ChatProjectConversation(TenantDataBase):
    __tablename__ = "chat_project_conversations"
    __table_args__ = (
        PrimaryKeyConstraint(
            "project_id", "conversation_id", name="pk_chat_project_conversations"
        ),
        # Reverse lookup: "which projects is this conversation in?" — used
        # both by the conversation detail view (badges) and the read-access
        # check ("can this user open this conversation?").
        Index("ix_chat_project_conversations_conversation", "conversation_id"),
    )

    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("chat_projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    conversation_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("chat_conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    added_by_user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    project: Mapped[ChatProject] = relationship(back_populates="conversation_links")
