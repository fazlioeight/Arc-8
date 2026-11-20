"""DB-backed dashboard metrics.

Reads the pre-aggregated ``dashboard_*`` fact tables (populated by the demo
seeder / an ETL rollup) and shapes them into the API response models. When a
fact table has no rows for the requested filters the functions return an empty
but well-formed payload, so the dashboard degrades gracefully on a fresh
tenant rather than erroring.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.tenant_manager import TenantContext
from ..models.dashboard_facts import (
    DashboardDeadlineBucket,
    DashboardFunnelContributor,
    DashboardFunnelStage,
    DashboardProviderMetric,
    DashboardRafMeta,
    DashboardRafSeriesPoint,
)
from ..schemas.dashboard import (
    DeadlineBucket,
    DeadlineRadarResponse,
    FunnelContributor,
    FunnelStage,
    ProviderHeatmapResponse,
    ProviderMetricValue,
    RafBreakdownEntry,
    RafDeltaResponse,
    RafForecastPoint,
    RafSeriesPoint,
    SuspectsFunnelResponse,
)


async def generate_raf_delta(
    session: AsyncSession,
    tenant: TenantContext,
    model_year: int,
    lob: str,
    provider_group: str,
    include_forecast: bool,
) -> RafDeltaResponse:
    group = provider_group or "All"
    meta = await session.scalar(
        select(DashboardRafMeta).where(
            DashboardRafMeta.model_year == model_year,
            DashboardRafMeta.lob == lob,
            DashboardRafMeta.provider_group == group,
        )
    )

    rows = list(
        (
            await session.execute(
                select(DashboardRafSeriesPoint)
                .where(
                    DashboardRafSeriesPoint.model_year == model_year,
                    DashboardRafSeriesPoint.lob == lob,
                    DashboardRafSeriesPoint.provider_group == group,
                )
                .order_by(DashboardRafSeriesPoint.as_of_date)
            )
        ).scalars()
    )

    raw_target = float(meta.target) if meta and meta.target else 1.25
    # G-10: Calibrate uncalibrated RAF targets (e.g. 3.00) to standard 1.25 MA RAF benchmark
    if raw_target > 1.75:
        calibrated_target = 1.25
        scale = calibrated_target / raw_target
    else:
        calibrated_target = raw_target if (meta and meta.target) else (1.25 if rows else 0.0)
        scale = 1.0

    series = [
        RafSeriesPoint(
            date=r.as_of_date,
            realized=round(float(r.realized or 0.0) * scale, 3),
            daily_add=round(float(r.daily_add or 0.0) * scale, 4),
        )
        for r in rows
        if not r.is_forecast
    ]
    forecast = []
    if include_forecast:
        forecast = [
            RafForecastPoint(
                date=r.as_of_date,
                realized_p50=round(float(r.realized_p50) * scale, 3) if r.realized_p50 is not None else None,
                lo80=round(float(r.lo80) * scale, 3) if r.lo80 is not None else None,
                hi80=round(float(r.hi80) * scale, 3) if r.hi80 is not None else None,
            )
            for r in rows
            if r.is_forecast
        ]

    breakdown = []
    if meta and isinstance(meta.breakdown, list):
        breakdown = [
            RafBreakdownEntry(
                group=str(b.get("group", "")),
                realized=round(float(b.get("realized", 0) or 0) * scale, 3),
            )
            for b in meta.breakdown
        ]

    return RafDeltaResponse(
        target=calibrated_target,
        cutoff_date=meta.cutoff_date if meta else date(model_year + 1, 1, 31),
        series=series,
        forecast=forecast,
        breakdown=breakdown,
        metadata={"tenant": tenant.key, "lob": lob, "provider_group": group},
    )


async def generate_suspects_funnel(
    session: AsyncSession,
    tenant: TenantContext,
    start_date: date,
    end_date: date,
) -> SuspectsFunnelResponse:
    stage_rows = list(
        (
            await session.execute(
                select(DashboardFunnelStage).order_by(DashboardFunnelStage.position)
            )
        ).scalars()
    )
    stages = [
        FunnelStage(key=s.stage_key, count=s.count, median_days=s.median_days)
        for s in stage_rows
    ]

    contributor_rows = list(
        (await session.execute(select(DashboardFunnelContributor))).scalars()
    )
    contributors = [
        FunnelContributor(stage=c.stage_key, name=c.name, count=c.count)
        for c in contributor_rows
    ]

    return SuspectsFunnelResponse(
        stages=stages,
        contributors=contributors,
        as_of=datetime.now(timezone.utc),
    )


async def generate_deadline_radar(
    session: AsyncSession,
    tenant: TenantContext,
    cutoff: date,
    stage: str,
) -> DeadlineRadarResponse:
    rows = list(
        (
            await session.execute(
                select(DashboardDeadlineBucket)
                .where(DashboardDeadlineBucket.stage == stage)
                .order_by(DashboardDeadlineBucket.position)
            )
        ).scalars()
    )
    buckets = [DeadlineBucket(range=r.range_label, count=r.count) for r in rows]
    return DeadlineRadarResponse(
        buckets=buckets,
        cutoff=cutoff,
        stage=stage,
        generated_at=datetime.now(timezone.utc),
    )


async def generate_provider_heatmap(
    session: AsyncSession,
    tenant: TenantContext,
    lob: str,
    provider_group: str,
    metric: str,
) -> ProviderHeatmapResponse:
    group = provider_group or "All"
    rows = list(
        (
            await session.execute(
                select(DashboardProviderMetric)
                .where(
                    DashboardProviderMetric.lob == lob,
                    DashboardProviderMetric.provider_group == group,
                )
                .order_by(DashboardProviderMetric.provider, DashboardProviderMetric.metric)
            )
        ).scalars()
    )

    # Preserve first-seen order for providers and metrics.
    providers: list[str] = []
    metrics: list[str] = []
    values: list[ProviderMetricValue] = []
    sparklines: dict[str, list[float]] = {}
    for r in rows:
        if r.provider not in providers:
            providers.append(r.provider)
        if r.metric not in metrics:
            metrics.append(r.metric)
        values.append(ProviderMetricValue(provider=r.provider, metric=r.metric, value=r.value))
        if r.metric == metric:
            sparklines[r.provider] = list(r.sparkline or [])

    return ProviderHeatmapResponse(
        providers=providers,
        metrics=metrics,
        values=values,
        sparklines=sparklines,
    )
