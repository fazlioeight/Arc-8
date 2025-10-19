from __future__ import annotations

import hashlib
import math
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, List

from ..db.tenant_manager import TenantContext
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


def _seeded_random(*parts: Iterable[str | int]) -> float:
    joined = "|".join(str(part) for part in parts)
    digest = hashlib.sha256(joined.encode("utf-8")).hexdigest()
    # Convert first 12 hex chars to an integer and normalise between 0-1
    return int(digest[:12], 16) / float(0xFFFFFFFFFFFF)


def _seeded_sequence(parts: Iterable[str | int], length: int, spread: float = 0.35) -> List[float]:
    base = _seeded_random(*parts)
    sequence: List[float] = []
    accumulator = 0.0
    for index in range(length):
        # Deterministic pseudo-random using sine wave to create smooth series
        factor = math.sin(base * math.pi * (index + 1)) * spread
        value = max(0.01, base + factor + (index / max(length - 1, 1)) * spread * 0.25)
        accumulator += value
        sequence.append(value)
    # Normalise so that the total does not explode
    normaliser = accumulator / max(length, 1)
    return [round(value / normaliser, 4) for value in sequence]


def generate_raf_delta(
    tenant: TenantContext,
    model_year: int,
    lob: str,
    provider_group: str,
    include_forecast: bool,
) -> RafDeltaResponse:
    today = date.today()
    series_days = 30
    cutoff_date = date(model_year + 1, 1, 31)
    base_key = ("raf", tenant.key, model_year, lob, provider_group or "All")

    progress_ratio = 0.55 + _seeded_random(*base_key) * 0.25
    target = round(2.5 + _seeded_random(*base_key, "target") * 1.8, 2)
    realized_total = round(target * progress_ratio, 3)

    weights = _seeded_sequence(base_key, series_days, spread=0.25)
    cumulative = 0.0
    series: List[RafSeriesPoint] = []
    start_date = today - timedelta(days=series_days - 1)
    total_weight = sum(weights)
    for index, weight in enumerate(weights):
        # Scale to realised total while preserving curvature
        daily_add = max(0.01, realized_total * weight / max(total_weight, 1e-6))
        cumulative += daily_add
        if index == series_days - 1:
            daily_add += max(0.0, realized_total - cumulative)
            cumulative = realized_total
        series.append(
            RafSeriesPoint(
                date=start_date + timedelta(days=index),
                realized=round(cumulative, 3),
                daily_add=round(daily_add, 3),
            )
        )

    forecast: List[RafForecastPoint] = []
    if include_forecast:
        remaining_ratio = max(0.05, 1.0 - progress_ratio)
        projected_total = realized_total + remaining_ratio * target * 0.85
        horizon_dates = [
            cutoff_date - timedelta(days=21),
            cutoff_date - timedelta(days=14),
            cutoff_date - timedelta(days=7),
            cutoff_date,
        ]
        for horizon in horizon_dates:
            scale = (horizon - today).days / max((cutoff_date - today).days, 1)
            baseline = realized_total + (projected_total - realized_total) * max(min(scale, 1.0), 0.0)
            spread = max(0.05, projected_total * 0.08)
            forecast.append(
                RafForecastPoint(
                    date=horizon,
                    realized_p50=round(baseline, 3),
                    lo80=round(max(0.0, baseline - spread), 3),
                    hi80=round(baseline + spread, 3),
                )
            )

    breakdown_groups = [
        provider_group if provider_group and provider_group != "All" else "All",
        "Accountable Care",
        "Independent",
        "Hospital-owned",
    ]
    breakdown = []
    remaining = realized_total
    for index, group in enumerate(breakdown_groups):
        fraction = 0.4 if index == 0 else 0.2 * (index + 1) / len(breakdown_groups)
        value = round(max(0.0, realized_total * fraction * (0.9 + 0.2 * _seeded_random(*base_key, group))), 3)
        remaining -= value
        breakdown.append(RafBreakdownEntry(group=group, realized=max(0.0, value)))
    if remaining > 0:
        breakdown[0].realized = round(breakdown[0].realized + remaining, 3)

    return RafDeltaResponse(
        target=target,
        cutoff_date=cutoff_date,
        series=series,
        forecast=forecast,
        breakdown=breakdown,
        metadata={
            "tenant": tenant.key,
            "lob": lob,
            "provider_group": provider_group or "All",
        },
    )


