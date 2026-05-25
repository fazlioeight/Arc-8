"""Chat projects: grouping conversations and sharing them within a tenant.

A project lives in the tenant DB and is owned by exactly one user. Other
tenant users can be invited as ``editor`` (can add chats + send messages
in member chats) or ``viewer`` (read-only).

This service is the seam between the route handlers in ``routes/chat.py``
and the three project tables in ``models/chat_projects.py``. All
permission checks live here so the route handlers can stay thin and the
checks are unit-testable without spinning up FastAPI.

Authorization model:

  * ``list_projects_for_user`` / ``get_project``                        — any member.
  * ``list_project_conversations`` / ``list_members``                   — any member.
  * ``update_project`` / ``attach_conversation`` / ``detach_conversation``
    / ``create_conversation_in_project``                                — owner or editor.
  * ``delete_project`` / ``add_member`` / ``remove_member`` /
    ``update_member_role``                                              — owner only.

Conversations themselves are owned by a single user (the row in
``chat_conversations``). Membership in a containing project grants
read access to the conversation; editor+ membership grants write access
(i.e. ability to call ``append_message`` against it). Renaming or
deleting the conversation itself remains restricted to the conversation
owner — those routes don't use this service.

Errors are surfaced as three exceptions the route layer maps to HTTP:

  * ``ProjectNotFound``         → 404
  * ``ProjectPermissionDenied`` → 403
  * ``ProjectConflict``         → 409 (duplicate member, etc.)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import and_, exists, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ...models.chat_history import ChatConversation
from ...models.chat_projects import (
    PROJECT_ROLES,
    WRITER_ROLES,
    ChatProject,
    ChatProjectConversation,
    ChatProjectMember,
)
from . import history as history_svc


log = logging.getLogger("nexora.chat.projects")


# ── Exceptions ─────────────────────────────────────────────────────────────


class ProjectNotFound(LookupError):
    """Raised when a project id doesn't exist OR the requesting user isn't
    a member. We collapse the two cases to avoid leaking the existence of
    projects in the same tenant the user shouldn't see."""


class ProjectPermissionDenied(PermissionError):
    """Raised when the user is a member but lacks the role needed for the
    requested action (e.g. viewer trying to delete the project)."""


class ProjectConflict(Exception):
    """Raised for duplicate-key situations the user can recover from —
    inviting someone who's already a member, attaching a chat that's
    already in the project, etc."""


# ── Internal helpers ───────────────────────────────────────────────────────


async def _load_project(
    session: AsyncSession, *, project_id: str
) -> Optional[ChatProject]:
    """Return the active project row or None. Does NOT check membership —
    callers must follow with ``_require_member``."""
    return await session.scalar(
        select(ChatProject).where(
            ChatProject.id == project_id,
            ChatProject.archived_at.is_(None),
        )
    )


async def _load_membership(
    session: AsyncSession, *, project_id: str, user_id: int
) -> Optional[ChatProjectMember]:
    return await session.scalar(
        select(ChatProjectMember).where(
            ChatProjectMember.project_id == project_id,
            ChatProjectMember.user_id == user_id,
        )
    )


async def _require_member(
    session: AsyncSession, *, project_id: str, user_id: int
) -> tuple[ChatProject, ChatProjectMember]:
    """Load project + membership in one go. Raises ``ProjectNotFound`` for
    either missing project OR non-membership."""
    project = await _load_project(session, project_id=project_id)
    if project is None:
        raise ProjectNotFound(project_id)
    member = await _load_membership(
        session, project_id=project_id, user_id=user_id
    )
    if member is None:
        raise ProjectNotFound(project_id)
    return project, member


def _require_role(member: ChatProjectMember, allowed: set[str]) -> None:
    if member.role not in allowed:
        raise ProjectPermissionDenied(
            f"role '{member.role}' not in {sorted(allowed)}"
        )


async def _count_conversations(session: AsyncSession, project_id: str) -> int:
    return int(
        await session.scalar(
            select(func.count())
            .select_from(ChatProjectConversation)
            .where(ChatProjectConversation.project_id == project_id)
        )
        or 0
    )


async def _count_members(session: AsyncSession, project_id: str) -> int:
    return int(
        await session.scalar(
            select(func.count())
            .select_from(ChatProjectMember)
            .where(ChatProjectMember.project_id == project_id)
        )
        or 0
    )


