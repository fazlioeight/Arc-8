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
    CareJourney,
    CareJourneyCreate,
    CareJourneyListResponse,
    CareJourneyTemplate,
    CareOption,
    CareOptionCreate,
    CareOptionListResponse,
    DashboardResponse,
    DocumentListResponse,
    GapAnalysisResponse,
    MemberDetailResponse,
    MemberListResponse,
    MemberUpdate,
    Message,
    MessageCreate,
    MessageListResponse,
    Note,
    NoteCreate,
    RiskInsightListResponse,
    SubmissionExportRequest,
    SubmissionExportResponse,
    Task,
    TaskCreate,
    TaskListResponse,
    TaskUpdate,
)
from ..services import member360 as member360_service
from ..utils.audit_logger import record_audit_event
from ..utils.security import AuthenticatedUser, get_current_user, require_application

# All member360 routes require the tenant to have the `member360` app
# purchased AND the calling user to have at least `user`-level access
# on that app key. Matches the gating pattern used by routes/coding.py.
# Without this gate, any authenticated user in any tenant could reach
# /api/member360/* by knowing the URL.
router = APIRouter(
    prefix="/api/member360",
    tags=["member360"],
    dependencies=[Depends(require_application("member360"))],
)


async def _ensure(session: AsyncSession) -> None:
    await member360_service.ensure_ready(session)


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


@router.patch("/members/{member_id}", response_model=MemberDetailResponse)
async def update_member(
    member_id: int,
    payload: MemberUpdate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    data = payload.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No changes provided")
    detail = await member360_service.update_member(session, member_id, data)
    if not detail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.member.update",
        payload={"member_id": member_id, "fields": list(data.keys())},
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


@router.post("/care-journeys", response_model=CareJourney, status_code=status.HTTP_201_CREATED)
async def create_care_journey(
    payload: CareJourneyCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    try:
        journey = await member360_service.create_care_journey(
            session,
            payload.model_dump(),
            created_by=current_user.email,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not journey:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.care_journey.create",
        payload={
            "member_id": journey["member_id"],
            "journey_id": journey["id"],
            "template_id": payload.template_id,
        },
    )
    await session.commit()
    await control_session.commit()
    return journey


@router.get("/care-journey-templates", response_model=list[CareJourneyTemplate])
async def list_templates(
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    return await member360_service.list_care_journey_templates(session)


@router.get("/members/{member_id}/gaps", response_model=GapAnalysisResponse)
async def get_member_gap_analysis(
    member_id: int,
    submission_year: Optional[int] = Query(default=None, ge=2000, le=2100),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    result = await member360_service.build_gap_analysis(session, member_id, submission_year)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.gaps.view",
        payload={
            "member_id": member_id,
            "submission_year": result["submission_year"],
            "missing_hcc_count": len(result["missing_hcc"]),
        },
    )
    await session.commit()
    await control_session.commit()
    return result


@router.post("/submissions/export", response_model=SubmissionExportResponse)
async def export_submission(
    payload: SubmissionExportRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    result = await member360_service.generate_submission_export(
        session,
        submission_year=payload.submission_year,
        member_ids=payload.member_ids,
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.submission.export",
        payload={
            "submission_year": result["submission_year"],
            "record_count": result["record_count"],
            "member_ids": payload.member_ids or [],
        },
    )
    await session.commit()
    await control_session.commit()
    return result


# ---- Aggregate (multi-member) list endpoints --------------------------------
#
# Each endpoint returns a flat, paginated list across all members in the
# tenant. Rows include denormalized member fields (name, key, risk tier, plan,
# preferred channel) so list pages don't need to fan out per member. These
# replace the client-side `fetchMember360All*` fan-out helpers that capped
# silently at 500 members.


@router.get("/tasks", response_model=TaskListResponse)
async def list_tasks(
    member_id: Optional[int] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    priority: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    items, total = await member360_service.list_tasks(
        session,
        limit=limit,
        offset=offset,
        member_id=member_id,
        status=status_filter,
        priority=priority,
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.tasks.list",
        payload={"count": len(items), "total": total, "filters": {"member_id": member_id, "status": status_filter, "priority": priority}},
    )
    await session.commit()
    await control_session.commit()
    return {"items": items, "total": total}


@router.get("/messages", response_model=MessageListResponse)
async def list_messages(
    member_id: Optional[int] = Query(default=None),
    channel: Optional[str] = Query(default=None),
    direction: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    items, total = await member360_service.list_messages(
        session,
        limit=limit,
        offset=offset,
        member_id=member_id,
        channel=channel,
        direction=direction,
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.messages.list",
        payload={"count": len(items), "total": total, "filters": {"member_id": member_id, "channel": channel, "direction": direction}},
    )
    await session.commit()
    await control_session.commit()
    return {"items": items, "total": total}


@router.get("/care-options", response_model=CareOptionListResponse)
async def list_care_options(
    member_id: Optional[int] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    items, total = await member360_service.list_care_options_all(
        session,
        limit=limit,
        offset=offset,
        member_id=member_id,
        status=status_filter,
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.care_options.list",
        payload={"count": len(items), "total": total, "filters": {"member_id": member_id, "status": status_filter}},
    )
    await session.commit()
    await control_session.commit()
    return {"items": items, "total": total}


@router.get("/documents", response_model=DocumentListResponse)
async def list_documents(
    member_id: Optional[int] = Query(default=None),
    document_type: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    items, total = await member360_service.list_documents_all(
        session,
        limit=limit,
        offset=offset,
        member_id=member_id,
        document_type=document_type,
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.documents.list",
        payload={"count": len(items), "total": total, "filters": {"member_id": member_id, "document_type": document_type}},
    )
    await session.commit()
    await control_session.commit()
    return {"items": items, "total": total}


@router.get("/care-journeys", response_model=CareJourneyListResponse)
async def list_care_journeys(
    member_id: Optional[int] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    items, total = await member360_service.list_care_journeys_all(
        session,
        limit=limit,
        offset=offset,
        member_id=member_id,
        status=status_filter,
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.care_journeys.list",
        payload={"count": len(items), "total": total, "filters": {"member_id": member_id, "status": status_filter}},
    )
    await session.commit()
    await control_session.commit()
    return {"items": items, "total": total}


@router.get("/risk-insights", response_model=RiskInsightListResponse)
async def list_risk_insights(
    member_id: Optional[int] = Query(default=None),
    domain: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    await _ensure(session)
    items, total = await member360_service.list_risk_insights_all(
        session,
        limit=limit,
        offset=offset,
        member_id=member_id,
        domain=domain,
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.risk_insights.list",
        payload={"count": len(items), "total": total, "filters": {"member_id": member_id, "domain": domain}},
    )
    await session.commit()
    await control_session.commit()
    return {"items": items, "total": total}
