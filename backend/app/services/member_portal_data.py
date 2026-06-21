"""Read-only data access for the member dashboard (Feature 3).

Ownership is enforced HERE, at the data-access layer — never trust the route.
Every function takes the authenticated member's ``member_key`` (resolved from
the access token, never from client input) and scopes all queries to that
member's id. The claim-detail lookup additionally re-checks ``member_id`` so a
guessed claim id from another member returns nothing (no IDOR).

Tenant isolation is structural: the ``tenant_session`` is already bound to the
caller's tenant database, so cross-tenant rows are unreachable.
"""
from __future__ import annotations

from typing import List, Optional, Sequence, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.member360 import (
    Member360Accumulator,
    Member360AccumulatorScope,
    Member360Claim,
    Member360Coverage,
    Member360Dependent,
    Member360Document,
    Member360Member,
)


async def get_member_by_key(session: AsyncSession, member_key: str) -> Optional[Member360Member]:
    """Resolve the m360 member the account is bound to (the ownership anchor)."""
    return await session.scalar(
        select(Member360Member).where(Member360Member.member_key == member_key).limit(1)
    )


async def get_coverages(session: AsyncSession, member_id: int) -> Sequence[Member360Coverage]:
    return (
        await session.scalars(
            select(Member360Coverage)
            .where(Member360Coverage.member_id == member_id)
            .order_by(Member360Coverage.is_primary.desc(), Member360Coverage.effective_date.desc())
        )
    ).all()


async def get_dependents(session: AsyncSession, member_id: int) -> Sequence[Member360Dependent]:
    return (
        await session.scalars(
            select(Member360Dependent)
            .where(Member360Dependent.subscriber_member_id == member_id)
            .order_by(Member360Dependent.last_name, Member360Dependent.first_name)
        )
    ).all()


async def list_claims(
    session: AsyncSession,
    member_id: int,
    *,
    status: Optional[str] = None,
    limit: int = 25,
    offset: int = 0,
) -> Tuple[List[Member360Claim], int]:
    """Return (page, total) of the member's own claims, newest first."""
    base = select(Member360Claim).where(Member360Claim.member_id == member_id)
    if status:
        base = base.where(Member360Claim.status == status)

    total = await session.scalar(
        select(func.count()).select_from(base.order_by(None).subquery())
    )
    rows = (
        await session.scalars(
            base.order_by(Member360Claim.service_date.desc().nullslast(), Member360Claim.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return list(rows), int(total or 0)


async def get_claim_for_member(
    session: AsyncSession, member_id: int, claim_id: int
) -> Optional[Member360Claim]:
    """Fetch one claim WITH its lines + detail, re-checking ownership.

    The ``member_id`` filter is the IDOR guard: a claim id belonging to another
    member (same or different tenant) resolves to None even though the id is
    valid.
    """
    return await session.scalar(
        select(Member360Claim)
        .where(Member360Claim.id == claim_id, Member360Claim.member_id == member_id)
        .options(selectinload(Member360Claim.lines), selectinload(Member360Claim.detail))
        .limit(1)
    )


async def list_documents(session: AsyncSession, member_id: int) -> Sequence[Member360Document]:
    """The member's own active documents, newest first. Never exposes the
    storage key/path — the route maps only display metadata."""
    return (
        await session.scalars(
            select(Member360Document)
            .where(Member360Document.member_id == member_id, Member360Document.status == "active")
            .order_by(Member360Document.uploaded_at.desc(), Member360Document.id.desc())
        )
    ).all()


async def get_document_for_member(
    session: AsyncSession, member_id: int, document_id: int
) -> Optional[Member360Document]:
    """Fetch one document re-checking ownership (IDOR guard). A document id
    belonging to another member resolves to None."""
    return await session.scalar(
        select(Member360Document)
        .where(
            Member360Document.id == document_id,
            Member360Document.member_id == member_id,
            Member360Document.status == "active",
        )
        .limit(1)
    )


async def get_accumulator_scopes(
    session: AsyncSession, member_id: int
) -> List[Member360AccumulatorScope]:
    """Return per-scope accumulators.

    Prefers the scoped rows (individual + family). If a tenant has only the
    legacy single ``m360_accumulators`` row, synthesize an ``individual`` scope
    from it so the dashboard renders consistently either way.
    """
    scopes = list(
        (
            await session.scalars(
                select(Member360AccumulatorScope).where(
                    Member360AccumulatorScope.member_id == member_id
                )
            )
        ).all()
    )
    if scopes:
        return scopes

    legacy = await session.scalar(
        select(Member360Accumulator).where(Member360Accumulator.member_id == member_id).limit(1)
    )
    if legacy is None:
        return []
    return [
        Member360AccumulatorScope(
            member_id=member_id,
            scope="individual",
            deductible=legacy.deductible,
            deductible_met=legacy.deductible_met,
            out_of_pocket_max=legacy.out_of_pocket_max,
            out_of_pocket_met=legacy.out_of_pocket_met,
            plan_year_start=legacy.plan_year_start,
            as_of_date=legacy.plan_year_start,
            updated_at=legacy.updated_at,
        )
    ]