def generate_suspects_funnel(
    tenant: TenantContext,
    start_date: date,
    end_date: date,
) -> SuspectsFunnelResponse:
    base_key = ("funnel", tenant.key, start_date.isoformat(), end_date.isoformat())
    total = int(1200 + _seeded_random(*base_key) * 800)
    stage_keys = ["suspected", "coder_reviewed", "accepted", "submitted", "payer_accepted", "on_score"]

    counts: List[int] = []
    running = total
    for index, stage in enumerate(stage_keys):
        drop = 0.08 + 0.12 * _seeded_random(*base_key, stage)
        running = max(running if index == 0 else running * (1.0 - drop), 0)
        counts.append(int(round(running)))

    stages = [
        FunnelStage(
            key=key,
            count=max(count, 0),
            median_days=round(3 + 4 * _seeded_random(*base_key, key, "median"), 1),
        )
        for key, count in zip(stage_keys, counts)
    ]

    contributor_names = [
        "Evergreen Group",
        "North Valley IPA",
        "Metro Specialists",
        "Family First Care",
        "Community Clinic Network",
    ]
    contributors: List[FunnelContributor] = []
    for name in contributor_names:
        stage_index = int(_seeded_random(*base_key, name) * len(stage_keys)) % len(stage_keys)
        stage_key = stage_keys[stage_index]
        stage_count = stages[stage_index].count
        weight = 0.04 + 0.1 * _seeded_random(*base_key, stage_key, name)
        contributors.append(
            FunnelContributor(
                stage=stage_key,
                name=name,
                count=max(1, int(stage_count * weight)),
            )
        )

    return SuspectsFunnelResponse(
        stages=stages,
        contributors=contributors,
        as_of=datetime.now(timezone.utc),
    )


def generate_deadline_radar(
    tenant: TenantContext,
    cutoff: date,
    stage: str,
) -> DeadlineRadarResponse:
    base_key = ("deadline", tenant.key, cutoff.isoformat(), stage)
    ranges = ["0-3", "4-7", "8-14", "15-30", "30+"]
    range_weights = [0.18, 0.24, 0.26, 0.2, 0.12]
    total_items = int(320 + 240 * _seeded_random(*base_key))

    buckets: List[DeadlineBucket] = []
    remaining = total_items
    for index, range_label in enumerate(ranges):
        weight = range_weights[index] * (0.9 + 0.2 * _seeded_random(*base_key, range_label))
        assigned = int(round(total_items * weight))
        remaining -= assigned
        buckets.append(DeadlineBucket(range=range_label, count=max(0, assigned)))

    if remaining > 0:
        buckets[0].count += remaining

    return DeadlineRadarResponse(
        buckets=buckets,
        cutoff=cutoff,
        stage=stage,
        generated_at=datetime.now(timezone.utc),
    )


def generate_provider_heatmap(
    tenant: TenantContext,
    lob: str,
    provider_group: str,
    metric: str,
) -> ProviderHeatmapResponse:
    providers = [
        "Atlas Medical Group",
        "North Valley IPA",
        "Community Care Collaborative",
        "Prime Health Associates",
        "Summit Family Practice",
        "Vista Specialists Network",
    ]
    metrics = ["open_raf", "denial_rate", "days_aging", "qa_fail_rate"]

    base_key = ("heatmap", tenant.key, lob, provider_group or "All")

    values: List[ProviderMetricValue] = []
    for provider in providers:
        provider_seed = _seeded_random(*base_key, provider)
        for metric_key in metrics:
            raw = provider_seed * (1.0 + 0.6 * _seeded_random(*base_key, provider, metric_key))
            if metric_key == "open_raf":
                value = round(120 + raw * 80, 1)
            elif metric_key == "denial_rate":
                value = round(0.05 + raw * 0.12, 3)
            elif metric_key == "days_aging":
                value = round(12 + raw * 25, 1)
            else:  # qa_fail_rate
                value = round(0.04 + raw * 0.1, 3)
            values.append(ProviderMetricValue(provider=provider, metric=metric_key, value=value))

    sparklines = {}
    for provider in providers:
        spark_key = ("spark", tenant.key, provider)
        base_series = _seeded_sequence(spark_key, 12, spread=0.4)
        adjustment = 80 + 40 * _seeded_random(*spark_key, provider_group or "All")
        if metric == "denial_rate":
            sparkline = [round(0.05 + point * 0.12, 3) for point in base_series]
        elif metric == "days_aging":
            sparkline = [round(10 + point * 25, 1) for point in base_series]
        elif metric == "qa_fail_rate":
            sparkline = [round(0.03 + point * 0.09, 3) for point in base_series]
        else:
            sparkline = [round(adjustment + point * 60, 1) for point in base_series]
        sparklines[provider] = sparkline

    return ProviderHeatmapResponse(
        providers=providers,
        metrics=metrics,
        values=values,
        sparklines=sparklines,
    )
