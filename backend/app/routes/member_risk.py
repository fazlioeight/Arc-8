from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies.tenant import get_tenant_context, get_tenant_session
from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..models.coding import CodingMember, CodingMemberPriority
from ..utils.audit_logger import record_audit_event
from ..utils.security import AuthenticatedUser, get_current_user

router = APIRouter()


@router.get("/member/{member_id}/risk")
async def get_member_risk(
    member_id: str,
    tenant: TenantContext = Depends(get_tenant_context),
    current_user: AuthenticatedUser = Depends(get_current_user),
    control_session: AsyncSession = Depends(get_control_session),
    tenant_session: AsyncSession = Depends(get_tenant_session),
):
    member_result = await tenant_session.execute(
        select(CodingMember).where(CodingMember.member_key == member_id)
    )
    member = member_result.scalar_one_or_none()

    risk_score = None
    priority_tier = None
    hcc_opportunity_count = 0

    if member is not None:
        priority_result = await tenant_session.execute(
            select(CodingMemberPriority).where(CodingMemberPriority.member_id == member.id)
        )
        priority = priority_result.scalar_one_or_none()
        if priority is not None:
            risk_score = priority.priority_score
            priority_tier = priority.priority_tier
            hcc_opportunity_count = priority.hcc_opportunity_count

    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member.risk.view",
        payload={"member_id": member_id},
    )
    await control_session.commit()

    return {
        "member_id": member_id,
        "risk_score": risk_score,
        "priority_tier": priority_tier,
        "hcc_opportunity_count": hcc_opportunity_count,
        "requested_by": current_user.email,
        "tenant": tenant.key,
    }
