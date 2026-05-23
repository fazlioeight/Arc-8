"""Service layer for Nexora Lab Member360.

Responsibilities:
- Query helpers used by route handlers.
- Computation of dashboard rollups and risk insight summaries.

Tenant schema and helper-function setup happens once per process per
tenant in ``app.db.tenant_manager._bootstrap_tenant_schema`` (invoked when
the tenant's sessionmaker is first created). No demo or synthetic data is
created automatically — seeding is the operator's job via
``scripts/seed_prominence.py`` or a real data import.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Iterable, Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import hashlib

from ..models.member360 import (
    Member360CareJourney,
    Member360CareJourneyStage,
    Member360CareJourneyTemplate,
    Member360CareOption,
    Member360Claim,
    Member360Document,
    Member360Lab,
    Member360Medication,
    Member360Member,
    Member360Message,
    Member360Note,
    Member360OutreachChannel,
    Member360Problem,
    Member360RiskInsight,
    Member360Savings,
    Member360Task,
)
from . import member360_storage


def _compute_age(dob: Optional[date]) -> Optional[int]:
    if not dob:
        return None
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


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
            selectinload(Member360Member.problems),
            selectinload(Member360Member.medications),
            selectinload(Member360Member.labs),
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
        "documents": [_serialize_document(d) for d in member.documents],
        "problems": [_serialize_problem(p) for p in sorted(
            member.problems, key=lambda x: (x.status != "active", x.onset_date or date.min),
            reverse=False,
        )],
        "medications": [_serialize_medication(m) for m in sorted(
            member.medications, key=lambda x: x.last_fill_date or date.min, reverse=True,
        )],
        "labs": [_serialize_lab(l) for l in sorted(
            member.labs, key=lambda x: x.result_date, reverse=True,
        )],
    }


def _serialize_problem(p: Member360Problem) -> dict:
    return {
        "id": p.id,
        "member_id": p.member_id,
        "code": p.code,
        "code_system": p.code_system,
        "description": p.description,
        "status": p.status,
        "severity": p.severity,
        "is_primary": p.is_primary,
        "onset_date": p.onset_date,
        "resolved_date": p.resolved_date,
        "recorded_by": p.recorded_by,
    }


def _serialize_medication(m: Member360Medication) -> dict:
    return {
        "id": m.id,
        "member_id": m.member_id,
        "rx_number": m.rx_number,
        "ndc_code": m.ndc_code,
        "drug_name": m.drug_name,
        "generic_name": m.generic_name,
        "dose": m.dose,
        "dose_unit": m.dose_unit,
        "route": m.route,
        "frequency": m.frequency,
        "days_supply": m.days_supply,
        "refills_remaining": m.refills_remaining,
        "prescriber": m.prescriber,
        "pharmacy": m.pharmacy,
        "start_date": m.start_date,
        "end_date": m.end_date,
        "last_fill_date": m.last_fill_date,
        "status": m.status,
    }


def _serialize_lab(l: Member360Lab) -> dict:
    return {
        "id": l.id,
        "member_id": l.member_id,
        "loinc_code": l.loinc_code,
        "test_name": l.test_name,
        "result_value": l.result_value,
        "result_unit": l.result_unit,
        "reference_range_low": l.reference_range_low,
        "reference_range_high": l.reference_range_high,
        "abnormal_flag": l.abnormal_flag,
        "result_date": l.result_date,
        "ordering_provider": l.ordering_provider,
        "performing_lab": l.performing_lab,
        "status": l.status,
    }


def _serialize_document(d: Member360Document) -> dict:
    return {
        "id": d.id,
        "member_id": d.member_id,
        "file_name": d.file_name,
        "document_type": d.document_type,
        "uploaded_by": d.uploaded_by,
        "uploaded_at": d.uploaded_at,
        "status": d.status,
        "storage_backend": d.storage_backend,
        "content_type": d.content_type,
        "size_bytes": d.size_bytes,
        "sha256": d.sha256,
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
        status="queued",
    )
    session.add(message)
    await session.flush()
    # Outbound messages flow through the outreach delivery pipeline. Inbound
    # rows are journaled as-is — they're already delivered by definition.
    if message.direction == "outbound":
        await deliver_message(session, message)
        await session.flush()
    else:
        message.status = "received"
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


async def create_care_journey(
    session: AsyncSession,
    payload: dict,
    *,
    created_by: Optional[str] = None,
) -> Optional[dict]:
    """Create a care journey for a member, optionally scaffolded from a template.

    When ``template_id`` is provided we copy the template's ``default_stages``
    onto the new journey (preserving order via ``sequence``) and capture the
    template name so the UI can show provenance even if the template is later
    renamed/deleted.
    """
    member = await session.scalar(
        select(Member360Member).where(Member360Member.id == payload["member_id"])
    )
    if not member:
        return None

    template = None
    template_id = payload.get("template_id")
    if template_id is not None:
        template = await session.scalar(
            select(Member360CareJourneyTemplate).where(
                Member360CareJourneyTemplate.id == template_id
            )
        )
        if not template:
            raise ValueError("Care journey template not found")

    name = payload.get("name") or (template.name if template else None)
    if not name:
        raise ValueError("Care journey name is required when no template is selected")

    journey = Member360CareJourney(
        member_id=payload["member_id"],
        template_id=template.id if template else None,
        name=name,
        description=payload.get("description") or (template.description if template else None),
        status=payload.get("status") or "active",
        created_by=created_by,
        assigned_to=payload.get("assigned_to"),
        start_date=payload.get("start_date") or date.today(),
        target_completion_date=payload.get("target_completion_date"),
        source=payload.get("source"),
        template_name=template.name if template else None,
    )
    session.add(journey)
    await session.flush()

    if template and template.default_stages:
        for idx, stage in enumerate(template.default_stages):
            if not isinstance(stage, dict):
                continue
            session.add(
                Member360CareJourneyStage(
                    journey_id=journey.id,
                    sequence=int(stage.get("sequence", idx)),
                    name=str(stage.get("name") or f"Stage {idx + 1}"),
                    description=stage.get("description"),
                    status=stage.get("status") or "pending",
                )
            )
        await session.flush()

    journey = await session.scalar(
        select(Member360CareJourney)
        .where(Member360CareJourney.id == journey.id)
        .options(selectinload(Member360CareJourney.stages))
    )
    return {
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
        "open_task_count": 0,
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


# ---------- Aggregate (multi-member) list endpoints --------------------------
# Each helper returns ``(items, total)`` where ``items`` is a list of dicts
# already enriched with the member fields the UI lists need (member_name,
# member_key, risk_tier, plan_name, preferred_channel) so the frontend
# doesn't have to fan out and refetch each member detail.


def _member_ref(member: Optional[Member360Member]) -> dict:
    """Denormalized member fields attached to every aggregate row."""
    if member is None:
        return {
            "member_name": None,
            "member_key": None,
            "risk_tier": None,
            "plan_name": None,
            "preferred_channel": None,
        }
    return {
        "member_name": " ".join(p for p in (member.first_name, member.last_name) if p) or None,
        "member_key": member.member_key,
        "risk_tier": member.risk_tier,
        "plan_name": member.plan_name,
        "preferred_channel": member.preferred_channel,
    }


async def list_tasks(
    session: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    member_id: Optional[int] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
) -> tuple[list[dict], int]:
    stmt = select(Member360Task, Member360Member).join(
        Member360Member, Member360Task.member_id == Member360Member.id
    )
    if member_id is not None:
        stmt = stmt.where(Member360Task.member_id == member_id)
    if status:
        stmt = stmt.where(Member360Task.status == status)
    if priority:
        stmt = stmt.where(Member360Task.priority == priority)

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(Member360Task.due_date.asc().nullslast(), Member360Task.id.desc())
    stmt = stmt.limit(limit).offset(offset)
    rows = (await session.execute(stmt)).all()
    items = [{**_task_to_dict(t, m), **_member_ref(m)} for t, m in rows]
    return items, int(total)


async def list_messages(
    session: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    member_id: Optional[int] = None,
    channel: Optional[str] = None,
    direction: Optional[str] = None,
) -> tuple[list[dict], int]:
    stmt = select(Member360Message, Member360Member).join(
        Member360Member, Member360Message.member_id == Member360Member.id
    )
    if member_id is not None:
        stmt = stmt.where(Member360Message.member_id == member_id)
    if channel:
        stmt = stmt.where(Member360Message.channel == channel)
    if direction:
        stmt = stmt.where(Member360Message.direction == direction)

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(Member360Message.timestamp.desc(), Member360Message.id.desc())
    stmt = stmt.limit(limit).offset(offset)
    rows = (await session.execute(stmt)).all()
    items = [
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
            **_member_ref(member),
        }
        for msg, member in rows
    ]
    return items, int(total)


async def list_care_options_all(
    session: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    member_id: Optional[int] = None,
    status: Optional[str] = None,
) -> tuple[list[dict], int]:
    stmt = select(Member360CareOption, Member360Member).join(
        Member360Member, Member360CareOption.member_id == Member360Member.id
    )
    if member_id is not None:
        stmt = stmt.where(Member360CareOption.member_id == member_id)
    if status:
        stmt = stmt.where(Member360CareOption.status == status)

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(Member360CareOption.created_at.desc(), Member360CareOption.id.desc())
    stmt = stmt.limit(limit).offset(offset)
    rows = (await session.execute(stmt)).all()
    items = [
        {
            "id": o.id,
            "member_id": o.member_id,
            "service_type": o.service_type,
            "recommended_provider": o.recommended_provider,
            "facility_name": o.facility_name,
            "cost_estimate": float(o.cost_estimate) if o.cost_estimate is not None else None,
            "quality_score": o.quality_score,
            "distance_miles": o.distance_miles,
            "network_status": o.network_status,
            "potential_savings": float(o.potential_savings) if o.potential_savings is not None else None,
            "rationale": o.rationale,
            "member_facing_explanation": o.member_facing_explanation,
            "status": o.status,
            **_member_ref(member),
        }
        for o, member in rows
    ]
    return items, int(total)


async def list_documents_all(
    session: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    member_id: Optional[int] = None,
    document_type: Optional[str] = None,
) -> tuple[list[dict], int]:
    stmt = select(Member360Document, Member360Member).join(
        Member360Member, Member360Document.member_id == Member360Member.id
    )
    if member_id is not None:
        stmt = stmt.where(Member360Document.member_id == member_id)
    if document_type:
        stmt = stmt.where(Member360Document.document_type == document_type)

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(Member360Document.uploaded_at.desc(), Member360Document.id.desc())
    stmt = stmt.limit(limit).offset(offset)
    rows = (await session.execute(stmt)).all()
    items = [
        {**_serialize_document(d), **_member_ref(member)}
        for d, member in rows
    ]
    return items, int(total)


async def list_care_journeys_all(
    session: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    member_id: Optional[int] = None,
    status: Optional[str] = None,
) -> tuple[list[dict], int]:
    stmt = (
        select(Member360CareJourney, Member360Member)
        .join(Member360Member, Member360CareJourney.member_id == Member360Member.id)
        .options(selectinload(Member360CareJourney.stages))
    )
    if member_id is not None:
        stmt = stmt.where(Member360CareJourney.member_id == member_id)
    if status:
        stmt = stmt.where(Member360CareJourney.status == status)

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(Member360CareJourney.start_date.desc().nullslast(), Member360CareJourney.id.desc())
    stmt = stmt.limit(limit).offset(offset)
    rows = (await session.execute(stmt)).all()

    journey_ids = [j.id for j, _ in rows]
    open_task_by_journey: dict[int, int] = defaultdict(int)
    if journey_ids:
        task_rows = await session.execute(
            select(Member360Task.journey_id, func.count(Member360Task.id))
            .where(
                Member360Task.journey_id.in_(journey_ids),
                Member360Task.status.in_(["open", "in_progress", "waiting"]),
            )
            .group_by(Member360Task.journey_id)
        )
        open_task_by_journey = defaultdict(int, {jid: cnt for jid, cnt in task_rows.all()})

    items = [
        {
            "id": j.id,
            "member_id": j.member_id,
            "name": j.name,
            "description": j.description,
            "status": j.status,
            "template_name": j.template_name,
            "source": j.source,
            "assigned_to": j.assigned_to,
            "created_by": j.created_by,
            "start_date": j.start_date,
            "target_completion_date": j.target_completion_date,
            "stages": [
                {
                    "id": s.id,
                    "sequence": s.sequence,
                    "name": s.name,
                    "description": s.description,
                    "status": s.status,
                    "completed_at": s.completed_at,
                }
                for s in j.stages
            ],
            "open_task_count": open_task_by_journey.get(j.id, 0),
            **_member_ref(member),
        }
        for j, member in rows
    ]
    return items, int(total)


async def list_risk_insights_all(
    session: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    member_id: Optional[int] = None,
    domain: Optional[str] = None,
) -> tuple[list[dict], int]:
    stmt = select(Member360RiskInsight, Member360Member).join(
        Member360Member, Member360RiskInsight.member_id == Member360Member.id
    )
    if member_id is not None:
        stmt = stmt.where(Member360RiskInsight.member_id == member_id)
    if domain:
        stmt = stmt.where(Member360RiskInsight.domain == domain)

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(Member360RiskInsight.score.desc(), Member360RiskInsight.id.desc())
    stmt = stmt.limit(limit).offset(offset)
    rows = (await session.execute(stmt)).all()
    items = [
        {
            "id": r.id,
            "member_id": r.member_id,
            "domain": r.domain,
            "score": r.score,
            "driver": r.driver,
            "recommendation": r.recommendation,
            "confidence": r.confidence,
            "last_updated_at": r.last_updated_at,
            **_member_ref(member),
        }
        for r, member in rows
    ]
    return items, int(total)


# ---------- Batch ingest (members / claims / risk insights) ----------------
# Upsert by natural key so the same batch can be re-POSTed without producing
# duplicates. Members keyed by `member_key`; claims by `claim_number` (unique
# within tenant); risk insights by `(member_id, domain)` — one row per domain
# per member.

_MEMBER_IMPORT_FIELDS = (
    "first_name", "last_name", "date_of_birth", "gender", "plan_name",
    "line_of_business", "phone", "email", "address_line1", "address_city",
    "address_state", "address_zip", "preferred_language", "preferred_channel",
    "primary_care_provider", "risk_score_composite", "risk_tier",
    "clinical_risk_score", "utilization_risk_score", "cost_risk_score",
    "engagement_risk_score", "open_care_gaps", "next_best_action",
)


async def import_members(session: AsyncSession, items: list[dict]) -> dict:
    """Upsert members keyed by ``member_key``. Each item replaces non-None
    fields on an existing row or creates a new one. Returns a count summary
    plus per-row errors (e.g. missing ``member_key``)."""
    created = 0
    updated = 0
    errors: list[dict] = []
    for idx, item in enumerate(items):
        key = (item.get("member_key") or "").strip()
        if not key:
            errors.append({"index": idx, "member_key": None, "detail": "member_key is required"})
            continue
        existing = await session.scalar(
            select(Member360Member).where(Member360Member.member_key == key)
        )
        if existing:
            for field in _MEMBER_IMPORT_FIELDS:
                value = item.get(field)
                if value is not None:
                    setattr(existing, field, value)
            updated += 1
        else:
            row = Member360Member(member_key=key)
            for field in _MEMBER_IMPORT_FIELDS:
                value = item.get(field)
                if value is not None:
                    setattr(row, field, value)
            session.add(row)
            # Flush per row so a duplicate key later in the same batch is
            # detected as an update against the just-inserted row instead of
            # creating a second record. Autoflush on async sessions isn't
            # reliable across dialects.
            await session.flush()
            created += 1
    return {"created": created, "updated": updated, "errors": errors}


_CLAIM_IMPORT_FIELDS = (
    "service_date", "provider", "category", "status",
    "billed_amount", "paid_amount", "member_responsibility",
)


async def import_claims(session: AsyncSession, items: list[dict]) -> dict:
    """Upsert claims keyed by ``claim_number``. Member resolution is by
    ``member_key`` — claims for unknown members produce a per-row error
    rather than failing the batch, so a partially-valid batch still lands."""
    created = 0
    updated = 0
    errors: list[dict] = []
    member_key_cache: dict[str, Optional[int]] = {}
    for idx, item in enumerate(items):
        member_key = (item.get("member_key") or "").strip()
        claim_number = (item.get("claim_number") or "").strip()
        if not member_key or not claim_number:
            errors.append({
                "index": idx,
                "member_key": member_key or None,
                "detail": "member_key and claim_number are required",
            })
            continue
        if member_key not in member_key_cache:
            mid = await session.scalar(
                select(Member360Member.id).where(Member360Member.member_key == member_key)
            )
            member_key_cache[member_key] = mid
        member_id = member_key_cache[member_key]
        if member_id is None:
            errors.append({
                "index": idx,
                "member_key": member_key,
                "detail": f"member_key {member_key!r} not found",
            })
            continue
        existing = await session.scalar(
            select(Member360Claim).where(Member360Claim.claim_number == claim_number)
        )
        if existing:
            existing.member_id = member_id
            for field in _CLAIM_IMPORT_FIELDS:
                value = item.get(field)
                if value is not None:
                    setattr(existing, field, value)
            updated += 1
        else:
            row = Member360Claim(
                member_id=member_id,
                claim_number=claim_number,
                status=item.get("status") or "paid",
            )
            for field in _CLAIM_IMPORT_FIELDS:
                value = item.get(field)
                if value is not None and field != "status":
                    setattr(row, field, value)
            session.add(row)
            await session.flush()  # see import_members re: per-row flush
            created += 1
    return {"created": created, "updated": updated, "errors": errors}


_RISK_IMPORT_FIELDS = ("score", "driver", "recommendation", "confidence")


async def import_risk_insights(session: AsyncSession, items: list[dict]) -> dict:
    """Upsert risk insights keyed by ``(member_key, domain)``."""
    created = 0
    updated = 0
    errors: list[dict] = []
    member_key_cache: dict[str, Optional[int]] = {}
    for idx, item in enumerate(items):
        member_key = (item.get("member_key") or "").strip()
        domain = (item.get("domain") or "").strip()
        if not member_key or not domain:
            errors.append({
                "index": idx,
                "member_key": member_key or None,
                "detail": "member_key and domain are required",
            })
            continue
        if member_key not in member_key_cache:
            mid = await session.scalar(
                select(Member360Member.id).where(Member360Member.member_key == member_key)
            )
            member_key_cache[member_key] = mid
        member_id = member_key_cache[member_key]
        if member_id is None:
            errors.append({
                "index": idx,
                "member_key": member_key,
                "detail": f"member_key {member_key!r} not found",
            })
            continue
        existing = await session.scalar(
            select(Member360RiskInsight).where(
                Member360RiskInsight.member_id == member_id,
                Member360RiskInsight.domain == domain,
            )
        )
        if existing:
            for field in _RISK_IMPORT_FIELDS:
                value = item.get(field)
                if value is not None:
                    setattr(existing, field, value)
            existing.last_updated_at = datetime.utcnow()
            updated += 1
        else:
            row = Member360RiskInsight(
                member_id=member_id,
                domain=domain,
                score=float(item.get("score") or 0),
                driver=item.get("driver"),
                recommendation=item.get("recommendation"),
                confidence=item.get("confidence"),
            )
            session.add(row)
            await session.flush()  # see import_members re: per-row flush
            created += 1
    return {"created": created, "updated": updated, "errors": errors}


# ---------- Clinical data ingestion (problems / medications / labs) --------
# Each follows the same pattern as import_claims: resolve member by
# member_key, upsert by natural key, per-row errors collected rather than
# rolled back. The natural-key tuple differs per domain so we share the
# member-lookup cache helper inline rather than refactoring.


def _resolve_member_id_cached(
    cache: dict[str, Optional[int]],
    session: AsyncSession,
):
    """Returns an async resolver bound to a session-local cache so a batch
    that mentions the same ``member_key`` 100 times only hits the DB once."""
    async def resolve(member_key: str) -> Optional[int]:
        if member_key not in cache:
            cache[member_key] = await session.scalar(
                select(Member360Member.id).where(Member360Member.member_key == member_key)
            )
        return cache[member_key]
    return resolve


_PROBLEM_FIELDS = (
    "description", "status", "severity", "is_primary",
    "onset_date", "resolved_date", "recorded_by",
)


async def import_problems(session: AsyncSession, items: list[dict]) -> dict:
    """Upsert problems by ``(member_id, code, code_system)``."""
    created = 0
    updated = 0
    errors: list[dict] = []
    cache: dict[str, Optional[int]] = {}
    resolve = _resolve_member_id_cached(cache, session)
    for idx, item in enumerate(items):
        member_key = (item.get("member_key") or "").strip()
        code = (item.get("code") or "").strip()
        code_system = (item.get("code_system") or "ICD-10").strip()
        if not member_key or not code:
            errors.append({"index": idx, "member_key": member_key or None,
                           "detail": "member_key and code are required"})
            continue
        member_id = await resolve(member_key)
        if member_id is None:
            errors.append({"index": idx, "member_key": member_key,
                           "detail": f"member_key {member_key!r} not found"})
            continue
        existing = await session.scalar(
            select(Member360Problem).where(
                Member360Problem.member_id == member_id,
                Member360Problem.code == code,
                Member360Problem.code_system == code_system,
            )
        )
        if existing:
            for field in _PROBLEM_FIELDS:
                value = item.get(field)
                if value is not None:
                    setattr(existing, field, value)
            updated += 1
        else:
            row = Member360Problem(
                member_id=member_id, code=code, code_system=code_system,
                status=item.get("status") or "active",
                is_primary=bool(item.get("is_primary")),
            )
            for field in _PROBLEM_FIELDS:
                value = item.get(field)
                if value is not None and field not in ("status", "is_primary"):
                    setattr(row, field, value)
            session.add(row)
            await session.flush()  # see import_members re: per-row flush
            created += 1
    return {"created": created, "updated": updated, "errors": errors}


_MEDICATION_FIELDS = (
    "ndc_code", "drug_name", "generic_name", "dose", "dose_unit", "route",
    "frequency", "days_supply", "refills_remaining", "prescriber", "pharmacy",
    "start_date", "end_date", "last_fill_date", "status",
)


async def import_medications(session: AsyncSession, items: list[dict]) -> dict:
    """Upsert medications by ``(member_id, rx_number)``."""
    created = 0
    updated = 0
    errors: list[dict] = []
    cache: dict[str, Optional[int]] = {}
    resolve = _resolve_member_id_cached(cache, session)
    for idx, item in enumerate(items):
        member_key = (item.get("member_key") or "").strip()
        rx_number = (item.get("rx_number") or "").strip()
        drug_name = (item.get("drug_name") or "").strip()
        if not member_key or not rx_number or not drug_name:
            errors.append({"index": idx, "member_key": member_key or None,
                           "detail": "member_key, rx_number, and drug_name are required"})
            continue
        member_id = await resolve(member_key)
        if member_id is None:
            errors.append({"index": idx, "member_key": member_key,
                           "detail": f"member_key {member_key!r} not found"})
            continue
        existing = await session.scalar(
            select(Member360Medication).where(
                Member360Medication.member_id == member_id,
                Member360Medication.rx_number == rx_number,
            )
        )
        if existing:
            for field in _MEDICATION_FIELDS:
                value = item.get(field)
                if value is not None:
                    setattr(existing, field, value)
            updated += 1
        else:
            row = Member360Medication(
                member_id=member_id, rx_number=rx_number, drug_name=drug_name,
                status=item.get("status") or "active",
            )
            for field in _MEDICATION_FIELDS:
                value = item.get(field)
                if value is not None and field not in ("drug_name", "status"):
                    setattr(row, field, value)
            session.add(row)
            await session.flush()
            created += 1
    return {"created": created, "updated": updated, "errors": errors}


_LAB_FIELDS = (
    "test_name", "result_value", "result_unit", "reference_range_low",
    "reference_range_high", "abnormal_flag", "ordering_provider",
    "performing_lab", "status",
)


async def import_labs(session: AsyncSession, items: list[dict]) -> dict:
    """Upsert labs by ``(member_id, loinc_code, result_date)``."""
    created = 0
    updated = 0
    errors: list[dict] = []
    cache: dict[str, Optional[int]] = {}
    resolve = _resolve_member_id_cached(cache, session)
    for idx, item in enumerate(items):
        member_key = (item.get("member_key") or "").strip()
        loinc_code = (item.get("loinc_code") or "").strip()
        result_date = item.get("result_date")
        test_name = (item.get("test_name") or "").strip()
        if not member_key or not loinc_code or not result_date or not test_name:
            errors.append({"index": idx, "member_key": member_key or None,
                           "detail": "member_key, loinc_code, test_name, and result_date are required"})
            continue
        member_id = await resolve(member_key)
        if member_id is None:
            errors.append({"index": idx, "member_key": member_key,
                           "detail": f"member_key {member_key!r} not found"})
            continue
        existing = await session.scalar(
            select(Member360Lab).where(
                Member360Lab.member_id == member_id,
                Member360Lab.loinc_code == loinc_code,
                Member360Lab.result_date == result_date,
            )
        )
        if existing:
            for field in _LAB_FIELDS:
                value = item.get(field)
                if value is not None:
                    setattr(existing, field, value)
            updated += 1
        else:
            row = Member360Lab(
                member_id=member_id, loinc_code=loinc_code,
                test_name=test_name, result_date=result_date,
                status=item.get("status") or "final",
            )
            for field in _LAB_FIELDS:
                value = item.get(field)
                if value is not None and field not in ("test_name", "status"):
                    setattr(row, field, value)
            session.add(row)
            await session.flush()
            created += 1
    return {"created": created, "updated": updated, "errors": errors}


# ---------- Care journey + stage progression -------------------------------
# Stage state machine: pending → in_progress → completed. Completing a stage
# stamps ``completed_at``; reopening (in_progress) clears it. Journey-level
# updates also live here so the workspace can advance status / reassign.

_JOURNEY_UPDATE_FIELDS = (
    "name", "description", "status", "assigned_to",
    "start_date", "target_completion_date",
)

_VALID_JOURNEY_STATUS = {"active", "paused", "completed", "cancelled"}
_VALID_STAGE_STATUS = {"pending", "in_progress", "completed", "skipped"}


def _serialize_journey(journey: Member360CareJourney, open_task_count: int = 0) -> dict:
    return {
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
            for s in sorted(journey.stages, key=lambda x: x.sequence)
        ],
        "open_task_count": open_task_count,
    }


async def update_care_journey(
    session: AsyncSession, journey_id: int, payload: dict
) -> Optional[dict]:
    journey = await session.scalar(
        select(Member360CareJourney)
        .where(Member360CareJourney.id == journey_id)
        .options(selectinload(Member360CareJourney.stages))
    )
    if not journey:
        return None
    for field in _JOURNEY_UPDATE_FIELDS:
        if field in payload and payload[field] is not None:
            if field == "status" and payload[field] not in _VALID_JOURNEY_STATUS:
                raise ValueError(
                    f"Invalid journey status {payload[field]!r}; "
                    f"expected one of {sorted(_VALID_JOURNEY_STATUS)}"
                )
            setattr(journey, field, payload[field])
    await session.flush()
    return _serialize_journey(journey)


async def add_care_journey_stage(
    session: AsyncSession,
    journey_id: int,
    payload: dict,
) -> Optional[dict]:
    """Append (or insert-at-sequence) a stage on an existing journey.

    When ``sequence`` is omitted, the new stage gets ``max(existing) + 1`` so
    callers don't have to query the journey first. ``status`` is validated
    against the same allow-list the update endpoint uses so a stage can't be
    born in a state the state machine doesn't recognize.
    """
    journey = await session.scalar(
        select(Member360CareJourney)
        .where(Member360CareJourney.id == journey_id)
        .options(selectinload(Member360CareJourney.stages))
    )
    if not journey:
        return None
    new_status = payload.get("status") or "pending"
    if new_status not in _VALID_STAGE_STATUS:
        raise ValueError(
            f"Invalid stage status {new_status!r}; "
            f"expected one of {sorted(_VALID_STAGE_STATUS)}"
        )
    sequence = payload.get("sequence")
    if sequence is None:
        sequence = (max((s.sequence for s in journey.stages), default=-1)) + 1
    stage = Member360CareJourneyStage(
        journey_id=journey.id,
        sequence=int(sequence),
        name=payload["name"],
        description=payload.get("description"),
        status=new_status,
        completed_at=datetime.utcnow() if new_status == "completed" else None,
    )
    # Append to the loaded relationship rather than re-querying — re-querying
    # returns the same identity-mapped instance whose ``stages`` collection
    # SQLAlchemy already considers loaded, so selectinload won't refresh it.
    journey.stages.append(stage)
    await session.flush()
    return _serialize_journey(journey)


async def update_care_journey_stage(
    session: AsyncSession,
    journey_id: int,
    stage_id: int,
    payload: dict,
) -> Optional[dict]:
    stage = await session.scalar(
        select(Member360CareJourneyStage).where(
            Member360CareJourneyStage.id == stage_id,
            Member360CareJourneyStage.journey_id == journey_id,
        )
    )
    if not stage:
        return None
    new_status = payload.get("status")
    if new_status is not None:
        if new_status not in _VALID_STAGE_STATUS:
            raise ValueError(
                f"Invalid stage status {new_status!r}; "
                f"expected one of {sorted(_VALID_STAGE_STATUS)}"
            )
        # Stamp/clear completed_at to match the new state. Completed stages
        # carry a timestamp so timeline + reporting can show "completed on X".
        if new_status == "completed" and stage.status != "completed":
            stage.completed_at = datetime.utcnow()
        elif new_status != "completed":
            stage.completed_at = None
        stage.status = new_status
    if payload.get("name") is not None:
        stage.name = payload["name"]
    if payload.get("description") is not None:
        stage.description = payload["description"]
    await session.flush()

    # Re-load the parent journey with stages so the caller can re-render.
    journey = await session.scalar(
        select(Member360CareJourney)
        .where(Member360CareJourney.id == journey_id)
        .options(selectinload(Member360CareJourney.stages))
    )
    return _serialize_journey(journey) if journey else None


# ---------- Outreach delivery ---------------------------------------------
# Resolves a matching Member360OutreachChannel for the message's channel_type
# and dispatches to a provider stub. Providers update Message.status:
#   queued → delivered            (success)
#   queued → failed_no_provider   (channel configured but provider lacks creds)
#   queued → skipped_no_channel   (no admin-config row for this channel_type)
#   queued → skipped_inactive     (matching channel exists but is_active=False)
# Real Twilio / SendGrid wiring slots in by adding a branch to ``_dispatch``.


async def _resolve_outreach_channel(
    session: AsyncSession, channel_type: str
) -> Optional[Member360OutreachChannel]:
    if not channel_type:
        return None
    return await session.scalar(
        select(Member360OutreachChannel).where(
            func.lower(Member360OutreachChannel.channel_type) == channel_type.lower()
        ).order_by(Member360OutreachChannel.id.asc())
    )


def _dispatch_outreach(
    channel: Member360OutreachChannel,
    *,
    body: str,
    recipient: Optional[str],
) -> tuple[str, Optional[str]]:
    """Provider dispatch stub. Returns ``(status, error)``.

    ``dryrun`` is the default for unconfigured environments — it logs the
    payload and reports ``delivered`` so the message round-trips through
    the UI. Real providers are stubbed to ``failed_no_provider`` until
    their SDKs + secrets are wired through ``OutreachChannel.config``.
    """
    provider = (channel.provider or "").strip().lower() or "dryrun"
    if provider in {"dryrun", "console", "noop"}:
        return "delivered", None
    # Real providers — placeholder until secrets/SDKs are integrated.
    if provider in {"twilio", "sendgrid", "talkdesk"}:
        return "failed_no_provider", (
            f"Provider {provider!r} configured but delivery SDK is not wired."
        )
    return "failed_no_provider", f"Unknown provider {provider!r}."


async def deliver_message(
    session: AsyncSession, message: Member360Message
) -> Member360Message:
    """Attempt synchronous delivery for ``message`` and update its ``status``
    in place. Always returns the message — callers don't have to inspect
    success/failure because the status field carries the outcome."""
    channel = await _resolve_outreach_channel(session, message.channel)
    if channel is None:
        message.status = "skipped_no_channel"
        return message
    if not channel.is_active:
        message.status = "skipped_inactive"
        return message
    status_, _err = _dispatch_outreach(
        channel, body=message.body, recipient=message.recipient
    )
    message.status = status_
    return message


# ---------- Document upload + retrieval -----------------------------------
# Two-phase write: insert the row first to claim an id, then write to the
# storage backend keyed on that id (so two documents with the same filename
# never collide), then flush the storage metadata back onto the row. If the
# storage write fails the transaction rolls back and no orphan row remains.


async def create_document(
    session: AsyncSession,
    *,
    tenant_key: str,
    member_id: int,
    file_name: str,
    content_type: str,
    body: bytes,
    uploaded_by: Optional[str],
    document_type: Optional[str] = None,
) -> Optional[dict]:
    member = await session.scalar(
        select(Member360Member).where(Member360Member.id == member_id)
    )
    if not member:
        return None

    digest = hashlib.sha256(body).hexdigest()
    row = Member360Document(
        member_id=member_id,
        file_name=(file_name or "file")[:255],
        document_type=document_type,
        uploaded_by=uploaded_by,
        status="active",
        content_type=(content_type or "application/octet-stream")[:128],
        size_bytes=len(body),
        sha256=digest,
    )
    session.add(row)
    await session.flush()  # populates row.id

    backend = member360_storage.get_document_backend()
    storage_path = await backend.write(
        tenant_key=tenant_key,
        member_id=member_id,
        doc_id=row.id,
        file_name=row.file_name,
        body=body,
    )
    row.storage_backend = backend.name
    row.storage_path = storage_path
    await session.flush()
    return _serialize_document(row)


async def read_document(
    session: AsyncSession,
    *,
    tenant_key: str,
    document_id: int,
) -> Optional[tuple[dict, bytes]]:
    """Look up a document row + load its bytes from the backend.

    Returns ``None`` if the document doesn't exist, has no storage record
    (legacy metadata-only row), or its bytes can't be read. The caller
    surfaces the 404 — we avoid leaking ``DocumentStorageError`` to the
    HTTP layer because we don't want to distinguish "row missing" from
    "bytes missing" in the response (both look like 404 to the user).
    """
    row = await session.scalar(
        select(Member360Document).where(Member360Document.id == document_id)
    )
    if not row or not row.storage_path:
        return None
    backend = member360_storage.get_document_backend()
    try:
        body = await backend.read(tenant_key=tenant_key, storage_path=row.storage_path)
    except member360_storage.DocumentStorageError:
        return None
    return _serialize_document(row), body
