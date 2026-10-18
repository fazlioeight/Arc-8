from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies.tenant import get_tenant_context, get_tenant_session
from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..models.tables import Claim
from ..utils.audit_logger import record_audit_event
from ..utils.security import AuthenticatedUser, get_current_user

router = APIRouter()


@router.get("/member/{member_id}/costs")
async def get_member_costs(
    member_id: str,
    tenant: TenantContext = Depends(get_tenant_context),
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
):
    total_raw = await session.scalar(
        select(func.coalesce(func.sum(Claim.cost), 0)).where(Claim.member_key == member_id)
    )
    if isinstance(total_raw, Decimal):
        total_cost = float(total_raw)
    elif isinstance(total_raw, (float, int)):
        total_cost = float(total_raw)
    else:
        total_cost = 0.0

    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="member.cost.view",
        payload={"member_id": member_id, "cost_total": total_cost},
    )
    await control_session.commit()

    return {"member_id": member_id, "total_cost": total_cost, "tenant": tenant.key}
