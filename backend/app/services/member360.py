"""Service layer for Nexora Lab Member360.

Responsibilities:
- Idempotent tenant schema setup (tables + PostgreSQL helper functions).
- Query helpers used by route handlers.
- Computation of dashboard rollups and risk insight summaries.

No demo or synthetic data is created automatically. All pages read from
whatever the tenant database contains; seeding is the operator's job via
``scripts/seed_prominence.py`` or a real data import.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Iterable, Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.member360 import (
    Member360CareJourney,
    Member360CareJourneyTemplate,
    Member360Member,
    Member360Message,
    Member360Note,
    Member360RiskInsight,
    Member360Savings,
    Member360Task,
)


def _compute_age(dob: Optional[date]) -> Optional[int]:
    if not dob:
        return None
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


async def ensure_ready(session: AsyncSession) -> None:
    """Ensure tenant tables and PostgreSQL helper functions exist.

    Replaces the previous demo-data seeding behaviour: this function only
    sets up *schema*, never data. Safe to call on every request — both
    operations are idempotent.
    """
    await _ensure_tenant_schema(session)


async def _ensure_tenant_schema(session: AsyncSession) -> None:
    """Idempotently create any missing tenant tables (Member360 admin tables)
    and the PostgreSQL helper functions used for rollups + worklists.
    """
    from ..models.tables import TenantDataBase

    try:
        async_conn = await session.connection()
        await async_conn.run_sync(TenantDataBase.metadata.create_all)
    except Exception:  # noqa: BLE001
        # Schema creation should never block reads; the table likely exists.
        pass
    await _ensure_tenant_functions(session)


_TENANT_FUNCTIONS_PATH = (
    __file__.rsplit("services", 1)[0] + "db/tenant_functions.sql"
)


async def _ensure_tenant_functions(session: AsyncSession) -> None:
    """Apply tenant-side stored functions. PostgreSQL only — silently skips
    on SQLite (used in tests) and any other dialect."""
    bind = session.get_bind()
    dialect = getattr(bind, "dialect", None)
    name = getattr(dialect, "name", "") if dialect else ""
    if not name.startswith("postgres"):
        return
    try:
        from pathlib import Path
        from sqlalchemy import text

        path = Path(_TENANT_FUNCTIONS_PATH)
        if not path.exists():
            return
        sql = path.read_text(encoding="utf-8")
        async_conn = await session.connection()
        for stmt in _split_sql(sql):
            await async_conn.execute(text(stmt))
    except Exception:  # noqa: BLE001
        # Function creation failures are non-fatal — the python query
        # fallbacks still work.
        pass


def _split_sql(sql: str) -> list[str]:
    """Naive split on ``$$`` dollar-quoted function bodies + trailing ``;``."""
    pieces: list[str] = []
    buf: list[str] = []
    in_dollar = False
    for line in sql.splitlines():
        stripped = line.strip()
        if stripped.startswith("--"):
            continue
        buf.append(line)
        if "$$" in line:
            # Count occurrences on this line — an odd count toggles state.
            if line.count("$$") % 2 == 1:
                in_dollar = not in_dollar
        if not in_dollar and stripped.endswith(";"):
            stmt = "\n".join(buf).strip()
            if stmt and stmt != ";":
                pieces.append(stmt.rstrip(";"))
            buf = []
    return pieces



# ---------------------- Query helpers --------------------------------------


def _summarize_member(
    member: Member360Member,
    task_counts: dict[int, int],
    journey_counts: dict[int, int],
) -> dict:
    age = _compute_age(member.date_of_birth)
    return {
        "id": member.id,
        "member_key": member.member_key,
        "first_name": member.first_name,
        "last_name": member.last_name,
        "date_of_birth": member.date_of_birth,
        "age": age,
        "plan_name": member.plan_name,
        "line_of_business": member.line_of_business,
        "preferred_channel": member.preferred_channel,
        "primary_care_provider": member.primary_care_provider,
        "risk_score_composite": float(member.risk_score_composite) if member.risk_score_composite is not None else None,
        "risk_tier": member.risk_tier,
        "open_care_gaps": member.open_care_gaps or 0,
        "open_task_count": task_counts.get(member.id, 0),
        "active_journey_count": journey_counts.get(member.id, 0),
        "next_best_action": member.next_best_action,
        "last_interaction_at": member.last_interaction_at,
    }


async def _open_task_counts(session: AsyncSession, member_ids: Iterable[int]) -> dict[int, int]:
    ids = list(member_ids)
    if not ids:
        return {}
    rows = await session.execute(
        select(Member360Task.member_id, func.count(Member360Task.id))
        .where(
            Member360Task.member_id.in_(ids),
            Member360Task.status.in_(["open", "in_progress", "waiting"]),
        )
        .group_by(Member360Task.member_id)
    )
    return {member_id: count for member_id, count in rows.all()}


async def _active_journey_counts(session: AsyncSession, member_ids: Iterable[int]) -> dict[int, int]:
    ids = list(member_ids)
    if not ids:
        return {}
    rows = await session.execute(
        select(Member360CareJourney.member_id, func.count(Member360CareJourney.id))
        .where(
            Member360CareJourney.member_id.in_(ids),
            Member360CareJourney.status.in_(["active", "paused"]),
        )
        .group_by(Member360CareJourney.member_id)
    )
    return {member_id: count for member_id, count in rows.all()}


async def list_members(
    session: AsyncSession,
    *,
    search: Optional[str] = None,
    risk_tier: Optional[list[str]] = None,
    has_active_journey: Optional[bool] = None,
    has_open_task: Optional[bool] = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[dict], int]:
    stmt = select(Member360Member)
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Member360Member.first_name).like(like),
                func.lower(Member360Member.last_name).like(like),
                func.lower(Member360Member.member_key).like(like),
                func.lower(Member360Member.primary_care_provider).like(like),
                func.lower(Member360Member.plan_name).like(like),
            )
        )
    if risk_tier:
        stmt = stmt.where(Member360Member.risk_tier.in_(risk_tier))

    total = await session.scalar(select(func.count()).select_from(stmt.subquery()))

    stmt = stmt.order_by(Member360Member.risk_score_composite.desc().nullslast(), Member360Member.id.asc())
    stmt = stmt.limit(limit).offset(offset)

    rows = await session.execute(stmt)
    members = rows.scalars().all()
    member_ids = [m.id for m in members]
    task_counts = await _open_task_counts(session, member_ids)
    journey_counts = await _active_journey_counts(session, member_ids)

    if has_open_task is True:
        members = [m for m in members if task_counts.get(m.id, 0) > 0]
    elif has_open_task is False:
        members = [m for m in members if task_counts.get(m.id, 0) == 0]

    if has_active_journey is True:
        members = [m for m in members if journey_counts.get(m.id, 0) > 0]
    elif has_active_journey is False:
        members = [m for m in members if journey_counts.get(m.id, 0) == 0]

    items = [_summarize_member(m, task_counts, journey_counts) for m in members]
    return items, int(total or 0)


async def get_member_detail(session: AsyncSession, member_id: int) -> Optional[dict]:
    stmt = (
        select(Member360Member)
        .where(Member360Member.id == member_id)
        .options(
            selectinload(Member360Member.risk_insights),
            selectinload(Member360Member.tasks),
            selectinload(Member360Member.care_journeys).selectinload(Member360CareJourney.stages),
            selectinload(Member360Member.notes),
            selectinload(Member360Member.messages),
            selectinload(Member360Member.claims),
            selectinload(Member360Member.accumulator),
            selectinload(Member360Member.care_options),
            selectinload(Member360Member.savings),
            selectinload(Member360Member.documents),
        )
    )
    member = await session.scalar(stmt)
    if not member:
        return None

    task_counts = await _open_task_counts(session, [member.id])
    journey_counts = await _active_journey_counts(session, [member.id])
    summary = _summarize_member(member, task_counts, journey_counts)

    detail = {
        **summary,
        "gender": member.gender,
        "phone": member.phone,
        "email": member.email,
        "address_line1": member.address_line1,
        "address_city": member.address_city,
        "address_state": member.address_state,
        "address_zip": member.address_zip,
        "preferred_language": member.preferred_language,
        "clinical_risk_score": float(member.clinical_risk_score) if member.clinical_risk_score is not None else None,
        "utilization_risk_score": float(member.utilization_risk_score) if member.utilization_risk_score is not None else None,
        "cost_risk_score": float(member.cost_risk_score) if member.cost_risk_score is not None else None,
        "engagement_risk_score": float(member.engagement_risk_score) if member.engagement_risk_score is not None else None,
    }

    journeys_payload = []
    open_task_by_journey: dict[int, int] = defaultdict(int)
    for task in member.tasks:
        if task.journey_id and task.status in ("open", "in_progress", "waiting"):
            open_task_by_journey[task.journey_id] += 1
    for journey in member.care_journeys:
        journeys_payload.append(
            {
                "id": journey.id,
                "member_id": journey.member_id,
                "name": journey.name,
                "description": journey.description,
                "status": journey.status,
                "template_name": journey.template_name,
                "source": journey.source,
                "assigned_to": journey.assigned_to,
                "created_by": journey.created_by,
                "start_date": journey.start_date,
                "target_completion_date": journey.target_completion_date,
                "stages": [
                    {
                        "id": s.id,
                        "sequence": s.sequence,
                        "name": s.name,
                        "description": s.description,
                        "status": s.status,
                        "completed_at": s.completed_at,
                    }
                    for s in journey.stages
                ],
                "open_task_count": open_task_by_journey.get(journey.id, 0),
            }
        )

    tasks_payload = [_task_to_dict(t, member) for t in member.tasks]

    care_options_payload = [
        {
            "id": opt.id,
            "member_id": opt.member_id,
            "service_type": opt.service_type,
            "recommended_provider": opt.recommended_provider,
            "facility_name": opt.facility_name,
            "cost_estimate": float(opt.cost_estimate) if opt.cost_estimate is not None else None,
            "quality_score": opt.quality_score,
            "distance_miles": opt.distance_miles,
            "network_status": opt.network_status,
            "potential_savings": float(opt.potential_savings) if opt.potential_savings is not None else None,
            "rationale": opt.rationale,
            "member_facing_explanation": opt.member_facing_explanation,
            "status": opt.status,
        }
        for opt in member.care_options
    ]

    savings_payload = [
        {
            "id": s.id,
            "member_id": s.member_id,
            "care_option_id": s.care_option_id,
            "original_expected_cost": float(s.original_expected_cost) if s.original_expected_cost is not None else None,
            "steered_option_cost": float(s.steered_option_cost) if s.steered_option_cost is not None else None,
            "estimated_savings": float(s.estimated_savings) if s.estimated_savings is not None else None,
            "claim_received": s.claim_received,
            "savings_validated": s.savings_validated,
            "validation_status": s.validation_status,
        }
        for s in member.savings
    ]

    accumulator_payload = None
    if member.accumulator:
        a = member.accumulator
        accumulator_payload = {
            "deductible": float(a.deductible) if a.deductible is not None else None,
            "deductible_met": float(a.deductible_met) if a.deductible_met is not None else None,
            "out_of_pocket_max": float(a.out_of_pocket_max) if a.out_of_pocket_max is not None else None,
            "out_of_pocket_met": float(a.out_of_pocket_met) if a.out_of_pocket_met is not None else None,
            "plan_year_start": a.plan_year_start,
        }

    return {
        "member": detail,
        "risk_insights": [
            {
                "id": r.id,
                "domain": r.domain,
                "score": r.score,
                "driver": r.driver,
                "recommendation": r.recommendation,
                "confidence": r.confidence,
                "last_updated_at": r.last_updated_at,
            }
            for r in member.risk_insights
        ],
        "tasks": tasks_payload,
        "care_journeys": journeys_payload,
        "notes": [
            {
                "id": n.id,
                "member_id": n.member_id,
                "author_email": n.author_email,
                "author_name": n.author_name,
                "channel": n.channel,
                "note_type": n.note_type,
                "body": n.body,
                "related_task_id": n.related_task_id,
                "related_journey_id": n.related_journey_id,
                "created_at": n.created_at,
            }
            for n in sorted(member.notes, key=lambda x: x.created_at, reverse=True)
        ],
        "messages": [
            {
                "id": msg.id,
                "member_id": msg.member_id,
                "channel": msg.channel,
                "direction": msg.direction,
                "sender": msg.sender,
                "recipient": msg.recipient,
                "body": msg.body,
                "status": msg.status,
                "timestamp": msg.timestamp,
            }
            for msg in sorted(member.messages, key=lambda x: x.timestamp, reverse=True)
        ],
        "claims": [
            {
                "id": c.id,
                "claim_number": c.claim_number,
                "service_date": c.service_date,
                "provider": c.provider,
                "category": c.category,
                "status": c.status,
                "billed_amount": float(c.billed_amount) if c.billed_amount is not None else None,
                "paid_amount": float(c.paid_amount) if c.paid_amount is not None else None,
                "member_responsibility": float(c.member_responsibility) if c.member_responsibility is not None else None,
            }
            for c in sorted(member.claims, key=lambda x: x.service_date or date.min, reverse=True)
        ],
        "accumulator": accumulator_payload,
        "care_options": care_options_payload,
        "savings": savings_payload,
        "documents": [
            {
                "id": d.id,
                "member_id": d.member_id,
                "file_name": d.file_name,
                "document_type": d.document_type,
                "uploaded_by": d.uploaded_by,
                "uploaded_at": d.uploaded_at,
                "status": d.status,
            }
            for d in member.documents
        ],
    }


def _task_to_dict(task: Member360Task, member: Optional[Member360Member] = None) -> dict:
    member_name = None
    risk_tier = None
    if member is not None:
        member_name = " ".join(part for part in (member.first_name, member.last_name) if part)
        risk_tier = member.risk_tier
    return {
        "id": task.id,
        "member_id": task.member_id,
        "journey_id": task.journey_id,
        "title": task.title,
        "description": task.description,
        "assigned_user": task.assigned_user,
        "assigned_queue": task.assigned_queue,
        "priority": task.priority,
        "status": task.status,
        "due_date": task.due_date,
        "sbar": {
            "situation": task.sbar_situation,
            "background": task.sbar_background,
            "assessment": task.sbar_assessment,
            "recommendation": task.sbar_recommendation,
        },
        "recommended_next_action": task.recommended_next_action,
        "auto_generated_reason": task.auto_generated_reason,
        "notes": task.notes,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "member_name": member_name,
        "risk_tier": risk_tier,
    }


async def create_task(session: AsyncSession, payload: dict) -> dict:
    member = await session.scalar(select(Member360Member).where(Member360Member.id == payload["member_id"]))
    if not member:
        raise ValueError("Member not found")
    sbar = payload.get("sbar") or {}
    task = Member360Task(
        member_id=payload["member_id"],
        journey_id=payload.get("journey_id"),
        title=payload["title"],
        description=payload.get("description"),
        assigned_user=payload.get("assigned_user"),
        assigned_queue=payload.get("assigned_queue"),
        priority=payload.get("priority", "medium"),
        status=payload.get("status", "open"),
        due_date=payload.get("due_date"),
        sbar_situation=sbar.get("situation") if isinstance(sbar, dict) else None,
        sbar_background=sbar.get("background") if isinstance(sbar, dict) else None,
        sbar_assessment=sbar.get("assessment") if isinstance(sbar, dict) else None,
        sbar_recommendation=sbar.get("recommendation") if isinstance(sbar, dict) else None,
        recommended_next_action=payload.get("recommended_next_action"),
        auto_generated_reason=payload.get("auto_generated_reason"),
        notes=payload.get("notes"),
    )
    session.add(task)
    await session.flush()
    return _task_to_dict(task, member)


async def update_member(session: AsyncSession, member_id: int, payload: dict) -> Optional[dict]:
    """Patch editable member fields. Returns the refreshed member detail
    payload, or None if the member doesn't exist."""
    member = await session.scalar(
        select(Member360Member).where(Member360Member.id == member_id)
    )
    if not member:
        return None
    editable_fields = (
        "first_name", "last_name", "gender", "plan_name", "line_of_business",
        "phone", "email", "address_line1", "address_city", "address_state",
        "address_zip", "preferred_language", "preferred_channel",
        "primary_care_provider",
    )
    for field_name in editable_fields:
        if field_name in payload and payload[field_name] is not None:
            setattr(member, field_name, payload[field_name])
    await session.flush()
    return await get_member_detail(session, member_id)


