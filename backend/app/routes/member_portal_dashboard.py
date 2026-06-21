"""Member-facing dashboard: read-only data views (Feature 3).

Mounted at ``/api/member``. Every route requires a member session
(``get_current_member``), is bound to the caller's own ``member_key`` (taken
from the token, never from the client), enforces the per-member PHI rate limit,
and writes a PHI access audit entry for each read — success or failure.

Reads come exclusively from the ``m360_*`` tenant tables (the chosen source of
truth) via ``member_portal_data``, which enforces ownership at the query layer.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context, get_tenant_session
from ..middleware.rate_limit import member_phi_rate_limit
from ..models.member360 import Member360Member
from ..schemas.member_portal import (
    AccumulatorScopeOut,
    AccumulatorsResponse,
    ClaimDetailResponse,
    ClaimLineOut,
    ClaimListResponse,
    ClaimSummary,
    CoverageOut,
    DependentOut,
    EligibilityResponse,
)
from ..services import member_portal_data
from ..utils.member_auth import AuthenticatedMember, get_current_member
from ..utils.phi_audit import PhiAction, PhiEvent, record_phi_access

router = APIRouter(
    prefix="/api/member",
    tags=["member-portal"],
    dependencies=[Depends(member_phi_rate_limit())],
)


def _remaining(limit: Optional[float], met: Optional[float]) -> Optional[float]:
    if limit is None:
        return None
    return max(float(limit) - float(met or 0), 0.0)


async def _resolve_member(
    request: Request,
    session: AsyncSession,
    current_member: AuthenticatedMember,
    *,
    record_type: str,
) -> Member360Member:
    """Resolve the caller's own m360 member row, auditing the access.

    A failure (the bound member_key no longer exists in the tenant) is itself
    audited as an unsuccessful PHI access before the 404.
    """
    member = await member_portal_data.get_member_by_key(session, current_member.member_key)
    record_phi_access(
        request,
        event=PhiEvent.ACCESS,
        user_id=current_member.email,
        patient_id=current_member.member_key,
        record_type=record_type,
        action=PhiAction.READ,
        success=member is not None,
    )
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member record not found")
    return member


@router.get("/eligibility", response_model=EligibilityResponse)
async def get_eligibility(
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    current_member: AuthenticatedMember = Depends(get_current_member),
) -> EligibilityResponse:
    member = await _resolve_member(request, session, current_member, record_type="eligibility")
    coverages = await member_portal_data.get_coverages(session, member.id)
    dependents = await member_portal_data.get_dependents(session, member.id)
    return EligibilityResponse(
        member_key=member.member_key,
        first_name=member.first_name,
        last_name=member.last_name,
        plan_name=member.plan_name,
        line_of_business=member.line_of_business,
        primary_care_provider=member.primary_care_provider,
        coverages=[CoverageOut.model_validate(c) for c in coverages],
        dependents=[DependentOut.model_validate(d) for d in dependents],
    )


@router.get("/claims", response_model=ClaimListResponse)
async def list_claims(
    request: Request,
    status_filter: Optional[str] = Query(default=None, alias="status", max_length=32),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    current_member: AuthenticatedMember = Depends(get_current_member),
) -> ClaimListResponse:
    member = await _resolve_member(request, session, current_member, record_type="claims")
    claims, total = await member_portal_data.list_claims(
        session, member.id, status=status_filter, limit=limit, offset=offset
    )
    return ClaimListResponse(
        items=[ClaimSummary.model_validate(c) for c in claims],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/claims/{claim_id}", response_model=ClaimDetailResponse)
async def get_claim(
    claim_id: int,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    current_member: AuthenticatedMember = Depends(get_current_member),
) -> ClaimDetailResponse:
    member = await _resolve_member(request, session, current_member, record_type="claim_detail")
    claim = await member_portal_data.get_claim_for_member(session, member.id, claim_id)
    if claim is None:
        # Either no such claim or it belongs to someone else — same 404 either way.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim not found")
    detail = claim.detail
    return ClaimDetailResponse(
        id=claim.id,
        claim_number=claim.claim_number,
        service_date=claim.service_date,
        provider=claim.provider,
        category=claim.category,
        status=claim.status,
        billed_amount=claim.billed_amount,
        paid_amount=claim.paid_amount,
        member_responsibility=claim.member_responsibility,
        denial_reason=detail.denial_reason if detail else None,
        eob_document_id=detail.eob_document_id if detail else None,
        lines=[ClaimLineOut.model_validate(line) for line in claim.lines],
    )


@router.get("/accumulators", response_model=AccumulatorsResponse)
async def get_accumulators(
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    current_member: AuthenticatedMember = Depends(get_current_member),
) -> AccumulatorsResponse:
    member = await _resolve_member(request, session, current_member, record_type="accumulators")
    scopes = await member_portal_data.get_accumulator_scopes(session, member.id)
    return AccumulatorsResponse(
        scopes=[
            AccumulatorScopeOut(
                scope=s.scope,
                deductible=s.deductible,
                deductible_met=s.deductible_met,
                deductible_remaining=_remaining(s.deductible, s.deductible_met),
                out_of_pocket_max=s.out_of_pocket_max,
                out_of_pocket_met=s.out_of_pocket_met,
                out_of_pocket_remaining=_remaining(s.out_of_pocket_max, s.out_of_pocket_met),
                plan_year_start=s.plan_year_start,
                as_of_date=s.as_of_date,
                updated_at=s.updated_at,
            )
            for s in scopes
        ]
    )
