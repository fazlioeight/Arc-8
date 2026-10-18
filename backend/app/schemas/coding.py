from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class CodingMemberSummary(BaseModel):
    id: int
    member_key: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    status: str
    line_of_business: Optional[str] = None
    risk_score: Optional[float] = None
    pcp_name: Optional[str] = None
    pcp_npi: Optional[str] = None
    assigned_coder_ids: list[int] = Field(default_factory=list)
    assigned_coder_emails: list[str] = Field(default_factory=list)


class CodingMemberDetail(CodingMemberSummary):
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    primary_language: Optional[str] = None
    last_contacted_at: Optional[datetime] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None



class CodingMemberEligibility(BaseModel):
    plan_start: Optional[date] = None
    plan_end: Optional[date] = None
    medicare_effective_date: Optional[date] = None
    joined_at: Optional[date] = None
    is_new_to_medicare: bool = False
    is_dual_eligible: bool = False
    risk_tier: Optional[str] = None
    last_synced_at: Optional[datetime] = None


class CodingClaimSummary(BaseModel):
    id: int
    claim_number: str
    claim_type: str
    service_date: Optional[date] = None
    provider_id: Optional[int] = None
    diagnosis_codes: Dict[str, Any] = Field(default_factory=dict)
    hcc_codes: Dict[str, Any] = Field(default_factory=dict)
    total_paid: Optional[float] = None
    chart_required: bool = False


class CodingMaoRecord(BaseModel):
    id: int
    submission_year: int
    hcc_code: str
    icd10_code: Optional[str] = None
    service_start: Optional[date] = None
    service_end: Optional[date] = None
    status: str


class CodingHealthAssessmentDetail(BaseModel):
    id: int
    assessment_date: date
    assessment_type: str
    provider_id: Optional[int] = None
    icd10_codes: list[str] = Field(default_factory=list)
    hcc_codes: list[str] = Field(default_factory=list)
    completion_status: str
    notes: Optional[str] = None


class CodingMemberPriorityView(BaseModel):
    member_id: int
    member_key: str
    priority_score: float
    priority_tier: str
    hcc_opportunity_count: int
    next_action: Optional[str] = None
    next_action_due: Optional[date] = None
    justification: Optional[str] = None


class CodingChase(BaseModel):
    id: int
    chase_code: str
    status: str
    priority: str
    assigned_coder_id: Optional[int] = None
    assigned_coder_email: Optional[str] = None
    due_date: Optional[date] = None
    service_date_from: Optional[date] = None
    service_date_to: Optional[date] = None
    icd10_code: Optional[str] = None
    hcc_code: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CodingNote(BaseModel):
    id: int
    member_id: int
    author_email: str
    author_name: Optional[str] = None
    body: str
    created_at: datetime


class CodingAttachment(BaseModel):
    id: int
    member_id: int
    filename: str
    content_type: str
    storage_path: str
    uploaded_by: Optional[str] = None
    uploaded_at: datetime
    is_external: bool


class CodingMemberCreate(BaseModel):
    member_key: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    status: str = Field(default="active")
    line_of_business: Optional[str] = None
    primary_language: Optional[str] = None
    risk_score: Optional[float] = None
    pcp_name: Optional[str] = None
    pcp_npi: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None


class CodingChaseCreate(BaseModel):
    chase_code: str
    status: str = Field(default="open")
    priority: str = Field(default="normal")
    assigned_coder_id: Optional[int] = None
    assigned_coder_email: Optional[str] = None
    due_date: Optional[date] = None
    service_date_from: Optional[date] = None
    service_date_to: Optional[date] = None
    icd10_code: Optional[str] = None
    hcc_code: Optional[str] = None
    notes: Optional[str] = None


class CodingChaseUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_coder_id: Optional[int] = None
    assigned_coder_email: Optional[str] = None
    due_date: Optional[date] = None
    service_date_from: Optional[date] = None
    service_date_to: Optional[date] = None
    icd10_code: Optional[str] = None
    hcc_code: Optional[str] = None
    notes: Optional[str] = None


class CodingNoteCreate(BaseModel):
    body: str
    author_name: Optional[str] = None


class CodingAttachmentCreate(BaseModel):
    filename: str
    content_type: str
    storage_path: str
    is_external: bool = False


class CodingMemberSearchResponse(BaseModel):
    items: list[CodingMemberSummary]
    total: int


class CodingMemberDetailResponse(BaseModel):
    member: CodingMemberDetail
    eligibility: Optional[CodingMemberEligibility] = None
    chases: list[CodingChase]
    notes: list[CodingNote]
    attachments: list[CodingAttachment]
    claims: list[CodingClaimSummary] = Field(default_factory=list)
    mao_records: list[CodingMaoRecord] = Field(default_factory=list)
    health_assessments: list[CodingHealthAssessmentDetail] = Field(default_factory=list)
    priority: Optional[CodingMemberPriorityView] = None


class CodingProviderSummary(BaseModel):
    id: int
    name: str
    npi: Optional[str] = None
    tax_id: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class CodingProviderLocation(BaseModel):
    address_line1: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None


class CodingProviderDetail(CodingProviderSummary):
    location: Optional[CodingProviderLocation] = None


class CodingProviderSearchResponse(BaseModel):
    items: list[CodingProviderSummary]
    total: int



class CoderSummary(BaseModel):
    id: int
    email: str
    role: str
    applications: Dict[str, str] = Field(default_factory=dict)


class CodingAssignmentItem(BaseModel):
    chase_id: int
    member_id: int
    member_key: str
    member_name: Optional[str] = None
    status: str
    priority: Optional[str] = None
    assigned_coder_email: Optional[str] = None
    hcc_code: Optional[str] = None
    icd10_code: Optional[str] = None
    updated_at: Optional[datetime] = None


class CodingAssignmentOverview(BaseModel):
    coders: list[CoderSummary]
    items: list[CodingAssignmentItem]


class CodingAssignmentRequest(BaseModel):
    coder_email: str
    chase_ids: list[int] = Field(default_factory=list)
    member_ids: list[int] = Field(default_factory=list)

class CodingMemberGapResponse(BaseModel):
    member: Dict[str, Any]
    mao_records: list[Dict[str, Any]]
    missing_hcc: list[Dict[str, Any]]
    stale_records: list[Dict[str, Any]]
    immediate_actions: list[str]


class CodingPrioritizedResponse(BaseModel):
    items: list[CodingMemberPriorityView]
    total: int


class HealthAssessmentCreate(BaseModel):
    assessment_date: date
    assessment_type: str = Field(default="initial")
    provider_id: Optional[int] = None
    icd10_codes: list[str] = Field(default_factory=list)
    hcc_codes: list[str] = Field(default_factory=list)
    notes: Optional[str] = None


class SubmissionGenerateRequest(BaseModel):
    submission_year: int
    member_ids: Optional[list[int]] = None


class SubmissionGenerateResponse(BaseModel):
    batch_id: int
    submission_year: int
    record_count: int
    csv: str
