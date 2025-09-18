from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies.tenant import get_tenant_context, get_tenant_session
from ..db.tenant_manager import TenantContext
from ..services.analytics_service import tenant_totals
from ..utils.security import AuthenticatedUser, get_current_user

router = APIRouter()


@router.get("/api/analytics/dashboard")
async def get_dashboard(
    tenant: TenantContext = Depends(get_tenant_context),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    return {
        "user": current_user.email,
        "tenant": tenant.key,
        "highRiskCount": 42,
        "featureFlags": tenant.feature_flags,
    }


@router.get("/api/analytics/summary")
async def get_summary(
    tenant: TenantContext = Depends(get_tenant_context),
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    totals = await tenant_totals(session)
    return {"tenant": tenant.key, **totals}
