from __future__ import annotations

from typing import Iterable, Optional, Sequence, Tuple

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.coding import (
    CodingMember,
    CodingMemberAttachment,
    CodingMemberChase,
    CodingMemberNote,
    CodingProvider,
    CodingProviderLocation,
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
        like = f"%{search.lower()}%"
        filters.append(
            or_(
                func.lower(CodingMember.first_name).like(like),
                func.lower(CodingMember.last_name).like(like),
                func.lower(CodingMember.member_key).like(like),
                func.lower(CodingMember.pcp_name).like(like),
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

    demo_member = CodingMember(
        member_key="M-0001",
        first_name="Alex",
        last_name="Johnson",
        status="active",
        line_of_business="Commercial",
        risk_score=0.84,
        primary_language="English",
        pcp_name="Dr. Rivera",
        pcp_npi="1234567890",
        address_city="Austin",
        address_state="TX",
    )
    session.add(demo_member)
    await session.flush()

    session.add_all(
        [
            CodingMemberChase(
                member_id=demo_member.id,
                chase_code="CH-1001",
                status="open",
                priority="high",
                assigned_coder_email="coder@nexora.test",
                icd10_code="E11.9",
                hcc_code="HCC18",
            ),
            CodingMemberChase(
                member_id=demo_member.id,
                chase_code="CH-1002",
                status="in_review",
                priority="normal",
                assigned_coder_email="reviewer@nexora.test",
                icd10_code="I10",
                hcc_code="HCC161",
            ),
        ]
    )

    provider = CodingProvider(
        name="Rivera Family Practice",
        npi="1457389023",
        tax_id="74-1234567",
        phone="555-123-4567",
    )
    session.add(provider)
    await session.flush()
    session.add(
        CodingProviderLocation(
            provider_id=provider.id,
            address_line1="123 Main St",
            city="Austin",
            state="TX",
            postal_code="73301",
        )
    )

    session.add(
        CodingMemberNote(
            member_id=demo_member.id,
            author_email="coder@nexora.test",
            author_name="Demo Coder",
            body="Initial chart review completed.",
        )
    )