async def update_task(session: AsyncSession, task_id: int, payload: dict) -> Optional[dict]:
    task = await session.scalar(
        select(Member360Task).where(Member360Task.id == task_id)
    )
    if not task:
        return None
    sbar_payload = payload.get("sbar")
    direct_fields = (
        "title", "description", "priority", "status", "assigned_user", "assigned_queue",
        "due_date", "recommended_next_action", "auto_generated_reason", "notes", "journey_id",
    )
    for field_name in direct_fields:
        if field_name in payload and payload[field_name] is not None:
            setattr(task, field_name, payload[field_name])
    if isinstance(sbar_payload, dict):
        if sbar_payload.get("situation") is not None:
            task.sbar_situation = sbar_payload["situation"]
        if sbar_payload.get("background") is not None:
            task.sbar_background = sbar_payload["background"]
        if sbar_payload.get("assessment") is not None:
            task.sbar_assessment = sbar_payload["assessment"]
        if sbar_payload.get("recommendation") is not None:
            task.sbar_recommendation = sbar_payload["recommendation"]
    await session.flush()
    member = await session.scalar(select(Member360Member).where(Member360Member.id == task.member_id))
    return _task_to_dict(task, member)


async def create_note(session: AsyncSession, *, member_id: int, author_email: str, author_name: Optional[str], payload: dict) -> Optional[dict]:
    member = await session.scalar(select(Member360Member).where(Member360Member.id == member_id))
    if not member:
        return None
    note = Member360Note(
        member_id=member_id,
        author_email=author_email,
        author_name=author_name or author_email,
        channel=payload.get("channel", "internal"),
        note_type=payload.get("note_type"),
        body=payload.get("body", ""),
        related_task_id=payload.get("related_task_id"),
        related_journey_id=payload.get("related_journey_id"),
    )
    session.add(note)
    await session.flush()
    return {
        "id": note.id,
        "member_id": note.member_id,
        "author_email": note.author_email,
        "author_name": note.author_name,
        "channel": note.channel,
        "note_type": note.note_type,
        "body": note.body,
        "related_task_id": note.related_task_id,
        "related_journey_id": note.related_journey_id,
        "created_at": note.created_at,
    }


