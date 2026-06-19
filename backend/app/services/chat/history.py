"""Chat history persistence + LLM-integrated send_message.

This service is the seam between the existing stateless chat path
(``app/services/chat/client.py``) and the new per-tenant ``chat_conversations``
/ ``chat_messages`` tables. The route handler is intentionally thin — most of
the logic lives here so it's unit-testable without spinning up FastAPI.

Ownership invariants enforced at this layer:

  * A user can only read / write conversations they own. Cross-user access
    inside a tenant is rejected with ``ConversationNotFound`` (we don't leak
    whether the id exists for someone else).
  * Soft-deleted conversations are invisible to list / get / append.
  * The conversation's ``updated_at`` and ``message_count`` are kept in sync
    on every append — the sidebar's "recent conversations" query relies on
    those two columns being authoritative.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...models.chat_history import ChatConversation, ChatHistoryMessage


log = logging.getLogger("nexora.chat.history")


class ConversationNotFound(LookupError):
    """Raised when a conversation id is unknown OR belongs to another user
    or is soft-deleted. We collapse all three into one error to avoid
    leaking the existence of other users' conversations."""


class ConversationListPage:
    """Lightweight DTO returned by ``list_conversations``. Just a wrapper so
    callers can add a ``next_cursor`` field later without rewriting calls."""

    def __init__(self, items: list[ChatConversation]) -> None:
        self.items = items


# ── Title derivation ────────────────────────────────────────────────────────


def derive_title_from_first_message(content: str) -> str:
    """First-user-message → short title for the sidebar.

    Heuristics:
      * Strip leading/trailing whitespace.
      * Take the first sentence (split on ``. ``, ``! ``, ``? `` or newline).
      * Cap at ~60 chars on a word boundary so the sidebar doesn't have
        truncated mid-word lines.
    """
    text = (content or "").strip().replace("\r", "")
    if not text:
        return "New conversation"
    # First line / sentence.
    for sep in ("\n", ". ", "? ", "! "):
        if sep in text:
            text = text.split(sep, 1)[0]
            break
    text = text.strip()
    if len(text) <= 60:
        return text
    cut = text[:60].rsplit(" ", 1)[0]
    return (cut or text[:60]) + "…"


# ── CRUD ────────────────────────────────────────────────────────────────────


