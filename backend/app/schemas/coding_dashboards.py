from __future__ import annotations

from datetime import date, datetime
from typing import Dict, Optional

from pydantic import BaseModel, Field


class CodingWorklistItem(BaseModel):
    chase_id: int
    member_id: int
    member_key: str
    member_name: Optional[str] = None
    status: str
    priority: Optional[str] = None
    assigned_coder_email: Optional[str] = None
    icd10_code: Optional[str] = None
    hcc_code: Optional[str] = None
    service_date_from: Optional[date] = None
    service_date_to: Optional[date] = None
    due_date: Optional[date] = None
    updated_at: datetime


class CodingWorklistSummary(BaseModel):
    status_counts: Dict[str, int] = Field(default_factory=dict)
    priority_counts: Dict[str, int] = Field(default_factory=dict)
    due_soon: int = 0
    overdue: int = 0


class CodingWorklistResponse(BaseModel):
    items: list[CodingWorklistItem]
    total: int
    summary: CodingWorklistSummary


class CodingReviewMetric(BaseModel):
    label: str
    value: int
    hint: Optional[str] = None


class CodingReviewQueueItem(CodingWorklistItem):
    note_count: int = 0
    last_note_at: Optional[datetime] = None
    next_action: Optional[str] = None


class CodingReviewDashboardResponse(BaseModel):
    metrics: list[CodingReviewMetric]
    queue: list[CodingReviewQueueItem]


class ProviderEducationEntry(BaseModel):
    provider_id: int
    name: str
    npi: Optional[str] = None
    tax_id: Optional[str] = None
    member_count: int = 0
    open_gaps: int = 0
    mao_records: int = 0
    last_contacted_at: Optional[datetime] = None
    education_status: str


class ProviderEducationResponse(BaseModel):
    items: list[ProviderEducationEntry]
    total: int


class GroupDashboardEntry(BaseModel):
    group_key: str
    group_name: str
    tax_id: Optional[str] = None
    provider_count: int = 0
    member_count: int = 0
    open_gaps: int = 0
    average_risk_score: float = 0.0
    pending_education: int = 0


class GroupDashboardResponse(BaseModel):
    items: list[GroupDashboardEntry]
    total: int


class ProviderManagementEntry(BaseModel):
    provider_id: int
    name: str
    npi: Optional[str] = None
    tax_id: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address_line1: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    member_count: int = 0
    open_chases: int = 0
    last_updated_at: Optional[datetime] = None


class ProviderManagementResponse(BaseModel):
    items: list[ProviderManagementEntry]
    total: int


class ProviderContactUpdate(BaseModel):
    name: Optional[str] = None
    npi: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    tax_id: Optional[str] = None
    address_line1: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