# ── Project CRUD ───────────────────────────────────────────────────────────


async def create_project(
    session: AsyncSession,
    *,
    owner_id: int,
    owner_email: str,
    title: str,
    description: Optional[str] = None,
) -> ChatProject:
    """Insert a project AND its owner member row in the same flush so a
    crash between the two can't leave a project nobody owns."""
    project = ChatProject(
        owner_id=owner_id,
        owner_email=owner_email,
        title=title.strip(),
        description=(description.strip() if description else None),
    )
    session.add(project)
    await session.flush()  # populate project.id

    owner_member = ChatProjectMember(
        project_id=project.id,
        user_id=owner_id,
        user_email=owner_email,
        role="owner",
        added_by_user_id=None,
    )
    session.add(owner_member)
    await session.flush()
    return project


async def list_projects_for_user(
    session: AsyncSession, *, user_id: int
) -> list[tuple[ChatProject, ChatProjectMember, int, int]]:
    """Return ``(project, my_membership, conversation_count, member_count)``
    tuples for every active project this user belongs to, newest first.

    A single query joining ``chat_projects`` to ``chat_project_members``
    on ``user_id``; counts are issued as one subquery each. With Postgres
    + small N this is fine; if list pages grow, the counts can become a
    LATERAL join in a follow-up.
    """
    stmt = (
        select(ChatProject, ChatProjectMember)
        .join(
            ChatProjectMember,
            and_(
                ChatProjectMember.project_id == ChatProject.id,
                ChatProjectMember.user_id == user_id,
            ),
        )
        .where(ChatProject.archived_at.is_(None))
        .order_by(ChatProject.updated_at.desc())
    )
    rows = (await session.execute(stmt)).all()
    out: list[tuple[ChatProject, ChatProjectMember, int, int]] = []
    for project, membership in rows:
        out.append(
            (
                project,
                membership,
                await _count_conversations(session, project.id),
                await _count_members(session, project.id),
            )
        )
    return out


async def get_project(
    session: AsyncSession, *, project_id: str, user_id: int
) -> tuple[ChatProject, ChatProjectMember]:
    return await _require_member(
        session, project_id=project_id, user_id=user_id
    )


async def update_project(
    session: AsyncSession,
    *,
    project_id: str,
    user_id: int,
    title: Optional[str] = None,
    description: Optional[str] = None,
) -> ChatProject:
    project, member = await _require_member(
        session, project_id=project_id, user_id=user_id
    )
    _require_role(member, WRITER_ROLES)
    if title is not None:
        project.title = title.strip() or project.title
    if description is not None:
        # Empty string clears the description; non-empty replaces it.
        project.description = description.strip() or None
    project.updated_at = datetime.now(timezone.utc)
    await session.flush()
    return project


async def delete_project(
    session: AsyncSession, *, project_id: str, user_id: int
) -> None:
    project, member = await _require_member(
        session, project_id=project_id, user_id=user_id
    )
    _require_role(member, {"owner"})
    project.archived_at = datetime.now(timezone.utc)
    await session.flush()


# ── Members ────────────────────────────────────────────────────────────────


async def list_members(
    session: AsyncSession, *, project_id: str, user_id: int
) -> list[ChatProjectMember]:
    await _require_member(session, project_id=project_id, user_id=user_id)
    stmt = (
        select(ChatProjectMember)
        .where(ChatProjectMember.project_id == project_id)
        .order_by(ChatProjectMember.created_at.asc())
    )
    return list((await session.execute(stmt)).scalars().all())


async def add_member(
    session: AsyncSession,
    *,
    project_id: str,
    actor_user_id: int,
    new_user_id: int,
    new_user_email: str,
    role: str = "viewer",
) -> ChatProjectMember:
    """Owner-only. ``role`` must be ``editor`` or ``viewer`` — owner is
    reserved for the project creator and isn't transferable through this
    endpoint."""
    if role not in {"editor", "viewer"}:
        raise ValueError(f"role must be 'editor' or 'viewer', got {role!r}")

    _, member = await _require_member(
        session, project_id=project_id, user_id=actor_user_id
    )
    _require_role(member, {"owner"})

    existing = await _load_membership(
        session, project_id=project_id, user_id=new_user_id
    )
    if existing is not None:
        raise ProjectConflict(
            f"user {new_user_id} is already a member of project {project_id}"
        )

    new_member = ChatProjectMember(
        project_id=project_id,
        user_id=new_user_id,
        user_email=new_user_email,
        role=role,
        added_by_user_id=actor_user_id,
    )
    session.add(new_member)
    try:
        await session.flush()
    except IntegrityError as exc:
        # Race: another request inserted the same (project_id, user_id)
        # between our existence check and the flush. Surface as conflict.
        raise ProjectConflict(str(exc)) from exc
    return new_member


