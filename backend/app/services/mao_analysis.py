from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.coding import (
    CodingClaim,
    CodingHealthAssessment,
    CodingMao004Record,
    CodingMember,
    CodingMemberEligibility,
)


async def get_member_gap_analysis(
    session: AsyncSession,
    member_id: int,
    submission_year: int,
) -> dict:
    member = await session.get(CodingMember, member_id)
    if not member:
        raise ValueError("Member not found")

    eligibility = await session.scalar(
        select(CodingMemberEligibility).where(CodingMemberEligibility.member_id == member.id)
    )

    mao_records = (await session.scalars(
        select(CodingMao004Record).where(
            CodingMao004Record.member_id == member.id,
            CodingMao004Record.submission_year == submission_year,
        )
    )).all()

    claim_records = (await session.scalars(select(CodingClaim).where(CodingClaim.member_id == member.id))).all()
    assessment_records = (await session.scalars(select(CodingHealthAssessment).where(CodingHealthAssessment.member_id == member.id))).all()

    claims_hcc = set()
    claims_icd = set()
    for claim in claim_records:
        claims_hcc.update((claim.hcc_codes or {}).keys())
        for code in (claim.diagnosis_codes or {}).keys():
            claims_icd.add(code)

    assessments_icd = set()
    for assessment in assessment_records:
        assessments_icd.update(assessment.icd10_codes or [])

    mao_hcc = {record.hcc_code: record for record in mao_records}

    missing_hcc = []
    for hcc_code in claims_hcc:
        if hcc_code not in mao_hcc:
            missing_hcc.append(
                {
                    "hcc_code": hcc_code,
                    "icd10_candidates": list(claims_icd | assessments_icd),
                    "reason": "Present in claims but not yet in MAO-004",
                }
            )

    stale_records = []
    if eligibility and eligibility.joined_at:
        cutoff = date(eligibility.joined_at.year - 2, eligibility.joined_at.month, 1)
    else:
        cutoff = date(submission_year - 2, 1, 1)

    for record in mao_records:
        if record.service_start and record.service_start < cutoff:
            stale_records.append(
                {
                    "hcc_code": record.hcc_code,
                    "service_start": record.service_start,
                    "service_end": record.service_end,
                    "reason": "Outside two-year lookback window",
                }
            )

    immediate_actions = []
    if eligibility and eligibility.is_new_to_medicare:
        immediate_actions.append("health_assessment_required")

    return {
        "member": {
            "id": member.id,
            "member_key": member.member_key,
            "risk_score": member.risk_score,
            "eligibility": {
                "plan_start": eligibility.plan_start if eligibility else None,
                "medicare_effective_date": eligibility.medicare_effective_date if eligibility else None,
                "is_new_to_medicare": eligibility.is_new_to_medicare if eligibility else False,
            },
        },
        "mao_records": [
            {
                "hcc_code": record.hcc_code,
                "icd10_code": record.icd10_code,
                "service_start": record.service_start,
                "service_end": record.service_end,
                "status": record.status,
            }
            for record in mao_records
        ],
        "missing_hcc": missing_hcc,
        "stale_records": stale_records,
        "immediate_actions": immediate_actions,
    }
