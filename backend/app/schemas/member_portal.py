"""Pydantic IO models for the member-facing dashboard (Feature 3)."""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class CoverageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    plan_name: Optional[str] = None
    line_of_business: Optional[str] = None
    coverage_status: str
    effective_date: Optional[date] = None
    term_date: Optional[date] = None
    coverage_tier: Optional[str] = None
    relationship_to_subscriber: str
    is_primary: bool
    as_of_date: Optional[date] = None


class DependentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    relationship_type: Optional[str] = None
    date_of_birth: Optional[date] = None
    coverage_status: str


class EligibilityResponse(BaseModel):
    member_key: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    plan_name: Optional[str] = None
    line_of_business: Optional[str] = None
    primary_care_provider: Optional[str] = None
    coverages: List[CoverageOut] = []
    dependents: List[DependentOut] = []


class ClaimSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    claim_number: str
    service_date: Optional[date] = None
    provider: Optional[str] = None
    category: Optional[str] = None
    status: str
    billed_amount: Optional[float] = None
    paid_amount: Optional[float] = None
    member_responsibility: Optional[float] = None


class ClaimListResponse(BaseModel):
    items: List[ClaimSummary] = []
    total: int
    limit: int
    offset: int


class ClaimLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    line_number: int
    service_date: Optional[date] = None
    procedure_code: Optional[str] = None
    procedure_description: Optional[str] = None
    billed_amount: Optional[float] = None
    allowed_amount: Optional[float] = None
    paid_amount: Optional[float] = None
    member_responsibility: Optional[float] = None
    copay: Optional[float] = None
    coinsurance: Optional[float] = None
    deductible: Optional[float] = None
    status: str
    denial_reason: Optional[str] = None


class ClaimDetailResponse(ClaimSummary):
    denial_reason: Optional[str] = None
    eob_document_id: Optional[int] = None
    lines: List[ClaimLineOut] = []


class AccumulatorScopeOut(BaseModel):
    scope: str
    deductible: Optional[float] = None
    deductible_met: Optional[float] = None
    deductible_remaining: Optional[float] = None
    out_of_pocket_max: Optional[float] = None
    out_of_pocket_met: Optional[float] = None
    out_of_pocket_remaining: Optional[float] = None
    plan_year_start: Optional[date] = None
    as_of_date: Optional[date] = None
    updated_at: Optional[datetime] = None


class AccumulatorsResponse(BaseModel):
    scopes: List[AccumulatorScopeOut] = []


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    file_name: str
    document_type: Optional[str] = None
    content_type: Optional[str] = None
    size_bytes: Optional[int] = None
    uploaded_at: Optional[datetime] = None
    status: str


class DocumentListResponse(BaseModel):
    items: List[DocumentOut] = []


class DocumentGrantResponse(BaseModel):
    download_url: str
    expires_in: int


class ProviderLocationOut(BaseModel):
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    phone: Optional[str] = None
    distance_miles: Optional[float] = None


class ProviderNetworkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    plan_name: Optional[str] = None
    line_of_business: Optional[str] = None
    network_status: str


class ProviderOut(BaseModel):
    id: int
    npi: Optional[str] = None
    name: str
    specialty: Optional[str] = None
    is_pcp: bool
    accepting_new_patients: bool
    phone: Optional[str] = None
    languages: List[str] = []
    nearest_distance_miles: Optional[float] = None
    locations: List[ProviderLocationOut] = []
    networks: List[ProviderNetworkOut] = []


class ProviderSearchOrigin(BaseModel):
    latitude: float
    longitude: float
    source: str  # coords | geocoded


class ProviderSearchResponse(BaseModel):
    items: List[ProviderOut] = []
    total: int
    limit: int
    offset: int
    origin: Optional[ProviderSearchOrigin] = None


class MapConfigResponse(BaseModel):
    maps_api_key: str
    has_key: bool
