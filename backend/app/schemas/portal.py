from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class PortalProfile(BaseModel):
    """Lightweight profile summary surfaced on the portal landing page."""

    email: Optional[str] = None
    tenant: Optional[str] = None
    role: Optional[str] = None
    last_login: Optional[datetime] = None


class PortalApplication(BaseModel):
    """Metadata about a workspace tile that the portal promotes."""

    key: str
    label: Optional[str] = None
    desc: Optional[str] = None
    path: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    level: Optional[str] = None
    allowed: bool = True


class PortalSavedItem(BaseModel):
    """User-saved assets (reports, dashboards, saved charts) shown in the portal feed."""

    id: str
    title: str
    summary: Optional[str] = None
    app_key: Optional[str] = None
    path: Optional[str] = None
    saved_at: Optional[datetime] = None
    metadata: Dict[str, str] = Field(default_factory=dict)
    tenant_id: Optional[int] = None
    user_id: Optional[int] = None


class PortalTodo(BaseModel):
    """Assignments or reminders surfaced to the user from across portal apps."""

    id: str
    title: str
    summary: Optional[str] = None
    app_key: Optional[str] = None
    assigned_by: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: Optional[str] = None
    due_at: Optional[datetime] = None
    path: Optional[str] = None
    status: str = "open"
    metadata: Dict[str, str] = Field(default_factory=dict)


class PortalOverview(BaseModel):
    """Canonical payload returned by the `/api/portal/overview` endpoint."""

    profile: PortalProfile = Field(default_factory=PortalProfile)
    applications: List[PortalApplication] = Field(default_factory=list)
    last_saved: List[PortalSavedItem] = Field(default_factory=list)
    todos: List[PortalTodo] = Field(default_factory=list)
