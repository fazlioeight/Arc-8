from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies.tenant import get_tenant_context, get_tenant_session
from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..models.coding import CodingClaim, CodingMember
from ..utils.audit_logger import record_audit_event
from ..utils.security import AuthenticatedUser, get_current_user

router = APIRouter()


@router.get("/overutilization/")
async def flag_overutilization(
    threshold: int = Query(5, ge=1, le=100),
    tenant: TenantContext = Depends(get_tenant_context),
    current_user: AuthenticatedUser = Depends(get_current_user),
    tenant_session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
):
    """Flag members whose visit count (claims, as a proxy) meets or exceeds the
    threshold. Backed by a real per-member claim count rather than a stub."""
    visits = func.count(CodingClaim.id)
    stmt = (
        select(CodingMember.member_key, visits.label("visits"))
        .join(CodingClaim, CodingClaim.member_id == CodingMember.id)
        .group_by(CodingMember.id, CodingMember.member_key)
        .having(visits >= threshold)
        .order_by(visits.desc())
    )
    rows = (await tenant_session.execute(stmt)).all()
    flagged_members = [{"member_id": key, "visits": int(count)} for key, count in rows]

    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="analytics.overutilization.view",
        payload={"threshold": threshold, "flagged_count": len(flagged_members)},
    )
    await control_session.commit()

    return {
        "requested_by": current_user.email,
        "tenant": tenant.key,
        "threshold": threshold,
        "flagged": flagged_members,
    }
