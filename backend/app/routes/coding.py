from __future__ import annotations

from datetime import date, datetime
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies.tenant import get_tenant_context, get_tenant_session
from ..db.tenant_manager import TenantContext
from ..db.session import get_control_session
from ..schemas.coding import (
    CodingAttachment,
    CodingAttachmentCreate,
    CodingChase,
    CodingChaseCreate,
    CodingChaseUpdate,
    CodingClaimSummary,
    CodingHealthAssessmentDetail,
    CodingMaoRecord,
    CodingMemberCreate,
    CodingMemberDetail,
    CodingMemberDetailResponse,
    CodingMemberEligibility,
    CodingMemberSearchResponse,
    CodingMemberSummary,
    CodingMemberPriorityView,
    CodingMemberGapResponse,
    CodingPrioritizedResponse,
    CodingNote,
    CodingNoteCreate,
    CodingProviderDetail,
    CodingProviderSearchResponse,
    CodingProviderSummary,
    CoderSummary,
    CodingAssignmentItem,
    CodingAssignmentOverview,
    CodingAssignmentRequest,
    HealthAssessmentCreate,
    SubmissionGenerateRequest,
    SubmissionGenerateResponse,
)
from ..services import coding_members, mao_analysis, submission_builder
from ..utils.audit_logger import record_audit_event
from ..utils.security import AuthenticatedUser, get_current_user, require_admin, require_application

router = APIRouter(
    prefix="/api/coding",
    tags=["coding"],
    dependencies=[Depends(require_application("coding"))],
)


async def _require_provider_directory_access(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> AuthenticatedUser:
    """Allow clinical, supervisor, coordinator, nurse, coder, and admin roles to query the provider directory."""
    allowed_apps = {"coding", "member360", "providers", "portal"}
    if not any(app in (current_user.app_permissions or {}) for app in allowed_apps):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have access to the provider directory",
        )
    return current_user


providers_router = APIRouter(
    prefix="/api/coding",
    tags=["coding"],
    dependencies=[Depends(_require_provider_directory_access)],
)


def _member_to_summary(member, assignment: Optional[Dict[str, list]] = None) -> CodingMemberSummary:
    assignment = assignment or {}
    return CodingMemberSummary(
        id=member.id,
        member_key=member.member_key,
        first_name=member.first_name,
        last_name=member.last_name,
        status=member.status,
        line_of_business=member.line_of_business,
        risk_score=float(member.risk_score) if member.risk_score is not None else None,
        pcp_name=member.pcp_name,
        pcp_npi=member.pcp_npi,
        assigned_coder_ids=assignment.get("assigned_coder_ids", []),
        assigned_coder_emails=assignment.get("assigned_coder_emails", []),
    )


def _member_to_detail(member, assignment: Optional[Dict[str, list]] = None) -> CodingMemberDetail:
    summary = _member_to_summary(member, assignment=assignment)
    data = summary.model_dump()
    data.update(
        {
            "date_of_birth": member.date_of_birth,
            "gender": member.gender,
            "primary_language": member.primary_language,
            "last_contacted_at": member.last_contacted_at,
            "address_city": member.address_city,
            "address_state": member.address_state,
            "address_zip": member.address_zip,
        }
    )
    return CodingMemberDetail(**data)


def _chase_to_schema(chase) -> CodingChase:
    return CodingChase(
        id=chase.id,
        chase_code=chase.chase_code,
        status=chase.status,
        priority=chase.priority,
        assigned_coder_id=chase.assigned_coder_id,
        assigned_coder_email=chase.assigned_coder_email,
        due_date=chase.due_date,
        service_date_from=chase.service_date_from,
        service_date_to=chase.service_date_to,
        icd10_code=chase.icd10_code,
        hcc_code=chase.hcc_code,
        notes=chase.notes,
        created_at=chase.created_at,
        updated_at=chase.updated_at,
    )


def _extract_assignment_metadata(chases) -> Dict[str, list]:
    coder_ids = set()
    email_map: Dict[str, str] = {}
    for chase in chases:
        status = (chase.status or '').lower()
        if status == 'closed':
            continue
        if chase.assigned_coder_id is not None:
            coder_ids.add(chase.assigned_coder_id)
        email_value = (chase.assigned_coder_email or '').strip()
        if email_value:
            normalized = email_value.lower()
            if normalized not in email_map:
                email_map[normalized] = email_value
    return {
        "assigned_coder_ids": sorted(coder_ids),
        "assigned_coder_emails": sorted(email_map.values()),
    }


def _note_to_schema(note) -> CodingNote:
    return CodingNote(
        id=note.id,
        member_id=note.member_id,
        author_email=note.author_email,
        author_name=note.author_name,
        body=note.body,
        created_at=note.created_at,
    )


