from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context, get_tenant_session
from ..models.ride_booking import (
    RideBooking as RideBookingModel,
    RidePartner as RidePartnerModel,
    RidePartnerBillingProfile as RidePartnerBillingProfileModel,
    RidePartnerSchedule as RidePartnerScheduleModel,
    RidePaymentEvent as RidePaymentEventModel,
    RidePaymentRecord as RidePaymentRecordModel,
    RideReconciliationItem as RideReconciliationItemModel,
)
from ..schemas.ride_booking import (
    RideBooking,
    RideBookingCreate,
    RideListResponse,
    RideOptionsResponse,
    RidePartner,
    RidePartnerAvailability,
    RidePartnerAvailabilityResponse,
    RidePartnerBillingProfile,
    RidePartnerBillingProfileUpsert,
    RidePartnerCreate,
    RidePartnerListResponse,
    RidePartnerSchedule,
    RidePartnerScheduleCreate,
    RidePaymentEvent,
    RidePaymentMetric,
    RidePaymentRecord,
    RidePaymentsResponse,
    RideReconciliationItem,
)
from ..utils.audit_logger import record_audit_event
from ..utils.security import AuthenticatedUser, get_current_user, require_application

router = APIRouter(
    prefix="/api/ride-booking",
    tags=["ride_booking"],
    dependencies=[Depends(require_application("ride_booking"))],
)

BASE_RIDE_COMPANIES = ["Uber Health", "Lyft Assist", "Other"]
WEEKDAY_INDEX = {
    "sun": 6,
    "mon": 0,
    "tue": 1,
    "wed": 2,
    "thu": 3,
    "fri": 4,
    "sat": 5,
}


def _schedule_to_schema(row: RidePartnerScheduleModel) -> RidePartnerSchedule:
    return RidePartnerSchedule(
        id=row.id,
        frequency=row.frequency,
        start_date=row.start_date,
        end_date=row.end_date,
        open_slots=row.open_slots,
        days_of_week=list(row.days_of_week or []),
        days_of_month=list(row.days_of_month or []),
        notes=row.notes,
    )


def _billing_to_schema(row: RidePartnerBillingProfileModel | None) -> RidePartnerBillingProfile | None:
    if row is None:
        return None
    return RidePartnerBillingProfile(
        pay_to_name=row.pay_to_name,
        payment_email=row.payment_email,
        payment_method=row.payment_method,
        remit_address=row.remit_address,
        tax_id=row.tax_id,
        updated_at=row.updated_at,
    )


def _partner_to_schema(row: RidePartnerModel) -> RidePartner:
    return RidePartner(
        id=row.id,
        company_name=row.company_name,
        contact_name=row.contact_name,
        contact_email=row.contact_email,
        contact_phone=row.contact_phone,
        status=row.status,
        created_at=row.created_at,
        billing_profile=_billing_to_schema(row.billing_profile),
        schedules=[_schedule_to_schema(schedule) for schedule in row.schedules],
    )


def _ride_to_schema(row: RideBookingModel) -> RideBooking:
    return RideBooking(
        id=row.id,
        member_id=row.member_id,
        first_name=row.first_name,
        last_name=row.last_name,
        ride_type=row.ride_type,
        pickup=row.pickup,
        pickup_address=row.pickup_address,
        dropoff=row.dropoff,
        dropoff_address=row.dropoff_address,
        scheduled_pickup=row.scheduled_pickup,
        estimated_dropoff=row.estimated_dropoff,
        cost_usd=row.cost_usd,
        status=row.status,
        created_at=row.created_at,
    )


def _payment_record_to_schema(row: RidePaymentRecordModel) -> RidePaymentRecord:
    return RidePaymentRecord(
        id=row.id,
        counterparty_name=row.counterparty_name,
        invoice_number=row.invoice_number,
        amount_usd=row.amount_usd,
        status=row.status,
    )


def _reconciliation_to_schema(row: RideReconciliationItemModel) -> RideReconciliationItem:
    return RideReconciliationItem(
        id=row.id,
        title=row.title,
        detail=row.detail,
        status=row.status,
        priority=row.priority,
        created_at=row.created_at,
    )


def _event_to_schema(row: RidePaymentEventModel) -> RidePaymentEvent:
    return RidePaymentEvent(
        id=row.id,
        source=row.source,
        event_type=row.event_type,
        detail=row.detail,
        payload=dict(row.payload or {}),
        event_at=row.event_at,
    )


def _schedule_matches(schedule: RidePartnerScheduleModel, target_date: date) -> bool:
    if schedule.open_slots <= 0:
        return False
    if target_date < schedule.start_date or target_date > schedule.end_date:
        return False
    if schedule.frequency == "daily":
        return True
    if schedule.frequency == "weekly":
        allowed = schedule.days_of_week or list(WEEKDAY_INDEX.keys())
        weekday = target_date.weekday()
        return any(WEEKDAY_INDEX.get(code) == weekday for code in allowed)
    if schedule.frequency == "monthly":
        allowed = schedule.days_of_month or [target_date.day]
        return target_date.day in allowed
    return False