async def list_conversations(
    session: AsyncSession,
    *,
    user_id: int,
    limit: int = 100,
) -> ConversationListPage:
    """Return the current user's active conversations, newest first.

    ``limit`` is generous because Postgres's partial index makes this query
    cheap even with thousands of rows. The frontend can paginate later if
    we ever see a user with >100 active conversations.
    """
    stmt = (
        select(ChatConversation)
        .where(
            ChatConversation.user_id == user_id,
            ChatConversation.archived_at.is_(None),
        )
        .order_by(ChatConversation.updated_at.desc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return ConversationListPage(items=list(rows))


async def get_conversation(
    session: AsyncSession,
    *,
    conversation_id: str,
    user_id: int,
    include_messages: bool = True,
) -> ChatConversation:
    """Load a conversation belonging to ``user_id`` (or raise).

    ``include_messages=True`` (default) eager-loads the messages relationship
    in a single round-trip via ``selectinload``.

    This is the owner-strict path. For project-aware access (where another
    tenant user can read or write the chat through a shared project) use
    :func:`get_readable_conversation` or :func:`get_writable_conversation`.
    """
    stmt = select(ChatConversation).where(
        ChatConversation.id == conversation_id,
        ChatConversation.user_id == user_id,
        ChatConversation.archived_at.is_(None),
    )
    if include_messages:
        stmt = stmt.options(selectinload(ChatConversation.messages))
    row = await session.scalar(stmt)
    if row is None:
        raise ConversationNotFound(conversation_id)
    return row


async def get_readable_conversation(
    session: AsyncSession,
    *,
    conversation_id: str,
    user_id: int,
    include_messages: bool = True,
) -> ChatConversation:
    """Load a conversation that ``user_id`` can read.

    Read access = owner OR any project member (owner / editor / viewer)
    of an active project the conversation is attached to. Existence
    leakage is handled exactly like :func:`get_conversation`: missing,
    inaccessible, and soft-deleted all collapse to ``ConversationNotFound``.
    """
    # Import inside the function to avoid a circular import — projects.py
    # already imports this module.
    from . import projects as projects_svc

    stmt = select(ChatConversation).where(
        ChatConversation.id == conversation_id,
        ChatConversation.archived_at.is_(None),
    )
    if include_messages:
        stmt = stmt.options(selectinload(ChatConversation.messages))
    row = await session.scalar(stmt)
    if row is None:
        raise ConversationNotFound(conversation_id)

    if row.user_id == user_id:
        return row
    if await projects_svc.user_has_read_access(
        session, conversation_id=conversation_id, user_id=user_id
    ):
        return row
    raise ConversationNotFound(conversation_id)


async def get_writable_conversation(
    session: AsyncSession,
    *,
    conversation_id: str,
    user_id: int,
    include_messages: bool = False,
) -> ChatConversation:
    """Load a conversation that ``user_id`` can append messages to.

    Write access = owner OR editor/owner role in an active project
    containing the chat. A viewer-role member can read but not write —
    they'll get ``ConversationNotFound`` here (and the route layer turns
    that into a 404, not a 403, so we don't leak the chat's existence to
    users who shouldn't be writing to it)."""
    from . import projects as projects_svc

    stmt = select(ChatConversation).where(
        ChatConversation.id == conversation_id,
        ChatConversation.archived_at.is_(None),
    )
    if include_messages:
        stmt = stmt.options(selectinload(ChatConversation.messages))
    row = await session.scalar(stmt)
    if row is None:
        raise ConversationNotFound(conversation_id)

    if row.user_id == user_id:
        return row
    if await projects_svc.user_has_write_access(
        session, conversation_id=conversation_id, user_id=user_id
    ):
        return row
    raise ConversationNotFound(conversation_id)


async def create_conversation(
    session: AsyncSession,
    *,
    user_id: int,
    user_email: str,
    title: Optional[str] = None,
) -> ChatConversation:
    """Insert a new conversation. Title is optional at create-time; the
    first call to ``append_message`` will set it from the user message if
    still empty."""
    convo = ChatConversation(
        user_id=user_id,
        user_email=user_email,
        title=(title.strip() if title else None),
    )
    session.add(convo)
    await session.flush()  # populate convo.id
    return convo


async def rename_conversation(
    session: AsyncSession,
    *,
    conversation_id: str,
    user_id: int,
    title: str,
) -> ChatConversation:
    """Atomic rename. Caller commits."""
    convo = await get_conversation(
        session, conversation_id=conversation_id, user_id=user_id, include_messages=False
    )
    convo.title = title.strip() or convo.title
    convo.updated_at = datetime.now(timezone.utc)
    await session.flush()
    return convo


async def archive_conversation(
    session: AsyncSession,
    *,
    conversation_id: str,
    user_id: int,
) -> None:
    """Soft-delete. The row stays for audit/backup; sidebar hides it.

    Hard delete is a separate ops procedure (right-to-erasure on request).
    """
    convo = await get_conversation(
        session, conversation_id=conversation_id, user_id=user_id, include_messages=False
    )
    convo.archived_at = datetime.now(timezone.utc)
    await session.flush()


async def archive_all_conversations(
    session: AsyncSession,
    *,
    user_id: int,
) -> int:
    """Soft-delete every active conversation owned by ``user_id``.

    Backs the Settings "clear chat history" action. Like the single-archive
    path this is a soft delete (rows stay for audit / right-to-erasure ops).
    Returns the number of conversations archived.
    """
    stmt = (
        update(ChatConversation)
        .where(
            ChatConversation.user_id == user_id,
            ChatConversation.archived_at.is_(None),
        )
        .values(archived_at=datetime.now(timezone.utc))
    )
    result = await session.execute(stmt)
    return int(result.rowcount or 0)


# ── Message append ──────────────────────────────────────────────────────────


async def append_message(
    session: AsyncSession,
    *,
    conversation_id: str,
    user_id: int,
    role: str,
    content: str,
    model: Optional[str] = None,
    attached_file_name: Optional[str] = None,
    workbook_id: Optional[str] = None,
    tokens_in: Optional[int] = None,
    tokens_out: Optional[int] = None,
) -> ChatHistoryMessage:
    """Append one turn to a conversation and bump the conversation's
    ``updated_at`` + ``message_count`` in the same transaction.

    The caller (route handler) commits — keeping commit at the route lets us
    write user message + LLM call + assistant message under the same Unit
    of Work, so a network blip mid-stream doesn't leave a half-saved row.

    Permission: the conversation owner OR an editor/owner of a project
    that contains the chat may append. Viewers (read-only project members)
    are rejected with ``ConversationNotFound``.
    """
    convo = await get_writable_conversation(
        session, conversation_id=conversation_id, user_id=user_id, include_messages=False
    )
    msg = ChatHistoryMessage(
        conversation_id=convo.id,
        role=role,
        content=content,
        model=model,
        attached_file_name=attached_file_name,
        workbook_id=workbook_id,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
    )
    session.add(msg)

    # Update conversation bookkeeping.
    if role == "user" and (not convo.title or not convo.title.strip()):
        convo.title = derive_title_from_first_message(content)
    if model:
        convo.model = model
    convo.message_count = (convo.message_count or 0) + 1
    convo.updated_at = datetime.now(timezone.utc)

    await session.flush()
    return msg


async def list_messages_for_llm(
    session: AsyncSession,
    *,
    conversation_id: str,
    user_id: int,
) -> list[dict]:
    """Return the conversation's messages as the ``[{role, content}, ...]``
    shape the Anthropic SDK expects.

    The sequence INCLUDES the most recently appended user message (the
    typical call order is: append user → list_messages_for_llm → call LLM).

    Uses the writable view: this function is only called from the chat
    routes when a user is sending a message, so the caller already has
    write access. Readers (viewers) shouldn't be triggering LLM calls.
    """
    convo = await get_writable_conversation(
        session, conversation_id=conversation_id, user_id=user_id, include_messages=True
    )
    return [
        {"role": m.role, "content": m.content}
        for m in sorted(convo.messages, key=lambda m: m.created_at)
        if m.role in ("user", "assistant")
    ]
