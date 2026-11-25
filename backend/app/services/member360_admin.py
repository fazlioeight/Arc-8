"""Admin/configuration service for Member360 (F-48 & G-03).

Templates, risk rules, task queues, outreach channels, and care-option
policies are all per-tenant config — they live in the tenant DB next to
the data they govern. Audit events come from the control plane.

G-03: Automatically seeds default Care Journey Templates, 4-Domain Risk Rules,
Clinical Task Queues, Outreach Channels, and Care Option Policies when a
tenant's config tables are empty so Live Admin is populated out of the box.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.member360 import (
    Member360CareJourneyTemplate,
    Member360CareOptionPolicy,
    Member360OutreachChannel,
    Member360RiskRule,
    Member360TaskQueue,
)
from ..models.tables import TenantAuditEvent


DEFAULT_CARE_JOURNEY_TEMPLATES: tuple[dict, ...] = (
    {
        "name": "Post-Acute Hospital Transition & 30-Day Readmission Prevention",
        "description": "Structured 30-day TOC pathway following inpatient or ED discharge with 48-hour RN medication reconciliation and 7-day PCP follow-up.",
        "category": "Transitions of Care",
        "recommended_for_risk_tier": "Critical",
        "default_stages": [
            {"sequence": 1, "name": "48-Hour Post-Discharge Outreach & Med Rec", "description": "Contact member within 48 hours of discharge and reconcile discharge medications against Abarca PBM fills.", "status": "pending"},
            {"sequence": 2, "name": "7-Day In-Network PCP Follow-Up Visit", "description": "Confirm scheduled PCP or specialist follow-up appointment and arrange transportation if needed.", "status": "pending"},
            {"sequence": 3, "name": "14-Day Symptom & Red-Flag Assessment", "description": "Assess clinical red flags, weight/BP logs, and social barriers.", "status": "pending"},
            {"sequence": 4, "name": "30-Day Stabilization & Chronic Care Handoff", "description": "Verify no readmissions and transition member to long-term chronic disease maintenance.", "status": "pending"},
        ],
        "default_tasks": [
            {"title": "Complete 48-hour post-discharge medication reconciliation", "priority": "urgent"},
            {"title": "Schedule 7-day PCP follow-up appointment", "priority": "high"},
        ],
    },
    {
        "name": "Complex Diabetes & CKD Comorbidity Stabilization (HEDIS GSD / KED)",
        "description": "End-to-end glycemic and renal care pathway for members with HbA1c > 9.0% or CKD Stage 3b/4.",
        "category": "Chronic Disease Management",
        "recommended_for_risk_tier": "High",
        "default_stages": [
            {"sequence": 1, "name": "Baseline HbA1c, eGFR & uACR Lab Order", "description": "Order overdue laboratory panels and review baseline biometrics.", "status": "pending"},
            {"sequence": 2, "name": "Pharmacotherapy & 0-Refill Adherence Review", "description": "Review GLP-1/SGLT2i/ACEi adherence and resolve prior authorizations.", "status": "pending"},
            {"sequence": 3, "name": "90-Day Repeat HbA1c & Renal Re-Evaluation", "description": "Evaluate repeat HbA1c target (<8.0%) and close HEDIS GSD/KED care gaps.", "status": "pending"},
        ],
        "default_tasks": [
            {"title": "Order quarterly HbA1c and annual eGFR/uACR panel", "priority": "high"},
            {"title": "Review 0-refill maintenance medications with Abarca PBM", "priority": "medium"},
        ],
    },
    {
        "name": "Congestive Heart Failure (CHF) GDMT & Volume Management",
        "description": "Cardiology-aligned pathway for heart failure members focused on GDMT adherence, daily weight monitoring, and ED diversion.",
        "category": "Chronic Disease Management",
        "recommended_for_risk_tier": "Critical",
        "default_stages": [
            {"sequence": 1, "name": "Cardiology & GDMT Regimen Audit", "description": "Confirm 4-pillar GDMT medication coverage and daily weight scale availability.", "status": "pending"},
            {"sequence": 2, "name": "Bi-Weekly Nurse Tele-Monitoring Check-In", "description": "Review fluid retention symptoms, blood pressure (<130/80), and sodium intake.", "status": "pending"},
            {"sequence": 3, "name": "Quarterly Cardiology & HEDIS CBP Closure", "description": "Document controlled BP reading and close HCC 222 / HEDIS CBP gap.", "status": "pending"},
        ],
        "default_tasks": [
            {"title": "Verify GDMT beta-blocker and ARNI/ACEi prescription fills", "priority": "high"},
        ],
    },
    {
        "name": "Preventive Annual Wellness & HCC Suspect Closure Pathway",
        "description": "Proactive outreach playbook to schedule Annual Wellness Visits (AWV) and recapture open CMS HCC v28 suspects.",
        "category": "Preventive & Risk Adjustment",
        "recommended_for_risk_tier": "Moderate",
        "default_stages": [
            {"sequence": 1, "name": "Member Outreach & AWV Scheduling", "description": "Contact member via preferred channel to schedule in-network PCP Annual Wellness Visit.", "status": "pending"},
            {"sequence": 2, "name": "Pre-Visit HCC v28 & HEDIS Gap Prep", "description": "Deliver open suspect checklist to PCP prior to encounter.", "status": "pending"},
            {"sequence": 3, "name": "Post-Visit Documentation & Gap Closure Audit", "description": "Verify claim/chart documentation and mark care gaps closed.", "status": "pending"},
        ],
        "default_tasks": [
            {"title": "Schedule Annual Wellness Visit (AWV) with attributed PCP", "priority": "medium"},
        ],
    },
)

DEFAULT_RISK_RULES: tuple[dict, ...] = (
    {
        "name": "Uncontrolled Diabetes & Renal Progression (HbA1c > 9.0% / CKD 3b+)",
        "domain": "Clinical",
        "weight": 1.45,
        "threshold": 7.5,
        "description": "Flags members with poorly controlled diabetes, elevated HbA1c, or declining eGFR requiring intensive clinical management.",
        "recommendation_template": "Enroll in Complex Diabetes & CKD Journey and order HbA1c + uACR lab panel.",
        "is_active": True,
    },
    {
        "name": "Frequent ED Utilization & 30-Day Inpatient Readmission Risk",
        "domain": "Utilization",
        "weight": 1.35,
        "threshold": 7.0,
        "description": "Triggers when a member has >= 2 emergency department visits or an acute inpatient discharge within the trailing 90 days.",
        "recommendation_template": "Initiate 48-hour Transitions of Care outreach and steer to Tier-1 urgent care / PCP.",
        "is_active": True,
    },
    {
        "name": "High-Cost Out-of-Network & Specialty Pharmacy Spend",
        "domain": "Cost",
        "weight": 1.20,
        "threshold": 6.5,
        "description": "Identifies members with high out-of-network claims or high-cost specialty referrals eligible for in-network steerage.",
        "recommendation_template": "Generate in-network Tier-1 Care Option recommendation to capture steerage savings.",
        "is_active": True,
    },
    {
        "name": "Medication Non-Adherence (0 Refills Remaining / PDC < 80%) & Care Gap Delay",
        "domain": "Engagement",
        "weight": 1.15,
        "threshold": 6.0,
        "description": "Flags members with 0 refills remaining on chronic maintenance medications or no PCP contact in > 180 days.",
        "recommendation_template": "Perform coordinator outreach to convert to 90-day mail-order refill and schedule PCP visit.",
        "is_active": True,
    },
)

DEFAULT_TASK_QUEUES: tuple[dict, ...] = (
    {
        "name": "RN Complex Care & Transitions of Care Queue",
        "description": "Primary clinical nurse queue for post-discharge outreach, SBAR assessments, and critical-risk care journeys.",
        "sla_priority_hours": {"urgent": 4, "high": 24, "medium": 72, "low": 120},
        "escalation_queue": "Clinical Supervisor Escalation Queue",
        "routing_rules": {"risk_tiers": ["Critical", "High"], "domains": ["Clinical", "Utilization"]},
        "is_active": True,
    },
    {
        "name": "Care Coordinator Outreach & Gap Closure Queue",
        "description": "Care advocate queue for AWV scheduling, HEDIS gap closure, PCP attribution follow-up, and in-network steerage.",
        "sla_priority_hours": {"urgent": 8, "high": 48, "medium": 96, "low": 168},
        "escalation_queue": "Clinical Supervisor Escalation Queue",
        "routing_rules": {"risk_tiers": ["Moderate", "Low"], "domains": ["Engagement", "Cost"]},
        "is_active": True,
    },
    {
        "name": "Pharmacy & Prior Authorization (Abarca PBM) Queue",
        "description": "Dedicated queue for 0-refill maintenance alerts, statin/diabetes PDC adherence, and prior authorization resolution.",
        "sla_priority_hours": {"urgent": 4, "high": 24, "medium": 48, "low": 96},
        "escalation_queue": "Clinical Supervisor Escalation Queue",
        "routing_rules": {"task_types": ["medication_refill", "prior_auth"]},
        "is_active": True,
    },
    {
        "name": "Clinical Supervisor Escalation Queue",
        "description": "Supervisor review queue for complex SBAR escalations, SLA breaches, and high-cost care exceptions.",
        "sla_priority_hours": {"urgent": 2, "high": 12, "medium": 24, "low": 48},
        "escalation_queue": None,
        "routing_rules": {"status": ["escalated"]},
        "is_active": True,
    },
)

DEFAULT_OUTREACH_CHANNELS: tuple[dict, ...] = (
    {
        "channel_type": "Phone",
        "provider": "talkdesk",
        "config": {"cti_screen_pop": True, "ai_call_summary": True, "recording_hipaa_vault": True},
        "consent_required": True,
        "preferred_languages": ["English", "Spanish"],
        "is_active": True,
    },
    {
        "channel_type": "Email",
        "provider": "sendgrid",
        "config": {"sender": "care.team@prominencehealth.com", "tls_enforced": True},
        "consent_required": True,
        "preferred_languages": ["English", "Spanish"],
        "is_active": True,
    },
    {
        "channel_type": "Portal",
        "provider": "dryrun",
        "config": {"notification_push": True},
        "consent_required": False,
        "preferred_languages": ["English", "Spanish"],
        "is_active": True,
    },
)

DEFAULT_CARE_OPTION_POLICIES: tuple[dict, ...] = (
    {
        "service_type": "Outpatient MRI / Advanced Diagnostic Imaging",
        "line_of_business": "Medicare Advantage",
        "max_distance_miles": 15.0,
        "min_quality_score": 4.5,
        "min_savings_threshold": 450.0,
        "network_tier": "Tier 1 In-Network",
        "notes": "Steer outpatient imaging from hospital outpatient department (HOPD) to freestanding Tier-1 imaging centers.",
        "is_active": True,
    },
    {
        "service_type": "Ambulatory Surgery & Endoscopy / Colonoscopy",
        "line_of_business": "Medicare Advantage",
        "max_distance_miles": 20.0,
        "min_quality_score": 4.6,
        "min_savings_threshold": 800.0,
        "network_tier": "Tier 1 In-Network",
        "notes": "Steer elective GI and orthopedic procedures to accredited in-network Ambulatory Surgery Centers (ASC).",
        "is_active": True,
    },
    {
        "service_type": "Urgent Care & Acute Telehealth (ED Diversion)",
        "line_of_business": "All LOBs",
        "max_distance_miles": 10.0,
        "min_quality_score": 4.4,
        "min_savings_threshold": 650.0,
        "network_tier": "Tier 1 In-Network",
        "notes": "Redirect low-acuity emergency department visits to in-network urgent care clinics and same-day PCP access.",
        "is_active": True,
    },
)


async def ensure_default_admin_seed(session: AsyncSession) -> dict[str, int]:
    """G-03: Idempotently seed default Care Journey Templates, Risk Rules,
    Task Queues, and Care Option Policies if the respective table is empty."""
    seeded: dict[str, int] = {
        "templates": 0,
        "risk_rules": 0,
        "task_queues": 0,
        "care_option_policies": 0,
    }

    tpl_count = await session.scalar(select(func.count(Member360CareJourneyTemplate.id))) or 0
    if tpl_count == 0:
        for item in DEFAULT_CARE_JOURNEY_TEMPLATES:
            session.add(Member360CareJourneyTemplate(**item))
            seeded["templates"] += 1

    rule_count = await session.scalar(select(func.count(Member360RiskRule.id))) or 0
    if rule_count == 0:
        for item in DEFAULT_RISK_RULES:
            session.add(Member360RiskRule(**item))
            seeded["risk_rules"] += 1
    else:
        existing_rules = (await session.execute(select(Member360RiskRule))).scalars().all()
        for r in existing_rules:
            if r.threshold is not None and float(r.threshold) > 10.0:
                r.threshold = round(float(r.threshold) / 10.0, 1)
                seeded["risk_rules"] += 1

    queue_count = await session.scalar(select(func.count(Member360TaskQueue.id))) or 0
    if queue_count == 0:
        for item in DEFAULT_TASK_QUEUES:
            session.add(Member360TaskQueue(**item))
            seeded["task_queues"] += 1

    policy_count = await session.scalar(select(func.count(Member360CareOptionPolicy.id))) or 0
    if policy_count == 0:
        for item in DEFAULT_CARE_OPTION_POLICIES:
            session.add(Member360CareOptionPolicy(**item))
            seeded["care_option_policies"] += 1

    if any(v > 0 for v in seeded.values()):
        await session.flush()

    return seeded


# ---- Templates ----------------------------------------------------------


def serialize_template(t: Member360CareJourneyTemplate) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "category": t.category,
        "recommended_for_risk_tier": t.recommended_for_risk_tier,
        "default_stages": t.default_stages or [],
        "default_tasks": t.default_tasks or [],
    }


async def create_template(session: AsyncSession, payload: dict) -> Member360CareJourneyTemplate:
    obj = Member360CareJourneyTemplate(**payload)
    session.add(obj)
    await session.flush()
    return obj


async def update_template(
    session: AsyncSession, template_id: int, payload: dict
) -> Optional[Member360CareJourneyTemplate]:
    obj = await session.get(Member360CareJourneyTemplate, template_id)
    if not obj:
        return None
    for key, value in payload.items():
        if value is not None:
            setattr(obj, key, value)
    await session.flush()
    return obj


async def delete_template(session: AsyncSession, template_id: int) -> bool:
    obj = await session.get(Member360CareJourneyTemplate, template_id)
    if not obj:
        return False
    await session.delete(obj)
    return True


# ---- Generic CRUD helpers ----------------------------------------------


async def _list(session: AsyncSession, model) -> list:
    rows = await session.execute(select(model).order_by(model.id.asc()))
    return list(rows.scalars().all())


async def _create(session: AsyncSession, model, payload: dict):
    obj = model(**payload)
    session.add(obj)
    await session.flush()
    return obj


async def _update(session: AsyncSession, model, item_id: int, payload: dict):
    obj = await session.get(model, item_id)
    if not obj:
        return None
    for key, value in payload.items():
        if value is not None:
            setattr(obj, key, value)
    await session.flush()
    return obj


async def _delete(session: AsyncSession, model, item_id: int) -> bool:
    obj = await session.get(model, item_id)
    if not obj:
        return False
    await session.delete(obj)
    return True


# ---- Risk rules / queues / channels / policies --------------------------


async def list_risk_rules(session: AsyncSession):
    await ensure_default_admin_seed(session)
    return await _list(session, Member360RiskRule)


async def create_risk_rule(session: AsyncSession, payload: dict):
    return await _create(session, Member360RiskRule, payload)


async def update_risk_rule(session: AsyncSession, item_id: int, payload: dict):
    return await _update(session, Member360RiskRule, item_id, payload)


async def delete_risk_rule(session: AsyncSession, item_id: int) -> bool:
    return await _delete(session, Member360RiskRule, item_id)


async def list_task_queues(session: AsyncSession):
    await ensure_default_admin_seed(session)
    return await _list(session, Member360TaskQueue)


async def create_task_queue(session: AsyncSession, payload: dict):
    return await _create(session, Member360TaskQueue, payload)


async def update_task_queue(session: AsyncSession, item_id: int, payload: dict):
    return await _update(session, Member360TaskQueue, item_id, payload)


async def delete_task_queue(session: AsyncSession, item_id: int) -> bool:
    return await _delete(session, Member360TaskQueue, item_id)


async def list_outreach_channels(session: AsyncSession):
    rows = await _list(session, Member360OutreachChannel)
    if not rows:
        for item in DEFAULT_OUTREACH_CHANNELS:
            session.add(Member360OutreachChannel(**item))
        await session.flush()
        rows = await _list(session, Member360OutreachChannel)
    return rows


async def create_outreach_channel(session: AsyncSession, payload: dict):
    return await _create(session, Member360OutreachChannel, payload)


async def update_outreach_channel(session: AsyncSession, item_id: int, payload: dict):
    return await _update(session, Member360OutreachChannel, item_id, payload)


async def delete_outreach_channel(session: AsyncSession, item_id: int) -> bool:
    return await _delete(session, Member360OutreachChannel, item_id)


async def list_care_option_policies(session: AsyncSession):
    await ensure_default_admin_seed(session)
    return await _list(session, Member360CareOptionPolicy)


async def create_care_option_policy(session: AsyncSession, payload: dict):
    return await _create(session, Member360CareOptionPolicy, payload)


async def update_care_option_policy(session: AsyncSession, item_id: int, payload: dict):
    return await _update(session, Member360CareOptionPolicy, item_id, payload)


async def delete_care_option_policy(session: AsyncSession, item_id: int) -> bool:
    return await _delete(session, Member360CareOptionPolicy, item_id)


# ---- Audit events (control plane) ---------------------------------------


async def list_audit_events(
    session: AsyncSession,
    *,
    tenant_id: int,
    event_type_prefix: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[TenantAuditEvent], int]:
    stmt = select(TenantAuditEvent).where(TenantAuditEvent.tenant_id == tenant_id)
    if event_type_prefix:
        stmt = stmt.where(TenantAuditEvent.event_type.startswith(event_type_prefix))
    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(TenantAuditEvent.created_at.desc()).limit(limit).offset(offset)
    rows = (await session.execute(stmt)).scalars().all()
    return list(rows), int(total)


async def list_audit_events_for_member(
    session: AsyncSession,
    *,
    tenant_id: int,
    member_id: int,
    event_type_prefix: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[TenantAuditEvent], int]:
    """Audit events whose JSON ``payload.member_id`` equals ``member_id``."""
    payload_member = TenantAuditEvent.payload["member_id"].as_integer()
    stmt = select(TenantAuditEvent).where(
        TenantAuditEvent.tenant_id == tenant_id,
        payload_member == member_id,
    )
    if event_type_prefix:
        stmt = stmt.where(TenantAuditEvent.event_type.startswith(event_type_prefix))
    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(TenantAuditEvent.created_at.desc()).limit(limit).offset(offset)
    rows = (await session.execute(stmt)).scalars().all()
    return list(rows), int(total)


def serialize_audit(event: TenantAuditEvent) -> dict:
    return {
        "id": event.id,
        "actor": event.actor,
        "event_type": event.event_type,
        "payload": event.payload or {},
        "created_at": event.created_at,
    }
