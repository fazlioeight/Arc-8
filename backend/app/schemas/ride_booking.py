from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class RidePartnerBillingProfile(BaseModel):
    pay_to_name: Optional[str] = None
    payment_email: Optional[str] = None
    payment_method: str = "ach"
    remit_address: Optional[str] = None
    tax_id: Optional[str] = None
    updated_at: Optional[datetime] = None


class RidePartnerBillingProfileUpsert(BaseModel):
    pay_to_name: Optional[str] = None
    payment_email: Optional[str] = None
    payment_method: Optional[str] = None
    remit_address: Optional[str] = None
    tax_id: Optional[str] = None


class RidePartnerSchedule(BaseModel):
    id: int
    frequency: str
    start_date: date
    end_date: date
    open_slots: int = 0
    days_of_week: list[str] = Field(default_factory=list)
    days_of_month: list[int] = Field(default_factory=list)
    notes: Optional[str] = None


class RidePartnerScheduleCreate(BaseModel):
    frequency: str
    start_date: date
    end_date: date
    open_slots: int = Field(default=0, ge=0)
    days_of_week: list[str] = Field(default_factory=list)
    days_of_month: list[int] = Field(default_factory=list)
    notes: Optional[str] = None


class RidePartner(BaseModel):
    id: int
    company_name: str
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    status: str = "active"
    created_at: Optional[datetime] = None
    billing_profile: Optional[RidePartnerBillingProfile] = None
    schedules: list[RidePartnerSchedule] = Field(default_factory=list)


class RidePartnerCreate(BaseModel):
    company_name: str
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None


class RideBooking(BaseModel):
    id: str
    member_id: str
    first_name: str
    last_name: str
    ride_type: str
    pickup: str
    pickup_address: str
    dropoff: str
    dropoff_address: str
    scheduled_pickup: datetime
    estimated_dropoff: Optional[datetime] = None
    cost_usd: Optional[float] = None
    status: str = "queued"
    created_at: Optional[datetime] = None


class RideBookingCreate(BaseModel):
    member_id: str
    first_name: str
    last_name: str
    ride_type: str
    pickup: str
    pickup_address: str
    dropoff: str
    dropoff_address: str
    scheduled_pickup: datetime
    estimated_dropoff: Optional[datetime] = None
    cost_usd: Optional[float] = Field(default=None, ge=0)
    status: Optional[str] = None


class RideListResponse(BaseModel):
    items: list[RideBooking]
    total: int


class RidePartnerListResponse(BaseModel):
    items: list[RidePartner]
    total: int


class RidePartnerAvailability(BaseModel):
    id: int
    company_name: str
    open_slots: int
    schedules: list[RidePartnerSchedule] = Field(default_factory=list)


class RidePartnerAvailabilityResponse(BaseModel):
    items: list[RidePartnerAvailability]


class RideOptionsResponse(BaseModel):
    options: list[str]


class RidePaymentMetric(BaseModel):
    id: str
    label: str
    value: str
    meta: Optional[str] = None
    tone: Optional[str] = None


class RidePaymentRecord(BaseModel):
    id: str
    counterparty_name: str
    invoice_number: str
    amount_usd: float
    status: str


class RideReconciliationItem(BaseModel):
    id: str
    title: str
    detail: Optional[str] = None
    status: str
    priority: str
    created_at: Optional[datetime] = None


class RidePaymentEvent(BaseModel):
    id: str
    source: str
    event_type: str
    detail: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)
    event_at: datetime


class RidePaymentsResponse(BaseModel):
    metrics: list[RidePaymentMetric]
    provider_records: list[RidePaymentRecord]
    subscriber_records: list[RidePaymentRecord]
    reconciliation: list[RideReconciliationItem]
    events: list[RidePaymentEvent]
