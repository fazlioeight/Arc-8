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


class MemberUpdate(BaseModel):
    """Editable subset of MemberDetail. All fields optional — partial PATCH."""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    gender: Optional[str] = None
    plan_name: Optional[str] = None
    line_of_business: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address_line1: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    preferred_language: Optional[str] = None
    preferred_channel: Optional[str] = None
    primary_care_provider: Optional[str] = None


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


class CareJourneyCreate(BaseModel):
    """Payload for ``POST /api/member360/care-journeys``.

    If ``template_id`` is supplied, the template's ``default_stages`` are
    copied onto the new journey verbatim and ``template_name`` is captured
    from the template. ``name`` falls back to the template name when omitted.
    """
    member_id: int
    name: Optional[str] = None
    description: Optional[str] = None
    template_id: Optional[int] = None
    status: str = "active"
    source: Optional[str] = None
    assigned_to: Optional[str] = None
    start_date: Optional[date] = None
    target_completion_date: Optional[date] = None


class CareJourneyUpdate(BaseModel):
    """Partial update for a care journey. All fields optional."""
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    start_date: Optional[date] = None
    target_completion_date: Optional[date] = None


class CareJourneyStageUpdate(BaseModel):
    """Stage status transitions. ``status`` is the only required field but
    callers can also rename a stage or rewrite its description if needed."""
    status: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None


class CareJourneyStageCreate(BaseModel):
    """Append a stage to an existing journey. If ``sequence`` is omitted the
    new stage lands at the end (max existing sequence + 1)."""
    name: str
    description: Optional[str] = None
    status: str = "pending"
    sequence: Optional[int] = None


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
    # Populated for documents uploaded via POST /members/{id}/documents.
    # Legacy rows imported with metadata only leave these unset.
    storage_backend: Optional[str] = None
    content_type: Optional[str] = None
    size_bytes: Optional[int] = None
    sha256: Optional[str] = None


class MemberListResponse(BaseModel):
    items: list[MemberSummary]
    total: int


class Problem(BaseModel):
    id: int
    member_id: int
    code: str
    code_system: str
    description: Optional[str] = None
    status: str
    severity: Optional[str] = None
    is_primary: bool = False
    onset_date: Optional[date] = None
    resolved_date: Optional[date] = None
    recorded_by: Optional[str] = None


class Medication(BaseModel):
    id: int
    member_id: int
    rx_number: str
    ndc_code: Optional[str] = None
    drug_name: str
    generic_name: Optional[str] = None
    dose: Optional[str] = None
    dose_unit: Optional[str] = None
    route: Optional[str] = None
    frequency: Optional[str] = None
    days_supply: Optional[int] = None
    refills_remaining: Optional[int] = None
    prescriber: Optional[str] = None
    pharmacy: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    last_fill_date: Optional[date] = None
    status: str


class Lab(BaseModel):
    id: int
    member_id: int
    loinc_code: str
    test_name: str
    result_value: Optional[str] = None
    result_unit: Optional[str] = None
    reference_range_low: Optional[float] = None
    reference_range_high: Optional[float] = None
    abnormal_flag: Optional[str] = None
    result_date: date
    ordering_provider: Optional[str] = None
    performing_lab: Optional[str] = None
    status: str


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
    problems: list[Problem] = Field(default_factory=list)
    medications: list[Medication] = Field(default_factory=list)
    labs: list[Lab] = Field(default_factory=list)


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


# ---- Gap analysis & submission export ------------------------------------


class GapMember(BaseModel):
    id: int
    member_key: str
    risk_score: Optional[float] = None
    risk_tier: Optional[str] = None


class MissingHcc(BaseModel):
    hcc_code: str
    icd10_candidates: list[str] = Field(default_factory=list)
    reason: Optional[str] = None
    recommendation: Optional[str] = None
    domain: Optional[str] = None
    score: Optional[float] = None
    confidence: Optional[float] = None


class GapAnalysisResponse(BaseModel):
    member: GapMember
    mao_records: list[dict[str, Any]] = Field(default_factory=list)
    missing_hcc: list[MissingHcc] = Field(default_factory=list)
    stale_records: list[dict[str, Any]] = Field(default_factory=list)
    immediate_actions: list[str] = Field(default_factory=list)
    submission_year: int


class SubmissionExportRequest(BaseModel):
    submission_year: Optional[int] = None
    member_ids: Optional[list[int]] = None


class SubmissionExportResponse(BaseModel):
    batch_id: int
    submission_year: int
    record_count: int
    csv: str


# ---- Aggregate (multi-member) list endpoints ------------------------------
#
# Each aggregate row carries the same handful of denormalized member fields
# (member_name, member_key, risk_tier, plan_name, preferred_channel) so the
# population pages don't have to fan out and refetch member detail per row.
# `RiskInsight` and `Message` previously omitted `member_id` from their
# schemas; the list variants add it back since it is needed to deep-link
# from a population row back to the member workspace.


class _MemberRef(BaseModel):
    member_name: Optional[str] = None
    member_key: Optional[str] = None
    risk_tier: Optional[str] = None
    plan_name: Optional[str] = None
    preferred_channel: Optional[str] = None


class TaskListItem(Task, _MemberRef):
    pass


class TaskListResponse(BaseModel):
    items: list[TaskListItem]
    total: int