def _attachment_to_schema(attachment) -> CodingAttachment:
    return CodingAttachment(
        id=attachment.id,
        member_id=attachment.member_id,
        filename=attachment.filename,
        content_type=attachment.content_type,
        storage_path=attachment.storage_path,
        uploaded_by=attachment.uploaded_by,
        uploaded_at=attachment.uploaded_at,
        is_external=attachment.is_external,
    )


def _provider_to_summary(provider) -> CodingProviderSummary:
    return CodingProviderSummary(
        id=provider.id,
        name=provider.name,
        npi=provider.npi,
        tax_id=provider.tax_id,
        phone=provider.phone,
        email=provider.email,
    )


def _provider_to_detail(provider) -> CodingProviderDetail:
    summary = _provider_to_summary(provider)
    data = summary.model_dump()
    if provider.location:
        data["location"] = {
            "address_line1": provider.location.address_line1,
            "city": provider.location.city,
            "state": provider.location.state,
            "postal_code": provider.location.postal_code,
        }
    return CodingProviderDetail(**data)


def _eligibility_to_schema(eligibility) -> CodingMemberEligibility | None:
    if not eligibility:
        return None
    return CodingMemberEligibility(
        plan_start=eligibility.plan_start,
        plan_end=eligibility.plan_end,
        medicare_effective_date=eligibility.medicare_effective_date,
        joined_at=eligibility.joined_at,
        is_new_to_medicare=eligibility.is_new_to_medicare,
        is_dual_eligible=eligibility.is_dual_eligible,
        risk_tier=eligibility.risk_tier,
        last_synced_at=eligibility.last_synced_at,
    )


def _claim_to_schema(claim) -> CodingClaimSummary:
    return CodingClaimSummary(
        id=claim.id,
        claim_number=claim.claim_number,
        claim_type=claim.claim_type,
        service_date=claim.service_date,
        provider_id=claim.provider_id,
        diagnosis_codes=dict(claim.diagnosis_codes or {}),
        hcc_codes=dict(claim.hcc_codes or {}),
        total_paid=claim.total_paid,
        chart_required=claim.chart_required,
    )


def _mao_record_to_schema(record) -> CodingMaoRecord:
    return CodingMaoRecord(
        id=record.id,
        submission_year=record.submission_year,
        hcc_code=record.hcc_code,
        icd10_code=record.icd10_code,
        service_start=record.service_start,
        service_end=record.service_end,
        status=record.status,
    )


def _assessment_to_schema(assessment) -> CodingHealthAssessmentDetail:
    return CodingHealthAssessmentDetail(
        id=assessment.id,
        assessment_date=assessment.assessment_date,
        assessment_type=assessment.assessment_type,
        provider_id=assessment.provider_id,
        icd10_codes=list(assessment.icd10_codes or []),
        hcc_codes=list(assessment.hcc_codes or []),
        completion_status=assessment.completion_status,
        notes=assessment.notes,
    )


def _priority_to_view(member, priority) -> CodingMemberPriorityView:
    return CodingMemberPriorityView(
        member_id=member.id,
        member_key=member.member_key,
        priority_score=priority.priority_score,
        priority_tier=priority.priority_tier,
        hcc_opportunity_count=priority.hcc_opportunity_count,
        next_action=priority.next_action,
        next_action_due=priority.next_action_due,
        justification=priority.justification,
    )


def _coder_to_summary(coder: dict) -> CoderSummary:
    return CoderSummary(
        id=coder.get('id'),
        email=coder.get('email'),
        role=coder.get('role') or 'user',
        applications=dict(coder.get('applications') or {}),
    )


def _assignment_to_item(data: dict) -> CodingAssignmentItem:
    return CodingAssignmentItem(
        chase_id=data.get('chase_id'),
        member_id=data.get('member_id'),
        member_key=data.get('member_key'),
        member_name=data.get('member_name'),
        status=data.get('status'),
        priority=data.get('priority'),
        assigned_coder_email=data.get('assigned_coder_email'),
        hcc_code=data.get('hcc_code'),
        icd10_code=data.get('icd10_code'),
        updated_at=data.get('updated_at'),
    )


@router.get("/members/prioritized", response_model=CodingPrioritizedResponse)
async def list_prioritized_members(
    submission_year: int = Query(default=datetime.utcnow().year),
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    priorities, total = await coding_members.list_prioritized_members(
        session, submission_year=submission_year, search=search, limit=limit, offset=offset
    )
    items: list[CodingMemberPriorityView] = []
    for priority in priorities:
        member = await coding_members.get_member(session, priority.member_id)
        if member is None:
            continue
        items.append(_priority_to_view(member, priority))
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.members.prioritized",
        payload={"count": len(items), "submission_year": submission_year},
    )
    await session.commit()
    await control_session.commit()
    return CodingPrioritizedResponse(items=items, total=total)


