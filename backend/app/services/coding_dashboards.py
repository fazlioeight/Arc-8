from __future__ import annotations

from datetime import date, timedelta
from typing import Optional, Sequence

from sqlalchemy import and_, case, distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .coding_status import PENDING_REVIEW, TERMINAL_CHASE_STATUSES

from ..models.coding import (
    CodingMao004Record,
    CodingMember,
    CodingMemberChase,
    CodingMemberNote,
    CodingMemberPriority,
    CodingProvider,
    CodingProviderLocation,
)


# Sentinel the worklist UI sends for the "Unassigned" saved view. It is not a
# real coder email — it means "chases with no assignee" — so it gets its own
# NULL/empty branch instead of an equality match (see fetch_worklist).
UNASSIGNED_SENTINEL = "__unassigned__"


def _normalize_sequence(values: Optional[Sequence[str]]) -> list[str]:
    if not values:
        return []
    if isinstance(values, str):  # type: ignore[unreachable]
        return [values]
    return [value for value in values if value]


def _member_display_name(first_name: Optional[str], last_name: Optional[str]) -> Optional[str]:
    parts = [part for part in (first_name, last_name) if part]
    if not parts:
        return None
    return " ".join(parts)


async def fetch_worklist(
    session: AsyncSession,
    *,
    statuses: Optional[Sequence[str]] = None,
    priorities: Optional[Sequence[str]] = None,
    assigned: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 25,
) -> dict[str, object]:
    status_values = _normalize_sequence(statuses)
    priority_values = _normalize_sequence(priorities)
    filters = []

    if status_values:
        filters.append(CodingMemberChase.status.in_(status_values))
    if priority_values:
        filters.append(CodingMemberChase.priority.in_(priority_values))
    if assigned:
        if assigned.lower() == UNASSIGNED_SENTINEL:
            filters.append(
                or_(
                    CodingMemberChase.assigned_coder_email.is_(None),
                    func.trim(CodingMemberChase.assigned_coder_email) == "",
                )
            )
        else:
            filters.append(func.lower(CodingMemberChase.assigned_coder_email) == assigned.lower())
    if search:
        term = search.strip().lower()
        like = f"%{term}%"
        compact = term.replace(" ", "").replace("-", "")
        compact_like = f"%{compact}%"
        hcc_digits = compact[3:] if compact.startswith("hcc") and compact[3:].isdigit() else compact
        hcc_alt_like = f"%hcc{hcc_digits}%" if hcc_digits.isdigit() else compact_like
        full_name = (
            func.coalesce(func.lower(CodingMember.first_name), "")
            + " "
            + func.coalesce(func.lower(CodingMember.last_name), "")
        )
        normalized_hcc = func.replace(
            func.replace(func.lower(func.coalesce(CodingMemberChase.hcc_code, "")), " ", ""),
            "-",
            "",
        )
        filters.append(
            or_(
                func.lower(CodingMember.member_key).like(like),
                func.lower(CodingMember.first_name).like(like),
                func.lower(CodingMember.last_name).like(like),
                full_name.like(like),
                func.lower(CodingMember.pcp_name).like(like),
                func.lower(CodingMemberChase.hcc_code).like(like),
                normalized_hcc.like(compact_like),
                normalized_hcc.like(hcc_alt_like),
                func.lower(CodingMemberChase.icd10_code).like(like),
                func.lower(CodingMemberChase.chase_code).like(like),
                func.lower(CodingMemberChase.assigned_coder_email).like(like),
            )
        )

    page = max(page, 1)
    page_size = max(1, min(page_size, 100))

    base_join = CodingMemberChase.member_id == CodingMember.id

    total_stmt = select(func.count()).select_from(CodingMemberChase).join(CodingMember, base_join, isouter=False)
    if filters:
        total_stmt = total_stmt.where(and_(*filters))
    total = await session.scalar(total_stmt)
    total = int(total or 0)

    status_stmt = (
        select(CodingMemberChase.status, func.count())
        .join(CodingMember, base_join)
        .group_by(CodingMemberChase.status)
    )
    if filters:
        status_stmt = status_stmt.where(and_(*filters))
    status_rows = (await session.execute(status_stmt)).all()
    status_counts = {row[0]: int(row[1] or 0) for row in status_rows if row[0]}

    priority_stmt = (
        select(CodingMemberChase.priority, func.count())
        .join(CodingMember, base_join)
        .group_by(CodingMemberChase.priority)
    )
    if filters:
        priority_stmt = priority_stmt.where(and_(*filters))
    priority_rows = (await session.execute(priority_stmt)).all()
    priority_counts = {row[0]: int(row[1] or 0) for row in priority_rows if row[0]}

    today = date.today()
    upcoming = today + timedelta(days=7)

    due_filters = list(filters)
    due_filters.append(CodingMemberChase.due_date.is_not(None))
    due_base = select(func.count()).select_from(CodingMemberChase).join(CodingMember, base_join)

    due_soon_stmt = due_base.where(
        CodingMemberChase.due_date >= today,
        CodingMemberChase.due_date <= upcoming,
    )
    if due_filters:
        due_soon_stmt = due_soon_stmt.where(and_(*due_filters))
    due_soon = await session.scalar(due_soon_stmt) or 0

    overdue_stmt = due_base.where(
        CodingMemberChase.due_date < today,
        CodingMemberChase.status.notin_(TERMINAL_CHASE_STATUSES),
    )
    if filters:
        overdue_stmt = overdue_stmt.where(and_(*filters))
    overdue = await session.scalar(overdue_stmt) or 0

    items_stmt = (
        select(
            CodingMemberChase.id.label("chase_id"),
            CodingMember.id.label("member_id"),
            CodingMember.member_key,
            CodingMember.first_name,
            CodingMember.last_name,
            CodingMemberChase.status,
            CodingMemberChase.priority,
            CodingMemberChase.assigned_coder_email,
            CodingMemberChase.icd10_code,
            CodingMemberChase.hcc_code,
            CodingMemberChase.service_date_from,
            CodingMemberChase.service_date_to,
            CodingMemberChase.due_date,
            CodingMemberChase.updated_at,
        )
        .join(CodingMember, base_join)
        .order_by(CodingMemberChase.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    if filters:
        items_stmt = items_stmt.where(and_(*filters))

    rows = (await session.execute(items_stmt)).all()
    items = []
    for row in rows:
        items.append(
            {
                "chase_id": row.chase_id,
                "member_id": row.member_id,
                "member_key": row.member_key,
                "member_name": _member_display_name(row.first_name, row.last_name),
                "status": row.status,
                "priority": row.priority,
                "assigned_coder_email": row.assigned_coder_email,
                "icd10_code": row.icd10_code,
                "hcc_code": row.hcc_code,
                "service_date_from": row.service_date_from,
                "service_date_to": row.service_date_to,
                "due_date": row.due_date,
                "updated_at": row.updated_at,
            }
        )

    return {
        "items": items,
        "total": total,
        "summary": {
            "status_counts": status_counts,
            "priority_counts": priority_counts,
            "due_soon": int(due_soon),
            "overdue": int(overdue),
        },
    }


async def fetch_review_dashboard(
    session: AsyncSession,
    *,
    assigned_email: Optional[str] = None,
    limit: int = 50,
) -> dict[str, object]:
    base_filters = [CodingMemberChase.status.notin_(TERMINAL_CHASE_STATUSES)]

    total_open_stmt = select(func.count()).select_from(CodingMemberChase).where(and_(*base_filters))
    total_open = await session.scalar(total_open_stmt) or 0

    assigned_count = 0
    if assigned_email:
        assigned_stmt = total_open_stmt.where(
            func.lower(CodingMemberChase.assigned_coder_email) == assigned_email.lower()
        )
        assigned_count = await session.scalar(assigned_stmt) or 0

    today = date.today()
    due_today_stmt = total_open_stmt.where(CodingMemberChase.due_date == today)
    due_today = await session.scalar(due_today_stmt) or 0

    overdue_stmt = total_open_stmt.where(CodingMemberChase.due_date < today)
    overdue = await session.scalar(overdue_stmt) or 0

    in_review_stmt = select(func.count()).select_from(CodingMemberChase).where(CodingMemberChase.status == PENDING_REVIEW)
    in_review = await session.scalar(in_review_stmt) or 0

    notes_subquery = (
        select(
            CodingMemberNote.member_id.label("member_id"),
            func.count().label("note_count"),
            func.max(CodingMemberNote.created_at).label("last_note_at"),
        )
        .group_by(CodingMemberNote.member_id)
        .subquery()
    )

    priority_subquery = (
        select(
            CodingMemberPriority.member_id.label("member_id"),
            CodingMemberPriority.next_action.label("next_action"),
        ).subquery()
    )

    queue_stmt = (
        select(
            CodingMemberChase.id.label("chase_id"),
            CodingMember.id.label("member_id"),
            CodingMember.member_key,
            CodingMember.first_name,
            CodingMember.last_name,
            CodingMemberChase.status,
            CodingMemberChase.priority,
            CodingMemberChase.assigned_coder_email,
            CodingMemberChase.icd10_code,
            CodingMemberChase.hcc_code,
            CodingMemberChase.service_date_from,
            CodingMemberChase.service_date_to,
            CodingMemberChase.due_date,
            CodingMemberChase.updated_at,
            func.coalesce(notes_subquery.c.note_count, 0).label("note_count"),
            notes_subquery.c.last_note_at,
            priority_subquery.c.next_action,
        )
        .join(CodingMember, CodingMember.id == CodingMemberChase.member_id)
        .join(notes_subquery, notes_subquery.c.member_id == CodingMember.id, isouter=True)
        .join(priority_subquery, priority_subquery.c.member_id == CodingMember.id, isouter=True)
        .where(and_(*base_filters))
        .order_by(CodingMemberChase.updated_at.desc())
        .limit(limit)
    )

    queue_rows = (await session.execute(queue_stmt)).all()
    queue = []
    for row in queue_rows:
        queue.append(
            {
                "chase_id": row.chase_id,
                "member_id": row.member_id,
                "member_key": row.member_key,
                "member_name": _member_display_name(row.first_name, row.last_name),
                "status": row.status,
                "priority": row.priority,
                "assigned_coder_email": row.assigned_coder_email,
                "icd10_code": row.icd10_code,
                "hcc_code": row.hcc_code,
                "service_date_from": row.service_date_from,
                "service_date_to": row.service_date_to,
                "due_date": row.due_date,
                "updated_at": row.updated_at,
                "note_count": int(row.note_count or 0),
                "last_note_at": row.last_note_at,
                "next_action": row.next_action,
            }
        )

    metrics = [
        {"label": "Open chases", "value": int(total_open), "hint": "Status not closed."},
        {"label": "Assigned to you", "value": int(assigned_count), "hint": "Chases in your queue."},
        {"label": "Due today", "value": int(due_today), "hint": "Due date is today."},
        {"label": "Overdue", "value": int(overdue), "hint": "Past due date and still open."},
        {"label": "In review", "value": int(in_review), "hint": "Marked as in review."},
    ]

    return {
        "metrics": metrics,
        "queue": queue,
    }


async def fetch_provider_education(
    session: AsyncSession,
    *,
    search: Optional[str] = None,
) -> list[dict[str, object]]:
    stmt = (
        select(
            CodingProvider.id,
            CodingProvider.name,
            CodingProvider.npi,
            CodingProvider.tax_id,
            func.count(distinct(CodingMember.id)).label("member_count"),
            func.count(distinct(CodingMemberChase.id)).label("open_gaps"),
            func.count(distinct(CodingMao004Record.id)).label("mao_records"),
            func.max(CodingMember.last_contacted_at).label("last_contacted_at"),
        )
        .join(CodingMember, CodingMember.pcp_npi == CodingProvider.npi, isouter=True)
        .join(CodingMemberChase, CodingMemberChase.member_id == CodingMember.id, isouter=True)
        .join(CodingMao004Record, CodingMao004Record.member_id == CodingMember.id, isouter=True)
        .group_by(CodingProvider.id)
        .order_by(CodingProvider.name.asc())
    )

    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(CodingProvider.name).like(like),
                func.lower(CodingProvider.npi).like(like),
                func.lower(CodingProvider.tax_id).like(like),
            )
        )

    rows = (await session.execute(stmt)).all()
    items = []
    for row in rows:
        open_gaps = int(row.open_gaps or 0)
        if open_gaps == 0:
            education_status = "completed"
        elif open_gaps <= 5:
            education_status = "in_progress"
        else:
            education_status = "at_risk"
        items.append(
            {
                "provider_id": row.id,
                "name": row.name,
                "npi": row.npi,
                "tax_id": row.tax_id,
                "member_count": int(row.member_count or 0),
                "open_gaps": open_gaps,
                "mao_records": int(row.mao_records or 0),
                "last_contacted_at": row.last_contacted_at,
                "education_status": education_status,
            }
        )
    return items


