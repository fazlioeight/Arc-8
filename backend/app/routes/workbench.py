from __future__ import annotations

import os
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context, get_tenant_session
from ..models.coding import (
    CodingClaim,
    CodingHealthAssessment,
    CodingMember,
    CodingMemberAttachment,
    CodingMemberChase,
)
from ..schemas.workbench import (
    Encounter,
    EvidenceSnippet,
    FinalizeRequest,
    FinalizeResponse,
    MeatFlags,
    Member,
    Provider,
    Suspect,
    WorkbenchPayload,
)
from ..services.coding_status import COMPLETED, OPEN
from ..utils.audit_logger import record_audit_event
from ..utils.security import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/api/workbench", tags=["workbench"])


def _claim_to_snippet(claim: CodingClaim, icd_filter: Optional[str] = None) -> EvidenceSnippet:
    dx = claim.diagnosis_codes
    if isinstance(dx, dict):
        dx_list: list[str] = list(dx.keys())
    elif isinstance(dx, list):
        dx_list = [str(x) for x in dx]
    else:
        dx_list = []

    qualifying = bool(icd_filter and icd_filter in dx_list)
    provider: Optional[Provider] = None
    if claim.provider_id:
        provider = Provider(id=str(claim.provider_id), name=None, type="provider")

    return EvidenceSnippet(
        snippet_id=f"claim-{claim.id}",
        source_type=claim.claim_type or "claim",
        dos=str(claim.service_date or ""),
        provider=provider,
        text=f"Claim {claim.claim_number} — Dx: {', '.join(dx_list) if dx_list else 'N/A'}",
        meat=MeatFlags(M=False, E=True, A=False, T=False),
        confidence=0.70,
        qualifying=qualifying,
    )


def _chase_to_suspect(chase: CodingMemberChase, claims: list[CodingClaim]) -> Suspect:
    icd_suggestions = []
    if chase.icd10_code:
        icd_suggestions = [{"code": chase.icd10_code, "label": chase.icd10_code}]

    evidence = [_claim_to_snippet(c, icd_filter=chase.icd10_code) for c in claims]
    priority_map = {"high": 0.9, "normal": 0.6, "low": 0.3}

    return Suspect(
        suspect_id=str(chase.id),
        condition=chase.chase_code,
        icd_suggestions=icd_suggestions,
        evidence=evidence,
        priority=priority_map.get(chase.priority, 0.5),
    )


@router.get("/suspects", response_model=WorkbenchPayload)
async def get_suspects(
    member_id: str,
    tenant: TenantContext = Depends(get_tenant_context),
    current_user: AuthenticatedUser = Depends(get_current_user),
    tenant_session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
) -> WorkbenchPayload:
    member_result = await tenant_session.execute(
        select(CodingMember).where(CodingMember.member_key == member_id)
    )
    member = member_result.scalar_one_or_none()
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member {member_id!r} not found",
        )

    chases_result = await tenant_session.execute(
        select(CodingMemberChase)
        .where(CodingMemberChase.member_id == member.id, CodingMemberChase.status == OPEN)
        .order_by(CodingMemberChase.id)
    )
    chases = list(chases_result.scalars().all())

    claims_result = await tenant_session.execute(
        select(CodingClaim)
        .where(CodingClaim.member_id == member.id)
        .order_by(CodingClaim.service_date.desc())
        .limit(20)
    )
    claims = list(claims_result.scalars().all())

    attachments_result = await tenant_session.execute(
        select(CodingMemberAttachment).where(CodingMemberAttachment.member_id == member.id)
    )
    attachments = list(attachments_result.scalars().all())

    suspects = [_chase_to_suspect(chase, claims) for chase in chases]

    latest_claim = claims[0] if claims else None
    encounter = Encounter(
        id=f"enc-{member.id}",
        dos=str(latest_claim.service_date) if latest_claim and latest_claim.service_date else str(date.today()),
        provider=Provider(
            id=str(latest_claim.provider_id or "") if latest_claim else "",
            name=member.pcp_name,
            type="provider",
        ),
        pos="11",
    )

    documents = [
        {
            "id": str(a.id),
            "source_type": a.content_type,
            "dos": str(a.uploaded_at.date()) if a.uploaded_at else "",
            "provider": {"name": a.uploaded_by or ""},
            "preview": a.filename,
        }
        for a in attachments
    ]

    name_parts = [member.last_name or "", member.first_name or ""]
    member_name = ", ".join(p for p in name_parts if p).strip(", ") or member.member_key

    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="workbench.suspects.view",
        payload={"member_id": member_id, "suspect_count": len(suspects)},
    )
    await control_session.commit()

    return WorkbenchPayload(
        member=Member(
            id=member.member_key,
            name=member_name,
            dob=str(member.date_of_birth) if member.date_of_birth else None,
            lob=member.line_of_business or "MA",
        ),
        encounter=encounter,
        suspects=suspects,
        documents=documents,
        model_year=date.today().year,
    )


@router.post("/code", response_model=FinalizeResponse)
async def finalize_code(
    payload: FinalizeRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    current_user: AuthenticatedUser = Depends(get_current_user),
    tenant_session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
) -> FinalizeResponse:
    if not payload.evidence_used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Select at least one evidence snippet before finalizing.",
        )
    if not payload.checklist.get("meat_complete"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="MEAT checklist must be satisfied.",
        )

    member_result = await tenant_session.execute(
        select(CodingMember).where(CodingMember.member_key == payload.member_id)
    )
    member = member_result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    assessment = CodingHealthAssessment(
        member_id=member.id,
        assessment_date=date.today(),
        assessment_type="hcc_coding",
        icd10_codes=[payload.selected_icd] if payload.selected_icd else [],
        hcc_codes=[],
        completion_status="pending_submission",
        notes=f"Finalized by {current_user.email} via workbench",
    )
    tenant_session.add(assessment)

    if payload.suspect_id.isdigit():
        chase_result = await tenant_session.execute(
            select(CodingMemberChase).where(
                CodingMemberChase.id == int(payload.suspect_id),
                CodingMemberChase.member_id == member.id,
            )
        )
        chase = chase_result.scalar_one_or_none()
        if chase is not None:
            chase.status = COMPLETED
            if payload.selected_icd:
                chase.icd10_code = payload.selected_icd

    await tenant_session.commit()
    await tenant_session.refresh(assessment)

    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="workbench.code.finalize",
        payload={
            "member_id": payload.member_id,
            "suspect_id": payload.suspect_id,
            "selected_icd": payload.selected_icd or "",
            "assessment_id": assessment.id,
        },
    )
    await control_session.commit()

    return FinalizeResponse(
        status="accepted",
        hcc={"id": "", "label": payload.selected_icd or "", "weight": 0.0},
        submission_intent="add",
        audit_id=f"A-{assessment.id}",
    )


@router.get("/documents/{document_id}/pdf")
async def get_document_pdf(
    document_id: str,
    tenant: TenantContext = Depends(get_tenant_context),
    current_user: AuthenticatedUser = Depends(get_current_user),
    tenant_session: AsyncSession = Depends(get_tenant_session),
) -> FileResponse:
    if not document_id.isdigit():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    attachment_result = await tenant_session.execute(
        select(CodingMemberAttachment).where(CodingMemberAttachment.id == int(document_id))
    )
    attachment = attachment_result.scalar_one_or_none()

    if attachment is None or not os.path.exists(attachment.storage_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    return FileResponse(
        attachment.storage_path,
        media_type=attachment.content_type or "application/pdf",
        filename=attachment.filename,
    )
