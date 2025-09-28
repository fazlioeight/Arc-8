from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies.tenant import get_tenant_context, get_tenant_session
from ..db.tenant_manager import TenantContext
from ..schemas.coding import (
    CodingAttachment,
    CodingAttachmentCreate,
    CodingChase,
    CodingChaseCreate,
    CodingChaseUpdate,
    CodingMemberCreate,
    CodingMemberDetail,
    CodingMemberDetailResponse,
    CodingMemberSearchResponse,
    CodingMemberSummary,
    CodingNote,
    CodingNoteCreate,
    CodingProviderDetail,
    CodingProviderSearchResponse,
    CodingProviderSummary,
)
from ..services import coding_members
from ..utils.audit_logger import record_audit_event
from ..utils.security import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/api/coding", tags=["coding"])


def _member_to_summary(member) -> CodingMemberSummary:
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
    )


def _member_to_detail(member) -> CodingMemberDetail:
    summary = _member_to_summary(member)
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


@router.get("/members", response_model=CodingMemberSearchResponse)
async def list_coding_members(
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
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
    items = [_member_to_summary(member) for member in members]
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.members.list",
        payload={"count": len(items), "search": search},
    )
    await session.commit()
    return CodingMemberSearchResponse(items=items, total=total)


@router.post("/members", response_model=CodingMemberDetail, status_code=status.HTTP_201_CREATED)
async def create_coding_member(
    payload: CodingMemberCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    existing = await coding_members.get_member_by_key(session, payload.member_key)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Member already exists")
    member = await coding_members.create_member(session, payload.model_dump())
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.members.create",
        payload={"member_id": member.id, "member_key": member.member_key},
    )
    await session.commit()
    return _member_to_detail(member)


@router.get("/members/{member_id}", response_model=CodingMemberDetailResponse)
async def get_coding_member(
    member_id: int,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    member = await coding_members.get_member(session, member_id)
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    chases = await coding_members.list_chases_for_member(session, member_id)
    notes = await coding_members.list_notes(session, member_id)
    attachments = await coding_members.list_attachments(session, member_id)
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.members.detail",
        payload={"member_id": member.id},
    )
    await session.commit()
    return CodingMemberDetailResponse(
        member=_member_to_detail(member),
        chases=[_chase_to_schema(chase) for chase in chases],
        notes=[_note_to_schema(note) for note in notes],
        attachments=[_attachment_to_schema(attachment) for attachment in attachments],
    )


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
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    member = await coding_members.get_member(session, member_id)
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    chase = await coding_members.create_chase(session, member=member, payload=payload.model_dump())
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.chases.create",
        payload={"member_id": member.id, "chase_id": chase.id},
    )
    await session.commit()
    return _chase_to_schema(chase)


@router.patch("/chases/{chase_id}", response_model=CodingChase)
async def update_member_chase(
    chase_id: int,
    payload: CodingChaseUpdate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No changes provided")
    chase = await coding_members.update_chase(session, chase_id=chase_id, payload=data)
    if not chase:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chase not found")
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.chases.update",
        payload={"chase_id": chase.id, "changes": list(data.keys())},
    )
    await session.commit()
    return _chase_to_schema(chase)


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
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.notes.create",
        payload={"member_id": member.id, "note_id": note.id},
    )
    await session.commit()
    return _note_to_schema(note)


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
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.attachments.create",
        payload={"member_id": member.id, "attachment_id": attachment.id},
    )
    await session.commit()
    return _attachment_to_schema(attachment)


@router.get("/providers", response_model=CodingProviderSearchResponse)
async def list_coding_providers(
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    search: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    providers, total = await coding_members.list_providers(
        session, search=search, page=page, page_size=page_size
    )
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.providers.list",
        payload={"count": len(providers), "search": search},
    )
    await session.commit()
    items = [_provider_to_summary(provider) for provider in providers]
    return CodingProviderSearchResponse(items=items, total=total)


@router.get("/providers/{provider_id}", response_model=CodingProviderDetail)
async def get_coding_provider(
    provider_id: int,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    provider = await coding_members.get_provider(session, provider_id)
    if not provider:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="coding.providers.detail",
        payload={"provider_id": provider.id},
    )
    await session.commit()
    return _provider_to_detail(provider)
