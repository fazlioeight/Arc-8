"""FastAPI routes for Nexora Lab Member360.

Mounted at ``/api/member360``. All routes require an authenticated user
within the active tenant. Tables are auto-seeded on first use.

Audit writes target the control plane (``tenant_audit_events`` is a
``ControlBase`` table that only exists in the control DB). Routes accept
both a tenant session for data work and a control session for audit, and
commit them separately — data first, audit second — so an audit failure
never rolls back a successful data change.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context, get_tenant_session
from ..schemas.member360 import (
    CareOption,
    CareOptionCreate,
    CareJourneyTemplate,
    DashboardResponse,
    MemberDetailResponse,
    MemberListResponse,
    Message,
    MessageCreate,
    Note,
    NoteCreate,
    Task,
    TaskCreate,
    TaskUpdate,
)
from ..services import member360 as member360_service
from ..utils.audit_logger import record_audit_event
from ..utils.security import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/api/member360", tags=["member360"])


async def _ensure(session: AsyncSession) -> None:
    await member360_service.ensure_seeded(session)


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    payload = await member360_service.build_dashboard(session)
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.dashboard.view",
        payload={},
    )
    await session.commit()
    await control_session.commit()
    return payload


@router.get("/members", response_model=MemberListResponse)
async def list_members(
    search: Optional[str] = Query(default=None),
    risk_tier: Optional[list[str]] = Query(default=None),
    has_active_journey: Optional[bool] = Query(default=None),
    has_open_task: Optional[bool] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    items, total = await member360_service.list_members(
        session,
        search=search,
        risk_tier=risk_tier,
        has_active_journey=has_active_journey,
        has_open_task=has_open_task,
        limit=limit,
        offset=offset,
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.members.list",
        payload={"count": len(items), "search": search or ""},
    )
    await session.commit()
    await control_session.commit()
    return {"items": items, "total": total}


@router.get("/members/{member_id}", response_model=MemberDetailResponse)
async def get_member(
    member_id: int,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    detail = await member360_service.get_member_detail(session, member_id)
    if not detail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.member.detail",
        payload={"member_id": member_id},
    )
    await session.commit()
    await control_session.commit()
    return detail


@router.post("/tasks", response_model=Task, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    try:
        task = await member360_service.create_task(session, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.task.create",
        payload={"task_id": task["id"], "member_id": task["member_id"]},
    )
    await session.commit()
    await control_session.commit()
    return task


@router.patch("/tasks/{task_id}", response_model=Task)
async def update_task(
    task_id: int,
    payload: TaskUpdate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    data = payload.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No changes provided")
    task = await member360_service.update_task(session, task_id, data)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.task.update",
        payload={"task_id": task_id, "fields": list(data.keys())},
    )
    await session.commit()
    await control_session.commit()
    return task


@router.post("/members/{member_id}/notes", response_model=Note, status_code=status.HTTP_201_CREATED)
async def create_note(
    member_id: int,
    payload: NoteCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    note = await member360_service.create_note(
        session,
        member_id=member_id,
        author_email=current_user.email,
        author_name=current_user.email,
        payload=payload.model_dump(),
    )
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.note.create",
        payload={"member_id": member_id, "note_id": note["id"]},
    )
    await session.commit()
    await control_session.commit()
    return note


@router.post("/members/{member_id}/messages", response_model=Message, status_code=status.HTTP_201_CREATED)
async def create_message(
    member_id: int,
    payload: MessageCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    message = await member360_service.create_message(
        session, member_id=member_id, sender=current_user.email, payload=payload.model_dump()
    )
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.message.create",
        payload={"member_id": member_id, "channel": message["channel"]},
    )
    await session.commit()
    await control_session.commit()
    return message


@router.post("/care-options", response_model=CareOption, status_code=status.HTTP_201_CREATED)
async def create_care_option(
    payload: CareOptionCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    result = await member360_service.create_care_option(session, payload.model_dump())
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.care_option.create",
        payload={"member_id": payload.member_id, "service_type": payload.service_type},
    )
    await session.commit()
    await control_session.commit()
    return result


@router.get("/care-journey-templates", response_model=list[CareJourneyTemplate])
async def list_templates(
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    return await member360_service.list_care_journey_templates(session)
