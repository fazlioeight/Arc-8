from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .tables import TenantDataBase


class CodingMember(TenantDataBase):
    __tablename__ = "coding_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    member_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String(1), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="active")
    line_of_business: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    primary_language: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    risk_score: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    pcp_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    pcp_npi: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    last_contacted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    address_city: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    address_state: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    address_zip: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    chases: Mapped[list["CodingMemberChase"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    notes: Mapped[list["CodingMemberNote"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    attachments: Mapped[list["CodingMemberAttachment"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    eligibility: Mapped[Optional["CodingMemberEligibility"]] = relationship(
        back_populates="member", uselist=False, cascade="all, delete-orphan"
    )
    claims: Mapped[list["CodingClaim"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    mao_records: Mapped[list["CodingMao004Record"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    health_assessments: Mapped[list["CodingHealthAssessment"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    priorities: Mapped[list["CodingMemberPriority"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )


class CodingMemberChase(TenantDataBase):
    __tablename__ = "coding_member_chases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("coding_members.id", ondelete="CASCADE"), index=True)
    chase_code: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="open")
    priority: Mapped[str] = mapped_column(String(16), default="normal")
    assigned_coder_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    assigned_coder_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    service_date_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    service_date_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    icd10_code: Mapped[Optional[str]] = mapped_column(String(12), nullable=True)
    hcc_code: Mapped[Optional[str]] = mapped_column(String(12), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    member: Mapped[CodingMember] = relationship(back_populates="chases")


class CodingMemberNote(TenantDataBase):
    __tablename__ = "coding_member_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("coding_members.id", ondelete="CASCADE"), index=True)
    author_email: Mapped[str] = mapped_column(String(255))
    author_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    member: Mapped[CodingMember] = relationship(back_populates="notes")


class CodingMemberAttachment(TenantDataBase):
    __tablename__ = "coding_member_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("coding_members.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    storage_path: Mapped[str] = mapped_column(String(512))
    uploaded_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_external: Mapped[bool] = mapped_column(Boolean, default=False)

    member: Mapped[CodingMember] = relationship(back_populates="attachments")


class CodingProvider(TenantDataBase):
    __tablename__ = "coding_providers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    npi: Mapped[Optional[str]] = mapped_column(String(15), unique=True, index=True, nullable=True)
    tax_id: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    name: Mapped[str] = mapped_column(String(128))
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    location: Mapped[Optional["CodingProviderLocation"]] = relationship(
        back_populates="provider", uselist=False, cascade="all, delete-orphan"
    )


class CodingProviderLocation(TenantDataBase):
    __tablename__ = "coding_provider_locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("coding_providers.id", ondelete="CASCADE"), unique=True)
    address_line1: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    postal_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    provider: Mapped[CodingProvider] = relationship(back_populates="location")


class CodingMemberEligibility(TenantDataBase):
    __tablename__ = "coding_member_eligibility"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("coding_members.id", ondelete="CASCADE"), unique=True, index=True)
    plan_start: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    plan_end: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    medicare_effective_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    joined_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    is_new_to_medicare: Mapped[bool] = mapped_column(Boolean, default=False)
    is_dual_eligible: Mapped[bool] = mapped_column(Boolean, default=False)
    risk_tier: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    member: Mapped[CodingMember] = relationship(back_populates="eligibility")


class CodingClaim(TenantDataBase):
    __tablename__ = "coding_claims"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("coding_members.id", ondelete="CASCADE"), index=True)
    provider_id: Mapped[Optional[int]] = mapped_column(ForeignKey("coding_providers.id", ondelete="SET NULL"), nullable=True)
    claim_number: Mapped[str] = mapped_column(String(64), index=True)
    claim_type: Mapped[str] = mapped_column(String(32), default="professional")
    service_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    diagnosis_codes: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    procedure_codes: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    hcc_codes: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    total_paid: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    chart_required: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    member: Mapped[CodingMember] = relationship(back_populates="claims")
    provider: Mapped[Optional[CodingProvider]] = relationship("CodingProvider")


class CodingMao004Record(TenantDataBase):
    __tablename__ = "coding_mao004_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("coding_members.id", ondelete="CASCADE"), index=True)
    submission_year: Mapped[int] = mapped_column(Integer, index=True)
    hcc_code: Mapped[str] = mapped_column(String(12))
    icd10_code: Mapped[Optional[str]] = mapped_column(String(12), nullable=True)
    service_start: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    service_end: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    source_claim_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="open")
    last_received_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    member: Mapped[CodingMember] = relationship(back_populates="mao_records")


class CodingHealthAssessment(TenantDataBase):
    __tablename__ = "coding_health_assessments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("coding_members.id", ondelete="CASCADE"), index=True)
    assessment_date: Mapped[date] = mapped_column(Date)
    assessment_type: Mapped[str] = mapped_column(String(64))
    provider_id: Mapped[Optional[int]] = mapped_column(ForeignKey("coding_providers.id", ondelete="SET NULL"), nullable=True)
    icd10_codes: Mapped[list[str]] = mapped_column(JSON, default=list)
    hcc_codes: Mapped[list[str]] = mapped_column(JSON, default=list)
    completion_status: Mapped[str] = mapped_column(String(32), default="pending_submission")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    member: Mapped[CodingMember] = relationship(back_populates="health_assessments")
    provider: Mapped[Optional[CodingProvider]] = relationship("CodingProvider")


class CodingMemberPriority(TenantDataBase):
    __tablename__ = "coding_member_priorities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("coding_members.id", ondelete="CASCADE"), unique=True)
    priority_score: Mapped[float] = mapped_column(Float)
    priority_tier: Mapped[str] = mapped_column(String(16))
    hcc_opportunity_count: Mapped[int] = mapped_column(Integer, default=0)
    next_action: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    next_action_due: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    justification: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    member: Mapped[CodingMember] = relationship(back_populates="priorities")


class CodingSubmissionBatch(TenantDataBase):
    __tablename__ = "coding_submission_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    submission_year: Mapped[int] = mapped_column(Integer, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default="draft")
    record_count: Mapped[int] = mapped_column(Integer, default=0)
    payload_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

