from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context
from ..models.tables import PortalSavedItem as PortalSavedItemModel
from ..models.tables import PortalTodo as PortalTodoModel
from ..models.tables import User
from ..schemas.portal import (
    PortalApplication,
    PortalOverview,
    PortalProfile,
    PortalSavedItem,
    PortalTodo,
)
from ..utils.security import AuthenticatedUser, get_current_user, tenant_application_keys

router = APIRouter(prefix="/api/portal", tags=["portal"])

_APP_PRESENTATION = {
    "portal": {"path": "/portal", "icon": "OV", "color": "#0ea5e9"},
    "coding": {"path": "/coding", "icon": "CD", "color": "#0f172a"},
    "member360": {"path": "/member-360", "icon": "M3", "color": "#0891b2"},
    "ride_booking": {"path": "/ride-booking", "icon": "RB", "color": "#2563eb"},
    "dashboard": {"path": "/dashboard", "icon": "DB", "color": "#4f46e5"},
    "job_center": {"path": "/jobs/status-center", "icon": "JI", "color": "#0d9488"},
    "docs": {"path": "/docs", "icon": "DL", "color": "#6366f1"},
    "settings": {"path": "/settings", "icon": "ST", "color": "#64748b"},
    "admin_console": {"path": "/admin/master", "icon": "MA", "color": "#dc2626"},
}


def _serialize_saved(item: PortalSavedItemModel) -> PortalSavedItem:
    return PortalSavedItem(
        id=str(item.id),
        tenant_id=item.tenant_id,
        user_id=item.user_id,
        title=item.title,
        summary=item.summary,
        app_key=item.app_key,
        path=item.path,
        saved_at=item.saved_at,
        metadata=dict(item.item_metadata or {}),
    )


def _serialize_todo(item: PortalTodoModel) -> PortalTodo:
    return PortalTodo(
        id=str(item.id),
        title=item.title,
        summary=item.summary,
        app_key=item.app_key,
        assigned_by=item.assigned_by,
        assigned_to=item.assigned_to,
        priority=item.priority,
        due_at=item.due_at,
        path=item.path,
        status=item.status,
        metadata=dict(item.item_metadata or {}),
    )


def _build_applications(tenant: TenantContext, current_user: AuthenticatedUser) -> list[PortalApplication]:
    available_keys = tenant_application_keys(tenant)
    apps: list[PortalApplication] = []
    for key, meta in settings.PORTAL_APPLICATIONS.items():
        if key not in available_keys:
            continue
        presentation = _APP_PRESENTATION.get(key, {})
        level = current_user.app_permissions.get(key)
        allowed = key == "portal" or bool(level)
        if key == "admin_console":
            allowed = level == "admin"
        apps.append(
            PortalApplication(
                key=key,
                label=meta.get("label", key),
                desc=meta.get("description"),
                path=presentation.get("path", "/"),
                icon=presentation.get("icon", key[:2].upper()),
                color=presentation.get("color", "#0f172a"),
                level=level,
                allowed=allowed,
            )
        )
    apps.sort(key=lambda app: (not app.allowed, (app.label or app.key).lower()))
    return apps


@router.get("/overview", response_model=PortalOverview)
async def get_portal_overview(
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> PortalOverview:
    user = await session.get(User, current_user.id)
    saved_stmt = (
        select(PortalSavedItemModel)
        .where(
            PortalSavedItemModel.tenant_id == tenant.id,
            or_(PortalSavedItemModel.user_id == current_user.id, PortalSavedItemModel.user_id.is_(None)),
        )
        .order_by(PortalSavedItemModel.saved_at.desc())
        .limit(8)
    )
    todos_stmt = (
        select(PortalTodoModel)
        .where(
            PortalTodoModel.tenant_id == tenant.id,
            PortalTodoModel.status == "open",
            or_(
                PortalTodoModel.assigned_to == current_user.email,
                PortalTodoModel.assigned_to.is_(None),
            ),
        )
        .order_by(PortalTodoModel.due_at.is_(None), PortalTodoModel.due_at.asc())
        .limit(8)
    )
    saved_items = list((await session.scalars(saved_stmt)).all())
    todos = list((await session.scalars(todos_stmt)).all())

    return PortalOverview(
        profile=PortalProfile(
            email=current_user.email,
            tenant=tenant.key,
            role=current_user.role,
            last_login=user.last_login_at if user and user.last_login_at else datetime.now(timezone.utc),
        ),
        applications=_build_applications(tenant, current_user),
        last_saved=[_serialize_saved(item) for item in saved_items],
        todos=[_serialize_todo(item) for item in todos],
    )
