from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies.tenant import get_tenant_context
from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..utils.audit_logger import record_audit_event
from ..utils.security import AuthenticatedUser, get_current_user

router = APIRouter()


@router.get("/overutilization/")
async def flag_overutilization(
    threshold: int = Query(5, ge=1, le=100),
    tenant: TenantContext = Depends(get_tenant_context),
    current_user: AuthenticatedUser = Depends(get_current_user),
    control_session: AsyncSession = Depends(get_control_session),
):
    flagged_members = [
        {"member_id": "M001", "visits": threshold + 2},
        {"member_id": "M007", "visits": threshold + 5},
    ]

    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="analytics.overutilization.view",
        payload={"threshold": threshold},
    )
    await control_session.commit()

    return {
        "requested_by": current_user.email,
        "tenant": tenant.key,
        "threshold": threshold,
        "flagged": flagged_members,
    }