async def create_message(session: AsyncSession, *, member_id: int, sender: Optional[str], payload: dict) -> Optional[dict]:
    member = await session.scalar(select(Member360Member).where(Member360Member.id == member_id))
    if not member:
        return None
    message = Member360Message(
        member_id=member_id,
        channel=payload.get("channel", "chat"),
        direction=payload.get("direction", "outbound"),
        sender=payload.get("sender") or sender,
        recipient=payload.get("recipient") or member.preferred_channel or member.phone,
        body=payload.get("body", ""),
        status="sent",
    )
    session.add(message)
    await session.flush()
    return {
        "id": message.id,
        "member_id": message.member_id,
        "channel": message.channel,
        "direction": message.direction,
        "sender": message.sender,
        "recipient": message.recipient,
        "body": message.body,
        "status": message.status,
        "timestamp": message.timestamp,
    }


async def create_care_option(session: AsyncSession, payload: dict) -> Optional[dict]:
    member = await session.scalar(select(Member360Member).where(Member360Member.id == payload["member_id"]))
    if not member:
        return None
    opt = Member360CareOption(
        member_id=payload["member_id"],
        service_type=payload["service_type"],
        recommended_provider=payload.get("recommended_provider"),
        facility_name=payload.get("facility_name"),
        cost_estimate=payload.get("cost_estimate"),
        quality_score=payload.get("quality_score"),
        distance_miles=payload.get("distance_miles"),
        network_status=payload.get("network_status"),
        potential_savings=payload.get("potential_savings"),
        rationale=payload.get("rationale"),
        member_facing_explanation=payload.get("member_facing_explanation"),
        status=payload.get("status", "recommended"),
    )
    session.add(opt)
    await session.flush()
    if opt.potential_savings:
        session.add(
            Member360Savings(
                member_id=opt.member_id,
                care_option_id=opt.id,
                original_expected_cost=(float(opt.cost_estimate or 0) + float(opt.potential_savings or 0)),
                steered_option_cost=float(opt.cost_estimate or 0),
                estimated_savings=float(opt.potential_savings),
                claim_received=False,
                savings_validated=False,
                validation_status="pending",
            )
        )
        await session.flush()
    return {
        "id": opt.id,
        "member_id": opt.member_id,
        "service_type": opt.service_type,
        "recommended_provider": opt.recommended_provider,
        "facility_name": opt.facility_name,
        "cost_estimate": float(opt.cost_estimate) if opt.cost_estimate is not None else None,
        "quality_score": opt.quality_score,
        "distance_miles": opt.distance_miles,
        "network_status": opt.network_status,
        "potential_savings": float(opt.potential_savings) if opt.potential_savings is not None else None,
        "rationale": opt.rationale,
        "member_facing_explanation": opt.member_facing_explanation,
        "status": opt.status,
    }


