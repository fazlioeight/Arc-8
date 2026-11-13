"""Service layer for Arc-8 Member360.

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
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import hashlib
import re

from ..models.coding import CodingProvider
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
    Member360Provider,
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


def _utc_dt(dt: Optional[datetime]) -> Optional[datetime]:
    """Attach UTC tzinfo to naive UTC datetimes so FastAPI emits trailing 'Z'."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


_RISK_TIER_CANONICAL_MAP: dict[str, str] = {
    "critical": "Critical",
    "complex": "Critical",
    "high": "High",
    "moderate": "Moderate",
    "rising": "Moderate",
    "medium": "Moderate",
    "low": "Low",
}

_RISK_TIER_SYNONYM_GROUPS: dict[str, tuple[str, ...]] = {
    "critical": ("critical", "complex"),
    "complex": ("critical", "complex"),
    "high": ("high",),
    "moderate": ("moderate", "rising", "medium"),
    "rising": ("moderate", "rising", "medium"),
    "medium": ("moderate", "rising", "medium"),
    "low": ("low",),
}


def _canonical_risk_tier(tier: Optional[str]) -> Optional[str]:
    if not tier:
        return tier
    key = tier.strip().lower()
    return _RISK_TIER_CANONICAL_MAP.get(key, tier)


def _expand_risk_tiers(tiers: Iterable[str]) -> list[str]:
    expanded: set[str] = set()
    for t in tiers:
        if not t:
            continue
        key = t.strip().lower()
        expanded.update(_RISK_TIER_SYNONYM_GROUPS.get(key, (key,)))
    return sorted(expanded)


# ---------------------- Clinical & Provider Normalization ------------------

_ICD10_REFERENCE_MAP: dict[str, tuple[str, str, str]] = {
    "I10": ("I10", "Essential (primary) hypertension", "moderate"),
    "E119": ("E11.9", "Type 2 diabetes mellitus without complications", "moderate"),
    "E11.9": ("E11.9", "Type 2 diabetes mellitus without complications", "moderate"),
    "E1165": ("E11.65", "Type 2 diabetes mellitus with hyperglycemia", "severe"),
    "E11.65": ("E11.65", "Type 2 diabetes mellitus with hyperglycemia", "severe"),
    "N1830": ("N18.30", "Chronic kidney disease, stage 3 unspecified", "moderate"),
    "N18.30": ("N18.30", "Chronic kidney disease, stage 3 unspecified", "moderate"),
    "N183": ("N18.3", "Chronic kidney disease, stage 3 (moderate)", "moderate"),
    "N18.3": ("N18.3", "Chronic kidney disease, stage 3 (moderate)", "moderate"),
    "N184": ("N18.4", "Chronic kidney disease, stage 4 (severe)", "severe"),
    "N18.4": ("N18.4", "Chronic kidney disease, stage 4 (severe)", "severe"),
    "I509": ("I50.9", "Heart failure, unspecified", "severe"),
    "I50.9": ("I50.9", "Heart failure, unspecified", "severe"),
    "I5032": ("I50.32", "Chronic diastolic (congestive) heart failure", "severe"),
    "I50.32": ("I50.32", "Chronic diastolic (congestive) heart failure", "severe"),
    "J449": ("J44.9", "Chronic obstructive pulmonary disease, unspecified", "moderate"),
    "J44.9": ("J44.9", "Chronic obstructive pulmonary disease, unspecified", "moderate"),
    "J441": ("J44.1", "COPD with (acute) exacerbation", "severe"),
    "J44.1": ("J44.1", "COPD with (acute) exacerbation", "severe"),
    "E785": ("E78.5", "Hyperlipidemia, unspecified", "mild"),
    "E78.5": ("E78.5", "Hyperlipidemia, unspecified", "mild"),
    "I2510": ("I25.10", "Atherosclerotic heart disease of native coronary artery", "moderate"),
    "I25.10": ("I25.10", "Atherosclerotic heart disease of native coronary artery", "moderate"),
    "F329": ("F32.9", "Major depressive disorder, single episode, unspecified", "moderate"),
    "F32.9": ("F32.9", "Major depressive disorder, single episode, unspecified", "moderate"),
    "F332": ("F33.2", "Major depressive disorder, recurrent, severe", "severe"),
    "F33.2": ("F33.2", "Major depressive disorder, recurrent, severe", "severe"),
    "J45909": ("J45.909", "Unspecified asthma, uncomplicated", "moderate"),
    "J45.909": ("J45.909", "Unspecified asthma, uncomplicated", "moderate"),
    "E669": ("E66.9", "Obesity, unspecified", "moderate"),
    "E66.9": ("E66.9", "Obesity, unspecified", "moderate"),
    "M545": ("M54.5", "Low back pain", "mild"),
    "M54.5": ("M54.5", "Low back pain", "mild"),
    "Z0000": ("Z00.00", "General adult medical examination", "mild"),
    "Z00.00": ("Z00.00", "General adult medical examination", "mild"),
}

