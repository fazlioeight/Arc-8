from __future__ import annotations

from datetime import date, datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class RafSeriesPoint(BaseModel):
    date: date
    realized: float = Field(ge=0)
    daily_add: float = Field(ge=0)


class RafForecastPoint(BaseModel):
    date: date
    realized_p50: Optional[float] = None
    lo80: Optional[float] = None
    hi80: Optional[float] = None


class RafBreakdownEntry(BaseModel):
    group: str
    realized: float = Field(ge=0)


class RafDeltaResponse(BaseModel):
    target: float = Field(ge=0)
    cutoff_date: date
    series: List[RafSeriesPoint]
    forecast: List[RafForecastPoint]
    breakdown: List[RafBreakdownEntry]
    metadata: Dict[str, str] = Field(default_factory=dict)


class FunnelStage(BaseModel):
    key: str
    count: int = Field(ge=0)
    median_days: float = Field(ge=0)


class FunnelContributor(BaseModel):
    stage: str
    name: str
    count: int = Field(ge=0)


class SuspectsFunnelResponse(BaseModel):
    stages: List[FunnelStage]
    contributors: List[FunnelContributor]
    as_of: datetime


class DeadlineBucket(BaseModel):
    range: str
    count: int = Field(ge=0)


class DeadlineRadarResponse(BaseModel):
    buckets: List[DeadlineBucket]
    cutoff: date
    stage: str
    generated_at: datetime


class ProviderMetricValue(BaseModel):
    provider: str
    metric: str
    value: Optional[float] = None


class ProviderHeatmapResponse(BaseModel):
    providers: List[str]
    metrics: List[str]
    values: List[ProviderMetricValue]
    sparklines: Dict[str, List[float]] = Field(default_factory=dict)
