"""Dashboard fact tables.

These hold the pre-aggregated metrics the executive dashboard renders (RAF
delta, suspects funnel, deadline radar, provider heatmap). They are populated
by the demo seeder today; in production an ETL/rollup job would refresh them.
Keeping them as real tables (rather than computing synthetic values on the
fly) means the dashboard endpoints are genuinely DB-backed and the numbers are
swappable for real measurements without touching application code.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Optional

from sqlalchemy import Boolean, Date, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from .tables import TenantDataBase


class DashboardRafMeta(TenantDataBase):
    """Per-(model_year, lob, provider_group) RAF header: target + breakdown."""

    __tablename__ = "dashboard_raf_meta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    model_year: Mapped[int] = mapped_column(Integer, index=True)
    lob: Mapped[str] = mapped_column(String(32), index=True)
    provider_group: Mapped[str] = mapped_column(String(64), default="All", index=True)
    target: Mapped[float] = mapped_column(Float, default=0.0)
    cutoff_date: Mapped[date] = mapped_column(Date)
    # list[{"group": str, "realized": float}]
    breakdown: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)


class DashboardRafSeriesPoint(TenantDataBase):
    """A daily realized-RAF point (or a forecast point) for a RAF combination."""

    __tablename__ = "dashboard_raf_series"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    model_year: Mapped[int] = mapped_column(Integer, index=True)
    lob: Mapped[str] = mapped_column(String(32), index=True)
    provider_group: Mapped[str] = mapped_column(String(64), default="All", index=True)
    as_of_date: Mapped[date] = mapped_column(Date, index=True)
    realized: Mapped[float] = mapped_column(Float, default=0.0)
    daily_add: Mapped[float] = mapped_column(Float, default=0.0)
    is_forecast: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    realized_p50: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lo80: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    hi80: Mapped[Optional[float]] = mapped_column(Float, nullable=True)


class DashboardFunnelStage(TenantDataBase):
    __tablename__ = "dashboard_funnel_stage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stage_key: Mapped[str] = mapped_column(String(48), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    count: Mapped[int] = mapped_column(Integer, default=0)
    median_days: Mapped[float] = mapped_column(Float, default=0.0)


class DashboardFunnelContributor(TenantDataBase):
    __tablename__ = "dashboard_funnel_contributor"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stage_key: Mapped[str] = mapped_column(String(48), index=True)
    name: Mapped[str] = mapped_column(String(128))
    count: Mapped[int] = mapped_column(Integer, default=0)


class DashboardDeadlineBucket(TenantDataBase):
    __tablename__ = "dashboard_deadline_bucket"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stage: Mapped[str] = mapped_column(String(48), index=True)
    range_label: Mapped[str] = mapped_column(String(16))
    position: Mapped[int] = mapped_column(Integer, default=0)
    count: Mapped[int] = mapped_column(Integer, default=0)


class DashboardProviderMetric(TenantDataBase):
    """One row per (lob, provider_group, provider, metric). The sparkline is the
    12-point trend for that provider+metric."""

    __tablename__ = "dashboard_provider_metric"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lob: Mapped[str] = mapped_column(String(32), index=True)
    provider_group: Mapped[str] = mapped_column(String(64), default="All", index=True)
    provider: Mapped[str] = mapped_column(String(128), index=True)
    metric: Mapped[str] = mapped_column(String(48), index=True)
    value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sparkline: Mapped[list[float]] = mapped_column(JSON, default=list)
