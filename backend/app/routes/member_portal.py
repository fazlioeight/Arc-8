"""Member-facing portal: self-registration & identity verification (Feature 1).

Mounted at ``/api/member/auth``. This is a NET-NEW public trust boundary —
prospective health-plan members, not internal staff. The flow is:

  register  ->  (identity proofed against m360_members)  ->  pending account
            ->  email verification link  ->  active account  ->  (login: Feature 2)

Anti-enumeration is a hard requirement: ``/register`` and ``/resend-verification``
ALWAYS return the same 202 body regardless of whether the member matched, was
already registered, or did not match — and the password is always hashed so the
"no match" and "already registered" paths cost the same wall-clock as a real
signup. Nothing reveals which proofing field failed.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context, get_tenant_session
from ..middleware.rate_limit import auth_rate_limit
from ..models.member_portal import MemberEmailVerificationToken, MemberPortalAccount
from ..schemas.types import NormalizedEmail
from ..services import member_identity
from ..services.email import send_email
from ..utils.audit_logger import record_audit_event
from ..utils.auth_throttle import client_ip
from ..utils.security import hash_password

router = APIRouter(prefix="/api/member/auth", tags=["member-portal-auth"])
logger = logging.getLogger(__name__)

# Uniform response for every registration / resend outcome (no enumeration).
_GENERIC_REGISTER_MESSAGE = (
    "If the information matches our records, a verification email has been sent. "
    "Please check your inbox to finish setting up your account."
)


class MemberRegisterRequest(BaseModel):
    member_id: str = Field(min_length=1, max_length=64)
    date_of_birth: date
    last_name: str = Field(min_length=1, max_length=80)
    zip_code: str = Field(min_length=3, max_length=10)
    email: NormalizedEmail
    password: str = Field(min_length=12, max_length=256)


class GenericMessageResponse(BaseModel):
    detail: str


class EmailVerifyRequest(BaseModel):
    token: str = Field(min_length=20, max_length=256)


class ResendVerificationRequest(BaseModel):
    email: NormalizedEmail


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def _issue_email_verification(
    session: AsyncSession, *, tenant: TenantContext, account: MemberPortalAccount
) -> str:
    raw_token = secrets.token_urlsafe(32)
    session.add(
        MemberEmailVerificationToken(
            tenant_id=tenant.id,
            account_id=account.id,
            token_hash=_hash_token(raw_token),
            expires_at=datetime.now(timezone.utc)
            + timedelta(minutes=settings.MEMBER_EMAIL_VERIFICATION_TTL_MINUTES),
        )
    )
    return raw_token


async def _send_verification_email(*, to: str, tenant: TenantContext, raw_token: str) -> None:
    base = (settings.MEMBER_PORTAL_BASE_URL or "").rstrip("/")
    link = f"{base}/verify-email?token={raw_token}" if base else f"token={raw_token}"
    body = (
        "Welcome to your member portal.\n\n"
        "Please confirm your email address to activate your account:\n\n"
        f"{link}\n\n"
        f"This link expires in {settings.MEMBER_EMAIL_VERIFICATION_TTL_MINUTES // 60} hours. "
        "If you did not request this, you can ignore this message."
    )
    try:
        await send_email(to=to, subject="Verify your member portal account", body=body)
    except Exception:  # noqa: BLE001 — never fail registration on a relay hiccup
        logger.exception("member verification email send failed for tenant=%s", tenant.key)


@router.post(
    "/register",
    response_model=GenericMessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def register(
    payload: MemberRegisterRequest,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    tenant_session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
    _rl: None = Depends(auth_rate_limit),
) -> GenericMessageResponse:
    ip = client_ip(request)
    generic = GenericMessageResponse(detail=_GENERIC_REGISTER_MESSAGE)

    # Always hash the password so a no-match / already-registered path costs the
    # same as a real signup (no timing oracle). The hash may be discarded.
    password_hash = await hash_password(payload.password)

    # Per-IP and per-member-id lockout (DB-backed; works without Redis).
    if await member_identity.is_verification_locked(
        control_session, tenant_id=tenant.id, ip_address=ip, submitted_member_key=payload.member_id
    ):
        await member_identity.record_attempt(
            control_session,
            tenant_id=tenant.id,
            submitted_member_key=payload.member_id,
            ip_address=ip,
            outcome="locked_out",
        )
        await control_session.commit()
        return generic

    member = await member_identity.find_matching_member(
        tenant_session,
        member_key=payload.member_id,
        date_of_birth=payload.date_of_birth,
        last_name=payload.last_name,
        zip_code=payload.zip_code,
    )

    if member is None:
        await member_identity.record_attempt(
            control_session,
            tenant_id=tenant.id,
            submitted_member_key=payload.member_id,
            ip_address=ip,
            outcome="no_match",
        )
        await record_audit_event(
            control_session,
            tenant_id=tenant.id,
            actor=payload.email,
            event_type="member.register.no_match",
            payload={"tenant": tenant.key, "ip": ip},
        )
        await control_session.commit()
        return generic

    # Identity matched. Refuse to create a second account for the same member or
    # reuse an email already taken in this tenant — but stay silent about it.
    existing = await control_session.scalar(
        select(MemberPortalAccount).where(
            MemberPortalAccount.tenant_id == tenant.id,
            MemberPortalAccount.member_key == member.member_key,
        )
    )
    if existing is not None:
        await member_identity.record_attempt(
            control_session,
            tenant_id=tenant.id,
            submitted_member_key=payload.member_id,
            ip_address=ip,
            outcome="already_registered",
        )
        await record_audit_event(
            control_session,
            tenant_id=tenant.id,
            actor=payload.email,
            event_type="member.register.already_registered",
            payload={"tenant": tenant.key, "ip": ip},
        )
        await control_session.commit()
        return generic

    account = MemberPortalAccount(
        tenant_id=tenant.id,
        member_key=member.member_key,
        email=payload.email,
        password_hash=password_hash,
        status="pending_verification",
    )
    control_session.add(account)
    try:
        await control_session.flush()
    except IntegrityError:
        # Email already in use by a different member in this tenant. Stay silent.
        await control_session.rollback()
        await member_identity.record_attempt(
            control_session,
            tenant_id=tenant.id,
            submitted_member_key=payload.member_id,
            ip_address=ip,
            outcome="already_registered",
        )
        await control_session.commit()
        return generic

    raw_token = await _issue_email_verification(control_session, tenant=tenant, account=account)
    await member_identity.record_attempt(
        control_session,
        tenant_id=tenant.id,
        submitted_member_key=payload.member_id,
        ip_address=ip,
        outcome="created",
    )
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=payload.email,
        event_type="member.register.created",
        payload={"tenant": tenant.key, "ip": ip, "account_id": account.id},
    )
    await control_session.commit()

    await _send_verification_email(to=payload.email, tenant=tenant, raw_token=raw_token)
    return generic


@router.post("/verify-email", status_code=status.HTTP_204_NO_CONTENT)
async def verify_email(
    payload: EmailVerifyRequest,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    control_session: AsyncSession = Depends(get_control_session),
    _rl: None = Depends(auth_rate_limit),
) -> None:
    token_hash = _hash_token(payload.token)
    record: Optional[MemberEmailVerificationToken] = await control_session.scalar(
        select(MemberEmailVerificationToken).where(
            MemberEmailVerificationToken.token_hash == token_hash,
            MemberEmailVerificationToken.tenant_id == tenant.id,
        )
    )
    now = datetime.now(timezone.utc)
    expires_at = record.expires_at if record else now
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if not record or record.used_at is not None or expires_at < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    account = await control_session.get(MemberPortalAccount, record.account_id)
    if account is None or account.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    record.used_at = now
    if account.status == "pending_verification":
        account.status = "active"
    account.email_verified_at = account.email_verified_at or now

    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=account.email,
        event_type="member.email.verified",
        payload={"tenant": tenant.key, "ip": client_ip(request), "account_id": account.id},
    )
    await control_session.commit()
    return None


@router.post(
    "/resend-verification",
    response_model=GenericMessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def resend_verification(
    payload: ResendVerificationRequest,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    control_session: AsyncSession = Depends(get_control_session),
    _rl: None = Depends(auth_rate_limit),
) -> GenericMessageResponse:
    generic = GenericMessageResponse(detail=_GENERIC_REGISTER_MESSAGE)
    account = await control_session.scalar(
        select(MemberPortalAccount).where(
            MemberPortalAccount.tenant_id == tenant.id,
            MemberPortalAccount.email == payload.email,
            MemberPortalAccount.status == "pending_verification",
        )
    )
    if account is None:
        return generic

    raw_token = await _issue_email_verification(control_session, tenant=tenant, account=account)
    await control_session.commit()
    await _send_verification_email(to=account.email, tenant=tenant, raw_token=raw_token)
    return generic