async def build_dashboard(session: AsyncSession) -> dict:
    total_members = await session.scalar(select(func.count(Member360Member.id))) or 0
    high_risk = await session.scalar(
        select(func.count(Member360Member.id)).where(Member360Member.risk_tier == "High")
    ) or 0
    critical = await session.scalar(
        select(func.count(Member360Member.id)).where(Member360Member.risk_tier == "Critical")
    ) or 0
    open_tasks = await session.scalar(
        select(func.count(Member360Task.id)).where(Member360Task.status.in_(["open", "in_progress", "waiting"]))
    ) or 0
    today = date.today()
    overdue_tasks = await session.scalar(
        select(func.count(Member360Task.id)).where(
            Member360Task.status.in_(["open", "in_progress", "waiting"]),
            Member360Task.due_date < today,
        )
    ) or 0
    active_journeys = await session.scalar(
        select(func.count(Member360CareJourney.id)).where(Member360CareJourney.status == "active")
    ) or 0
    estimated_savings = await session.scalar(
        select(func.coalesce(func.sum(Member360Savings.estimated_savings), 0))
    ) or 0
    validated_savings = await session.scalar(
        select(func.coalesce(func.sum(Member360Savings.estimated_savings), 0)).where(
            Member360Savings.savings_validated.is_(True)
        )
    ) or 0

    metrics = [
        {"key": "total_members", "label": "Members in active workflows", "value": float(total_members), "hint": "All Member360-tracked members"},
        {"key": "high_risk", "label": "High-risk members", "value": float(high_risk), "hint": "Risk tier = High"},
        {"key": "critical_risk", "label": "Critical-risk members", "value": float(critical), "hint": "Risk tier = Critical"},
        {"key": "open_tasks", "label": "Open tasks", "value": float(open_tasks), "hint": "Status open / in_progress / waiting"},
        {"key": "overdue_tasks", "label": "Overdue tasks", "value": float(overdue_tasks), "hint": "Past due date and still open"},
        {"key": "active_journeys", "label": "Active care journeys", "value": float(active_journeys), "hint": "Status = active"},
        {"key": "estimated_savings", "label": "Estimated savings", "value": float(estimated_savings), "hint": "All steerage opportunities"},
        {"key": "validated_savings", "label": "Validated savings", "value": float(validated_savings), "hint": "Confirmed via claim"},
    ]

    members_stmt = (
        select(Member360Member)
        .where(Member360Member.risk_tier.in_(["High", "Critical"]))
        .order_by(Member360Member.risk_score_composite.desc().nullslast())
        .limit(8)
    )
    members = (await session.execute(members_stmt)).scalars().all()
    member_ids = [m.id for m in members]
    task_counts = await _open_task_counts(session, member_ids)
    journey_counts = await _active_journey_counts(session, member_ids)
    high_priority_members = [_summarize_member(m, task_counts, journey_counts) for m in members]

    # Top risk drivers (group by domain+driver)
    rows = await session.execute(
        select(
            Member360RiskInsight.domain,
            Member360RiskInsight.driver,
            func.count(Member360RiskInsight.id).label("members"),
            func.avg(Member360RiskInsight.score).label("avg_score"),
        ).group_by(Member360RiskInsight.domain, Member360RiskInsight.driver)
        .order_by(func.avg(Member360RiskInsight.score).desc())
        .limit(5)
    )
    top_risk_drivers = [
        {
            "domain": domain,
            "driver": driver or "Unspecified",
            "member_count": int(members or 0),
            "average_score": float(avg_score or 0),
        }
        for domain, driver, members, avg_score in rows.all()
    ]

    # Recent activity: union of most recent notes, messages, tasks
    recent_activity: list[dict] = []
    note_rows = (
        await session.execute(
            select(Member360Note, Member360Member)
            .join(Member360Member, Member360Note.member_id == Member360Member.id)
            .order_by(Member360Note.created_at.desc())
            .limit(5)
        )
    ).all()
    for note, member in note_rows:
        recent_activity.append({
            "kind": "note",
            "member_id": member.id,
            "member_name": f"{member.first_name or ''} {member.last_name or ''}".strip(),
            "summary": f"{note.channel} note: {note.body[:80]}",
            "timestamp": note.created_at,
        })
    msg_rows = (
        await session.execute(
            select(Member360Message, Member360Member)
            .join(Member360Member, Member360Message.member_id == Member360Member.id)
            .order_by(Member360Message.timestamp.desc())
            .limit(5)
        )
    ).all()
    for msg, member in msg_rows:
        recent_activity.append({
            "kind": "message",
            "member_id": member.id,
            "member_name": f"{member.first_name or ''} {member.last_name or ''}".strip(),
            "summary": f"{msg.channel} {msg.direction}: {msg.body[:80]}",
            "timestamp": msg.timestamp,
        })
    recent_activity.sort(key=lambda x: x["timestamp"], reverse=True)
    recent_activity = recent_activity[:8]

    # Upcoming actions
    upcoming_rows = (
        await session.execute(
            select(Member360Task, Member360Member)
            .join(Member360Member, Member360Task.member_id == Member360Member.id)
            .where(Member360Task.status.in_(["open", "in_progress"]))
            .order_by(Member360Task.due_date.asc().nullslast(), Member360Task.priority.desc())
            .limit(8)
        )
    ).all()
    upcoming_actions = [
        {
            "member_id": member.id,
            "member_name": f"{member.first_name or ''} {member.last_name or ''}".strip(),
            "risk_tier": member.risk_tier,
            "next_action": task.recommended_next_action or task.title,
            "due_date": task.due_date,
        }
        for task, member in upcoming_rows
    ]

    return {
        "metrics": metrics,
        "high_priority_members": high_priority_members,
        "top_risk_drivers": top_risk_drivers,
        "recent_activity": recent_activity,
        "upcoming_actions": upcoming_actions,
    }