@router.get("/members", response_model=CodingMemberSearchResponse)
async def list_coding_members(
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    search: Optional[str] = Query(default=None, description="Case-insensitive search term"),
    status_filters: Optional[list[str]] = Query(default=None, alias="status"),
    lob_filters: Optional[list[str]] = Query(default=None, alias="lob"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    members, total = await coding_members.list_members(
        session,
        search=search,
        statuses=status_filters,
        lobs=lob_filters,
        page=page,
        page_size=page_size,
    )
    assignments_map: Dict[int, Dict[str, list]] = {}
    if members:
        member_ids = [member.id for member in members]
        assignments_map = await coding_members.load_assignment_metadata(session, member_ids)
    items = [_member_to_summary(member, assignments_map.get(member.id)) for member in members]
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.members.list",
        payload={"count": len(items), "search": search},
    )
    await session.commit()
    await control_session.commit()
    return CodingMemberSearchResponse(items=items, total=total)


@router.post("/members", response_model=CodingMemberDetail, status_code=status.HTTP_201_CREATED)
async def create_coding_member(
    payload: CodingMemberCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    existing = await coding_members.get_member_by_key(session, payload.member_key)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Member already exists")
    member = await coding_members.create_member(session, payload.model_dump())
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.members.create",
        payload={"member_id": member.id, "member_key": member.member_key},
    )
    await session.commit()
    await control_session.commit()
    return _member_to_detail(member)


@router.get("/members/{member_id}", response_model=CodingMemberDetailResponse)
async def get_coding_member(
    member_id: int,
    submission_year: int = Query(default=datetime.utcnow().year),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    member = await coding_members.get_member(session, member_id)
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    chases = await coding_members.list_chases_for_member(session, member_id)
    notes = await coding_members.list_notes(session, member_id)
    attachments = await coding_members.list_attachments(session, member_id)
    assignment_snapshot = _extract_assignment_metadata(chases)
    eligibility = await coding_members.get_member_eligibility(session, member.id)
    claims = await coding_members.list_claims(session, member.id)
    mao_records = await coding_members.list_mao_records(session, member.id, submission_year=submission_year)
    assessments = await coding_members.list_health_assessments(session, member.id)
    priority = await coding_members.get_member_priority(session, member, submission_year=submission_year)

    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.members.detail",
        payload={"member_id": member.id},
    )
    await session.commit()
    await control_session.commit()
    return CodingMemberDetailResponse(
        member=_member_to_detail(member, assignment_snapshot),
        eligibility=_eligibility_to_schema(eligibility),
        chases=[_chase_to_schema(chase) for chase in chases],
        notes=[_note_to_schema(note) for note in notes],
        attachments=[_attachment_to_schema(attachment) for attachment in attachments],
        claims=[_claim_to_schema(claim) for claim in claims],
        mao_records=[_mao_record_to_schema(record) for record in mao_records],
        health_assessments=[_assessment_to_schema(assessment) for assessment in assessments],
        priority=_priority_to_view(member, priority) if priority else None,
    )


@router.get("/members/{member_id}/gaps", response_model=CodingMemberGapResponse)
async def get_member_gap_analysis(
    member_id: int,
    submission_year: int = Query(default=datetime.utcnow().year),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    try:
        result = await mao_analysis.get_member_gap_analysis(
            session, member_id=member_id, submission_year=submission_year
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.members.gaps",
        payload={"member_id": member_id, "submission_year": submission_year},
    )
    await session.commit()
    await control_session.commit()
    return CodingMemberGapResponse(**result)


@router.post(
    "/members/{member_id}/chases",
    response_model=CodingChase,
    status_code=status.HTTP_201_CREATED,
)
async def create_member_chase(
    member_id: int,
    payload: CodingChaseCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    member = await coding_members.get_member(session, member_id)
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    chase = await coding_members.create_chase(session, member=member, payload=payload.model_dump())
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.chases.create",
        payload={"member_id": member.id, "chase_id": chase.id},
    )
    await session.commit()
    await control_session.commit()
    return _chase_to_schema(chase)


@router.patch("/chases/{chase_id}", response_model=CodingChase)
async def update_member_chase(
    chase_id: int,
    payload: CodingChaseUpdate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No changes provided")
    chase = await coding_members.update_chase(session, chase_id=chase_id, payload=data)
    if not chase:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chase not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.chases.update",
        payload={"chase_id": chase.id, "changes": list(data.keys())},
    )
    await session.commit()
    await control_session.commit()
    return _chase_to_schema(chase)


@router.post(
    "/members/{member_id}/assessments",
    response_model=CodingHealthAssessmentDetail,
    status_code=status.HTTP_201_CREATED,
)
async def create_health_assessment(
    member_id: int,
    payload: HealthAssessmentCreate,
    submission_year: int = Query(default=datetime.utcnow().year),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    member = await coding_members.get_member(session, member_id)
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    assessment = await coding_members.create_health_assessment(
        session, member=member, payload=payload.model_dump()
    )
    await coding_members.get_member_priority(session, member, submission_year=submission_year)
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.assessments.create",
        payload={"member_id": member.id, "assessment_id": assessment.id},
    )
    await session.commit()
    await control_session.commit()
    return _assessment_to_schema(assessment)


@router.post(
    "/members/{member_id}/notes",
    response_model=CodingNote,
    status_code=status.HTTP_201_CREATED,
)
async def create_member_note(
    member_id: int,
    payload: CodingNoteCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    member = await coding_members.get_member(session, member_id)
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    note_payload = payload.model_dump()
    note_payload["author_email"] = current_user.email
    if not note_payload.get("author_name"):
        note_payload["author_name"] = current_user.email
    note = await coding_members.create_note(session, member=member, payload=note_payload)
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.notes.create",
        payload={"member_id": member.id, "note_id": note.id},
    )
    await session.commit()
    await control_session.commit()
    return _note_to_schema(note)


@router.get("/admin/assignments", response_model=CodingAssignmentOverview)
async def get_admin_assignments(
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
):
    items_raw = await coding_members.list_open_assignments(session)
    coders_raw = await coding_members.list_coders_for_tenant(control_session, tenant.id)
    overview = CodingAssignmentOverview(
        coders=[_coder_to_summary(coder) for coder in coders_raw],
        items=[_assignment_to_item(item) for item in items_raw],
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.assignments.view",
        payload={"items": len(overview.items)},
    )
    await control_session.commit()
    return overview


@router.post("/admin/assignments", response_model=CodingAssignmentOverview)
async def assign_admin_work(
    payload: CodingAssignmentRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
):
    coders_raw = await coding_members.list_coders_for_tenant(control_session, tenant.id)
    coder_lookup = {coder["email"].lower(): coder for coder in coders_raw}
    target_coder = coder_lookup.get(payload.coder_email.lower()) if payload.coder_email else None
    if target_coder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coder not found")

    updated_chases = await coding_members.assign_chases_to_coder(
        session,
        coder_email=payload.coder_email,
        coder_id=target_coder.get('id'),
        chase_ids=payload.chase_ids,
        member_ids=payload.member_ids,
    )
    await session.commit()

    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.assignments.update",
        payload={
            "coder": payload.coder_email,
            "chase_ids": list(updated_chases),
            "member_ids": payload.member_ids,
        },
    )
    await control_session.commit()

    items_raw = await coding_members.list_open_assignments(session)
    overview = CodingAssignmentOverview(
        coders=[_coder_to_summary(coder) for coder in coders_raw],
        items=[_assignment_to_item(item) for item in items_raw],
    )
    return overview


@router.post("/submissions/export", response_model=SubmissionGenerateResponse)
async def generate_submission_export(
    request: SubmissionGenerateRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    result = await submission_builder.generate_submission_file(
        session,
        submission_year=request.submission_year,
        creator_email=current_user.email,
        member_ids=request.member_ids,
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.submissions.generate",
        payload={"submission_year": request.submission_year, "record_count": result["record_count"]},
    )
    await session.commit()
    await control_session.commit()
    return SubmissionGenerateResponse(**result)


@router.post(
    "/members/{member_id}/attachments",
    response_model=CodingAttachment,
    status_code=status.HTTP_201_CREATED,
)
async def create_member_attachment(
    member_id: int,
    payload: CodingAttachmentCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    member = await coding_members.get_member(session, member_id)
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    attachment_payload = payload.model_dump()
    attachment_payload["uploaded_by"] = current_user.email
    attachment = await coding_members.create_attachment(
        session,
        member=member,
        payload=attachment_payload,
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.attachments.create",
        payload={"member_id": member.id, "attachment_id": attachment.id},
    )
    await session.commit()
    await control_session.commit()
    return _attachment_to_schema(attachment)


@providers_router.get("/providers", response_model=CodingProviderSearchResponse)
async def list_coding_providers(
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    search: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    providers, total = await coding_members.list_providers(
        session, search=search, page=page, page_size=page_size
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.providers.list",
        payload={"count": len(providers), "search": search},
    )
    await session.commit()
    await control_session.commit()
    items = [_provider_to_summary(provider) for provider in providers]
    return CodingProviderSearchResponse(items=items, total=total)


@providers_router.get("/providers/{provider_id}", response_model=CodingProviderDetail)
async def get_coding_provider(
    provider_id: int,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    provider = await coding_members.get_provider(session, provider_id)
    if not provider:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.providers.detail",
        payload={"provider_id": provider.id},
    )
    await session.commit()
    await control_session.commit()
    return _provider_to_detail(provider)