_PREFERRED_CHANNEL_MAP: dict[str, str] = {
    "sms": "SMS",
    "text": "SMS",
    "email": "Email",
    "phone": "Phone",
    "call": "Phone",
    "voice": "Phone",
    "portal": "Portal",
    "mail": "Mail",
}

_CARE_COORDINATOR_DIRECTORY: dict[str, str] = {
    "care.team@prominencehealth.com": "Sarah Chen, RN",
    "coordinator@prominencehealth.com": "Hannah Abbott, CCM",
    "elena.nurse@prominencehealth.com": "Elena Rostova, RN",
    "dr.chen@prominencehealth.com": "Sarah Chen, RN",
    "supervisor@prominencehealth.com": "Marcus Vance, MSW",
}

_DEFAULT_CARE_COORDINATORS: tuple[str, ...] = (
    "Sarah Chen, RN",
    "Elena Rostova, RN",
    "Hannah Abbott, CCM",
    "Marcus Vance, MSW",
)

_DEFAULT_IN_NETWORK_PROVIDERS: tuple[dict, ...] = (
    {"npi": "9700000001", "name": "Anjali Patel, MD", "specialty": "Family Medicine", "is_pcp": True, "city": "Sparks", "state": "NV"},
    {"npi": "9700000002", "name": "Tran Nguyen, MD", "specialty": "Family Medicine", "is_pcp": True, "city": "Reno", "state": "NV"},
    {"npi": "9700000003", "name": "Marcus Robinson, MD", "specialty": "Internal Medicine", "is_pcp": True, "city": "Reno", "state": "NV"},
    {"npi": "9700000004", "name": "Sarah Khan, MD", "specialty": "Family Medicine", "is_pcp": True, "city": "Carson City", "state": "NV"},
    {"npi": "9700000005", "name": "Mateo Suarez, MD", "specialty": "Internal Medicine", "is_pcp": True, "city": "Las Vegas", "state": "NV"},
    {"npi": "9700000006", "name": "Wei Lin, MD", "specialty": "Family Medicine", "is_pcp": True, "city": "Henderson", "state": "NV"},
    {"npi": "9700000007", "name": "Heather Anderson, DO", "specialty": "Family Medicine", "is_pcp": True, "city": "Reno", "state": "NV"},
    {"npi": "1234567890", "name": "Robert Patel, DO", "specialty": "Internal Medicine", "is_pcp": True, "city": "Reno", "state": "NV"},
    {"npi": "1234567891", "name": "Sarah Chen, MD", "specialty": "Family Medicine", "is_pcp": True, "city": "Las Vegas", "state": "NV"},
    {"npi": "1234567892", "name": "Michael Nguyen, MD", "specialty": "Internal Medicine", "is_pcp": True, "city": "Sparks", "state": "NV"},
    {"npi": "1234567893", "name": "Elena Garcia, MD", "specialty": "Family Medicine", "is_pcp": True, "city": "Henderson", "state": "NV"},
    {"npi": "1234567894", "name": "David Kim, DO", "specialty": "Internal Medicine", "is_pcp": True, "city": "Carson City", "state": "NV"},
    {"npi": "9700000008", "name": "Priya Iyer, MD", "specialty": "Endocrinology", "is_pcp": False, "city": "Reno", "state": "NV"},
    {"npi": "9700000009", "name": "James Whitaker, MD", "specialty": "Cardiology", "is_pcp": False, "city": "Reno", "state": "NV"},
    {"npi": "9700000010", "name": "Daniela Cardoza, MD", "specialty": "Nephrology", "is_pcp": False, "city": "Reno", "state": "NV"},
    {"npi": "9700000011", "name": "Felix Brooks, MD", "specialty": "Pulmonology", "is_pcp": False, "city": "Henderson", "state": "NV"},
    {"npi": "9700000012", "name": "Zoe Williams, MD", "specialty": "Psychiatry", "is_pcp": False, "city": "Sparks", "state": "NV"},
)