async def update_member_role(
    session: AsyncSession,
    *,
    project_id: str,
    actor_user_id: int,
    target_user_id: int,
    role: str,
) -> ChatProjectMember:
    """Owner-only. Can't change the owner's role (i.e. step them down)."""
    if role not in {"editor", "viewer"}:
        raise ValueError(f"role must be 'editor' or 'viewer', got {role!r}")

    _, actor = await _require_member(
        session, project_id=project_id, user_id=actor_user_id
    )
    _require_role(actor, {"owner"})

    target = await _load_membership(
        session, project_id=project_id, user_id=target_user_id
    )
    if target is None:
        raise ProjectNotFound(f"member {target_user_id} not in project {project_id}")
    if target.role == "owner":
        raise ProjectPermissionDenied("cannot change the project owner's role")

    target.role = role
    await session.flush()
    return target


async def remove_member(
    session: AsyncSession,
    *,
    project_id: str,
    actor_user_id: int,
    target_user_id: int,
) -> None:
    """Owner-only. Can't remove the owner.

    Self-removal by a non-owner is allowed and short-circuits the owner
    check — letting a viewer/editor leave a project they were invited to
    is the expected ergonomics."""
    _, actor = await _require_member(
        session, project_id=project_id, user_id=actor_user_id
    )

    target = await _load_membership(
        session, project_id=project_id, user_id=target_user_id
    )
    if target is None:
        raise ProjectNotFound(f"member {target_user_id} not in project {project_id}")
    if target.role == "owner":
        raise ProjectPermissionDenied("cannot remove the project owner")

    # Owner can remove anyone; a non-owner can only remove themselves.
    if actor.role != "owner" and actor_user_id != target_user_id:
        raise ProjectPermissionDenied(
            "only the project owner can remove other members"
        )

    await session.delete(target)
    await session.flush()


# ── Conversations in a project ─────────────────────────────────────────────


async def list_project_conversations(
    session: AsyncSession, *, project_id: str, user_id: int
) -> list[ChatConversation]:
    """Return active conversations attached to this project, newest first.
    Archived (soft-deleted) conversations are filtered out — they can be
    recovered ops-side, but day-to-day they shouldn't clutter the view."""
    await _require_member(session, project_id=project_id, user_id=user_id)
    stmt = (
        select(ChatConversation)
        .join(
            ChatProjectConversation,
            ChatProjectConversation.conversation_id == ChatConversation.id,
        )
        .where(
            ChatProjectConversation.project_id == project_id,
            ChatConversation.archived_at.is_(None),
        )
        .order_by(ChatConversation.updated_at.desc())
    )
    return list((await session.execute(stmt)).scalars().all())


async def attach_conversation(
    session: AsyncSession,
    *,
    project_id: str,
    user_id: int,
    user_email: str,
    conversation_id: str,
) -> ChatProjectConversation:
    """Add an existing conversation to a project.

    The caller must:
      * be an editor or owner of the project, AND
      * own the conversation they're attaching (you can only share what
        you own — preventing one tenant user from re-sharing another's
        chat into a project the second user isn't in).
    """
    _, member = await _require_member(
        session, project_id=project_id, user_id=user_id
    )
    _require_role(member, WRITER_ROLES)

    # Conversation must exist AND belong to the caller. We deliberately
    # use the owner-strict getter here (not the project-aware one) — you
    # can't re-share a chat you only see through another shared project.
    try:
        convo = await history_svc.get_conversation(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            include_messages=False,
        )
    except history_svc.ConversationNotFound as exc:
        raise ProjectNotFound(f"conversation {conversation_id}") from exc

    # Already attached?
    existing = await session.scalar(
        select(ChatProjectConversation).where(
            ChatProjectConversation.project_id == project_id,
            ChatProjectConversation.conversation_id == conversation_id,
        )
    )
    if existing is not None:
        raise ProjectConflict(
            f"conversation {conversation_id} is already in project {project_id}"
        )

    link = ChatProjectConversation(
        project_id=project_id,
        conversation_id=convo.id,
        added_by_user_id=user_id,
    )
    session.add(link)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise ProjectConflict(str(exc)) from exc
    return link


