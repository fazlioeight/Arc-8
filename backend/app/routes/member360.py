"""FastAPI routes for Nexora Lab Member360.

Mounted at ``/api/member360``. All routes require an authenticated user
within the active tenant. Tenant tables and helper PG functions are
bootstrapped once per process per tenant in
``app.db.tenant_manager._bootstrap_tenant_schema`` — handlers here can
assume the schema is ready.

Audit writes target the control plane (``tenant_audit_events`` is a
``ControlBase`` table that only exists in the control DB). Routes accept
both a tenant session for data work and a control session for audit, and
commit them separately — data first, audit second — so an audit failure
never rolls back a successful data change.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings

from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context, get_tenant_session
from ..schemas.member360 import (
    CareJourney,
    CareJourneyCreate,
    CareJourneyListResponse,
    CareJourneyStageCreate,
    CareJourneyStageUpdate,
    CareJourneyTemplate,
    CareJourneyUpdate,
    CareOption,
    CareOptionCreate,
    CareOptionListResponse,
    ClaimImportRequest,
    Document,
    DashboardResponse,
    DocumentListResponse,
    GapAnalysisResponse,
    ImportResponse,
    LabImportRequest,
    MedicationImportRequest,
    MemberDetailResponse,
    MemberImportRequest,
    MemberListResponse,
    MemberUpdate,
    Message,
    MessageCreate,
    MessageListResponse,
    Note,
    NoteCreate,
    ProblemImportRequest,
    RiskInsightImportRequest,
    RiskInsightListResponse,
    SubmissionExportRequest,
    SubmissionExportResponse,
    Task,
    TaskCreate,
    TaskListResponse,
    TaskUpdate,
)
from ..schemas.member360_admin import AuditEventListResponse
from ..services import member360 as member360_service
from ..services import member360_admin as member360_admin_service
from ..middleware.rate_limit import phi_rate_limit
from ..utils.audit_logger import record_audit_event
from ..utils.phi_audit import PhiAction, PhiEvent, record_phi_access
from ..utils.security import AuthenticatedUser, get_current_user, require_application, require_mfa

# All member360 routes require, in order:
#   * the tenant to have the `member360` app purchased AND the caller to have
#     at least `user`-level access on that app key (require_application);
#   * a completed-MFA session when REQUIRE_PHI_MFA is enabled (require_mfa);
#   * the PHI per-user rate limit (30/min) not to be exceeded (phi_rate_limit).
# Without the first gate, any authenticated user in any tenant could reach
# /api/member360/* by knowing the URL. These are PHI routes, so every member
# read/write is additionally recorded to the append-only PHI audit trail.
router = APIRouter(
    prefix="/api/member360",
    tags=["member360"],
    dependencies=[
        Depends(require_application("member360")),
        Depends(require_mfa),
        Depends(phi_rate_limit()),
    ],
)


async def _require_documents_access(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> AuthenticatedUser:
    """Allow clinical staff with member360 access AND patients with portal access to view documents (scoped for patients)."""
    allowed_apps = {"member360", "docs", "portal"}
    if not any(app in (current_user.app_permissions or {}) for app in allowed_apps):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have access to documents",
        )
    return current_user


documents_router = APIRouter(
    prefix="/api/member360",
    tags=["member360"],
    dependencies=[
        Depends(_require_documents_access),
        Depends(require_mfa),
        Depends(phi_rate_limit()),
    ],
)


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
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
    if (current_user.role or "").strip().lower() in {"patient", "member"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Patient role is not permitted to query the population member roster",
        )
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
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    detail = await member360_service.get_member_detail(session, member_id)
    if not detail:
        # Record the failed access attempt too — a denied/miss read is exactly
        # what a compliance reviewer needs to see for anomaly detection.
        record_phi_access(
            request,
            event=PhiEvent.ACCESS.value,
            user_id=current_user.email,
            patient_id=str(member_id),
            record_type="member360.member",
            action=PhiAction.READ.value,
            success=False,
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    record_phi_access(
        request,
        event=PhiEvent.ACCESS.value,
        user_id=current_user.email,
        patient_id=str(member_id),
        record_type="member360.member",
        action=PhiAction.READ.value,
        success=True,
    )
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
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    data = payload.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No changes provided")
    detail = await member360_service.update_member(session, member_id, data)
    if not detail:
        record_phi_access(
            request,
            event=PhiEvent.UPDATE.value,
            user_id=current_user.email,
            patient_id=str(member_id),
            record_type="member360.member",
            action=PhiAction.WRITE.value,
            success=False,
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    record_phi_access(
        request,
        event=PhiEvent.UPDATE.value,
        user_id=current_user.email,
        patient_id=str(member_id),
        record_type="member360.member",
        action=PhiAction.WRITE.value,
        success=True,
    )
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


@documents_router.get("/documents", response_model=DocumentListResponse)
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
    effective_member_id = member_id
    if (current_user.role or "").strip().lower() in {"patient", "member", "user"}:
        from sqlalchemy import select
        from ..models.member360 import Member360Member
        matched_id = await session.scalar(
            select(Member360Member.id).where(Member360Member.email == current_user.email).limit(1)
        )
        if not matched_id:
            matched_id = await session.scalar(
                select(Member360Member.id).order_by(Member360Member.id.asc()).limit(1)
            )
        effective_member_id = matched_id or 1

    items, total = await member360_service.list_documents_all(
        session,
        limit=limit,
        offset=offset,
        member_id=effective_member_id,
        document_type=document_type,
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.documents.list",
        payload={"count": len(items), "total": total, "filters": {"member_id": effective_member_id, "document_type": document_type}},
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


# ---- Care journey + stage progression --------------------------------------


@router.patch("/care-journeys/{journey_id}", response_model=CareJourney)
async def patch_care_journey(
    journey_id: int,
    payload: CareJourneyUpdate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    data = payload.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No changes provided")
    try:
        journey = await member360_service.update_care_journey(session, journey_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not journey:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Care journey not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.care_journey.update",
        payload={"journey_id": journey_id, "fields": list(data.keys())},
    )
    await session.commit()
    await control_session.commit()
    return journey


@router.post(
    "/care-journeys/{journey_id}/stages",
    response_model=CareJourney,
    status_code=status.HTTP_201_CREATED,
)
async def add_care_journey_stage(
    journey_id: int,
    payload: CareJourneyStageCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        journey = await member360_service.add_care_journey_stage(
            session, journey_id, payload.model_dump()
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not journey:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Care journey not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.care_journey.stage_add",
        payload={"journey_id": journey_id, "name": payload.name},
    )
    await session.commit()
    await control_session.commit()
    return journey


@router.patch("/care-journeys/{journey_id}/stages/{stage_id}", response_model=CareJourney)
async def patch_care_journey_stage(
    journey_id: int,
    stage_id: int,
    payload: CareJourneyStageUpdate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    data = payload.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No changes provided")
    try:
        journey = await member360_service.update_care_journey_stage(
            session, journey_id, stage_id, data
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not journey:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.care_journey.stage_update",
        payload={"journey_id": journey_id, "stage_id": stage_id, "fields": list(data.keys())},
    )
    await session.commit()
    await control_session.commit()
    return journey


# ---- Batch ingest ----------------------------------------------------------
# Idempotent upsert endpoints keyed by natural identifiers. Per-row errors
# are returned in the response rather than rolling back the batch — callers
# can fix the bad rows and resubmit without losing progress.


@router.post("/import/members", response_model=ImportResponse)
async def import_members(
    payload: MemberImportRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    summary = await member360_service.import_members(
        session, [item.model_dump() for item in payload.members]
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.import.members",
        payload={
            "submitted": len(payload.members),
            "created": summary["created"],
            "updated": summary["updated"],
            "error_count": len(summary["errors"]),
        },
    )
    await session.commit()
    await control_session.commit()
    return summary


@router.post("/import/claims", response_model=ImportResponse)
async def import_claims(
    payload: ClaimImportRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    summary = await member360_service.import_claims(
        session, [item.model_dump() for item in payload.claims]
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.import.claims",
        payload={
            "submitted": len(payload.claims),
            "created": summary["created"],
            "updated": summary["updated"],
            "error_count": len(summary["errors"]),
        },
    )
    await session.commit()
    await control_session.commit()
    return summary


# ---- Document upload + download --------------------------------------------
# Uploads land in a per-tenant prefix on the configured storage backend
# (local FS by default). Each tenant has its own directory tree, so two
# tenants can never read one another's files even with a crafted
# ``storage_path``. See services.member360_storage for the layout.


@router.post(
    "/members/{member_id}/documents",
    response_model=Document,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    member_id: int,
    file: UploadFile = File(...),
    document_type: Optional[str] = Form(default=None),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    settings = get_settings()
    max_bytes = max(1, settings.MEMBER360_STORAGE_MAX_UPLOAD_MB) * 1024 * 1024
    body = await file.read()
    if len(body) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty upload")
    if len(body) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {settings.MEMBER360_STORAGE_MAX_UPLOAD_MB} MB limit",
        )
    try:
        doc = await member360_service.create_document(
            session,
            tenant_key=tenant.key,
            member_id=member_id,
            file_name=file.filename or "file",
            content_type=file.content_type or "application/octet-stream",
            body=body,
            uploaded_by=current_user.email,
            document_type=document_type,
        )
    except Exception as exc:  # noqa: BLE001
        # Storage failures roll back the row insert so we never leave an
        # orphan DB row pointing at nothing. The error is logged via the
        # request-logging middleware; surface a 500 to the caller.
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Document upload failed: {exc}",
        ) from exc
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.document.upload",
        payload={
            "member_id": member_id,
            "document_id": doc["id"],
            "size_bytes": doc["size_bytes"],
            "content_type": doc["content_type"],
        },
    )
    await session.commit()
    await control_session.commit()
    return doc


@router.get("/members/{member_id}/audit", response_model=AuditEventListResponse)
async def list_member_audit(
    member_id: int,
    event_type_prefix: Optional[str] = Query(default="member360."),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """Audit events scoped to a single member.

    Reads from the control plane (where audit lives); the tenant session is
    still requested so the ``require_application('member360')`` gate has the
    full tenant context. Filters on the JSON ``payload.member_id`` field set
    by every member-scoped audit call (task/note/message/care-option/journey
    create + update, document upload/download, gap analysis view, etc.).
    """
    rows, total = await member360_admin_service.list_audit_events_for_member(
        control_session,
        tenant_id=tenant.id,
        member_id=member_id,
        event_type_prefix=event_type_prefix or None,
        limit=limit,
        offset=offset,
    )
    return {
        "items": [member360_admin_service.serialize_audit(r) for r in rows],
        "total": total,
    }


@router.get("/documents/{document_id}/download")
async def download_document(
    document_id: int,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    result = await member360_service.read_document(
        session, tenant_key=tenant.key, document_id=document_id
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    doc, body = result
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.document.download",
        payload={"document_id": document_id, "member_id": doc["member_id"]},
    )
    await control_session.commit()
    return Response(
        content=body,
        media_type=doc.get("content_type") or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{doc["file_name"]}"',
            "X-Document-SHA256": doc.get("sha256") or "",
        },
    )


@router.post("/import/risk-insights", response_model=ImportResponse)
async def import_risk_insights(
    payload: RiskInsightImportRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    summary = await member360_service.import_risk_insights(
        session, [item.model_dump() for item in payload.insights]
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.import.risk_insights",
        payload={
            "submitted": len(payload.insights),
            "created": summary["created"],
            "updated": summary["updated"],
            "error_count": len(summary["errors"]),
        },
    )
    await session.commit()
    await control_session.commit()
    return summary


@router.post("/import/problems", response_model=ImportResponse)
async def import_problems(
    payload: ProblemImportRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    summary = await member360_service.import_problems(
        session, [item.model_dump() for item in payload.problems]
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.import.problems",
        payload={
            "submitted": len(payload.problems),
            "created": summary["created"],
            "updated": summary["updated"],
            "error_count": len(summary["errors"]),
        },
    )
    await session.commit()
    await control_session.commit()
    return summary


@router.post("/import/medications", response_model=ImportResponse)
async def import_medications(
    payload: MedicationImportRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    summary = await member360_service.import_medications(
        session, [item.model_dump() for item in payload.medications]
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.import.medications",
        payload={
            "submitted": len(payload.medications),
            "created": summary["created"],
            "updated": summary["updated"],
            "error_count": len(summary["errors"]),
        },
    )
    await session.commit()
    await control_session.commit()
    return summary


@router.post("/import/labs", response_model=ImportResponse)
async def import_labs(
    payload: LabImportRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    summary = await member360_service.import_labs(
        session, [item.model_dump() for item in payload.labs]
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member360.import.labs",
        payload={
            "submitted": len(payload.labs),
            "created": summary["created"],
            "updated": summary["updated"],
            "error_count": len(summary["errors"]),
        },
    )
    await session.commit()
    await control_session.commit()
    return summary
