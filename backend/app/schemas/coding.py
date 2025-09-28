from __future__ import annotations

from datetime import date, datetime
from typing import Optional

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


class CodingMemberDetail(CodingMemberSummary):
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    primary_language: Optional[str] = None
    last_contacted_at: Optional[datetime] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None


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
    chases: list[CodingChase]
    notes: list[CodingNote]
    attachments: list[CodingAttachment]


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
