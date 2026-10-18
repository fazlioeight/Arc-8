from __future__ import annotations

from datetime import date, datetime
from typing import Optional
import uuid

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .tables import TenantDataBase


class RidePartner(TenantDataBase):
    __tablename__ = "ride_partners"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    contact_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    schedules: Mapped[list["RidePartnerSchedule"]] = relationship(
        back_populates="partner", cascade="all, delete-orphan"
    )
    billing_profile: Mapped[Optional["RidePartnerBillingProfile"]] = relationship(
        back_populates="partner", uselist=False, cascade="all, delete-orphan"
    )
    rides: Mapped[list["RideBooking"]] = relationship(back_populates="partner")


class RidePartnerSchedule(TenantDataBase):
    __tablename__ = "ride_partner_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    partner_id: Mapped[int] = mapped_column(ForeignKey("ride_partners.id", ondelete="CASCADE"), index=True)
    frequency: Mapped[str] = mapped_column(String(32), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    open_slots: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    days_of_week: Mapped[list[str]] = mapped_column(JSON, default=list)
    days_of_month: Mapped[list[int]] = mapped_column(JSON, default=list)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    partner: Mapped[RidePartner] = relationship(back_populates="schedules")


class RidePartnerBillingProfile(TenantDataBase):
    __tablename__ = "ride_partner_billing_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    partner_id: Mapped[int] = mapped_column(
        ForeignKey("ride_partners.id", ondelete="CASCADE"), unique=True, index=True
    )
    pay_to_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    payment_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    payment_method: Mapped[str] = mapped_column(String(64), default="ach", nullable=False)
    remit_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tax_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    partner: Mapped[RidePartner] = relationship(back_populates="billing_profile")


class RideBooking(TenantDataBase):
    __tablename__ = "ride_bookings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    partner_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("ride_partners.id", ondelete="SET NULL"), nullable=True, index=True
    )
    member_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    first_name: Mapped[str] = mapped_column(String(128), nullable=False)
    last_name: Mapped[str] = mapped_column(String(128), nullable=False)
    ride_type: Mapped[str] = mapped_column(String(128), nullable=False)
    pickup: Mapped[str] = mapped_column(String(255), nullable=False)
    pickup_address: Mapped[str] = mapped_column(String(512), nullable=False)
    dropoff: Mapped[str] = mapped_column(String(255), nullable=False)
    dropoff_address: Mapped[str] = mapped_column(String(512), nullable=False)
    scheduled_pickup: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    estimated_dropoff: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cost_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="queued", nullable=False, index=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    partner: Mapped[Optional[RidePartner]] = relationship(back_populates="rides")


class RidePaymentRecord(TenantDataBase):
    __tablename__ = "ride_payment_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ride_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("ride_bookings.id", ondelete="SET NULL"), nullable=True, index=True
    )
    payer_type: Mapped[str] = mapped_column(String(32), nullable=False)
    counterparty_name: Mapped[str] = mapped_column(String(255), nullable=False)
    invoice_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    amount_usd: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="open", nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class RideReconciliationItem(TenantDataBase):
    __tablename__ = "ride_reconciliation_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="open", nullable=False, index=True)
    priority: Mapped[str] = mapped_column(String(32), default="medium", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class RidePaymentEvent(TenantDataBase):
    __tablename__ = "ride_payment_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    event_type: Mapped[str] = mapped_column(String(128), nullable=False)
    detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    event_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
