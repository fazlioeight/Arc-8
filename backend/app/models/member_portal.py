"""Control-plane models for the member-facing portal.

These tables live in the CONTROL database (``ControlBase``), NOT in the
per-tenant data plane. They form a *separate auth realm* from the staff
``users`` table: portal accounts belong to health-plan members (patients),
each one bound to a single ``(tenant_id, member_key)`` pair where
``member_key`` matches a row in that tenant's ``m360_members`` table.

Nothing here stores PHI beyond the member identifier itself — names, DOBs,
ZIPs and SSNs submitted during identity proofing are matched against the
tenant data plane and immediately discarded; they are never persisted here.

See [[member-portal-decisions]].
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .tables import ControlBase


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class MemberPortalAccount(ControlBase):
    """A member's portal credentials, bound to one tenant + one member record.

    ``status`` lifecycle:
      ``pending_verification`` -> (email verified) -> ``active``
      ``active`` -> (self-service / abuse) -> ``deactivated``
    A locked account is represented by ``locked_until`` in the future rather
    than a status flip, so it auto-recovers without an admin touch.
    """

    __tablename__ = "member_portal_accounts"
    __table_args__ = (
        # A member registers at most once per tenant, and an email is unique
        # within a tenant. Both are scoped by tenant_id so the same person can
        # exist independently across two health plans (multi-tenant member).
        UniqueConstraint("tenant_id", "member_key", name="uq_member_account_member"),
        UniqueConstraint("tenant_id", "email", name="uq_member_account_email"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The matched m360_members.member_key in the tenant data plane. This is the
    # ownership anchor every PHI read re-checks against.
    member_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending_verification", nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    mfa_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    mfa_enrolled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )


class MemberIdentityVerificationAttempt(ControlBase):
    """Forensic + anti-abuse log of identity-proofing attempts.

    Counted within a sliding window (per IP and per submitted member id) to
    drive lockout WITHOUT depending on Redis, so the control works the same in
    tests and in production. Deliberately stores only the submitted member id
    and the coarse outcome — never the DOB / last name / ZIP that were checked.
    """

    __tablename__ = "member_identity_verification_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # As submitted by the client (may not match any real member). Indexed for
    # per-member-id windowed counting.
    submitted_member_key: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # One of: no_match | created | already_registered | inactive_coverage | locked_out
    outcome: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False, index=True
    )


class MemberEmailVerificationToken(ControlBase):
    """Single-use, expiring token proving control of the member's email.

    Only the SHA-256 hash of the opaque token is stored.
    """

    __tablename__ = "member_email_verification_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    account_id: Mapped[int] = mapped_column(
        ForeignKey("member_portal_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)


class MemberPasswordResetToken(ControlBase):
    """Single-use, expiring password-reset token for the member realm.

    Mirrors the staff ``password_reset_tokens`` table but in the member realm
    so the two realms never share token state. Consumed in Feature 2.
    """

    __tablename__ = "member_password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    account_id: Mapped[int] = mapped_column(
        ForeignKey("member_portal_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    requested_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)


class MemberRefreshToken(ControlBase):
    """Rotating refresh token for the member realm (consumed in Feature 2).

    Same rotation/replay-detection design as the staff ``refresh_tokens``
    table: only the hash is stored, each refresh consumes one row and issues a
    child sharing ``session_id``; reusing a consumed token revokes the chain.
    """

    __tablename__ = "member_refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    account_id: Mapped[int] = mapped_column(
        ForeignKey("member_portal_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    max_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