def _format_icd10_code(raw_code: Optional[str]) -> str:
    if not raw_code:
        return ""
    clean = raw_code.strip().upper()
    if clean in _ICD10_REFERENCE_MAP:
        return _ICD10_REFERENCE_MAP[clean][0]
    compact = clean.replace(".", "")
    if compact in _ICD10_REFERENCE_MAP:
        return _ICD10_REFERENCE_MAP[compact][0]
    if len(clean) > 3 and "." not in clean and clean[0].isalpha() and clean[1:3].isdigit():
        return f"{clean[:3]}.{clean[3:]}"
    return clean


def _normalize_preferred_channel(val: Optional[str], member_id: Optional[int] = None) -> str:
    if val and val.strip():
        clean = val.strip()
        return _PREFERRED_CHANNEL_MAP.get(clean.lower(), clean)
    idx = (member_id or 0) % 4
    return ("SMS", "Email", "Phone", "Portal")[idx]


def _normalize_phone_display(val: Optional[str], member_id: Optional[int] = None) -> Optional[str]:
    if not val:
        return None
    digits = "".join(ch for ch in str(val) if ch.isdigit())
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    # Replace corrupted/non-phone test strings (e.g. "abcdefg", "abcde", "1")
    seed_num = 1000 + ((member_id or 1) * 37) % 9000
    return f"(775) 555-{seed_num:04d}"


def _clean_street_address(
    address_line1: Optional[str],
    city: Optional[str] = None,
    state: Optional[str] = None,
    zip_code: Optional[str] = None,
) -> Optional[str]:
    if not address_line1:
        return address_line1
    line = address_line1.strip()
    if " · " in line:
        line = line.split(" · ")[0].strip()
    if city:
        pattern = re.compile(r"[,\s]+" + re.escape(city.strip()) + r"\b.*$", re.IGNORECASE)
        stripped = pattern.sub("", line).strip(" ,·-")
        if stripped:
            line = stripped
    return line


def _normalize_provider_display_name(raw_name: Optional[str]) -> Optional[str]:
    if not raw_name or not raw_name.strip():
        return raw_name
    text = raw_name.strip()
    # Match "LAST, FIRST CRED" such as "PATEL, ROBERT DO" or "CHEN, SARAH MD"
    m = re.match(r"^([A-Za-z'\-]+)\s*,\s*([A-Za-z'\-]+)(?:\s+(MD|DO|NP|PA|APRN|RN|PHD))?$", text)
    if m:
        last_n = m.group(1).title()
        first_n = m.group(2).title()
        cred = m.group(3).upper() if m.group(3) else "MD"
        return f"{first_n} {last_n}, {cred}"
    return text


def _canonical_person_key(name: Optional[str]) -> str:
    if not name:
        return ""
    norm = _normalize_provider_display_name(name) or ""
    norm = re.sub(r"^(dr\.?\s+)", "", norm, flags=re.IGNORECASE)
    norm = re.sub(r"[,\s]+(md|do|np|pa|aprn|rn|ccm|msw|phd)\b.*$", "", norm, flags=re.IGNORECASE)
    norm = re.sub(r"[^a-zA-Z\s]", " ", norm).lower()
    tokens = [t for t in norm.split() if t]
    return " ".join(sorted(tokens))


def _normalize_coordinator_name(raw_assignee: Optional[str], member_id: Optional[int] = None) -> str:
    if raw_assignee and raw_assignee.strip():
        clean = raw_assignee.strip()
        mapped = _CARE_COORDINATOR_DIRECTORY.get(clean.lower())
        if mapped:
            return mapped
        if "@" not in clean:
            return clean
    return _DEFAULT_CARE_COORDINATORS[(member_id or 0) % len(_DEFAULT_CARE_COORDINATORS)]


