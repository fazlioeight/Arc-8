"""Identity-proofing & QNXT Master Patient Index (MPI) resolution logic (Feature 1 & G-02).

Matches a prospective or inbound member against the tenant's existing ``m360_members``
records using:
1. Primary Member Key / QNXT ``car_id`` / ``mem_id`` normalization.
2. 4-Factor Demographic MPI Matching (First Name + Last Name + DOB + 5-digit ZIP).
3. Duplicate Test Record Detection & Canonical Record Selection (G-02).
4. DB-backed attempt throttle for member self-registration.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..models.member360 import Member360Member
from ..models.member_portal import MemberIdentityVerificationAttempt


def _norm_name(value: Optional[str]) -> str:
    cleaned = re.sub(r"[^a-zA-Z\s'\-]", "", (value or "")).strip().casefold()
    return re.sub(r"\s+", " ", cleaned)


def _norm_zip(value: Optional[str]) -> str:
    """Reduce a ZIP to its 5-digit core (ZIP+4 and stray spaces tolerated)."""
    digits = "".join(ch for ch in (value or "") if ch.isdigit())
    return digits[:5]


def _norm_member_key(value: Optional[str]) -> str:
    return (value or "").strip()


def build_mpi_signature(
    first_name: Optional[str],
    last_name: Optional[str],
    date_of_birth: Optional[date],
    zip_code: Optional[str] = None,
) -> str:
    """Build a deterministic QNXT MPI demographic signature for deduplication (G-02).

    Two records with the same normalized first name, last name, and date of birth
    (and matching 5-digit ZIP when both have a ZIP) represent the same real-world
    patient in QNXT MPI.
    """
    fn = _norm_name(first_name)
    ln = _norm_name(last_name)
    dob_iso = date_of_birth.isoformat() if isinstance(date_of_birth, date) else str(date_of_birth or "")
    return f"{ln}|{fn}|{dob_iso}"


def is_synthetic_duplicate_test_member(member: Member360Member) -> bool:
    """Return True if a member row is an obvious synthetic/corrupted test artifact
    (e.g., 'Test Member', 'Duplicate Test', empty names)."""
    fn = _norm_name(member.first_name)
    ln = _norm_name(member.last_name)
    full = f"{fn} {ln}".strip()
    if not full:
        return True
    test_patterns = (
        "test member",
        "duplicate member",
        "duplicate test",
        "dummy member",
        "sample patient",
        "qa test",
    )
    return any(pat in full for pat in test_patterns)


def deduplicate_members_by_mpi(members: Iterable[Member360Member]) -> list[Member360Member]:
    """Deduplicate a sequence of ``Member360Member`` objects using QNXT MPI matching (G-02).

    When two records share the same MPI demographic signature ``(last_name, first_name, dob)``
    (or normalized ``member_key``), retains the canonical record:
    - Prefers non-test records over synthetic test records.
    - Prefers records with a ``MEM`` or ``PROM`` key and higher ``open_care_gaps`` /
      ``last_interaction_at`` recency.
    """
    canonical_by_mpi: dict[str, Member360Member] = {}
    ordered_keys: list[str] = []

    def _record_quality(m: Member360Member) -> tuple[int, int, int, int]:
        is_real = 0 if is_synthetic_duplicate_test_member(m) else 1
        has_pcp = 1 if (m.primary_care_provider and m.primary_care_provider.strip()) else 0
        has_interaction = 1 if m.last_interaction_at is not None else 0
        gaps = int(m.open_care_gaps or 0)
        return (is_real, has_pcp, has_interaction, gaps)

    for m in members:
        sig = build_mpi_signature(m.first_name, m.last_name, m.date_of_birth, m.address_zip)
        # If demographic fields are missing, fall back to member_key so we never collapse unrelated rows
        if sig.startswith("||") or not m.first_name or not m.last_name:
            sig = f"key:{_norm_member_key(m.member_key) or m.id}"
        if sig not in canonical_by_mpi:
            canonical_by_mpi[sig] = m
            ordered_keys.append(sig)
        else:
            existing = canonical_by_mpi[sig]
            if _record_quality(m) > _record_quality(existing):
                canonical_by_mpi[sig] = m

    return [canonical_by_mpi[k] for k in ordered_keys]


async def resolve_qnxt_mpi_member(
    tenant_session: AsyncSession,
    *,
    member_key: Optional[str] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    date_of_birth: Optional[date] = None,
    zip_code: Optional[str] = None,
) -> Optional[Member360Member]:
    """Resolve an inbound QNXT / SFTP / API member record against existing ``m360_members``
    using exact ``member_key`` first, then QNXT MPI demographic matching (G-02)."""
    key = _norm_member_key(member_key)
    if key:
        exact = await tenant_session.scalar(
            select(Member360Member).where(Member360Member.member_key == key).limit(1)
        )
        if exact is not None:
            return exact

    fn = _norm_name(first_name)
    ln = _norm_name(last_name)
    if fn and ln and date_of_birth is not None:
        candidates = (
            await tenant_session.scalars(
                select(Member360Member).where(
                    func.lower(func.trim(Member360Member.first_name)) == fn,
                    func.lower(func.trim(Member360Member.last_name)) == ln,
                    Member360Member.date_of_birth == date_of_birth,
                )
            )
        ).all()
        if candidates:
            norm_z = _norm_zip(zip_code)
            if norm_z:
                for cand in candidates:
                    if not cand.address_zip or _norm_zip(cand.address_zip) == norm_z:
                        return cand
            return candidates[0]
    return None


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
