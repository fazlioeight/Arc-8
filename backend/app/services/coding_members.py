from __future__ import annotations

from datetime import date, datetime
from typing import Iterable, Optional, Sequence, Tuple

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .coding_status import TERMINAL_CHASE_STATUSES
from .risk_prioritization import refresh_member_priority, refresh_priorities

from ..models.tables import User

from ..models.coding import (
    CodingClaim,
    CodingHealthAssessment,
    CodingMao004Record,
    CodingMember,
    CodingMemberAttachment,
    CodingMemberChase,
    CodingMemberNote,
    CodingMemberEligibility,
    CodingMemberPriority,
    CodingProvider,
    CodingProviderLocation,
    CodingSubmissionBatch,
)

DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100


async def list_members(
    session: AsyncSession,
    *,
    search: Optional[str] = None,
    statuses: Optional[Sequence[str]] = None,
    lobs: Optional[Sequence[str]] = None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> Tuple[list[CodingMember], int]:
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
    filters = []

    if statuses:
        filters.append(CodingMember.status.in_(statuses))
    if lobs:
        filters.append(CodingMember.line_of_business.in_(lobs))
    if search:
        like = f"%{search.strip().lower()}%"
        full_name = (
            func.coalesce(func.lower(CodingMember.first_name), "")
            + " "
            + func.coalesce(func.lower(CodingMember.last_name), "")
        )
        filters.append(
            or_(
                func.lower(CodingMember.first_name).like(like),
                func.lower(CodingMember.last_name).like(like),
                full_name.like(like),
                func.lower(CodingMember.member_key).like(like),
                func.lower(CodingMember.pcp_name).like(like),
                func.lower(CodingMember.line_of_business).like(like),
            )
        )

    where_clause = and_(*filters) if filters else None

    total_stmt = select(func.count()).select_from(CodingMember)
    if where_clause is not None:
        total_stmt = total_stmt.where(where_clause)
    total = await session.scalar(total_stmt)
    total = int(total or 0)

    stmt = select(CodingMember).order_by(CodingMember.last_name, CodingMember.first_name)
    if where_clause is not None:
        stmt = stmt.where(where_clause)
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    members = (await session.scalars(stmt)).all()
    return list(members), total


async def get_member(session: AsyncSession, member_id: int) -> CodingMember | None:
    stmt = select(CodingMember).where(CodingMember.id == member_id)
    return await session.scalar(stmt)


async def get_member_by_key(session: AsyncSession, member_key: str) -> CodingMember | None:
    stmt = select(CodingMember).where(CodingMember.member_key == member_key)
    return await session.scalar(stmt)


async def create_member(session: AsyncSession, payload: dict) -> CodingMember:
    member = CodingMember(**payload)
    session.add(member)
    await session.flush()
    return member


async def create_chase(
    session: AsyncSession,
    *,
    member: CodingMember,
    payload: dict,
) -> CodingMemberChase:
    chase = CodingMemberChase(member_id=member.id, **payload)
    session.add(chase)
    await session.flush()
    await session.refresh(chase)
    return chase


async def update_chase(
    session: AsyncSession,
    *,
    chase_id: int,
    payload: dict,
) -> CodingMemberChase | None:
    stmt = select(CodingMemberChase).where(CodingMemberChase.id == chase_id)
    chase = await session.scalar(stmt)
    if not chase:
        return None
    for key, value in payload.items():
        setattr(chase, key, value)
    await session.flush()
    await session.refresh(chase)
    return chase


async def list_chases_for_member(
    session: AsyncSession,
    member_id: int,
) -> list[CodingMemberChase]:
    stmt = (
        select(CodingMemberChase)
        .where(CodingMemberChase.member_id == member_id)
        .order_by(CodingMemberChase.created_at.desc())
    )
    return list((await session.scalars(stmt)).all())


async def list_chases_for_members(
    session: AsyncSession,
    member_ids: Sequence[int],
) -> list[CodingMemberChase]:
    if not member_ids:
        return []
    stmt = (
        select(CodingMemberChase)
        .where(CodingMemberChase.member_id.in_(member_ids))
        .order_by(CodingMemberChase.member_id, CodingMemberChase.created_at.desc())
    )
    return list((await session.scalars(stmt)).all())


async def create_note(
    session: AsyncSession,
    *,
    member: CodingMember,
    payload: dict,
) -> CodingMemberNote:
    note = CodingMemberNote(member_id=member.id, **payload)
    session.add(note)
    await session.flush()
    await session.refresh(note)
    return note


async def list_notes(session: AsyncSession, member_id: int) -> list[CodingMemberNote]:
    stmt = (
        select(CodingMemberNote)
        .where(CodingMemberNote.member_id == member_id)
        .order_by(CodingMemberNote.created_at.desc())
    )
    return list((await session.scalars(stmt)).all())


async def create_attachment(
    session: AsyncSession,
    *,
    member: CodingMember,
    payload: dict,
) -> CodingMemberAttachment:
    attachment = CodingMemberAttachment(member_id=member.id, **payload)
    session.add(attachment)
    await session.flush()
    await session.refresh(attachment)
    return attachment


async def list_attachments(session: AsyncSession, member_id: int) -> list[CodingMemberAttachment]:
    stmt = (
        select(CodingMemberAttachment)
        .where(CodingMemberAttachment.member_id == member_id)
        .order_by(CodingMemberAttachment.uploaded_at.desc())
    )
    return list((await session.scalars(stmt)).all())


async def list_providers(
    session: AsyncSession,
    *,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> Tuple[list[CodingProvider], int]:
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
    filters = []
    if search:
        like = f"%{search.lower()}%"
        filters.append(
            or_(
                func.lower(CodingProvider.name).like(like),
                func.lower(CodingProvider.npi).like(like),
                func.lower(CodingProvider.tax_id).like(like),
            )
        )

    where_clause = and_(*filters) if filters else None
    total_stmt = select(func.count()).select_from(CodingProvider)
    stmt = select(CodingProvider).order_by(CodingProvider.name)
    if where_clause is not None:
        total_stmt = total_stmt.where(where_clause)
        stmt = stmt.where(where_clause)

    total = int(await session.scalar(total_stmt) or 0)
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    providers = (await session.scalars(stmt)).all()
    return list(providers), total


async def get_provider(session: AsyncSession, provider_id: int) -> CodingProvider | None:
    stmt = select(CodingProvider).where(CodingProvider.id == provider_id)
    provider = await session.scalar(stmt)
    if provider:
        await session.refresh(provider, attribute_names=["location"])
    return provider


async def ensure_seed_data(session: AsyncSession) -> None:
    member_count = await session.scalar(select(func.count()).select_from(CodingMember))
    if member_count and member_count > 0:
        return

    seed_member = CodingMember(
        member_key="PH-0001",
        first_name="Jordan",
        last_name="Reeves",
        status="active",
        line_of_business="Commercial",
        risk_score=0.84,
        primary_language="English",
        pcp_name="Dr. Prominence",
        pcp_npi="1987654321",
        address_city="Chicago",
        address_state="IL",
    )
    session.add(seed_member)
    await session.flush()

    session.add_all(
        [
            CodingMemberChase(
                member_id=seed_member.id,
                chase_code="PH-CH-1001",
                status="open",
                priority="high",
                assigned_coder_email="coder@nexora.test",
                icd10_code="E11.9",
                hcc_code="HCC18",
            ),
            CodingMemberChase(
                member_id=seed_member.id,
                chase_code="PH-CH-1002",
                status="pending_review",
                priority="normal",
                assigned_coder_email="reviewer@nexora.test",
                icd10_code="I10",
                hcc_code="HCC161",
            ),
        ]
    )

    provider = CodingProvider(
        name="Prominence Primary Care",
        npi="1457389023",
        tax_id="74-1234567",
        phone="555-123-4567",
    )
    session.add(provider)
    await session.flush()
    session.add(
        CodingProviderLocation(
            provider_id=provider.id,
            address_line1="456 Market St",
            city="Chicago",
            state="IL",
            postal_code="60601",
        )
    )

    session.add(
        CodingMemberNote(
            member_id=seed_member.id,
            author_email="coder@nexora.test",
            author_name="Prominence Coder",
            body="Initial chart review completed for ProminenceHealth.",
        )
    )


async def load_assignment_metadata(
    session: AsyncSession,
    member_ids: Sequence[int],
) -> dict[int, dict[str, list]]:
    if not member_ids:
        return {}
    stmt = select(
        CodingMemberChase.member_id,
        CodingMemberChase.assigned_coder_id,
        CodingMemberChase.assigned_coder_email,
        CodingMemberChase.status,
    ).where(CodingMemberChase.member_id.in_(member_ids))
    result = await session.execute(stmt)
    assignments: dict[int, tuple[set[int], set[str]]] = {}
    for member_id, coder_id, coder_email, status in result:
        if status and status.lower() in TERMINAL_CHASE_STATUSES:
            continue
        coder_ids, coder_emails = assignments.setdefault(member_id, (set(), set()))
        if coder_id is not None:
            coder_ids.add(coder_id)
        if coder_email:
            normalized = coder_email.strip()
            if normalized:
                coder_emails.add(normalized)
    return {
        member_id: {
            'assigned_coder_ids': sorted(ids),
            'assigned_coder_emails': sorted(emails),
        }
        for member_id, (ids, emails) in assignments.items()
    }


async def get_member_eligibility(session: AsyncSession, member_id: int) -> CodingMemberEligibility | None:
    stmt = select(CodingMemberEligibility).where(CodingMemberEligibility.member_id == member_id)
    return await session.scalar(stmt)


async def upsert_member_eligibility(session: AsyncSession, member: CodingMember, payload: dict) -> CodingMemberEligibility:
    eligibility = await get_member_eligibility(session, member.id)
    if eligibility is None:
        eligibility = CodingMemberEligibility(member_id=member.id)
        session.add(eligibility)
    for key, value in payload.items():
        if hasattr(eligibility, key) and value is not None:
            setattr(eligibility, key, value)
    eligibility.last_synced_at = datetime.utcnow()
    return eligibility


async def list_claims(session: AsyncSession, member_id: int) -> list[CodingClaim]:
    stmt = select(CodingClaim).where(CodingClaim.member_id == member_id).order_by(CodingClaim.service_date.desc())
    return list((await session.scalars(stmt)).all())


async def list_mao_records(session: AsyncSession, member_id: int, submission_year: Optional[int] = None) -> list[CodingMao004Record]:
    stmt = select(CodingMao004Record).where(CodingMao004Record.member_id == member_id)
    if submission_year is not None:
        stmt = stmt.where(CodingMao004Record.submission_year == submission_year)
    stmt = stmt.order_by(CodingMao004Record.service_start.desc())
    return list((await session.scalars(stmt)).all())


async def list_health_assessments(session: AsyncSession, member_id: int) -> list[CodingHealthAssessment]:
    stmt = select(CodingHealthAssessment).where(CodingHealthAssessment.member_id == member_id).order_by(
        CodingHealthAssessment.assessment_date.desc()
    )
    return list((await session.scalars(stmt)).all())


async def create_health_assessment(
    session: AsyncSession,
    *,
    member: CodingMember,
    payload: dict,
) -> CodingHealthAssessment:
    assessment = CodingHealthAssessment(member_id=member.id, **payload)
    session.add(assessment)
    await session.flush()
    return assessment


async def get_member_priority(
    session: AsyncSession,
    member: CodingMember,
    submission_year: int,
) -> CodingMemberPriority:
    priority = await session.scalar(
        select(CodingMemberPriority).where(CodingMemberPriority.member_id == member.id)
    )
    if priority:
        return priority
    return await refresh_member_priority(session=session, member=member, submission_year=submission_year)


async def list_prioritized_members(
    session: AsyncSession,
    submission_year: int,
    *,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[CodingMemberPriority], int]:
    filters = []
    if search:
        like = f"%{search.lower()}%"
        filters.append(
            or_(
                func.lower(CodingMember.first_name).like(like),
                func.lower(CodingMember.last_name).like(like),
                func.lower(CodingMember.member_key).like(like),
            )
        )
    member_stmt = select(CodingMember)
    if filters:
        member_stmt = member_stmt.where(*filters)

    total_stmt = select(func.count()).select_from(CodingMember)
    if filters:
        total_stmt = total_stmt.where(*filters)

    total = await session.scalar(total_stmt)
    members = (await session.scalars(member_stmt.offset(offset).limit(limit))).all()
    priorities = await refresh_priorities(session=session, members=members, submission_year=submission_year)
    await session.flush()
    return priorities, int(total or 0)


async def list_open_assignments(session: AsyncSession) -> list[dict[str, object]]:
    stmt = (
        select(
            CodingMemberChase.id.label("chase_id"),
            CodingMember.id.label("member_id"),
            CodingMember.member_key.label("member_key"),
            CodingMember.first_name.label("first_name"),
            CodingMember.last_name.label("last_name"),
            CodingMemberChase.status.label("status"),
            CodingMemberChase.priority.label("priority"),
            CodingMemberChase.assigned_coder_email.label("assigned_coder_email"),
            CodingMemberChase.hcc_code.label("hcc_code"),
            CodingMemberChase.icd10_code.label("icd10_code"),
            CodingMemberChase.updated_at.label("updated_at"),
        )
        .join(CodingMember, CodingMember.id == CodingMemberChase.member_id)
        .where(CodingMemberChase.status.notin_(TERMINAL_CHASE_STATUSES))
        .order_by(CodingMemberChase.updated_at.desc())
    )
    rows = (await session.execute(stmt)).all()
    items: list[dict[str, object]] = []
    for row in rows:
        member_name = None
        first = row.first_name or ''
        last = row.last_name or ''
        combination = f"{first} {last}".strip()
        if combination:
            member_name = combination
        items.append(
            {
                "chase_id": row.chase_id,
                "member_id": row.member_id,
                "member_key": row.member_key,
                "member_name": member_name,
                "status": row.status,
                "priority": row.priority,
                "assigned_coder_email": row.assigned_coder_email,
                "hcc_code": row.hcc_code,
                "icd10_code": row.icd10_code,
                "updated_at": row.updated_at,
            }
        )
    return items


async def assign_chases_to_coder(
    session: AsyncSession,
    *,
    coder_email: str,
    coder_id: int | None = None,
    chase_ids: Sequence[int],
    member_ids: Sequence[int],
) -> list[int]:
    target_ids: set[int] = set(chase_ids or [])

    if member_ids:
        member_stmt = select(CodingMemberChase.id).where(
            CodingMemberChase.member_id.in_(member_ids),
            CodingMemberChase.status.notin_(TERMINAL_CHASE_STATUSES),
        )
        member_rows = (await session.execute(member_stmt)).scalars().all()
        target_ids.update(member_rows)

    if not target_ids:
        return []

    chase_stmt = select(CodingMemberChase).where(CodingMemberChase.id.in_(target_ids))
    chases = (await session.scalars(chase_stmt)).all()
    for chase in chases:
        chase.assigned_coder_email = coder_email
        if coder_id is not None:
            chase.assigned_coder_id = coder_id
    await session.flush()
    return [chase.id for chase in chases]


async def list_coders_for_tenant(control_session: AsyncSession, tenant_id: int) -> list[dict[str, object]]:
    stmt = (
        select(User)
        .where(User.tenant_id == tenant_id, User.is_active.is_(True))
        .order_by(User.email.asc())
    )
    users = (await control_session.scalars(stmt)).all()
    results: list[dict[str, object]] = []
    for user in users:
        applications = dict(user.app_permissions or {})
        results.append(
            {
                "id": user.id,
                "email": user.email,
                "role": user.role or 'user',
                "applications": applications,
            }
        )
    return results
