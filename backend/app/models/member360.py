"""Per-tenant SQLAlchemy models for the Nexora Lab Member360 module.

These tables back the care management workspace: members, risk insights,
care journeys (and their stages/templates), tasks with SBAR, notes,
omni-channel messages, claims, accumulators, care option reports,
collaborative care savings, and documents.

All tables are namespaced with the ``m360_`` prefix to keep this module
isolated from the existing ``coding_*`` tables. Reuse across modules is
intentionally avoided so this scaffold can evolve without coupling.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .tables import TenantDataBase


class Member360Member(TenantDataBase):
    __tablename__ = "m360_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    member_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    plan_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    line_of_business: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    address_line1: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    address_city: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    address_state: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    address_zip: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    preferred_language: Mapped[Optional[str]] = mapped_column(String(48), nullable=True)
    preferred_channel: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    primary_care_provider: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    risk_score_composite: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    risk_tier: Mapped[Optional[str]] = mapped_column(String(16), nullable=True, index=True)
    clinical_risk_score: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    utilization_risk_score: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    cost_risk_score: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    engagement_risk_score: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    open_care_gaps: Mapped[int] = mapped_column(Integer, default=0)
    next_best_action: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    last_interaction_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    risk_insights: Mapped[list["Member360RiskInsight"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    care_journeys: Mapped[list["Member360CareJourney"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    tasks: Mapped[list["Member360Task"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    notes: Mapped[list["Member360Note"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    messages: Mapped[list["Member360Message"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    claims: Mapped[list["Member360Claim"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    accumulator: Mapped[Optional["Member360Accumulator"]] = relationship(
        back_populates="member", uselist=False, cascade="all, delete-orphan"
    )
    care_options: Mapped[list["Member360CareOption"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    savings: Mapped[list["Member360Savings"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    documents: Mapped[list["Member360Document"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    problems: Mapped[list["Member360Problem"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    medications: Mapped[list["Member360Medication"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    labs: Mapped[list["Member360Lab"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    # Member-portal (Feature 3) additive relationships.
    coverages: Mapped[list["Member360Coverage"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )
    dependents: Mapped[list["Member360Dependent"]] = relationship(
        back_populates="subscriber", cascade="all, delete-orphan"
    )
    accumulator_scopes: Mapped[list["Member360AccumulatorScope"]] = relationship(
        back_populates="member", cascade="all, delete-orphan"
    )


class Member360RiskInsight(TenantDataBase):
    __tablename__ = "m360_risk_insights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("m360_members.id", ondelete="CASCADE"), index=True
    )
    domain: Mapped[str] = mapped_column(String(32))
    score: Mapped[float] = mapped_column(Float)
    driver: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    recommendation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    member: Mapped[Member360Member] = relationship(back_populates="risk_insights")


class Member360CareJourneyTemplate(TenantDataBase):
    __tablename__ = "m360_care_journey_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    recommended_for_risk_tier: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    default_stages: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    default_tasks: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Member360CareJourney(TenantDataBase):
    __tablename__ = "m360_care_journeys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("m360_members.id", ondelete="CASCADE"), index=True
    )
    template_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("m360_care_journey_templates.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active", index=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    assigned_to: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    target_completion_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    template_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    member: Mapped[Member360Member] = relationship(back_populates="care_journeys")
    stages: Mapped[list["Member360CareJourneyStage"]] = relationship(
        back_populates="journey", cascade="all, delete-orphan", order_by="Member360CareJourneyStage.sequence"
    )
    tasks: Mapped[list["Member360Task"]] = relationship(back_populates="journey")


class Member360CareJourneyStage(TenantDataBase):
    __tablename__ = "m360_care_journey_stages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    journey_id: Mapped[int] = mapped_column(
        ForeignKey("m360_care_journeys.id", ondelete="CASCADE"), index=True
    )
    sequence: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    journey: Mapped[Member360CareJourney] = relationship(back_populates="stages")


class Member360Task(TenantDataBase):
    __tablename__ = "m360_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("m360_members.id", ondelete="CASCADE"), index=True
    )
    journey_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("m360_care_journeys.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assigned_user: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    assigned_queue: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    priority: Mapped[str] = mapped_column(String(16), default="medium", index=True)
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    sbar_situation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sbar_background: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sbar_assessment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sbar_recommendation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recommended_next_action: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    auto_generated_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    member: Mapped[Member360Member] = relationship(back_populates="tasks")
    journey: Mapped[Optional[Member360CareJourney]] = relationship(back_populates="tasks")


class Member360Note(TenantDataBase):
    __tablename__ = "m360_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("m360_members.id", ondelete="CASCADE"), index=True
    )
    author_email: Mapped[str] = mapped_column(String(255))
    author_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    channel: Mapped[str] = mapped_column(String(32), default="internal")
    note_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    related_task_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("m360_tasks.id", ondelete="SET NULL"), nullable=True
    )
    related_journey_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("m360_care_journeys.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    member: Mapped[Member360Member] = relationship(back_populates="notes")


class Member360Message(TenantDataBase):
    __tablename__ = "m360_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("m360_members.id", ondelete="CASCADE"), index=True
    )
    channel: Mapped[str] = mapped_column(String(32), default="chat")
    direction: Mapped[str] = mapped_column(String(16), default="outbound")
    sender: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    recipient: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="sent")
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    member: Mapped[Member360Member] = relationship(back_populates="messages")


class Member360Claim(TenantDataBase):
    __tablename__ = "m360_claims"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("m360_members.id", ondelete="CASCADE"), index=True
    )
    claim_number: Mapped[str] = mapped_column(String(64), index=True)
    service_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    provider: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="paid")
    billed_amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    paid_amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    member_responsibility: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)

    member: Mapped[Member360Member] = relationship(back_populates="claims")
    # Member-portal (Feature 3) additive relationships.
    lines: Mapped[list["Member360ClaimLine"]] = relationship(
        back_populates="claim", cascade="all, delete-orphan", order_by="Member360ClaimLine.line_number"
    )
    detail: Mapped[Optional["Member360ClaimDetail"]] = relationship(
        back_populates="claim", uselist=False, cascade="all, delete-orphan"
    )


class Member360Accumulator(TenantDataBase):
    __tablename__ = "m360_accumulators"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("m360_members.id", ondelete="CASCADE"), unique=True, index=True
    )
    deductible: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    deductible_met: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    out_of_pocket_max: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    out_of_pocket_met: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    plan_year_start: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    member: Mapped[Member360Member] = relationship(back_populates="accumulator")


class Member360CareOption(TenantDataBase):
    __tablename__ = "m360_care_options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("m360_members.id", ondelete="CASCADE"), index=True
    )
    service_type: Mapped[str] = mapped_column(String(160))
    recommended_provider: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    facility_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    cost_estimate: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    quality_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    distance_miles: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    network_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    potential_savings: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    rationale: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    member_facing_explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="recommended", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    member: Mapped[Member360Member] = relationship(back_populates="care_options")
    savings: Mapped[list["Member360Savings"]] = relationship(
        back_populates="care_option", cascade="all, delete-orphan"
    )


class Member360Savings(TenantDataBase):
    __tablename__ = "m360_savings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("m360_members.id", ondelete="CASCADE"), index=True
    )
    care_option_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("m360_care_options.id", ondelete="SET NULL"), nullable=True
    )
    original_expected_cost: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    steered_option_cost: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    estimated_savings: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    claim_received: Mapped[bool] = mapped_column(Boolean, default=False)
    savings_validated: Mapped[bool] = mapped_column(Boolean, default=False)
    validation_status: Mapped[str] = mapped_column(String(32), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    member: Mapped[Member360Member] = relationship(back_populates="savings")
    care_option: Mapped[Optional[Member360CareOption]] = relationship(back_populates="savings")


class Member360Document(TenantDataBase):
    __tablename__ = "m360_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("m360_members.id", ondelete="CASCADE"), index=True
    )
    file_name: Mapped[str] = mapped_column(String(255))
    document_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    uploaded_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    status: Mapped[str] = mapped_column(String(32), default="active")
    # Populated when the document was uploaded through the API (vs. a row
    # imported with metadata only). ``storage_backend`` names the backend
    # (``local`` / ``s3``) so a future migration to S3 can leave old rows
    # readable from disk. ``storage_path`` is the backend-specific key.
    storage_backend: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    storage_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    content_type: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    member: Mapped[Member360Member] = relationship(back_populates="documents")


# ---------------------- Clinical data tables --------------------------------
# Members carry three core clinical collections — problems (diagnosis list,
# including HCC mapping), medications (Rx fills), and labs (LOINC-coded
# observations). All three are upsertable by natural key so a daily feed from
# the EHR re-POSTs the same batch without producing duplicates.


class Member360Problem(TenantDataBase):
    """Diagnosis/problem entry. ``code`` + ``code_system`` is the natural key
    within a member; reposting the same combo updates the existing row."""
    __tablename__ = "m360_problems"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("m360_members.id", ondelete="CASCADE"), index=True
    )
    code: Mapped[str] = mapped_column(String(32), index=True)
    code_system: Mapped[str] = mapped_column(String(16), default="ICD-10")
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active", index=True)
    severity: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    onset_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    resolved_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    recorded_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    member: Mapped[Member360Member] = relationship(back_populates="problems")


class Member360Medication(TenantDataBase):
    """Prescription record. ``rx_number`` is the natural key — one row per
    prescription within a member; refills update fields (last_fill_date,
    refills_remaining) on the same row."""
    __tablename__ = "m360_medications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("m360_members.id", ondelete="CASCADE"), index=True
    )
    rx_number: Mapped[str] = mapped_column(String(64), index=True)
    ndc_code: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    drug_name: Mapped[str] = mapped_column(String(255))
    generic_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    dose: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    dose_unit: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    route: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    frequency: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    days_supply: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    refills_remaining: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    prescriber: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    pharmacy: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    last_fill_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    member: Mapped[Member360Member] = relationship(back_populates="medications")


class Member360Lab(TenantDataBase):
    """LOINC-coded lab observation. Natural key is
    ``(member_id, loinc_code, result_date)`` — same test, same day, same
    member is treated as a correction/update of the prior result rather
    than a duplicate."""
    __tablename__ = "m360_labs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("m360_members.id", ondelete="CASCADE"), index=True
    )
    loinc_code: Mapped[str] = mapped_column(String(16), index=True)
    test_name: Mapped[str] = mapped_column(String(160))
    result_value: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    result_unit: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    reference_range_low: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reference_range_high: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    abnormal_flag: Mapped[Optional[str]] = mapped_column(String(4), nullable=True)
    result_date: Mapped[date] = mapped_column(Date, index=True)
    ordering_provider: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    performing_lab: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="final")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    member: Mapped[Member360Member] = relationship(back_populates="labs")


# ---------------------- Admin / configuration tables -------------------------
# Backs Member360LabAdminPage. These are tenant-scoped (per-tenant DB) so each
# customer can tune their own catalog without coordinating with us.


class Member360RiskRule(TenantDataBase):
    __tablename__ = "m360_risk_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    domain: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    weight: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False, default=1.0)
    threshold: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recommendation_template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Member360TaskQueue(TenantDataBase):
    __tablename__ = "m360_task_queues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sla_priority_hours: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    escalation_queue: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    routing_rules: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Member360OutreachChannel(TenantDataBase):
    __tablename__ = "m360_outreach_channels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    channel_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    provider: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    config: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    consent_required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    preferred_languages: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Member360CareOptionPolicy(TenantDataBase):
    __tablename__ = "m360_care_option_policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    service_type: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    line_of_business: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    max_distance_miles: Mapped[Optional[float]] = mapped_column(Numeric(6, 2), nullable=True)
    min_quality_score: Mapped[Optional[float]] = mapped_column(Numeric(4, 2), nullable=True)
    min_savings_threshold: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    network_tier: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------- Member-portal additive tables ------------------------
# Net-new tables (NOT alterations of existing m360_* tables) so the tenant
# schema sync (TenantDataBase.metadata.create_all / ensure_tenant_schema) picks
# them up everywhere idempotently. They back the member-facing dashboard
# (Feature 3): coverage/eligibility detail, dependents, claim line-items, claim
# denial + EOB linkage, and the individual-vs-family accumulator split.


class Member360Coverage(TenantDataBase):
    """A coverage span for a member (current or historical).

    Supplies the eligibility fields the base ``m360_members`` row lacks:
    coverage status, effective/term dates, tier, and subscriber relationship.
    A member may have more than one row (e.g. medical + Part D, or successive
    plan years); ``is_primary`` flags the one the dashboard headlines.
    """

    __tablename__ = "m360_coverages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("m360_members.id", ondelete="CASCADE"), index=True
    )
    plan_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    line_of_business: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    coverage_status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    effective_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    term_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    coverage_tier: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    relationship_to_subscriber: Mapped[str] = mapped_column(String(32), default="subscriber")
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True)
    as_of_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    member: Mapped[Member360Member] = relationship(back_populates="coverages")


class Member360Dependent(TenantDataBase):
    """A covered dependent listed under a subscriber member."""

    __tablename__ = "m360_member_dependents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subscriber_member_id: Mapped[int] = mapped_column(
        ForeignKey("m360_members.id", ondelete="CASCADE"), index=True
    )
    first_name: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    relationship_type: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # If the dependent is themselves an m360 member, their key; else null.
    member_key: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    coverage_status: Mapped[str] = mapped_column(String(32), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    subscriber: Mapped[Member360Member] = relationship(back_populates="dependents")


class Member360ClaimLine(TenantDataBase):
    """A single service line on a claim, with the member-responsibility split
    (copay / coinsurance / deductible) and per-line denial reason."""

    __tablename__ = "m360_claim_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    claim_id: Mapped[int] = mapped_column(
        ForeignKey("m360_claims.id", ondelete="CASCADE"), index=True
    )
    line_number: Mapped[int] = mapped_column(Integer, default=1)
    service_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    procedure_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    procedure_description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    billed_amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    allowed_amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    paid_amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    member_responsibility: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    copay: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    coinsurance: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    deductible: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="paid")
    denial_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    claim: Mapped[Member360Claim] = relationship(back_populates="lines")


class Member360ClaimDetail(TenantDataBase):
    """1:1 supplement to a claim: claim-level denial reason and the EOB document
    link. Kept separate from ``m360_claims`` to avoid altering the base table."""

    __tablename__ = "m360_claim_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    claim_id: Mapped[int] = mapped_column(
        ForeignKey("m360_claims.id", ondelete="CASCADE"), unique=True, index=True
    )
    denial_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    eob_document_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("m360_documents.id", ondelete="SET NULL"), nullable=True
    )
    remittance_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    claim: Mapped[Member360Claim] = relationship(back_populates="detail")
    eob_document: Mapped[Optional["Member360Document"]] = relationship()


class Member360AccumulatorScope(TenantDataBase):
    """Per-scope accumulator (``individual`` or ``family``).

    Supplements the legacy single-row ``m360_accumulators`` (treated as the
    individual scope when no scoped rows exist), enabling the individual-vs-
    family split the dashboard needs.
    """

    __tablename__ = "m360_accumulator_scopes"
    __table_args__ = (
        UniqueConstraint("member_id", "scope", name="uq_m360_accumulator_scope"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("m360_members.id", ondelete="CASCADE"), index=True
    )
    scope: Mapped[str] = mapped_column(String(16), default="individual")
    deductible: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    deductible_met: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    out_of_pocket_max: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    out_of_pocket_met: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    plan_year_start: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    as_of_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    member: Mapped[Member360Member] = relationship(back_populates="accumulator_scopes")


# ---------------------- Provider directory (Feature 6) -----------------------
# m360 has no provider tables, so the member-facing provider/PCP search gets its
# own directory in the m360 domain. New tables only (create_all-friendly).
# Geocodes are CACHED on the location row + in m360_geocode_cache so provider
# addresses are never re-sent to Google on every request. PRIVACY: only provider
# addresses and the member-entered search location ever leave to Google — never
# member identity (enforced by the geocoding service taking address strings only).


class Member360Provider(TenantDataBase):
    __tablename__ = "m360_providers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    npi: Mapped[Optional[str]] = mapped_column(String(15), unique=True, index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    specialty: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    is_pcp: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    accepting_new_patients: Mapped[bool] = mapped_column(Boolean, default=True)
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    languages: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    locations: Mapped[list["Member360ProviderLocation"]] = relationship(
        back_populates="provider", cascade="all, delete-orphan"
    )
    networks: Mapped[list["Member360ProviderNetwork"]] = relationship(
        back_populates="provider", cascade="all, delete-orphan"
    )


class Member360ProviderLocation(TenantDataBase):
    __tablename__ = "m360_provider_locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider_id: Mapped[int] = mapped_column(
        ForeignKey("m360_providers.id", ondelete="CASCADE"), index=True
    )
    address_line1: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    address_line2: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    postal_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # pending | ok | failed — drives the batch geocoder; cached so we never
    # re-geocode an address that already resolved.
    geocode_status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    geocoded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    provider: Mapped[Member360Provider] = relationship(back_populates="locations")


class Member360ProviderNetwork(TenantDataBase):
    __tablename__ = "m360_provider_networks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider_id: Mapped[int] = mapped_column(
        ForeignKey("m360_providers.id", ondelete="CASCADE"), index=True
    )
    plan_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    line_of_business: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    network_status: Mapped[str] = mapped_column(String(24), default="in_network")

    provider: Mapped[Member360Provider] = relationship(back_populates="networks")


class Member360GeocodeCache(TenantDataBase):
    """Cache of geocoded query strings (provider addresses and member-entered
    search locations) so an address is sent to Google at most once."""

    __tablename__ = "m360_geocode_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    query_text: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="ok")  # ok | failed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
