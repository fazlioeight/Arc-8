from __future__ import annotations

import logging
from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext, tenant_connection_manager
from ..dependencies.tenant import get_tenant_context
from ..models.coding import CodingMember, CodingMemberChase
from ..models.member360 import Member360Member, Member360Task
from ..models.ride_booking import RideBooking, RideReconciliationItem
from ..models.tables import DataImportJob
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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/portal", tags=["portal"])

_PORTAL_TODOS_LIMIT = 25
_PER_APP_TODO_LIMIT = 8


def _to_aware_utc(value: datetime | date | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.combine(value, time.min, tzinfo=timezone.utc)


_PRIORITY_RANK = {"high": 0, "medium": 1, "normal": 2, "low": 3}


def _priority_rank(priority: str | None) -> int:
    return _PRIORITY_RANK.get((priority or "low").lower(), 99)

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


async def _fetch_member360_todos(
    tenant: TenantContext, current_user: AuthenticatedUser
) -> list[PortalTodo]:
    todos: list[PortalTodo] = []
    try:
        async with tenant_connection_manager.get_session(tenant) as session:
            stmt = (
                select(Member360Task, Member360Member)
                .join(Member360Member, Member360Task.member_id == Member360Member.id)
                .where(Member360Task.status != "completed")
                .where(
                    or_(
                        Member360Task.assigned_user == current_user.email,
                        Member360Task.assigned_user.is_(None),
                    )
                )
                .order_by(Member360Task.due_date.asc().nullslast(), Member360Task.id.desc())
                .limit(_PER_APP_TODO_LIMIT)
            )
            rows = (await session.execute(stmt)).all()
    except Exception:  # noqa: BLE001
        logger.exception("portal.todos.member360_fetch_failed", extra={"tenant_key": tenant.key})
        return todos

    for task, member in rows:
        member_label = " ".join(
            part for part in (member.first_name, member.last_name) if part
        ).strip() or member.member_key
        todos.append(
            PortalTodo(
                id=f"member360-task-{task.id}",
                title=task.title,
                summary=task.description,
                app_key="member360",
                assigned_by=task.assigned_queue,
                assigned_to=task.assigned_user,
                priority=task.priority or "medium",
                due_at=_to_aware_utc(task.due_date),
                path=f"/member360/members/{member.id}",
                status=task.status or "open",
                metadata={"member": member_label} if member_label else {},
            )
        )
    return todos


async def _fetch_coding_todos(
    tenant: TenantContext, current_user: AuthenticatedUser
) -> list[PortalTodo]:
    todos: list[PortalTodo] = []
    try:
        async with tenant_connection_manager.get_session(tenant) as session:
            stmt = (
                select(CodingMemberChase, CodingMember)
                .join(CodingMember, CodingMemberChase.member_id == CodingMember.id)
                .where(CodingMemberChase.status == "open")
                .where(CodingMemberChase.assigned_coder_email == current_user.email)
                .order_by(CodingMemberChase.due_date.asc().nullslast(), CodingMemberChase.id.desc())
                .limit(_PER_APP_TODO_LIMIT)
            )
            rows = (await session.execute(stmt)).all()
    except Exception:  # noqa: BLE001
        logger.exception("portal.todos.coding_fetch_failed", extra={"tenant_key": tenant.key})
        return todos

    for chase, member in rows:
        member_label = " ".join(
            part for part in (member.first_name, member.last_name) if part
        ).strip() or member.member_key
        title = f"Review {chase.chase_code} for {member_label}".strip()
        todos.append(
            PortalTodo(
                id=f"coding-chase-{chase.id}",
                title=title,
                summary=chase.notes,
                app_key="coding",
                assigned_to=chase.assigned_coder_email,
                priority=chase.priority or "normal",
                due_at=_to_aware_utc(chase.due_date),
                path=f"/coding/chases/{chase.id}",
                status=chase.status or "open",
                metadata={
                    **({"icd10": chase.icd10_code} if chase.icd10_code else {}),
                    **({"hcc": chase.hcc_code} if chase.hcc_code else {}),
                },
            )
        )
    return todos


async def _fetch_ride_booking_todos(tenant: TenantContext) -> list[PortalTodo]:
    todos: list[PortalTodo] = []
    try:
        async with tenant_connection_manager.get_session(tenant) as session:
            recon_stmt = (
                select(RideReconciliationItem)
                .where(RideReconciliationItem.status == "open")
                .order_by(RideReconciliationItem.created_at.desc())
                .limit(_PER_APP_TODO_LIMIT)
            )
            recon_items = list((await session.scalars(recon_stmt)).all())

            booking_stmt = (
                select(RideBooking)
                .where(RideBooking.status.in_(("queued", "needs_review")))
                .order_by(RideBooking.scheduled_pickup.asc())
                .limit(_PER_APP_TODO_LIMIT)
            )
            bookings = list((await session.scalars(booking_stmt)).all())
    except Exception:  # noqa: BLE001
        logger.exception("portal.todos.ride_booking_fetch_failed", extra={"tenant_key": tenant.key})
        return todos

    for item in recon_items:
        todos.append(
            PortalTodo(
                id=f"ride-recon-{item.id}",
                title=item.title,
                summary=item.detail,
                app_key="ride_booking",
                priority=item.priority or "medium",
                due_at=_to_aware_utc(item.created_at),
                path="/ride-booking",
                status=item.status or "open",
            )
        )
    for booking in bookings:
        rider = f"{booking.first_name} {booking.last_name}".strip()
        title = f"Confirm ride for {rider}".strip() if rider else "Confirm ride"
        todos.append(
            PortalTodo(
                id=f"ride-booking-{booking.id}",
                title=title,
                summary=f"{booking.pickup} → {booking.dropoff}",
                app_key="ride_booking",
                priority="medium",
                due_at=_to_aware_utc(booking.scheduled_pickup),
                path="/ride-booking",
                status=booking.status or "queued",
                metadata={"member_id": booking.member_id} if booking.member_id else {},
            )
        )
    return todos


async def _fetch_job_center_todos(
    session: AsyncSession, tenant: TenantContext, current_user: AuthenticatedUser
) -> list[PortalTodo]:
    todos: list[PortalTodo] = []
    try:
        stmt = (
            select(DataImportJob)
            .where(DataImportJob.tenant_id == tenant.id)
            .where(DataImportJob.status.in_(("failed", "needs_attention")))
            .where(
                or_(
                    DataImportJob.initiated_by == current_user.email,
                    DataImportJob.initiated_by.is_(None),
                )
            )
            .order_by(DataImportJob.updated_at.desc())
            .limit(_PER_APP_TODO_LIMIT)
        )
        jobs = list((await session.scalars(stmt)).all())
    except Exception:  # noqa: BLE001
        logger.exception("portal.todos.job_center_fetch_failed", extra={"tenant_key": tenant.key})
        return todos

    for job in jobs:
        title = f"Retry job: {job.name}" if job.status == "failed" else f"Review job: {job.name}"
        todos.append(
            PortalTodo(
                id=f"job-{job.id}",
                title=title,
                summary=job.error,
                app_key="job_center",
                priority="high" if job.status == "failed" else "medium",
                due_at=_to_aware_utc(job.updated_at),
                path="/jobs/status-center",
                status=job.status,
                metadata={"source_type": job.source_type} if job.source_type else {},
            )
        )
    return todos


def _sort_todos(todos: list[PortalTodo]) -> list[PortalTodo]:
    far_future = datetime.max.replace(tzinfo=timezone.utc)
    return sorted(
        todos,
        key=lambda t: (
            _priority_rank(t.priority),
            _to_aware_utc(t.due_at) or far_future,
        ),
    )


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
    portal_todos_stmt = (
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
        .limit(_PER_APP_TODO_LIMIT)
    )
    saved_items = list((await session.scalars(saved_stmt)).all())
    portal_todos = list((await session.scalars(portal_todos_stmt)).all())

    available_apps = tenant_application_keys(tenant)
    user_apps = set(current_user.app_permissions.keys())

    aggregated: list[PortalTodo] = [_serialize_todo(item) for item in portal_todos]

    if "member360" in available_apps and "member360" in user_apps:
        aggregated.extend(await _fetch_member360_todos(tenant, current_user))
    if "coding" in available_apps and "coding" in user_apps:
        aggregated.extend(await _fetch_coding_todos(tenant, current_user))
    if "ride_booking" in available_apps and "ride_booking" in user_apps:
        aggregated.extend(await _fetch_ride_booking_todos(tenant))
    if "job_center" in available_apps and "job_center" in user_apps:
        aggregated.extend(await _fetch_job_center_todos(session, tenant, current_user))

    return PortalOverview(
        profile=PortalProfile(
            email=current_user.email,
            tenant=tenant.key,
            role=current_user.role,
            last_login=user.last_login_at if user and user.last_login_at else datetime.now(timezone.utc),
        ),
        applications=_build_applications(tenant, current_user),
        last_saved=[_serialize_saved(item) for item in saved_items],
        todos=_sort_todos(aggregated)[:_PORTAL_TODOS_LIMIT],
    )
