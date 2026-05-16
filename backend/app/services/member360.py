"""Service layer for Nexora Lab Member360.

Responsibilities:
- Lazy seeding of demo data on first request (per tenant DB).
- Query helpers used by route handlers.
- Computation of dashboard rollups and risk insight summaries.

The seed makes the demo workable on a freshly-migrated dev DB without
requiring a separate seed script. It is idempotent: if any member already
exists for the tenant, no seeding happens.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Iterable, Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.member360 import (
    Member360Accumulator,
    Member360CareJourney,
    Member360CareJourneyStage,
    Member360CareJourneyTemplate,
    Member360CareOption,
    Member360Claim,
    Member360Document,
    Member360Member,
    Member360Message,
    Member360Note,
    Member360RiskInsight,
    Member360Savings,
    Member360Task,
)


_seed_lock = asyncio.Lock()


def _compute_age(dob: Optional[date]) -> Optional[int]:
    if not dob:
        return None
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


async def ensure_seeded(session: AsyncSession) -> None:
    """Seed demo data on first use. Idempotent."""
    existing = await session.scalar(select(func.count(Member360Member.id)))
    if existing:
        return
    async with _seed_lock:
        existing = await session.scalar(select(func.count(Member360Member.id)))
        if existing:
            return
        await _seed_demo_data(session)
        await session.commit()


async def _seed_demo_data(session: AsyncSession) -> None:
    """Populate tenant DB with demo members, journeys, tasks, care options, savings, etc."""
    today = date.today()
    now = datetime.utcnow()

    # ---- Templates ----------------------------------------------------
    templates = [
        Member360CareJourneyTemplate(
            name="High-Risk Member Outreach",
            description="Structured engagement for members with composite risk in the high or critical tier.",
            category="Risk Management",
            recommended_for_risk_tier="High",
            default_stages=[
                {"name": "Identify drivers", "description": "Review claims and gaps."},
                {"name": "Initial outreach", "description": "Call within 48 hours."},
                {"name": "Care plan", "description": "Develop personalized plan."},
                {"name": "Follow-up", "description": "Weekly check-ins."},
            ],
            default_tasks=[
                {"title": "Call member", "priority": "high"},
                {"title": "Schedule comprehensive assessment", "priority": "medium"},
            ],
        ),
        Member360CareJourneyTemplate(
            name="Post-Discharge Follow-Up",
            description="48-72 hour outreach after inpatient discharge.",
            category="Transitions of Care",
            recommended_for_risk_tier="Moderate",
            default_stages=[
                {"name": "Discharge review", "description": "Read discharge summary."},
                {"name": "Outreach call", "description": "Within 48 hours."},
                {"name": "Med reconciliation", "description": "Review medications."},
            ],
            default_tasks=[
                {"title": "Call member after discharge", "priority": "urgent"},
                {"title": "Reconcile medications", "priority": "high"},
            ],
        ),
        Member360CareJourneyTemplate(
            name="Imaging Steerage",
            description="Guide member to lower-cost, high-quality imaging facility.",
            category="Care Options",
            recommended_for_risk_tier="Moderate",
            default_stages=[
                {"name": "Confirm order", "description": "Verify imaging order."},
                {"name": "Present options", "description": "Provide steered options."},
                {"name": "Schedule", "description": "Help member schedule."},
            ],
            default_tasks=[
                {"title": "Discuss imaging options with member", "priority": "high"},
            ],
        ),
        Member360CareJourneyTemplate(
            name="Chronic Condition Review",
            description="Quarterly review of chronic condition management.",
            category="Chronic Care",
            recommended_for_risk_tier="High",
            default_stages=[
                {"name": "Review claims", "description": "Look at HCC trend."},
                {"name": "Outreach", "description": "Connect with member."},
                {"name": "PCP coordination", "description": "Sync with PCP."},
            ],
            default_tasks=[
                {"title": "Review chronic condition trends", "priority": "medium"},
            ],
        ),
        Member360CareJourneyTemplate(
            name="Preventive Care Gap Closure",
            description="Close preventive care gaps such as annual wellness or screenings.",
            category="Preventive",
            recommended_for_risk_tier="Low",
            default_stages=[
                {"name": "Identify gaps", "description": "Pull open HEDIS gaps."},
                {"name": "Outreach", "description": "Member outreach."},
                {"name": "Verify closure", "description": "Confirm services occurred."},
            ],
            default_tasks=[
                {"title": "Outreach to schedule preventive visit", "priority": "medium"},
            ],
        ),
    ]
    session.add_all(templates)
    await session.flush()

    # ---- Members ------------------------------------------------------
    seed_members = [
        {
            "member_key": "M360-0001",
            "first_name": "Maria",
            "last_name": "Hernandez",
            "date_of_birth": date(1956, 3, 12),
            "gender": "Female",
            "plan_name": "ProminenceCare Gold",
            "line_of_business": "Medicare Advantage",
            "phone": "(702) 555-0142",
            "email": "maria.hernandez@example.com",
            "address_line1": "1245 Charleston Blvd",
            "address_city": "Las Vegas",
            "address_state": "NV",
            "address_zip": "89102",
            "preferred_language": "Spanish",
            "preferred_channel": "Phone",
            "primary_care_provider": "Dr. Aaron Whitley",
            "risk_score_composite": 8.6,
            "risk_tier": "Critical",
            "clinical_risk_score": 9.1,
            "utilization_risk_score": 8.2,
            "cost_risk_score": 8.8,
            "engagement_risk_score": 5.3,
            "open_care_gaps": 4,
            "next_best_action": "Schedule cardiology follow-up",
        },
        {
            "member_key": "M360-0002",
            "first_name": "James",
            "last_name": "O'Connell",
            "date_of_birth": date(1962, 8, 4),
            "gender": "Male",
            "plan_name": "ProminenceCare Silver",
            "line_of_business": "Medicare Advantage",
            "phone": "(702) 555-0188",
            "email": "james.oconnell@example.com",
            "address_city": "Reno",
            "address_state": "NV",
            "address_zip": "89509",
            "preferred_language": "English",
            "preferred_channel": "SMS",
            "primary_care_provider": "Dr. Priya Shah",
            "risk_score_composite": 7.4,
            "risk_tier": "High",
            "clinical_risk_score": 7.9,
            "utilization_risk_score": 7.0,
            "cost_risk_score": 6.5,
            "engagement_risk_score": 4.0,
            "open_care_gaps": 3,
            "next_best_action": "Imaging steerage opportunity (MRI)",
        },
        {
            "member_key": "M360-0003",
            "first_name": "Linda",
            "last_name": "Pham",
            "date_of_birth": date(1971, 11, 22),
            "gender": "Female",
            "plan_name": "ProminenceCare PPO",
            "line_of_business": "Commercial",
            "phone": "(415) 555-0117",
            "email": "linda.pham@example.com",
            "address_city": "San Jose",
            "address_state": "CA",
            "address_zip": "95110",
            "preferred_channel": "Secure Message",
            "primary_care_provider": "Dr. Marcus Lee",
            "risk_score_composite": 6.1,
            "risk_tier": "High",
            "clinical_risk_score": 6.7,
            "utilization_risk_score": 5.5,
            "cost_risk_score": 6.3,
            "engagement_risk_score": 6.4,
            "open_care_gaps": 2,
            "next_best_action": "Confirm diabetes care plan",
        },
        {
            "member_key": "M360-0004",
            "first_name": "Robert",
            "last_name": "Carter",
            "date_of_birth": date(1980, 5, 30),
            "gender": "Male",
            "plan_name": "ProminenceCare HMO",
            "line_of_business": "Commercial",
            "phone": "(415) 555-0103",
            "email": "robert.carter@example.com",
            "address_city": "Oakland",
            "address_state": "CA",
            "address_zip": "94612",
            "preferred_channel": "Chat",
            "primary_care_provider": "Dr. Sandra Yi",
            "risk_score_composite": 4.2,
            "risk_tier": "Moderate",
            "clinical_risk_score": 4.0,
            "utilization_risk_score": 4.5,
            "cost_risk_score": 4.1,
            "engagement_risk_score": 5.2,
            "open_care_gaps": 1,
            "next_best_action": "Annual wellness visit",
        },
        {
            "member_key": "M360-0005",
            "first_name": "Emily",
            "last_name": "Nakamura",
            "date_of_birth": date(1993, 1, 18),
            "gender": "Female",
            "plan_name": "ProminenceCare PPO",
            "line_of_business": "Commercial",
            "phone": "(702) 555-0211",
            "email": "emily.nakamura@example.com",
            "address_city": "Henderson",
            "address_state": "NV",
            "address_zip": "89014",
            "preferred_channel": "Chat",
            "primary_care_provider": "Dr. Aaron Whitley",
            "risk_score_composite": 2.1,
            "risk_tier": "Low",
            "clinical_risk_score": 2.0,
            "utilization_risk_score": 2.4,
            "cost_risk_score": 2.0,
            "engagement_risk_score": 7.5,
            "open_care_gaps": 0,
            "next_best_action": "Send preventive care reminder",
        },
        {
            "member_key": "M360-0006",
            "first_name": "Daniel",
            "last_name": "Adeyemi",
            "date_of_birth": date(1949, 9, 8),
            "gender": "Male",
            "plan_name": "ProminenceCare Gold",
            "line_of_business": "Medicare Advantage",
            "phone": "(702) 555-0144",
            "email": "daniel.adeyemi@example.com",
            "address_city": "Sparks",
            "address_state": "NV",
            "address_zip": "89431",
            "preferred_channel": "Phone",
            "primary_care_provider": "Dr. Priya Shah",
            "risk_score_composite": 8.9,
            "risk_tier": "Critical",
            "clinical_risk_score": 9.3,
            "utilization_risk_score": 8.7,
            "cost_risk_score": 9.0,
            "engagement_risk_score": 3.2,
            "open_care_gaps": 5,
            "next_best_action": "Urgent: post-ED outreach",
        },
        {
            "member_key": "M360-0007",
            "first_name": "Sophia",
            "last_name": "Rivera",
            "date_of_birth": date(1968, 2, 14),
            "gender": "Female",
            "plan_name": "ProminenceCare Silver",
            "line_of_business": "Medicare Advantage",
            "phone": "(702) 555-0177",
            "email": "sophia.rivera@example.com",
            "address_city": "Las Vegas",
            "address_state": "NV",
            "address_zip": "89148",
            "preferred_channel": "Phone",
            "primary_care_provider": "Dr. Marcus Lee",
            "risk_score_composite": 5.8,
            "risk_tier": "Moderate",
            "clinical_risk_score": 5.6,
            "utilization_risk_score": 6.0,
            "cost_risk_score": 5.5,
            "engagement_risk_score": 6.1,
            "open_care_gaps": 2,
            "next_best_action": "Confirm imaging steerage",
        },
        {
            "member_key": "M360-0008",
            "first_name": "Michael",
            "last_name": "Stewart",
            "date_of_birth": date(1955, 7, 25),
            "gender": "Male",
            "plan_name": "ProminenceCare Gold",
            "line_of_business": "Medicare Advantage",
            "phone": "(702) 555-0199",
            "email": "michael.stewart@example.com",
            "address_city": "Reno",
            "address_state": "NV",
            "address_zip": "89502",
            "preferred_channel": "SMS",
            "primary_care_provider": "Dr. Sandra Yi",
            "risk_score_composite": 7.0,
            "risk_tier": "High",
            "clinical_risk_score": 7.4,
            "utilization_risk_score": 6.8,
            "cost_risk_score": 6.9,
            "engagement_risk_score": 5.6,
            "open_care_gaps": 3,
            "next_best_action": "Schedule comprehensive assessment",
        },
    ]
    member_objs: list[Member360Member] = []
    for spec in seed_members:
        m = Member360Member(**spec, last_interaction_at=now - timedelta(days=2))
        session.add(m)
        member_objs.append(m)
    await session.flush()

    # ---- Risk Insights ----------------------------------------------
    insight_specs = [
        ("Clinical", "Uncontrolled HbA1c trend (>9)", "Schedule diabetes coaching", 0.92),
        ("Utilization", "2 ED visits in last 90 days", "Care manager outreach within 48h", 0.88),
        ("Cost", "Imaging cost variance vs network median", "Steerage to lower-cost facility", 0.81),
        ("Engagement", "No outbound contact in 60 days", "Try preferred channel and language", 0.74),
    ]
    for member in member_objs:
        for domain, driver, recommendation, confidence in insight_specs:
            # Score derived from per-domain field on member
            score = {
                "Clinical": float(member.clinical_risk_score or 0),
                "Utilization": float(member.utilization_risk_score or 0),
                "Cost": float(member.cost_risk_score or 0),
                "Engagement": float(member.engagement_risk_score or 0),
            }[domain]
            session.add(
                Member360RiskInsight(
                    member_id=member.id,
                    domain=domain,
                    score=score,
                    driver=driver,
                    recommendation=recommendation,
                    confidence=confidence,
                )
            )

    # ---- Care Journeys (assign one to first three high/critical members) -----
    journey_assignments = [
        (member_objs[0], templates[0], "active"),
        (member_objs[1], templates[2], "active"),
        (member_objs[5], templates[1], "active"),
        (member_objs[7], templates[3], "active"),
    ]
    for member, template, status in journey_assignments:
        journey = Member360CareJourney(
            member_id=member.id,
            template_id=template.id,
            name=template.name,
            description=template.description,
            status=status,
            template_name=template.name,
            source="seed",
            assigned_to="admin@admin.com",
            created_by="seed",
            start_date=today - timedelta(days=5),
            target_completion_date=today + timedelta(days=21),
        )
        session.add(journey)
        await session.flush()
        for idx, stage_spec in enumerate(template.default_stages or []):
            session.add(
                Member360CareJourneyStage(
                    journey_id=journey.id,
                    sequence=idx,
                    name=stage_spec.get("name", f"Stage {idx + 1}"),
                    description=stage_spec.get("description"),
                    status="complete" if idx == 0 else "in_progress" if idx == 1 else "pending",
                    completed_at=now - timedelta(days=3) if idx == 0 else None,
                )
            )

    await session.flush()

    # ---- Tasks ------------------------------------------------------
    task_seed = [
        (member_objs[0], "Call member re: cardiology follow-up", "urgent", "open",
         "Member identified as critical risk with uncontrolled CHF.",
         "Two CHF-related ED visits in past 6 months; missed cardiology follow-up.",
         "High likelihood of decompensation without near-term intervention.",
         "Outbound call today, escalate to RN if no answer.",
         "Auto-prioritized due to Critical risk tier"),
        (member_objs[1], "Discuss MRI imaging steerage", "high", "open",
         "Member calling about MRI options for shoulder.",
         "PCP ordered MRI; member on PPO with $850 deductible remaining.",
         "Steered facility saves est. $620 with equal quality score.",
         "Send care option report and SMS link to scheduling.",
         "Imaging steerage opportunity detected on inbound call"),
        (member_objs[2], "Confirm diabetes care plan", "medium", "in_progress",
         "Type 2 diabetes management review.",
         "HbA1c trending up; last reading 8.4.",
         "Medication adherence gap.",
         "Coordinate with PCP and schedule diabetes coach.",
         None),
        (member_objs[5], "Urgent post-ED outreach", "urgent", "open",
         "Member discharged from ED 24 hours ago.",
         "ED visit for chest pain; admitted overnight.",
         "Risk of readmission elevated.",
         "Call within next 12 hours to verify med reconciliation.",
         "Post-discharge automation triggered"),
        (member_objs[7], "Schedule comprehensive assessment", "high", "open",
         "New high-risk identification.",
         "Multiple chronic conditions, missed last AWV.",
         "Comprehensive assessment overdue.",
         "Offer in-home assessment as primary option.",
         "AI flagged: chronic care review template recommended"),
    ]
    for member, title, priority, status, situation, background, assessment, recommendation, reason in task_seed:
        session.add(
            Member360Task(
                member_id=member.id,
                title=title,
                priority=priority,
                status=status,
                due_date=today + timedelta(days=2),
                sbar_situation=situation,
                sbar_background=background,
                sbar_assessment=assessment,
                sbar_recommendation=recommendation,
                recommended_next_action=recommendation,
                auto_generated_reason=reason,
                assigned_user="admin@admin.com",
                assigned_queue="Care Coordination",
            )
        )

    # ---- Notes ------------------------------------------------------
    for member in member_objs[:5]:
        session.add(
            Member360Note(
                member_id=member.id,
                author_email="admin@admin.com",
                author_name="Care Coordinator",
                channel="Phone",
                note_type="Outreach",
                body=f"Spoke with {member.first_name}. Reviewed care plan and confirmed next steps.",
            )
        )

    # ---- Messages ---------------------------------------------------
    for member in member_objs[:5]:
        session.add(
            Member360Message(
                member_id=member.id,
                channel=member.preferred_channel or "SMS",
                direction="outbound",
                sender="ProminenceCare",
                recipient=member.phone or member.email or member.member_key,
                body=f"Hi {member.first_name}, this is your care team. Let us know a good time to talk this week.",
                status="delivered",
            )
        )
        session.add(
            Member360Message(
                member_id=member.id,
                channel=member.preferred_channel or "SMS",
                direction="inbound",
                sender=member.member_key,
                recipient="ProminenceCare",
                body="Thanks - tomorrow afternoon works.",
                status="received",
            )
        )

    # ---- Claims & Accumulators -------------------------------------
    for idx, member in enumerate(member_objs):
        session.add_all(
            [
                Member360Claim(
                    member_id=member.id,
                    claim_number=f"CLM-{member.member_key}-A",
                    service_date=today - timedelta(days=30 + idx),
                    provider="Mountain View Imaging" if idx % 2 == 0 else "Desert Cardiology",
                    category="Imaging" if idx % 2 == 0 else "Cardiology",
                    status="paid",
                    billed_amount=1280.0 + idx * 110,
                    paid_amount=720.0 + idx * 65,
                    member_responsibility=180.0 + idx * 15,
                ),
                Member360Claim(
                    member_id=member.id,
                    claim_number=f"CLM-{member.member_key}-B",
                    service_date=today - timedelta(days=14 + idx),
                    provider="Primary Care Group",
                    category="Office Visit",
                    status="processed",
                    billed_amount=240.0,
                    paid_amount=180.0,
                    member_responsibility=60.0,
                ),
            ]
        )
        session.add(
            Member360Accumulator(
                member_id=member.id,
                deductible=2500.0,
                deductible_met=420.0 + idx * 75,
                out_of_pocket_max=7500.0,
                out_of_pocket_met=1100.0 + idx * 130,
                plan_year_start=date(today.year, 1, 1),
            )
        )

    # ---- Care Options + Savings ------------------------------------
    care_options = [
        (member_objs[1], "MRI - Shoulder", "Pacific Imaging Center", "Pacific Imaging Center",
         640.0, 4.7, 5.2, "In Network", 620.0,
         "Same MRI protocol with equivalent radiology read at 49% lower cost.",
         "We found a high-quality imaging center 5 miles away that costs $620 less than your original facility."),
        (member_objs[6], "MRI - Knee", "ValleyOrtho Imaging", "ValleyOrtho Imaging",
         580.0, 4.6, 3.1, "In Network", 480.0,
         "Lower-cost imaging facility with comparable quality and shorter wait time.",
         "ValleyOrtho can see you sooner and saves about $480 vs the originally ordered facility."),
        (member_objs[2], "Endocrinologist Consult", "Bay Endocrine Associates", "Bay Endocrine Associates",
         220.0, 4.8, 6.5, "In Network", 95.0,
         "Highest-rated endocrinologist accepting new patients within 4 weeks.",
         "We found an endocrinologist with great reviews who is available soon."),
    ]
    for spec in care_options:
        member, service_type, provider, facility, cost, quality, distance, network, savings, rationale, member_facing = spec
        opt = Member360CareOption(
            member_id=member.id,
            service_type=service_type,
            recommended_provider=provider,
            facility_name=facility,
            cost_estimate=cost,
            quality_score=quality,
            distance_miles=distance,
            network_status=network,
            potential_savings=savings,
            rationale=rationale,
            member_facing_explanation=member_facing,
            status="recommended",
        )
        session.add(opt)
        await session.flush()
        session.add(
            Member360Savings(
                member_id=member.id,
                care_option_id=opt.id,
                original_expected_cost=cost + savings,
                steered_option_cost=cost,
                estimated_savings=savings,
                claim_received=False,
                savings_validated=False,
                validation_status="pending",
            )
        )

    # ---- Documents ---------------------------------------------------
    for member in member_objs[:4]:
        session.add(
            Member360Document(
                member_id=member.id,
                file_name=f"{member.member_key}_care_waiver.pdf",
                document_type="Care Waiver",
                uploaded_by="admin@admin.com",
                status="active",
            )
        )

    # Update aggregate counters that the UI uses (open_task_count comes from query).


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