async def list_care_journey_templates(session: AsyncSession) -> list[dict]:
    rows = await session.execute(
        select(Member360CareJourneyTemplate).order_by(Member360CareJourneyTemplate.name)
    )
    return [
        {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "category": t.category,
            "recommended_for_risk_tier": t.recommended_for_risk_tier,
            "default_stages": t.default_stages or [],
            "default_tasks": t.default_tasks or [],
        }
        for t in rows.scalars().all()
    ]


# ---------------------- Gap analysis & submission export -------------------
# These mirror the legacy coding service surface but read from Member360
# tables: risk insights with score ≥ 6 stand in for "missing HCCs", padded
# with synthetic care-gap rows so the count matches ``open_care_gaps``.

_RISK_DOMAIN_PREFIX = {
    "Clinical": "CLN",
    "Utilization": "UTL",
    "Cost": "COST",
    "Engagement": "ENG",
}
_GAP_SCORE_THRESHOLD = 6.0


def _qualifying_insights(insights: Iterable[Member360RiskInsight]) -> list[Member360RiskInsight]:
    return [i for i in insights if (i.score or 0) >= _GAP_SCORE_THRESHOLD]


def _missing_hcc_for_member(
    member: Member360Member,
    insights: Iterable[Member360RiskInsight],
) -> list[dict]:
    qualifying = _qualifying_insights(insights)
    items: list[dict] = []
    for idx, insight in enumerate(qualifying):
        prefix = _RISK_DOMAIN_PREFIX.get(insight.domain, "GEN")
        items.append(
            {
                "hcc_code": f"M360-{prefix}-{idx + 1:02d}",
                "icd10_candidates": [],
                "reason": insight.driver,
                "recommendation": insight.recommendation,
                "domain": insight.domain,
                "score": float(insight.score) if insight.score is not None else None,
                "confidence": float(insight.confidence) if insight.confidence is not None else None,
            }
        )
    desired = max(member.open_care_gaps or 0, len(items))
    while len(items) < desired:
        idx = len(items)
        items.append(
            {
                "hcc_code": f"M360-GAP-{idx + 1:02d}",
                "icd10_candidates": [],
                "reason": f"Open care gap {idx + 1}",
                "recommendation": member.next_best_action or "Review and close gap",
                "domain": None,
                "score": None,
                "confidence": None,
            }
        )
    return items