class MessageListItem(Message, _MemberRef):
    pass


class MessageListResponse(BaseModel):
    items: list[MessageListItem]
    total: int


class CareOptionListItem(CareOption, _MemberRef):
    pass


class CareOptionListResponse(BaseModel):
    items: list[CareOptionListItem]
    total: int


class DocumentListItem(Document, _MemberRef):
    pass


class DocumentListResponse(BaseModel):
    items: list[DocumentListItem]
    total: int


class CareJourneyListItem(CareJourney, _MemberRef):
    pass


class CareJourneyListResponse(BaseModel):
    items: list[CareJourneyListItem]
    total: int


class RiskInsightListItem(RiskInsight, _MemberRef):
    member_id: int


class RiskInsightListResponse(BaseModel):
    items: list[RiskInsightListItem]
    total: int


# ---- Batch ingest --------------------------------------------------------
#
# Upsert endpoints keyed on natural identifiers (`member_key`, `claim_number`,
# `member_key + domain`). Reruns are idempotent — same input produces same
# DB state — so callers can re-POST a corrected batch without cleanup.


class MemberImportItem(BaseModel):
    """Upsertable subset of Member360Member. ``member_key`` is the unique
    natural key the upserter dedupes on. ``next_best_action`` and the four
    risk scores are operator-controlled — they're included so an external
    risk engine can write them through this endpoint."""
    member_key: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    plan_name: Optional[str] = None
    line_of_business: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address_line1: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    preferred_language: Optional[str] = None
    preferred_channel: Optional[str] = None
    primary_care_provider: Optional[str] = None
    risk_score_composite: Optional[float] = None
    risk_tier: Optional[str] = None
    clinical_risk_score: Optional[float] = None
    utilization_risk_score: Optional[float] = None
    cost_risk_score: Optional[float] = None
    engagement_risk_score: Optional[float] = None
    open_care_gaps: Optional[int] = None
    next_best_action: Optional[str] = None


class MemberImportRequest(BaseModel):
    members: list[MemberImportItem]


class ClaimImportItem(BaseModel):
    """Claim upsert. Keyed on ``claim_number`` (unique within a tenant).
    ``member_key`` is required so the upserter can resolve the FK without
    callers having to know our internal member ids."""
    member_key: str
    claim_number: str
    service_date: Optional[date] = None
    provider: Optional[str] = None
    category: Optional[str] = None
    status: str = "paid"
    billed_amount: Optional[float] = None
    paid_amount: Optional[float] = None
    member_responsibility: Optional[float] = None


class ClaimImportRequest(BaseModel):
    claims: list[ClaimImportItem]


class RiskInsightImportItem(BaseModel):
    """Risk insight upsert. Keyed on ``(member_key, domain)`` — one row per
    domain per member; reposting overwrites driver/score/recommendation."""
    member_key: str
    domain: str
    score: float
    driver: Optional[str] = None
    recommendation: Optional[str] = None
    confidence: Optional[float] = None


class RiskInsightImportRequest(BaseModel):
    insights: list[RiskInsightImportItem]


class ProblemImportItem(BaseModel):
    """Problem upsert keyed on ``(member_key, code, code_system)``."""
    member_key: str
    code: str
    code_system: str = "ICD-10"
    description: Optional[str] = None
    status: Optional[str] = None
    severity: Optional[str] = None
    is_primary: Optional[bool] = None
    onset_date: Optional[date] = None
    resolved_date: Optional[date] = None
    recorded_by: Optional[str] = None


class ProblemImportRequest(BaseModel):
    problems: list[ProblemImportItem]


class MedicationImportItem(BaseModel):
    """Medication upsert keyed on ``(member_key, rx_number)``. Reposting the
    same rx_number with updated ``last_fill_date`` / ``refills_remaining``
    advances the existing row instead of creating a new fill record."""
    member_key: str
    rx_number: str
    drug_name: str
    ndc_code: Optional[str] = None
    generic_name: Optional[str] = None
    dose: Optional[str] = None
    dose_unit: Optional[str] = None
    route: Optional[str] = None
    frequency: Optional[str] = None
    days_supply: Optional[int] = None
    refills_remaining: Optional[int] = None
    prescriber: Optional[str] = None
    pharmacy: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    last_fill_date: Optional[date] = None
    status: Optional[str] = None


class MedicationImportRequest(BaseModel):
    medications: list[MedicationImportItem]


class LabImportItem(BaseModel):
    """Lab upsert keyed on ``(member_key, loinc_code, result_date)``."""
    member_key: str
    loinc_code: str
    test_name: str
    result_date: date
    result_value: Optional[str] = None
    result_unit: Optional[str] = None
    reference_range_low: Optional[float] = None
    reference_range_high: Optional[float] = None
    abnormal_flag: Optional[str] = None
    ordering_provider: Optional[str] = None
    performing_lab: Optional[str] = None
    status: Optional[str] = None


class LabImportRequest(BaseModel):
    labs: list[LabImportItem]


class ImportError(BaseModel):
    index: int
    member_key: Optional[str] = None
    detail: str


class ImportResponse(BaseModel):
    """Counts reflect the *final* outcome of the batch:
    ``created`` + ``updated`` + ``len(errors)`` == total submitted."""
    created: int = 0
    updated: int = 0
    errors: list[ImportError] = Field(default_factory=list)