async def fetch_group_overview(
    session: AsyncSession,
    *,
    search: Optional[str] = None,
) -> list[dict[str, object]]:
    active_gap = case(
        (CodingMemberChase.status.notin_(TERMINAL_CHASE_STATUSES), 1),
        else_=0,
    )

    stmt = (
        select(
            CodingProvider.tax_id.label("group_key"),
            func.max(CodingProvider.name).label("group_name"),
            func.count(distinct(CodingProvider.id)).label("provider_count"),
            func.count(distinct(CodingMember.id)).label("member_count"),
            func.count(distinct(CodingMemberChase.id)).label("open_gaps"),
            func.avg(CodingMember.risk_score).label("avg_risk_score"),
            func.sum(active_gap).label("pending_education"),
        )
        .join(CodingMember, CodingMember.pcp_npi == CodingProvider.npi, isouter=True)
        .join(CodingMemberChase, CodingMemberChase.member_id == CodingMember.id, isouter=True)
        .group_by(CodingProvider.tax_id)
        .order_by(func.max(CodingProvider.name).asc())
    )

    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(CodingProvider.tax_id).like(like),
                func.lower(CodingProvider.name).like(like),
            )
        )

    rows = (await session.execute(stmt)).all()
    items = []
    for row in rows:
        group_key = row.group_key or "UNASSIGNED"
        group_name = row.group_name or f"Group {group_key}"
        avg_risk = float(row.avg_risk_score or 0.0)
        items.append(
            {
                "group_key": group_key,
                "group_name": group_name,
                "tax_id": row.group_key,
                "provider_count": int(row.provider_count or 0),
                "member_count": int(row.member_count or 0),
                "open_gaps": int(row.open_gaps or 0),
                "average_risk_score": round(avg_risk, 2),
                "pending_education": int(row.pending_education or 0),
            }
        )
    return items


