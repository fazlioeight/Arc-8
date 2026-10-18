from __future__ import annotations

import csv
import io
from datetime import date
from typing import Iterable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.coding import (
    CodingClaim,
    CodingHealthAssessment,
    CodingMao004Record,
    CodingMember,
    CodingSubmissionBatch,
)

_SUBMISSION_HEADER = [
    "MemberID",
    "MemberKey",
    "SubmissionYear",
    "HCCCode",
    "ICD10",
    "ServiceFrom",
    "ServiceTo",
    "Source",
]


async def build_submission_rows(
    session: AsyncSession,
    submission_year: int,
    members: Iterable[CodingMember],
) -> list[list[str]]:
    rows: list[list[str]] = []
    for member in members:
        mao_records = (await session.scalars(
            select(CodingMao004Record).where(
                CodingMao004Record.member_id == member.id,
                CodingMao004Record.submission_year == submission_year,
            )
        )).all()
        if not mao_records:
            # fall back to claims that map to HCCs
            claim_records = (await session.scalars(select(CodingClaim).where(CodingClaim.member_id == member.id))).all()
            for claim in claim_records:
                for hcc_code, icd_details in (claim.hcc_codes or {}).items():
                    icd_code = icd_details if isinstance(icd_details, str) else icd_details.get("icd10") if isinstance(icd_details, dict) else None
                    rows.append(
                        [
                            str(member.id),
                            member.member_key,
                            str(submission_year),
                            hcc_code,
                            icd_code or "",
                            claim.service_date.isoformat() if claim.service_date else "",
                            claim.service_date.isoformat() if claim.service_date else "",
                            "claim",
                        ]
                    )
        else:
            for record in mao_records:
                rows.append(
                    [
                        str(member.id),
                        member.member_key,
                        str(submission_year),
                        record.hcc_code,
                        record.icd10_code or "",
                        record.service_start.isoformat() if record.service_start else "",
                        record.service_end.isoformat() if record.service_end else "",
                        "mao004",
                    ]
                )

        assessments = (await session.scalars(select(CodingHealthAssessment).where(CodingHealthAssessment.member_id == member.id))).all()
        for assessment in assessments:
            for idx, icd_code in enumerate(assessment.icd10_codes or []):
                hcc_code = (assessment.hcc_codes or [None])[idx] if isinstance(assessment.hcc_codes, list) else None
                rows.append(
                    [
                        str(member.id),
                        member.member_key,
                        str(submission_year),
                        hcc_code or "",
                        icd_code,
                        assessment.assessment_date.isoformat(),
                        assessment.assessment_date.isoformat(),
                        "assessment",
                    ]
                )
    return rows


async def generate_submission_file(
    session: AsyncSession,
    submission_year: int,
    creator_email: str,
    member_ids: Optional[list[int]] = None,
) -> dict:
    member_stmt = select(CodingMember)
    if member_ids:
        member_stmt = member_stmt.where(CodingMember.id.in_(member_ids))
    members = (await session.scalars(member_stmt)).all()
    rows = await build_submission_rows(session, submission_year=submission_year, members=members)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(_SUBMISSION_HEADER)
    writer.writerows(rows)

    batch = CodingSubmissionBatch(
        submission_year=submission_year,
        created_by=creator_email,
        status="generated",
        record_count=len(rows),
    )
    session.add(batch)
    await session.flush()

    return {
        "batch_id": batch.id,
        "submission_year": submission_year,
        "record_count": len(rows),
        "csv": buffer.getvalue(),
    }
