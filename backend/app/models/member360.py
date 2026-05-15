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

    member: Mapped[Member360Member] = relationship(back_populates="documents")