async def fetch_provider_management(
    session: AsyncSession,
    *,
    search: Optional[str] = None,
) -> list[dict[str, object]]:
    stmt = (
        select(
            CodingProvider.id,
            CodingProvider.name,
            CodingProvider.npi,
            CodingProvider.tax_id,
            CodingProvider.phone,
            CodingProvider.email,
            CodingProviderLocation.address_line1,
            CodingProviderLocation.city,
            CodingProviderLocation.state,
            CodingProviderLocation.postal_code,
            func.count(distinct(CodingMember.id)).label("member_count"),
            func.count(distinct(CodingMemberChase.id)).label("open_chases"),
            func.max(CodingMemberChase.updated_at).label("last_updated_at"),
        )
        .join(CodingProviderLocation, CodingProviderLocation.provider_id == CodingProvider.id, isouter=True)
        .join(CodingMember, CodingMember.pcp_npi == CodingProvider.npi, isouter=True)
        .join(CodingMemberChase, CodingMemberChase.member_id == CodingMember.id, isouter=True)
        .group_by(
            CodingProvider.id,
            CodingProviderLocation.id,
        )
        .order_by(CodingProvider.name.asc())
    )

    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(CodingProvider.name).like(like),
                func.lower(CodingProvider.npi).like(like),
                func.lower(CodingProvider.tax_id).like(like),
            )
        )

    rows = (await session.execute(stmt)).all()
    items = []
    for row in rows:
        items.append(
            {
                "provider_id": row.id,
                "name": row.name,
                "npi": row.npi,
                "tax_id": row.tax_id,
                "phone": row.phone,
                "email": row.email,
                "address_line1": row.address_line1,
                "city": row.city,
                "state": row.state,
                "postal_code": row.postal_code,
                "member_count": int(row.member_count or 0),
                "open_chases": int(row.open_chases or 0),
                "last_updated_at": row.last_updated_at,
            }
        )
    return items


async def update_provider_contact(
    session: AsyncSession,
    provider_id: int,
    payload: dict[str, object],
) -> CodingProvider | None:
    stmt = select(CodingProvider).where(CodingProvider.id == provider_id)
    provider = await session.scalar(stmt)
    if not provider:
        return None

    updatable_fields = ("name", "npi", "phone", "email", "tax_id")
    for field in updatable_fields:
        if field in payload:
            setattr(provider, field, payload[field])

    location_fields = {"address_line1", "city", "state", "postal_code"}
    if location_fields.intersection(payload.keys()):
        location = provider.location
        if location is None:
            location = CodingProviderLocation(provider_id=provider.id)
            session.add(location)
            provider.location = location
        for field in location_fields:
            if field in payload:
                setattr(location, field, payload[field])

    await session.flush()
    await session.refresh(provider)
    return provider