async def _list_partner_rows(session: AsyncSession) -> list[RidePartnerModel]:
    stmt = (
        select(RidePartnerModel)
        .options(
            selectinload(RidePartnerModel.schedules),
            selectinload(RidePartnerModel.billing_profile),
        )
        .where(RidePartnerModel.status == "active")
        .order_by(RidePartnerModel.company_name.asc())
    )
    return list((await session.scalars(stmt)).all())


async def _record_control_audit(
    control_session: AsyncSession,
    *,
    tenant: TenantContext,
    user: AuthenticatedUser,
    event_type: str,
    payload: dict,
) -> None:
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=user.email,
        event_type=event_type,
        payload=payload,
    )
    await control_session.commit()


@router.get("/rides", response_model=RideListResponse)
async def list_rides(
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_tenant_session),
    _: AuthenticatedUser = Depends(get_current_user),
) -> RideListResponse:
    total = int(await session.scalar(select(func.count()).select_from(RideBookingModel)) or 0)
    stmt = select(RideBookingModel).order_by(RideBookingModel.scheduled_pickup.desc()).limit(limit)
    rows = list((await session.scalars(stmt)).all())
    return RideListResponse(items=[_ride_to_schema(row) for row in rows], total=total)


@router.post("/rides", response_model=RideBooking, status_code=status.HTTP_201_CREATED)
async def create_ride(
    payload: RideBookingCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> RideBooking:
    partner = await session.scalar(
        select(RidePartnerModel).where(RidePartnerModel.company_name == payload.ride_type).limit(1)
    )
    ride = RideBookingModel(
        partner_id=partner.id if partner else None,
        member_id=payload.member_id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        ride_type=payload.ride_type,
        pickup=payload.pickup,
        pickup_address=payload.pickup_address,
        dropoff=payload.dropoff,
        dropoff_address=payload.dropoff_address,
        scheduled_pickup=payload.scheduled_pickup,
        estimated_dropoff=payload.estimated_dropoff or payload.scheduled_pickup + timedelta(minutes=45),
        cost_usd=payload.cost_usd,
        status=payload.status or "queued",
        created_by=current_user.email,
    )
    session.add(ride)
    await session.flush()
    await session.commit()
    await session.refresh(ride)
    await _record_control_audit(
        control_session,
        tenant=tenant,
        user=current_user,
        event_type="ride_booking.ride.create",
        payload={"ride_id": ride.id, "member_id": ride.member_id, "ride_type": ride.ride_type},
    )
    return _ride_to_schema(ride)


@router.get("/partners", response_model=RidePartnerListResponse)
async def list_partners(
    session: AsyncSession = Depends(get_tenant_session),
    _: AuthenticatedUser = Depends(get_current_user),
) -> RidePartnerListResponse:
    rows = await _list_partner_rows(session)
    return RidePartnerListResponse(items=[_partner_to_schema(row) for row in rows], total=len(rows))


@router.post("/partners", response_model=RidePartner, status_code=status.HTTP_201_CREATED)
async def create_partner(
    payload: RidePartnerCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> RidePartner:
    if not payload.company_name.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Company name is required")
    partner = RidePartnerModel(
        company_name=payload.company_name.strip(),
        contact_name=(payload.contact_name or "").strip() or None,
        contact_email=(payload.contact_email or "").strip() or None,
        contact_phone=(payload.contact_phone or "").strip() or None,
    )
    session.add(partner)
    await session.flush()
    await session.commit()
    await session.refresh(partner, attribute_names=["schedules", "billing_profile"])
    await _record_control_audit(
        control_session,
        tenant=tenant,
        user=current_user,
        event_type="ride_booking.partner.create",
        payload={"partner_id": partner.id, "company_name": partner.company_name},
    )
    return _partner_to_schema(partner)


@router.post(
    "/partners/{partner_id}/schedules",
    response_model=RidePartnerSchedule,
    status_code=status.HTTP_201_CREATED,
)
async def create_partner_schedule(
    partner_id: int,
    payload: RidePartnerScheduleCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> RidePartnerSchedule:
    partner = await session.get(RidePartnerModel, partner_id)
    if not partner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner not found")
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="End date must be after start date")
    schedule = RidePartnerScheduleModel(
        partner_id=partner_id,
        frequency=payload.frequency,
        start_date=payload.start_date,
        end_date=payload.end_date,
        open_slots=payload.open_slots,
        days_of_week=payload.days_of_week,
        days_of_month=payload.days_of_month,
        notes=payload.notes,
    )
    session.add(schedule)
    await session.flush()
    await session.commit()
    await session.refresh(schedule)
    await _record_control_audit(
        control_session,
        tenant=tenant,
        user=current_user,
        event_type="ride_booking.schedule.create",
        payload={"partner_id": partner_id, "schedule_id": schedule.id},
    )
    return _schedule_to_schema(schedule)


@router.patch("/partners/{partner_id}/billing-profile", response_model=RidePartnerBillingProfile)
async def upsert_partner_billing_profile(
    partner_id: int,
    payload: RidePartnerBillingProfileUpsert,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> RidePartnerBillingProfile:
    partner = await session.get(RidePartnerModel, partner_id)
    if not partner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner not found")
    stmt = select(RidePartnerBillingProfileModel).where(RidePartnerBillingProfileModel.partner_id == partner_id)
    profile = await session.scalar(stmt)
    if profile is None:
        profile = RidePartnerBillingProfileModel(partner_id=partner_id)
        session.add(profile)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, key, value)
    await session.flush()
    await session.commit()
    await session.refresh(profile)
    await _record_control_audit(
        control_session,
        tenant=tenant,
        user=current_user,
        event_type="ride_booking.billing_profile.update",
        payload={"partner_id": partner_id},
    )
    return _billing_to_schema(profile)


@router.get("/partners/available", response_model=RidePartnerAvailabilityResponse)
async def list_available_partners(
    target_date: Optional[date] = Query(default=None, alias="date"),
    session: AsyncSession = Depends(get_tenant_session),
    _: AuthenticatedUser = Depends(get_current_user),
) -> RidePartnerAvailabilityResponse:
    day = target_date or date.today()
    rows = await _list_partner_rows(session)
    items: list[RidePartnerAvailability] = []
    for row in rows:
        schedules = [schedule for schedule in row.schedules if _schedule_matches(schedule, day)]
        if not schedules:
            continue
        items.append(
            RidePartnerAvailability(
                id=row.id,
                company_name=row.company_name,
                open_slots=sum(schedule.open_slots for schedule in schedules),
                schedules=[_schedule_to_schema(schedule) for schedule in schedules],
            )
        )
    return RidePartnerAvailabilityResponse(items=items)


@router.get("/ride-options", response_model=RideOptionsResponse)
async def list_ride_options(
    target_date: Optional[date] = Query(default=None, alias="date"),
    session: AsyncSession = Depends(get_tenant_session),
    _: AuthenticatedUser = Depends(get_current_user),
) -> RideOptionsResponse:
    day = target_date or date.today()
    rows = await _list_partner_rows(session)
    partner_names = [
        row.company_name
        for row in rows
        if any(_schedule_matches(schedule, day) for schedule in row.schedules)
    ]
    options = list(dict.fromkeys([*BASE_RIDE_COMPANIES, *partner_names]))
    return RideOptionsResponse(options=options)


@router.get("/payments", response_model=RidePaymentsResponse)
async def get_payments(
    session: AsyncSession = Depends(get_tenant_session),
    _: AuthenticatedUser = Depends(get_current_user),
) -> RidePaymentsResponse:
    provider_rows = list(
        (
            await session.scalars(
                select(RidePaymentRecordModel)
                .where(RidePaymentRecordModel.payer_type == "provider")
                .order_by(RidePaymentRecordModel.created_at.desc())
                .limit(20)
            )
        ).all()
    )
    subscriber_rows = list(
        (
            await session.scalars(
                select(RidePaymentRecordModel)
                .where(RidePaymentRecordModel.payer_type == "subscriber")
                .order_by(RidePaymentRecordModel.created_at.desc())
                .limit(20)
            )
        ).all()
    )
    reconciliation_rows = list(
        (
            await session.scalars(
                select(RideReconciliationItemModel)
                .where(RideReconciliationItemModel.status == "open")
                .order_by(RideReconciliationItemModel.created_at.desc())
                .limit(20)
            )
        ).all()
    )
    event_rows = list(
        (
            await session.scalars(
                select(RidePaymentEventModel).order_by(RidePaymentEventModel.event_at.desc()).limit(20)
            )
        ).all()
    )

    if not provider_rows and not subscriber_rows:
        rides = list((await session.scalars(select(RideBookingModel).limit(20))).all())
        pseudo_provider_total = sum(float(ride.cost_usd or 0) for ride in rides)
        pseudo_subscriber_total = pseudo_provider_total * 1.12
    else:
        pseudo_provider_total = sum(row.amount_usd for row in provider_rows)
        pseudo_subscriber_total = sum(row.amount_usd for row in subscriber_rows)

    metrics = [
        RidePaymentMetric(
            id="payouts",
            label="Total payouts",
            value=f"${pseudo_provider_total:,.0f}",
            meta="Provider records",
            tone="success",
        ),
        RidePaymentMetric(
            id="invoices",
            label="Subscriber invoices",
            value=f"${pseudo_subscriber_total:,.0f}",
            meta="Subscriber records",
            tone="info",
        ),
        RidePaymentMetric(
            id="disputes",
            label="Open disputes",
            value=str(len(reconciliation_rows)),
            meta="Needs review",
            tone="danger" if reconciliation_rows else "success",
        ),
    ]
    return RidePaymentsResponse(
        metrics=metrics,
        provider_records=[_payment_record_to_schema(row) for row in provider_rows],
        subscriber_records=[_payment_record_to_schema(row) for row in subscriber_rows],
        reconciliation=[_reconciliation_to_schema(row) for row in reconciliation_rows],
        events=[_event_to_schema(row) for row in event_rows],
    )