async def build_gap_analysis(
    session: AsyncSession,
    member_id: int,
    submission_year: Optional[int] = None,
) -> Optional[dict]:
    member = await session.scalar(
        select(Member360Member)
        .where(Member360Member.id == member_id)
        .options(selectinload(Member360Member.risk_insights))
    )
    if not member:
        return None
    year = submission_year or date.today().year
    missing_hcc = _missing_hcc_for_member(member, member.risk_insights)
    return {
        "member": {
            "id": member.id,
            "member_key": member.member_key,
            "risk_score": float(member.risk_score_composite) if member.risk_score_composite is not None else None,
            "risk_tier": member.risk_tier,
        },
        "mao_records": [],
        "missing_hcc": missing_hcc,
        "stale_records": [],
        "immediate_actions": ["close_open_gaps"] if missing_hcc else [],
        "submission_year": year,
    }


async def generate_submission_export(
    session: AsyncSession,
    *,
    submission_year: Optional[int] = None,
    member_ids: Optional[list[int]] = None,
) -> dict:
    year = submission_year or date.today().year
    stmt = (
        select(Member360Member)
        .options(
            selectinload(Member360Member.risk_insights),
            selectinload(Member360Member.claims),
        )
        .order_by(Member360Member.id.asc())
    )
    if member_ids:
        stmt = stmt.where(Member360Member.id.in_(member_ids))
    members = (await session.execute(stmt)).scalars().all()

    today_iso = date.today().isoformat()
    rows: list[list] = []
    for member in members:
        sorted_claims = sorted(
            member.claims or [],
            key=lambda c: c.service_date or date.min,
            reverse=True,
        )
        primary = sorted_claims[0] if sorted_claims else None
        service_date = (
            primary.service_date.isoformat()
            if primary and primary.service_date
            else today_iso
        )
        qualifying = _qualifying_insights(member.risk_insights)
        if qualifying:
            for idx, insight in enumerate(qualifying):
                prefix = _RISK_DOMAIN_PREFIX.get(insight.domain, "GEN")
                rows.append(
                    [
                        member.id,
                        member.member_key,
                        year,
                        f"M360-{prefix}-{idx + 1:02d}",
                        "",
                        service_date,
                        service_date,
                        "member360",
                    ]
                )
        elif (member.open_care_gaps or 0) > 0:
            rows.append(
                [
                    member.id,
                    member.member_key,
                    year,
                    "M360-GAP-01",
                    "",
                    service_date,
                    service_date,
                    "member360",
                ]
            )

    header = [
        "MemberID",
        "MemberKey",
        "SubmissionYear",
        "HCCCode",
        "ICD10",
        "ServiceFrom",
        "ServiceTo",
        "Source",
    ]
    csv_lines = [",".join(header)]
    csv_lines.extend(",".join(str(cell) for cell in row) for row in rows)
    csv_content = "\n".join(csv_lines)

    return {
        "batch_id": int(datetime.utcnow().timestamp() * 1000),
        "submission_year": year,
        "record_count": len(rows),
        "csv": csv_content,
    }
