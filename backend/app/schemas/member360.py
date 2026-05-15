"""Pydantic schemas for the Nexora Lab Member360 module."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class MemberSummary(BaseModel):
    id: int
    member_key: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    age: Optional[int] = None
    plan_name: Optional[str] = None
    line_of_business: Optional[str] = None
    preferred_channel: Optional[str] = None
    primary_care_provider: Optional[str] = None
    risk_score_composite: Optional[float] = None
    risk_tier: Optional[str] = None
    open_care_gaps: int = 0
    open_task_count: int = 0
    active_journey_count: int = 0
    next_best_action: Optional[str] = None
    last_interaction_at: Optional[datetime] = None


class MemberDetail(MemberSummary):
    gender: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address_line1: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    preferred_language: Optional[str] = None
    clinical_risk_score: Optional[float] = None
    utilization_risk_score: Optional[float] = None
    cost_risk_score: Optional[float] = None
    engagement_risk_score: Optional[float] = None


class RiskInsight(BaseModel):
    id: int
    domain: str
    score: float
    driver: Optional[str] = None
    recommendation: Optional[str] = None
    confidence: Optional[float] = None
    last_updated_at: datetime


class CareJourneyStage(BaseModel):
    id: int
    sequence: int
    name: str
    description: Optional[str] = None
    status: str
    completed_at: Optional[datetime] = None


class CareJourney(BaseModel):
    id: int
    member_id: int
    name: str
    description: Optional[str] = None
    status: str
    template_name: Optional[str] = None
    source: Optional[str] = None
    assigned_to: Optional[str] = None
    created_by: Optional[str] = None
    start_date: Optional[date] = None
    target_completion_date: Optional[date] = None
    stages: list[CareJourneyStage] = Field(default_factory=list)
    open_task_count: int = 0


class CareJourneyTemplate(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    recommended_for_risk_tier: Optional[str] = None
    default_stages: list[dict[str, Any]] = Field(default_factory=list)
    default_tasks: list[dict[str, Any]] = Field(default_factory=list)


class SBAR(BaseModel):
    situation: Optional[str] = None
    background: Optional[str] = None
    assessment: Optional[str] = None
    recommendation: Optional[str] = None


class Task(BaseModel):
    id: int
    member_id: int
    journey_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    assigned_user: Optional[str] = None
    assigned_queue: Optional[str] = None
    priority: str
    status: str
    due_date: Optional[date] = None
    sbar: SBAR = Field(default_factory=SBAR)
    recommended_next_action: Optional[str] = None
    auto_generated_reason: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    member_name: Optional[str] = None
    risk_tier: Optional[str] = None


class TaskCreate(BaseModel):
    member_id: int
    journey_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    priority: str = "medium"
    status: str = "open"
    assigned_user: Optional[str] = None
    assigned_queue: Optional[str] = None
    due_date: Optional[date] = None
    sbar: Optional[SBAR] = None
    recommended_next_action: Optional[str] = None
    auto_generated_reason: Optional[str] = None
    notes: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    assigned_user: Optional[str] = None
    assigned_queue: Optional[str] = None
    due_date: Optional[date] = None
    sbar: Optional[SBAR] = None
    recommended_next_action: Optional[str] = None
    auto_generated_reason: Optional[str] = None
    notes: Optional[str] = None
    journey_id: Optional[int] = None


class Note(BaseModel):
    id: int
    member_id: int
    author_email: str
    author_name: Optional[str] = None
    channel: str
    note_type: Optional[str] = None
    body: str
    related_task_id: Optional[int] = None
    related_journey_id: Optional[int] = None
    created_at: datetime


class NoteCreate(BaseModel):
    body: str
    channel: str = "internal"
    note_type: Optional[str] = None
    related_task_id: Optional[int] = None
    related_journey_id: Optional[int] = None


class Message(BaseModel):
    id: int
    member_id: int
    channel: str
    direction: str
    sender: Optional[str] = None
    recipient: Optional[str] = None
    body: str
    status: str
    timestamp: datetime


class MessageCreate(BaseModel):
    channel: str = "chat"
    direction: str = "outbound"
    body: str
    sender: Optional[str] = None
    recipient: Optional[str] = None


class Claim(BaseModel):
    id: int
    claim_number: str
    service_date: Optional[date] = None
    provider: Optional[str] = None
    category: Optional[str] = None
    status: str
    billed_amount: Optional[float] = None
    paid_amount: Optional[float] = None
    member_responsibility: Optional[float] = None


class Accumulator(BaseModel):
    deductible: Optional[float] = None
    deductible_met: Optional[float] = None
    out_of_pocket_max: Optional[float] = None
    out_of_pocket_met: Optional[float] = None
    plan_year_start: Optional[date] = None


class CareOption(BaseModel):
    id: int
    member_id: int
    service_type: str
    recommended_provider: Optional[str] = None
    facility_name: Optional[str] = None
    cost_estimate: Optional[float] = None
    quality_score: Optional[float] = None
    distance_miles: Optional[float] = None
    network_status: Optional[str] = None
    potential_savings: Optional[float] = None
    rationale: Optional[str] = None
    member_facing_explanation: Optional[str] = None
    status: str


class CareOptionCreate(BaseModel):
    member_id: int
    service_type: str
    recommended_provider: Optional[str] = None
    facility_name: Optional[str] = None
    cost_estimate: Optional[float] = None
    quality_score: Optional[float] = None
    distance_miles: Optional[float] = None
    network_status: Optional[str] = None
    potential_savings: Optional[float] = None
    rationale: Optional[str] = None
    member_facing_explanation: Optional[str] = None
    status: str = "recommended"


class SavingsRecord(BaseModel):
    id: int
    member_id: int
    care_option_id: Optional[int] = None
    original_expected_cost: Optional[float] = None
    steered_option_cost: Optional[float] = None
    estimated_savings: Optional[float] = None
    claim_received: bool = False
    savings_validated: bool = False
    validation_status: str


class Document(BaseModel):
    id: int
    member_id: int
    file_name: str
    document_type: Optional[str] = None
    uploaded_by: Optional[str] = None
    uploaded_at: datetime
    status: str


class MemberListResponse(BaseModel):
    items: list[MemberSummary]
    total: int


class MemberDetailResponse(BaseModel):
    member: MemberDetail
    risk_insights: list[RiskInsight] = Field(default_factory=list)
    tasks: list[Task] = Field(default_factory=list)
    care_journeys: list[CareJourney] = Field(default_factory=list)
    notes: list[Note] = Field(default_factory=list)
    messages: list[Message] = Field(default_factory=list)
    claims: list[Claim] = Field(default_factory=list)
    accumulator: Optional[Accumulator] = None
    care_options: list[CareOption] = Field(default_factory=list)
    savings: list[SavingsRecord] = Field(default_factory=list)
    documents: list[Document] = Field(default_factory=list)


class DashboardMetric(BaseModel):
    key: str
    label: str
    value: float
    delta: Optional[float] = None
    hint: Optional[str] = None


class DashboardRiskDriver(BaseModel):
    domain: str
    driver: str
    member_count: int
    average_score: float


class DashboardRecentActivity(BaseModel):
    kind: str
    member_id: Optional[int] = None
    member_name: Optional[str] = None
    summary: str
    timestamp: datetime


class DashboardUpcomingAction(BaseModel):
    member_id: int
    member_name: str
    risk_tier: Optional[str] = None
    next_action: str
    due_date: Optional[date] = None


class DashboardResponse(BaseModel):
    metrics: list[DashboardMetric]
    high_priority_members: list[MemberSummary] = Field(default_factory=list)
    top_risk_drivers: list[DashboardRiskDriver] = Field(default_factory=list)
    recent_activity: list[DashboardRecentActivity] = Field(default_factory=list)
    upcoming_actions: list[DashboardUpcomingAction] = Field(default_factory=list)
