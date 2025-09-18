from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies.tenant import get_tenant_context
from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..utils.audit_logger import record_audit_event
from ..utils.security import AuthenticatedUser, get_current_user

router = APIRouter()


@router.get("/member/{member_id}/risk")
async def get_member_risk(
    member_id: str,
    tenant: TenantContext = Depends(get_tenant_context),
    current_user: AuthenticatedUser = Depends(get_current_user),
    control_session: AsyncSession = Depends(get_control_session),
):
    risk_score = 0.42  # Placeholder risk score.

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
        "requested_by": current_user.email,
        "tenant": tenant.key,
    }
