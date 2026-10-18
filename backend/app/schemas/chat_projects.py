"""Pydantic schemas for the chat projects API.

Mirrors ``schemas.chat_history``'s style: separate request / summary /
detail models so the OpenAPI surface is tidy and the frontend can pick
the lightest shape for each view.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from .chat_history import ConversationSummary


ProjectRole = Literal["owner", "editor", "viewer"]


# ── List + detail ──────────────────────────────────────────────────────────


class ProjectMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    user_email: str
    role: ProjectRole
    created_at: datetime


class ProjectSummary(BaseModel):
    """Sidebar list shape — enough to render the project list with a count
    badge and the requesting user's role, no embedded chats or full member
    list. ``my_role`` is the calling user's role in this project (not a
    column on the table) — populated by the service layer."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: Optional[str] = None
    owner_id: int
    owner_email: str
    conversation_count: int = 0
    member_count: int = 0
    my_role: ProjectRole
    created_at: datetime
    updated_at: datetime


class ProjectDetail(BaseModel):
    """Project view: header + members + chats. The chat objects are the
    same ``ConversationSummary`` shape the sidebar uses so the frontend
    doesn't need a second mapper."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: Optional[str] = None
    owner_id: int
    owner_email: str
    my_role: ProjectRole
    created_at: datetime
    updated_at: datetime
    members: list[ProjectMemberOut] = Field(default_factory=list)
    conversations: list[ConversationSummary] = Field(default_factory=list)


class ProjectListResponse(BaseModel):
    projects: list[ProjectSummary]


# ── Mutations ──────────────────────────────────────────────────────────────


class CreateProjectRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)


class UpdateProjectRequest(BaseModel):
    """All fields optional — PATCH semantics. At least one should be set;
    enforced at the route layer with a 400 if the payload is empty."""

    model_config = ConfigDict(str_strip_whitespace=True)

    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)


class AddMemberRequest(BaseModel):
    """Add a user to the project. The user must belong to the same tenant
    (enforced server-side by looking up ``user_id`` scoped to
    ``tenant.id``). Owner role is reserved for the project creator —
    requests with ``role="owner"`` are rejected with 400."""

    user_id: int
    role: Literal["editor", "viewer"] = "viewer"


class UpdateMemberRoleRequest(BaseModel):
    role: Literal["editor", "viewer"]


class AttachConversationRequest(BaseModel):
    """Body of ``POST /api/chat/projects/{project_id}/conversations``.

    Exactly one of ``conversation_id`` (attach existing) or ``title``
    (create new) must be provided. Enforced at the service layer."""

    conversation_id: Optional[str] = Field(default=None, min_length=36, max_length=36)
    title: Optional[str] = Field(default=None, max_length=200)


# ── Tenant user picker (for the share dialog) ──────────────────────────────


class TenantUserOut(BaseModel):
    """Minimal shape for the project share picker — id + email only. Does
    NOT include role/applications, since the share dialog only needs
    enough to render an autocomplete and send back a user_id."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str


class TenantUserListResponse(BaseModel):
    users: list[TenantUserOut]