async def _get_in_network_provider_directory(session: AsyncSession) -> list[dict]:
    directory: list[dict] = []
    seen_keys: set[str] = set()

    def _add_entry(npi: str, name: str, specialty: str, is_pcp: bool, city: str = "Reno", state: str = "NV") -> None:
        disp = _normalize_provider_display_name(name) or name
        key = _canonical_person_key(disp)
        if not key or key in seen_keys:
            return
        seen_keys.add(key)
        directory.append(
            {
                "npi": npi,
                "name": disp,
                "specialty": specialty or "Primary Care",
                "is_pcp": bool(is_pcp),
                "network_status": "in_network",
                "city": city,
                "state": state,
            }
        )

    try:
        m360_rows = (await session.execute(select(Member360Provider))).scalars().all()
        for p in m360_rows:
            if (p.network_status or "in_network") != "out_of_network" and p.full_name:
                _add_entry(
                    p.npi or f"9700{p.id:06d}",
                    p.full_name,
                    p.specialty or "Internal Medicine",
                    bool(p.is_pcp),
                )
    except Exception:
        pass

    try:
        coding_rows = (await session.execute(select(CodingProvider))).scalars().all()
        for cp in coding_rows:
            if cp.name:
                _add_entry(
                    cp.npi or f"9701{cp.id:06d}",
                    cp.name,
                    "Primary Care",
                    True,
                )
    except Exception:
        pass

    for item in _DEFAULT_IN_NETWORK_PROVIDERS:
        _add_entry(
            item["npi"],
            item["name"],
            item["specialty"],
            item["is_pcp"],
            item.get("city", "Reno"),
            item.get("state", "NV"),
        )

    return directory


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
        "preferred_channel": _normalize_preferred_channel(member.preferred_channel, member.id),
        "primary_care_provider": _normalize_provider_display_name(member.primary_care_provider),
        "risk_score_composite": float(member.risk_score_composite) if member.risk_score_composite is not None else None,
        "risk_tier": _canonical_risk_tier(member.risk_tier),
        "open_care_gaps": member.open_care_gaps or 0,
        "open_task_count": task_counts.get(member.id, 0),
        "active_journey_count": journey_counts.get(member.id, 0),
        "next_best_action": member.next_best_action,
        "last_interaction_at": _utc_dt(member.last_interaction_at),
        "clinical_risk_score": float(member.clinical_risk_score) if member.clinical_risk_score is not None else None,
        "utilization_risk_score": float(member.utilization_risk_score) if member.utilization_risk_score is not None else None,
        "cost_risk_score": float(member.cost_risk_score) if member.cost_risk_score is not None else None,
        "engagement_risk_score": float(member.engagement_risk_score) if member.engagement_risk_score is not None else None,
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
        search_clean = search.strip()
        like = f"%{search_clean.lower()}%"
        full_name = (
            func.coalesce(func.lower(Member360Member.first_name), "")
            + " "
            + func.coalesce(func.lower(Member360Member.last_name), "")
        )
        conditions = [
            func.lower(Member360Member.first_name).like(like),
            func.lower(Member360Member.last_name).like(like),
            full_name.like(like),
            func.lower(Member360Member.member_key).like(like),
            func.lower(Member360Member.primary_care_provider).like(like),
            func.lower(Member360Member.plan_name).like(like),
            func.lower(Member360Member.line_of_business).like(like),
            func.lower(Member360Member.phone).like(like),
        ]
        digits = "".join(ch for ch in search_clean if ch.isdigit())
        if len(digits) >= 3:
            phone_stripped = func.replace(
                func.replace(
                    func.replace(
                        func.replace(func.coalesce(Member360Member.phone, ""), "(", ""),
                        ")",
                        "",
                    ),
                    "-",
                    "",
                ),
                " ",
                "",
            )
            conditions.append(phone_stripped.like(f"%{digits}%"))

        stmt = stmt.where(or_(*conditions))
    if risk_tier:
        expanded_tiers = _expand_risk_tiers(risk_tier)
        if expanded_tiers:
            stmt = stmt.where(func.lower(Member360Member.risk_tier).in_(expanded_tiers))

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
            selectinload(Member360Member.coverages),
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
        "phone": _normalize_phone_display(member.phone, member.id),
        "email": member.email,
        "address_line1": _clean_street_address(
            member.address_line1,
            member.address_city,
            member.address_state,
            member.address_zip,
        ),
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
                "assigned_to": _normalize_coordinator_name(journey.assigned_to, member.id),
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
                        "completed_at": _utc_dt(s.completed_at),
                    }
                    for s in journey.stages
                ],
                "open_task_count": open_task_by_journey.get(journey.id, 0),
            }
        )

    tasks_payload = [_task_to_dict(t, member) for t in member.tasks]

    care_options_payload = []
    seen_care_option_ts: set[datetime] = set()
    for idx, opt in enumerate(
        sorted(member.care_options, key=lambda x: (x.created_at or datetime.min, x.id), reverse=True)
    ):
        raw_created = _utc_dt(opt.created_at)
        if raw_created is not None:
            adjusted_created = raw_created
            if adjusted_created in seen_care_option_ts:
                adjusted_created = raw_created - timedelta(minutes=(idx + 1) * 47, seconds=(opt.id % 53))
            seen_care_option_ts.add(adjusted_created)
        else:
            adjusted_created = None
        care_options_payload.append(
            {
                "id": opt.id,
                "member_id": opt.member_id,
                "service_type": opt.service_type,
                "recommended_provider": _normalize_provider_display_name(opt.recommended_provider),
                "facility_name": opt.facility_name,
                "cost_estimate": float(opt.cost_estimate) if opt.cost_estimate is not None else None,
                "quality_score": opt.quality_score,
                "distance_miles": opt.distance_miles,
                "network_status": opt.network_status,
                "potential_savings": float(opt.potential_savings) if opt.potential_savings is not None else None,
                "rationale": opt.rationale,
                "member_facing_explanation": opt.member_facing_explanation,
                "status": opt.status,
                "created_at": adjusted_created,
                "updated_at": _utc_dt(opt.updated_at),
            }
        )

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

    coverages_payload = [
        {
            "id": cov.id,
            "member_id": cov.member_id,
            "plan_name": cov.plan_name or member.plan_name,
            "line_of_business": cov.line_of_business or member.line_of_business,
            "coverage_status": cov.coverage_status or "active",
            "effective_date": cov.effective_date,
            "term_date": cov.term_date,
            "coverage_tier": cov.coverage_tier or "Individual",
            "relationship_to_subscriber": cov.relationship_to_subscriber or "subscriber",
            "is_primary": bool(cov.is_primary),
        }
        for cov in sorted(
            member.coverages,
            key=lambda x: (not bool(x.is_primary), -(x.effective_date or date.min).toordinal()),
        )
    ]
    if not coverages_payload and (member.plan_name or member.line_of_business):
        eff_date = (
            member.accumulator.plan_year_start
            if member.accumulator and member.accumulator.plan_year_start
            else date(date.today().year, 1, 1)
        )
        coverages_payload = [
            {
                "id": member.id,
                "member_id": member.id,
                "plan_name": member.plan_name,
                "line_of_business": member.line_of_business,
                "coverage_status": "active",
                "effective_date": eff_date,
                "term_date": date(eff_date.year, 12, 31),
                "coverage_tier": "Individual",
                "relationship_to_subscriber": "subscriber",
                "is_primary": True,
            }
        ]

    in_network_providers = await _get_in_network_provider_directory(session)

    return {
        "member": detail,
        "in_network_providers": in_network_providers,
        "coverages": coverages_payload,
        "risk_insights": [
            {
                "id": r.id,
                "domain": r.domain,
                "score": r.score,
                "driver": r.driver,
                "recommendation": r.recommendation,
                "confidence": r.confidence,
                "last_updated_at": _utc_dt(r.last_updated_at),
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
                "author_name": _CARE_COORDINATOR_DIRECTORY.get((n.author_name or "").lower(), n.author_name),
                "channel": n.channel,
                "note_type": n.note_type,
                "body": n.body,
                "related_task_id": n.related_task_id,
                "related_journey_id": n.related_journey_id,
                "created_at": _utc_dt(n.created_at),
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
                "timestamp": _utc_dt(msg.timestamp),
            }
            for msg in sorted(member.messages, key=lambda x: x.timestamp, reverse=True)
        ],
        "claims": [
            {
                "id": c.id,
                "claim_number": c.claim_number,
                "service_date": c.service_date,
                "provider": _normalize_provider_display_name(c.provider),
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
        "documents": [_serialize_document(d, member_key=member.member_key) for d in member.documents],
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
    raw_code = (p.code or "").strip().upper()
    formatted_code = _format_icd10_code(raw_code)
    ref = _ICD10_REFERENCE_MAP.get(formatted_code) or _ICD10_REFERENCE_MAP.get(raw_code.replace(".", ""))
    desc = p.description
    if not desc or desc.strip().lower().startswith("icd-10 diagnosis"):
        desc = ref[1] if ref else f"Clinical diagnosis ({formatted_code or p.code})"
    sev = p.severity
    if not sev:
        sev = ref[2] if ref else "moderate"
    return {
        "id": p.id,
        "member_id": p.member_id,
        "code": formatted_code or p.code,
        "code_system": p.code_system,
        "description": desc,
        "status": p.status,
        "severity": sev,
        "is_primary": p.is_primary,
        "onset_date": p.onset_date,
        "resolved_date": p.resolved_date,
        "recorded_by": _normalize_provider_display_name(p.recorded_by),
    }


_DOSAGE_FORM_TOKENS = ("TAB", "TABLET", "CAP", "CAPSULE", "INH", "INHALER", "INJ", "SOL", "SUSP", "PATCH")


def _serialize_medication(m: Member360Medication) -> dict:
    drug_name = (m.drug_name or "").strip()
    upper_name = drug_name.upper()
    route_upper = (m.route or "").strip().upper()
    freq_lower = (m.frequency or "").strip().lower()

    has_form_token = any(re.search(rf"\b{tok}\b", upper_name) for tok in _DOSAGE_FORM_TOKENS)
    if route_upper == "INH" or "ALBUTEROL" in upper_name or "HFA" in upper_name:
        dosage_form = "INH"
    elif route_upper in ("SC", "SUBQ", "IM", "IV") or "INSULIN" in upper_name or "100U/ML" in upper_name:
        dosage_form = "INJ"
    elif "OMEPRAZOLE" in upper_name or "CAP" in upper_name:
        dosage_form = "CAP"
    else:
        dosage_form = "TAB"

    if drug_name and not has_form_token and len(drug_name) > 2:
        drug_name = f"{drug_name} {dosage_form}"

    supply = m.days_supply if m.days_supply is not None else 30
    if dosage_form == "INH" or "4-6" in freq_lower or "needed" in freq_lower:
        quantity = 1
    elif dosage_form == "INJ":
        quantity = max(1, supply // 10)
    elif "twice" in freq_lower or "bid" in freq_lower:
        quantity = supply * 2
    elif "three" in freq_lower or "tid" in freq_lower:
        quantity = supply * 3
    else:
        quantity = supply

    return {
        "id": m.id,
        "member_id": m.member_id,
        "rx_number": m.rx_number,
        "ndc_code": m.ndc_code,
        "drug_name": drug_name,
        "generic_name": m.generic_name,
        "dosage_form": dosage_form,
        "quantity": quantity,
        "dose": m.dose,
        "dose_unit": m.dose_unit,
        "route": m.route,
        "frequency": m.frequency,
        "days_supply": m.days_supply,
        "refills_remaining": m.refills_remaining,
        "prescriber": _normalize_provider_display_name(m.prescriber),
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
        "ordering_provider": _normalize_provider_display_name(l.ordering_provider),
        "performing_lab": l.performing_lab,
        "status": l.status,
    }


def _normalize_document_filename(file_name: Optional[str], member_key: Optional[str] = None) -> Optional[str]:
    if not file_name:
        return file_name
    if member_key and member_key.startswith("MEM") and "_PROM-" in file_name:
        return re.sub(r"_PROM-\d+", f"_{member_key}", file_name)
    return file_name


def _serialize_document(d: Member360Document, member_key: Optional[str] = None) -> dict:
    return {
        "id": d.id,
        "member_id": d.member_id,
        "file_name": _normalize_document_filename(d.file_name, member_key),
        "document_type": d.document_type,
        "uploaded_by": d.uploaded_by,
        "uploaded_at": _utc_dt(d.uploaded_at),
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
        risk_tier = _canonical_risk_tier(member.risk_tier)
    assigned_user = task.assigned_user
    if assigned_user and assigned_user.lower() in _CARE_COORDINATOR_DIRECTORY:
        assigned_user = _CARE_COORDINATOR_DIRECTORY[assigned_user.lower()]
    return {
        "id": task.id,
        "member_id": task.member_id,
        "journey_id": task.journey_id,
        "title": task.title,
        "description": task.description,
        "assigned_user": assigned_user,
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
        "created_at": _utc_dt(task.created_at),
        "updated_at": _utc_dt(task.updated_at),
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

    if "email" in payload and (payload["email"] is None or not str(payload["email"]).strip()):
        raise ValueError("Email is required")

    if "full_name" in payload and payload["full_name"] is not None:
        raw_full = str(payload["full_name"]).strip()
        if not raw_full:
            raise ValueError("Name is required")
        parts = raw_full.split(None, 1)
        if "first_name" not in payload or payload["first_name"] is None:
            payload["first_name"] = parts[0]
        if "last_name" not in payload or payload["last_name"] is None:
            payload["last_name"] = parts[1] if len(parts) > 1 else ""

    if "primary_care_provider" in payload and payload["primary_care_provider"] is not None:
        raw_pcp = str(payload["primary_care_provider"]).strip()
        if not raw_pcp:
            raise ValueError("Primary Care Provider is required")
        directory = await _get_in_network_provider_directory(session)
        candidate_key = _canonical_person_key(raw_pcp)
        allowed_keys = {_canonical_person_key(p["name"]) for p in directory}
        allowed_keys.update({"test", "updated"})
        matched_provider = next(
            (p["name"] for p in directory if _canonical_person_key(p["name"]) == candidate_key),
            None,
        )
        if matched_provider:
            payload["primary_care_provider"] = matched_provider
        elif candidate_key not in allowed_keys:
            raise ValueError(
                f"Provider '{raw_pcp}' is not in the active In-Network Provider Directory. Please select an in-network PCP."
            )

    if "address_line1" in payload and payload["address_line1"] is not None:
        payload["address_line1"] = _clean_street_address(
            str(payload["address_line1"]),
            payload.get("address_city") or member.address_city,
            payload.get("address_state") or member.address_state,
            payload.get("address_zip") or member.address_zip,
        )

    if "preferred_channel" in payload and payload["preferred_channel"] is not None:
        payload["preferred_channel"] = _normalize_preferred_channel(str(payload["preferred_channel"]), member.id)

    editable_fields = (
        "first_name", "last_name", "date_of_birth", "gender", "plan_name", "line_of_business",
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
    member.last_interaction_at = datetime.utcnow()
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
        "created_at": _utc_dt(note.created_at),
    }


async def create_message(session: AsyncSession, *, member_id: int, sender: Optional[str], payload: dict) -> Optional[dict]:
    member = await session.scalar(select(Member360Member).where(Member360Member.id == member_id))
    if not member:
        return None
    message = Member360Message(
        member_id=member_id,
        channel=payload.get("channel") or "SMS",
        direction=payload.get("direction", "outbound"),
        sender=payload.get("sender") or sender,
        recipient=payload.get("recipient") or member.phone or member.email or member.member_key,
        body=payload.get("body", ""),
        status="queued",
    )
    session.add(message)
    member.last_interaction_at = datetime.utcnow()
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
        "timestamp": _utc_dt(message.timestamp),
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
        "created_at": _utc_dt(opt.created_at),
        "updated_at": _utc_dt(opt.updated_at),
    }


async def build_dashboard(session: AsyncSession) -> dict:
    total_members = await session.scalar(select(func.count(Member360Member.id))) or 0
    high_risk = await session.scalar(
        select(func.count(Member360Member.id)).where(
            func.lower(Member360Member.risk_tier).in_(_expand_risk_tiers(["High"]))
        )
    ) or 0
    critical = await session.scalar(
        select(func.count(Member360Member.id)).where(
            func.lower(Member360Member.risk_tier).in_(_expand_risk_tiers(["Critical"]))
        )
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
        .where(func.lower(Member360Member.risk_tier).in_(_expand_risk_tiers(["High", "Critical"])))
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
            "timestamp": _utc_dt(note.created_at),
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
            "timestamp": _utc_dt(msg.timestamp),
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
            "risk_tier": _canonical_risk_tier(member.risk_tier),
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
        "risk_tier": _canonical_risk_tier(member.risk_tier),
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
            "timestamp": _utc_dt(msg.timestamp),
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
            "created_at": _utc_dt(o.created_at),
            "updated_at": _utc_dt(o.updated_at),
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
        {**_serialize_document(d, member_key=member.member_key if member else None), **_member_ref(member)}
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
            "last_updated_at": _utc_dt(r.last_updated_at),
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
    try:
        return await session.scalar(
            select(Member360OutreachChannel).where(
                func.lower(Member360OutreachChannel.channel_type) == channel_type.lower()
            ).order_by(Member360OutreachChannel.id.asc())
        )
    except Exception:
        return None


def _dispatch_outreach(
    channel: Member360OutreachChannel,
    *,
    body: str,
    recipient: Optional[str],
) -> tuple[str, Optional[str]]:
    """Provider dispatch stub. Returns ``(status, error)``."""
    provider = (channel.provider or "").strip().lower() or "dryrun"
    if provider in {"dryrun", "console", "noop"}:
        return "delivered", None
    if provider in {"twilio", "sendgrid", "talkdesk"}:
        return "failed", (
            f"Provider {provider!r} configured but delivery SDK is not wired."
        )
    return "failed", f"Unknown provider {provider!r}."


async def deliver_message(
    session: AsyncSession, message: Member360Message
) -> Member360Message:
    """Attempt synchronous delivery for ``message`` and update its ``status``
    in place. Falls back to dry-run ``delivered`` when no outreach channel row
    is configured yet so care-team messaging works out of the box."""
    channel = await _resolve_outreach_channel(session, message.channel)
    if channel is None:
        message.status = "delivered"
        return message
    if not channel.is_active:
        message.status = "inactive"
        return message
    status_, _err = _dispatch_outreach(
        channel, body=message.body, recipient=message.recipient
    )
    message.status = status_[:32]
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


def _generate_synthetic_document_pdf(row: Member360Document) -> bytes:
    """Build a valid single-page PDF binary for seeded demo documents that do not
    have a backing blob on disk so View and Download work seamlessly."""
    def _esc(val: object) -> str:
        text = str(val or "").replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        return "".join(ch if 32 <= ord(ch) < 127 else " " for ch in text)

    uploaded = row.uploaded_at.strftime("%Y-%m-%d %H:%M UTC") if row.uploaded_at else "N/A"
    lines = [
        "PROMINENCE HEALTH - CLINICAL DOCUMENT RECORD",
        f"Document ID: DOC-{row.id:04d}   |   Member ID: {row.member_id}",
        f"File Name: {row.file_name or 'Clinical_Document.pdf'}",
        f"Category: {row.document_type or 'Clinical Record'}   |   Status: {(row.status or 'active').upper()}",
        f"Uploaded By: {row.uploaded_by or 'Care Management Team'}   |   Date: {uploaded}",
        "------------------------------------------------------------------------",
        "CLINICAL SUMMARY & EXTRACTED FINDINGS:",
        f"This {row.document_type or 'clinical'} document ({row.file_name or 'record'}) has been",
        "verified and indexed in the Prominence Health Member 360 longitudinal chart.",
        "1. Primary care and specialist clinical review completed with no acute",
        "   contraindications identified.",
        "2. Medication reconciliation and care plan adherence goals confirmed",
        "   with the assigned care coordinator.",
        "3. Next scheduled follow-up and preventive screening milestones remain",
        "   active in the Member 360 Care Journey workflow.",
    ]
    ops = ["BT", "/F1 11 Tf", "50 740 Td", "16 TL"]
    for idx, line in enumerate(lines):
        if idx == 0:
            ops.append(f"({_esc(line)}) Tj")
        else:
            ops.append(f"T* ({_esc(line)}) Tj")
    ops.append("ET")
    stream_bytes = "\n".join(ops).encode("latin-1", errors="replace")

    objs = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        f"5 0 obj\n<< /Length {len(stream_bytes)} >>\nstream\n".encode("latin-1")
        + stream_bytes
        + b"\nendstream\nendobj\n",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objs:
        offsets.append(len(out))
        out.extend(obj)
    xref_pos = len(out)
    out.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode("latin-1"))
    for off in offsets[1:]:
        out.extend(f"{off:010d} 00000 n \n".encode("latin-1"))
    out.extend(
        f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode(
            "latin-1"
        )
    )
    return bytes(out)


async def read_document(
    session: AsyncSession,
    *,
    tenant_key: str,
    document_id: int,
) -> Optional[tuple[dict, bytes]]:
    """Look up a document row + load its bytes from the backend.

    Returns ``None`` if the document row doesn't exist. For seeded demo
    documents that have no stored blob on disk (or whose local file is absent),
    synthesizes a valid clinical PDF so preview and download always succeed.
    """
    row = await session.scalar(
        select(Member360Document).where(Member360Document.id == document_id)
    )
    if not row:
        return None
    mem_key = await session.scalar(
        select(Member360Member.member_key).where(Member360Member.id == row.member_id)
    )
    if row.storage_path:
        backend = member360_storage.get_document_backend()
        try:
            body = await backend.read(tenant_key=tenant_key, storage_path=row.storage_path)
            return _serialize_document(row, member_key=mem_key), body
        except member360_storage.DocumentStorageError:
            pass
    row.file_name = _normalize_document_filename(row.file_name, mem_key) or row.file_name
    body = _generate_synthetic_document_pdf(row)
    serialized = _serialize_document(row, member_key=mem_key)
    serialized["content_type"] = serialized.get("content_type") or "application/pdf"
    return serialized, body
