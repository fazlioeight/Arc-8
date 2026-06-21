"""Identity-proofing logic for member self-registration (Feature 1).

Matches a prospective member against the tenant's existing ``m360_members``
records using Member ID + DOB + last name + ZIP (see [[member-portal-decisions]]),
and provides a Redis-free, DB-backed attempt throttle so the anti-abuse control
behaves identically in tests and production.

Security posture: the caller treats *every* non-match identically and never
reveals which field failed. This module returns a bare match / no-match and
records only the coarse outcome — never the DOB/last-name/ZIP that were checked.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..models.member360 import Member360Member
from ..models.member_portal import MemberIdentityVerificationAttempt


def _norm_name(value: Optional[str]) -> str:
    return (value or "").strip().casefold()


def _norm_zip(value: Optional[str]) -> str:
    """Reduce a ZIP to its 5-digit core (ZIP+4 and stray spaces tolerated)."""
    digits = "".join(ch for ch in (value or "") if ch.isdigit())
    return digits[:5]


def _norm_member_key(value: Optional[str]) -> str:
    return (value or "").strip()


async def find_matching_member(
    tenant_session: AsyncSession,
    *,
    member_key: str,
    date_of_birth: date,
    last_name: str,
    zip_code: str,
) -> Optional[Member360Member]:
    """Return the m360 member iff ALL four proofing factors match, else None.

    Member ID is the primary selector (it is unique), so a shared DOB across
    members is not ambiguous: we fetch by member_key, then verify the other
    three factors in Python to keep the comparison explicit and locale-safe.
    """
    key = _norm_member_key(member_key)
    if not key:
        return None
    member = await tenant_session.scalar(
        select(Member360Member).where(Member360Member.member_key == key).limit(1)
    )
    if member is None:
        return None
    if member.date_of_birth != date_of_birth:
        return None
    if _norm_name(member.last_name) != _norm_name(last_name):
        return None
    if _norm_zip(member.address_zip) != _norm_zip(zip_code):
        return None
    return member


# ---------------------------------------------------------------------------
# DB-backed attempt throttle (per IP and per submitted member id)
# ---------------------------------------------------------------------------


async def is_verification_locked(
    control_session: AsyncSession,
    *,
    tenant_id: int,
    ip_address: Optional[str],
    submitted_member_key: Optional[str],
) -> bool:
    """True if either the IP or the submitted member id has exceeded the
    failed-attempt budget within the lockout window.

    Only failed attempts (outcome ``no_match`` / ``inactive_coverage`` /
    ``locked_out``) count toward the budget; a successful ``created`` or a
    benign ``already_registered`` does not lock anyone out.
    """
    window_start = datetime.now(timezone.utc) - timedelta(seconds=settings.LOGIN_LOCKOUT_WINDOW_SECONDS)
    failed = ("no_match", "inactive_coverage", "locked_out")
    base = (
        select(func.count())
        .select_from(MemberIdentityVerificationAttempt)
        .where(
            MemberIdentityVerificationAttempt.tenant_id == tenant_id,
            MemberIdentityVerificationAttempt.created_at >= window_start,
            MemberIdentityVerificationAttempt.outcome.in_(failed),
        )
    )
    limit = settings.LOGIN_LOCKOUT_MAX_ATTEMPTS
    if ip_address:
        ip_count = await control_session.scalar(
            base.where(MemberIdentityVerificationAttempt.ip_address == ip_address)
        )
        if (ip_count or 0) >= limit:
            return True
    key = _norm_member_key(submitted_member_key)
    if key:
        key_count = await control_session.scalar(
            base.where(MemberIdentityVerificationAttempt.submitted_member_key == key)
        )
        if (key_count or 0) >= limit:
            return True
    return False


async def record_attempt(
    control_session: AsyncSession,
    *,
    tenant_id: int,
    submitted_member_key: Optional[str],
    ip_address: Optional[str],
    outcome: str,
) -> None:
    """Append an attempt row. Caller commits."""
    control_session.add(
        MemberIdentityVerificationAttempt(
            tenant_id=tenant_id,
            submitted_member_key=_norm_member_key(submitted_member_key) or None,
            ip_address=ip_address,
            outcome=outcome,
        )
    )