async def detach_conversation(
    session: AsyncSession,
    *,
    project_id: str,
    user_id: int,
    conversation_id: str,
) -> None:
    """Editor+ can detach. The conversation itself is unaffected — it
    just disappears from the project view (and from members who only
    had access through this project)."""
    _, member = await _require_member(
        session, project_id=project_id, user_id=user_id
    )
    _require_role(member, WRITER_ROLES)

    link = await session.scalar(
        select(ChatProjectConversation).where(
            ChatProjectConversation.project_id == project_id,
            ChatProjectConversation.conversation_id == conversation_id,
        )
    )
    if link is None:
        raise ProjectNotFound(
            f"conversation {conversation_id} not in project {project_id}"
        )
    await session.delete(link)
    await session.flush()


async def create_conversation_in_project(
    session: AsyncSession,
    *,
    project_id: str,
    user_id: int,
    user_email: str,
    title: Optional[str] = None,
) -> ChatConversation:
    """Create a new conversation owned by ``user_id`` AND attach it to
    ``project_id`` in one transaction. Used by the in-project ``+ New
    chat`` button."""
    _, member = await _require_member(
        session, project_id=project_id, user_id=user_id
    )
    _require_role(member, WRITER_ROLES)

    convo = await history_svc.create_conversation(
        session, user_id=user_id, user_email=user_email, title=title
    )
    link = ChatProjectConversation(
        project_id=project_id,
        conversation_id=convo.id,
        added_by_user_id=user_id,
    )
    session.add(link)
    await session.flush()
    return convo


# ── Conversation access helpers (used by the chat route handlers) ──────────


async def user_has_read_access(
    session: AsyncSession, *, conversation_id: str, user_id: int
) -> bool:
    """True if ``user_id`` can read ``conversation_id`` — either as owner
    or as a member of an active project the conversation is attached to."""
    # Owner path: cheap scalar.
    is_owner = await session.scalar(
        select(
            exists().where(
                and_(
                    ChatConversation.id == conversation_id,
                    ChatConversation.user_id == user_id,
                    ChatConversation.archived_at.is_(None),
                )
            )
        )
    )
    if is_owner:
        return True

    # Project-membership path. ``archived_at IS NULL`` on the project so
    # soft-deleted projects don't keep granting access.
    shared = await session.scalar(
        select(
            exists().where(
                and_(
                    ChatProjectConversation.conversation_id == conversation_id,
                    ChatProjectConversation.project_id == ChatProjectMember.project_id,
                    ChatProjectMember.user_id == user_id,
                    ChatProjectConversation.project_id == ChatProject.id,
                    ChatProject.archived_at.is_(None),
                )
            )
        )
    )
    return bool(shared)


async def user_has_write_access(
    session: AsyncSession, *, conversation_id: str, user_id: int
) -> bool:
    """True if ``user_id`` can append messages to ``conversation_id``.

    Write access requires owning the conversation OR being an
    owner/editor (not viewer) in a project that contains it."""
    is_owner = await session.scalar(
        select(
            exists().where(
                and_(
                    ChatConversation.id == conversation_id,
                    ChatConversation.user_id == user_id,
                    ChatConversation.archived_at.is_(None),
                )
            )
        )
    )
    if is_owner:
        return True

    shared = await session.scalar(
        select(
            exists().where(
                and_(
                    ChatProjectConversation.conversation_id == conversation_id,
                    ChatProjectConversation.project_id == ChatProjectMember.project_id,
                    ChatProjectMember.user_id == user_id,
                    ChatProjectMember.role.in_(WRITER_ROLES),
                    ChatProjectConversation.project_id == ChatProject.id,
                    ChatProject.archived_at.is_(None),
                )
            )
        )
    )
    return bool(shared)
