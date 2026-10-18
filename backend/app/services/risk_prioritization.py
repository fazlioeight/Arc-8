from __future__ import annotations

from datetime import date, datetime
from typing import Iterable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.coding import (
    CodingClaim,
    CodingHealthAssessment,
    CodingMao004Record,
    CodingMember,
    CodingMemberChase,
    CodingMemberPriority,
)

_HCC_WEIGHT_DEFAULT = 5.0
_HCC_WEIGHTS: dict[str, float] = {
    "HCC1": 25.0,
    "HCC2": 22.0,
    "HCC8": 18.0,
    "HCC12": 15.0,
    "HCC18": 12.0,
    "HCC19": 10.0,
    "HCC54": 8.0,
}

_PRIORITY_TIERS = [
    (75, "critical"),
    (50, "high"),
    (30, "medium"),
    (0, "standard"),
]


def _hcc_weight(code: Optional[str]) -> float:
    if not code:
        return 0.0
    normalized = code.upper().strip()
    return _HCC_WEIGHTS.get(normalized, _HCC_WEIGHT_DEFAULT)


async def calculate_priority_score(
    session: AsyncSession,
    member: CodingMember,
    submission_year: int,
    as_of: Optional[date] = None,
) -> tuple[float, str, int, Optional[str], Optional[date], str]:
    """Derive risk score, tier, and next action guidance for a member."""

    as_of_dt = datetime.combine(as_of, datetime.min.time()) if isinstance(as_of, date) else datetime.utcnow()
    chase_stmt = select(CodingMemberChase).where(CodingMemberChase.member_id == member.id)
    chases = (await session.scalars(chase_stmt)).all()
    open_chases = [chase for chase in chases if (chase.status or "").lower() != "closed"]
    open_score = len(open_chases) * 3

    mao_stmt = select(CodingMao004Record).where(
        CodingMao004Record.member_id == member.id,
        CodingMao004Record.submission_year == submission_year,
    )
    mao_records = (await session.scalars(mao_stmt)).all()
    mao_score = sum(_hcc_weight(record.hcc_code) for record in mao_records)

    claim_stmt = select(CodingClaim).where(CodingClaim.member_id == member.id)
    claims = (await session.scalars(claim_stmt)).all()
    claim_hccs: set[str] = set()
    for claim in claims:
        claim_hccs.update((claim.hcc_codes or {}).keys())
    claim_score = sum(_hcc_weight(code) for code in claim_hccs)

    assessment_stmt = select(CodingHealthAssessment).where(CodingHealthAssessment.member_id == member.id)
    recent_assessment = await session.scalar(assessment_stmt.order_by(CodingHealthAssessment.assessment_date.desc()).limit(1))

    assessment_score = 10.0 if not recent_assessment else 0.0
    if recent_assessment and (as_of_dt.date() - recent_assessment.assessment_date).days > 365:
        assessment_score += 5.0

    base_risk = float(member.risk_score or 0)
    total_score = base_risk + mao_score + claim_score + open_score + assessment_score
    tier = next(label for threshold, label in _PRIORITY_TIERS if total_score >= threshold)

    next_action = None
    next_action_due = None
    justification = ""

    if not recent_assessment:
        next_action = "schedule_assessment"
        next_action_due = as_of_dt.date()
        justification = "No health assessment on record"
    elif assessment_score > 0:
        next_action = "refresh_assessment"
        next_action_due = recent_assessment.assessment_date.replace(year=recent_assessment.assessment_date.year + 1)
        justification = "Health assessment older than 12 months"
    elif open_chases:
        next_action = "complete_open_chases"
        next_action_due = min(
            (chase.due_date for chase in open_chases if chase.due_date),
            default=None,
        )
        justification = f"{len(open_chases)} chase(s) pending review"
    elif mao_records:
        next_action = "submit_mao"
        justification = "MAO-004 ready for submission"

    return total_score, tier, len(open_chases), next_action, next_action_due, justification


async def refresh_member_priority(
    session: AsyncSession,
    member: CodingMember,
    submission_year: int,
    as_of: Optional[date] = None,
) -> CodingMemberPriority:
    score, tier, hcc_count, next_action, due, justification = await calculate_priority_score(
        session,
        member,
        submission_year=submission_year,
        as_of=as_of,
    )
    stmt = select(CodingMemberPriority).where(CodingMemberPriority.member_id == member.id)
    priority = await session.scalar(stmt)
    if priority is None:
        priority = CodingMemberPriority(member_id=member.id, priority_score=score, priority_tier=tier)
        priority.member = member
        session.add(priority)
    priority.priority_score = score
    priority.priority_tier = tier
    priority.hcc_opportunity_count = hcc_count
    priority.next_action = next_action
    priority.next_action_due = due
    priority.justification = justification
    priority.computed_at = datetime.utcnow()
    return priority


async def refresh_priorities(
    session: AsyncSession,
    members: Iterable[CodingMember],
    submission_year: int,
    as_of: Optional[date] = None,
) -> list[CodingMemberPriority]:
    priorities: list[CodingMemberPriority] = []
    for member in members:
        priorities.append(
            await refresh_member_priority(session=session, member=member, submission_year=submission_year, as_of=as_of)
        )
    return priorities
