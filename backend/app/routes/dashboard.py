from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies.tenant import get_tenant_context, get_tenant_session
from ..db.tenant_manager import TenantContext
from ..schemas.dashboard import (
    DeadlineRadarResponse,
    ProviderHeatmapResponse,
    RafDeltaResponse,
    SuspectsFunnelResponse,
)
from ..services.dashboard_metrics import (
    generate_deadline_radar,
    generate_provider_heatmap,
    generate_raf_delta,
    generate_suspects_funnel,
)
from ..utils.security import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/api", tags=["dashboard"])


def _parse_iso_date(value: Optional[str], field: str) -> date:
    if not value:
        raise HTTPException(status_code=400, detail=f"Missing required query parameter: {field}")
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid date format for '{field}'. Use YYYY-MM-DD.") from exc


def _should_include_forecast(flag: Optional[str]) -> bool:
    if flag is None:
        return True
    return str(flag).strip().lower() in {"1", "true", "yes", "on"}


@router.get("/raf/delta", response_model=RafDeltaResponse)
async def get_raf_delta(
    model_year: Optional[int] = Query(default=None, alias="model_year"),
    lob: str = Query(default="MA"),
    provider_group: str = Query(default="All", alias="provider_group"),
    forecast: Optional[str] = Query(default=None),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    _: AuthenticatedUser = Depends(get_current_user),
) -> RafDeltaResponse:
    target_year = model_year or date.today().year
    include_forecast = _should_include_forecast(forecast)
    return await generate_raf_delta(
        session=session,
        tenant=tenant,
        model_year=target_year,
        lob=lob,
        provider_group=provider_group or "All",
        include_forecast=include_forecast,
    )


@router.get("/suspects/funnel", response_model=SuspectsFunnelResponse)
async def get_suspects_funnel(
    from_date: Optional[str] = Query(default=None, alias="from"),
    to_date: Optional[str] = Query(default=None, alias="to"),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    _: AuthenticatedUser = Depends(get_current_user),
) -> SuspectsFunnelResponse:
    end = _parse_iso_date(to_date, "to") if to_date else date.today()
    start = _parse_iso_date(from_date, "from") if from_date else end - timedelta(days=30)
    if start > end:
        raise HTTPException(status_code=400, detail="'from' date must be before 'to' date.")
    return await generate_suspects_funnel(session=session, tenant=tenant, start_date=start, end_date=end)


@router.get("/deadlines/radar", response_model=DeadlineRadarResponse)
async def get_deadline_radar(
    cutoff: str = Query(...),
    stage: str = Query(default="accepted"),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    _: AuthenticatedUser = Depends(get_current_user),
) -> DeadlineRadarResponse:
    cutoff_date = _parse_iso_date(cutoff, "cutoff")
    return await generate_deadline_radar(session=session, tenant=tenant, cutoff=cutoff_date, stage=stage or "accepted")


@router.get("/deadlines/radar/export")
async def export_deadline_radar_csv(
    cutoff: str = Query(...),
    stage: str = Query(default="accepted"),
    lob: Optional[str] = Query(default=None),
    model_year: Optional[int] = Query(default=None, alias="model_year"),
    provider_group: Optional[str] = Query(default=None, alias="provider_group"),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    user: AuthenticatedUser = Depends(get_current_user),
):
    cutoff_date = _parse_iso_date(cutoff, "cutoff")
    radar = await generate_deadline_radar(session=session, tenant=tenant, cutoff=cutoff_date, stage=stage or "accepted")

    header = "member_id,provider_id,stage,days_to_cutoff,count"
    rows = [header]
    for bucket in radar.buckets:
        rows.append(f"aggregate,aggregate,{radar.stage},{bucket.range},{bucket.count}")
    metadata = (
        f"# exported_by={user.email} tenant={tenant.key} cutoff={cutoff_date.isoformat()} "
        f"stage={radar.stage} lob={lob or ''} model_year={model_year or ''} provider_group={provider_group or 'All'}"
    )
    rows.append(metadata)
    content = "\n".join(rows)
    filename = f"deadline_radar_{cutoff_date.isoformat()}.csv"
    return StreamingResponse(
        iter([content]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/providers/heatmap", response_model=ProviderHeatmapResponse)
async def get_provider_heatmap(
    metric: str = Query(default="open_raf"),
    lob: str = Query(default="MA"),
    provider_group: str = Query(default="All", alias="provider_group"),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    _: AuthenticatedUser = Depends(get_current_user),
) -> ProviderHeatmapResponse:
    return await generate_provider_heatmap(
        session=session,
        tenant=tenant,
        lob=lob,
        provider_group=provider_group or "All",
        metric=metric or "open_raf",
    )
