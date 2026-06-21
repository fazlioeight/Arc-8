"""Member-facing portal: login, session & account management (Feature 2).

Mounted at ``/api/member/auth`` alongside the registration router. Mirrors the
staff realm's hardened auth flow but entirely within the member realm:

  * login           — password + optional TOTP, DB-backed account lockout
  * refresh         — rotating member refresh tokens (idle + absolute timeout)
  * logout          — revoke the access-token jti + all member refresh tokens
  * password reset  — token-based, expiring, single-use; invalidates sessions
  * change-password — authenticated; invalidates other sessions
  * MFA             — enroll / verify / disable (TOTP), reusing pyotp infra
  * me              — the member's own account summary (own identifiers only)

Enumeration posture: a wrong email and a wrong password are indistinguishable
(generic 401, constant-time-ish via a dummy hash). Account-state messages
(unverified / disabled) are only revealed *after* a correct password.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import quote

import bcrypt
import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context
from ..middleware.rate_limit import auth_rate_limit
from ..models.member_portal import MemberPasswordResetToken, MemberPortalAccount
from ..routes.auth import verify_totp
from ..schemas.types import NormalizedEmail
from ..services.email import send_email
from ..utils.audit_logger import record_audit_event
from ..utils.auth_throttle import client_ip
from ..utils.member_auth import (
    AuthenticatedMember,
    create_member_access_token,
    decode_member_token,
    get_current_member,
    issue_member_refresh_token,
    member_oauth2_scheme,
    revoke_member_refresh_tokens,
    rotate_member_refresh_token,
)
from ..utils.security import hash_password, revoke_jti, verify_password

router = APIRouter(prefix="/api/member/auth", tags=["member-portal-auth"])
logger = logging.getLogger(__name__)

# Precomputed bcrypt hash so the "no such account" path still spends a verify
# cycle — removes the email-exists timing oracle on login.
_DUMMY_HASH = bcrypt.hashpw(b"timing-equalizer", bcrypt.gensalt()).decode("utf-8")


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #


class MemberLoginRequest(BaseModel):
    email: NormalizedEmail
    password: str
    mfa_code: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20)


class PasswordResetRequest(BaseModel):
    email: NormalizedEmail


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=20)
    new_password: str = Field(min_length=12, max_length=256)


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(min_length=12, max_length=256)


class MfaEnrollResponse(BaseModel):
    otpauth_url: str
    secret: str


class MfaVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=8)


class MfaDisableRequest(BaseModel):
    password: str
    code: str = Field(min_length=6, max_length=8)


class MeResponse(BaseModel):
    email: str
    member_key: str
    status: str
    mfa_enrolled: bool
    email_verified: bool


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _is_locked(account: MemberPortalAccount, now: datetime) -> bool:
    locked_until = _aware(account.locked_until)
    return locked_until is not None and locked_until > now


def _otpauth_url(secret: str, email: str, tenant_key: str) -> str:
    label = quote(f"{settings.MFA_ISSUER}:{tenant_key}:{email}", safe="")
    issuer = quote(settings.MFA_ISSUER, safe="")
    return f"otpauth://totp/{label}?secret={secret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30"


def _login_response(account: MemberPortalAccount, tenant: TenantContext, refresh_token: str) -> dict:
    return {
        "token": create_member_access_token(account, tenant),
        "refresh_token": refresh_token,
        "expires_in": settings.ACCESS_TOKEN_EXPIRES_MINUTES * 60,
        "email": account.email,
        "member_key": account.member_key,
        "mfa_enrolled": account.mfa_enrolled_at is not None,
    }


async def _record_login_failure(
    session: AsyncSession, account: MemberPortalAccount, tenant: TenantContext, ip: str, reason: str
) -> None:
    account.failed_login_count = (account.failed_login_count or 0) + 1
    if account.failed_login_count >= settings.LOGIN_LOCKOUT_MAX_ATTEMPTS:
        account.locked_until = datetime.now(timezone.utc) + timedelta(
            seconds=settings.LOGIN_LOCKOUT_WINDOW_SECONDS
        )
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=account.email,
        event_type="member.login.failed",
        payload={"tenant": tenant.key, "ip": ip, "reason": reason},
    )


# --------------------------------------------------------------------------- #
# Login / refresh / logout
# --------------------------------------------------------------------------- #


@router.post("/login")
async def login(
    payload: MemberLoginRequest,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    _rl: None = Depends(auth_rate_limit),
):
    ip = client_ip(request)
    now = datetime.now(timezone.utc)
    account = await session.scalar(
        select(MemberPortalAccount).where(
            MemberPortalAccount.tenant_id == tenant.id,
            MemberPortalAccount.email == payload.email,
        )
    )

    # Constant-ish time + non-enumerating: unknown email and wrong password both
    # land on the same generic 401, and both pay one bcrypt verify.
    password_ok = await verify_password(payload.password, account.password_hash if account else _DUMMY_HASH)

    if account is None or not password_ok:
        if account is not None:
            await _record_login_failure(session, account, tenant, ip, "bad_password")
            await session.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Lockout is checked only after a correct password so an attacker can't probe
    # lock state with throwaway guesses; the failure counter above still trips it.
    if _is_locked(account, now):
        await record_audit_event(
            session,
            tenant_id=tenant.id,
            actor=account.email,
            event_type="member.login.locked_out",
            payload={"tenant": tenant.key, "ip": ip},
        )
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Try again later.",
        )

    if account.status == "pending_verification":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Please verify your email before logging in")
    if account.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is not available")

    # MFA challenge.
    if account.mfa_enrolled_at is not None:
        if not payload.mfa_code:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="mfa_required")
        if not verify_totp(account.mfa_secret or "", payload.mfa_code):
            await _record_login_failure(session, account, tenant, ip, "bad_mfa_code")
            await session.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MFA code")

    # Success: clear lock state, stamp login, issue tokens.
    account.failed_login_count = 0
    account.locked_until = None
    account.last_login_at = now
    refresh_token = await issue_member_refresh_token(session, tenant_id=tenant.id, account_id=account.id, ip=ip)
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=account.email,
        event_type="member.login.success",
        payload={"tenant": tenant.key, "ip": ip, "mfa": account.mfa_enrolled_at is not None},
    )
    await session.commit()
    return _login_response(account, tenant, refresh_token)


@router.post("/refresh")
async def refresh(
    payload: RefreshRequest,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    _rl: None = Depends(auth_rate_limit),
):
    account_id, new_refresh = await rotate_member_refresh_token(
        session, raw_token=payload.refresh_token, tenant_id=tenant.id, ip=client_ip(request)
    )
    account = await session.get(MemberPortalAccount, account_id)
    if account is None or account.tenant_id != tenant.id or account.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account unavailable")
    await session.commit()
    return _login_response(account, tenant, new_refresh)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    token: str = Depends(member_oauth2_scheme),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
) -> None:
    # Decode directly (don't require an active account) so a client can always
    # clean up, then best-effort revoke the jti and all refresh tokens.
    try:
        decoded = decode_member_token(token)
    except HTTPException:
        return None
    jti = decoded.get("jti")
    exp = decoded.get("exp")
    if jti and exp:
        ttl = int(exp) - int(datetime.now(timezone.utc).timestamp())
        if ttl > 0:
            await revoke_jti(jti, ttl)
    account_id = decoded.get("mid")
    if account_id and tenant and tenant.id:
        await revoke_member_refresh_tokens(session, tenant_id=tenant.id, account_id=account_id)
        await record_audit_event(
            session,
            tenant_id=tenant.id,
            actor=decoded.get("sub") or "unknown",
            event_type="member.logout",
            payload={"tenant": tenant.key, "ip": client_ip(request)},
        )
        await session.commit()
    return None


@router.get("/me", response_model=MeResponse)
async def me(
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_member: AuthenticatedMember = Depends(get_current_member),
) -> MeResponse:
    account = await session.get(MemberPortalAccount, current_member.id)
    if account is None or account.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account unavailable")
    return MeResponse(
        email=account.email,
        member_key=account.member_key,
        status=account.status,
        mfa_enrolled=account.mfa_enrolled_at is not None,
        email_verified=account.email_verified_at is not None,
    )


# --------------------------------------------------------------------------- #
# Password reset & change
# --------------------------------------------------------------------------- #


@router.post("/password-reset/request", status_code=status.HTTP_204_NO_CONTENT)
async def password_reset_request(
    payload: PasswordResetRequest,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    _rl: None = Depends(auth_rate_limit),
) -> None:
    # Always 204, whether or not the account exists (no enumeration).
    account = await session.scalar(
        select(MemberPortalAccount).where(
            MemberPortalAccount.tenant_id == tenant.id,
            MemberPortalAccount.email == payload.email,
            MemberPortalAccount.status == "active",
        )
    )
    if account is None:
        return None

    raw_token = secrets.token_urlsafe(32)
    session.add(
        MemberPasswordResetToken(
            tenant_id=tenant.id,
            account_id=account.id,
            token_hash=_hash_token(raw_token),
            expires_at=datetime.now(timezone.utc)
            + timedelta(minutes=settings.MEMBER_PASSWORD_RESET_TTL_MINUTES),
            requested_ip=client_ip(request),
        )
    )
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=account.email,
        event_type="member.password_reset.requested",
        payload={"tenant": tenant.key, "ip": client_ip(request)},
    )
    await session.commit()

    base = (settings.MEMBER_PORTAL_BASE_URL or "").rstrip("/")
    link = f"{base}/reset-password?token={raw_token}" if base else f"token={raw_token}"
    body = (
        "We received a request to reset your member portal password.\n\n"
        f"{link}\n\n"
        f"This link expires in {settings.MEMBER_PASSWORD_RESET_TTL_MINUTES} minutes. "
        "If you did not request this, you can ignore this message."
    )
    try:
        await send_email(to=account.email, subject="Reset your member portal password", body=body)
    except Exception:  # noqa: BLE001
        logger.exception("member password-reset email failed for tenant=%s", tenant.key)
    return None


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def password_reset_confirm(
    payload: PasswordResetConfirm,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    _rl: None = Depends(auth_rate_limit),
) -> None:
    record = await session.scalar(
        select(MemberPasswordResetToken).where(
            MemberPasswordResetToken.token_hash == _hash_token(payload.token),
            MemberPasswordResetToken.tenant_id == tenant.id,
        )
    )
    now = datetime.now(timezone.utc)
    expires_at = _aware(record.expires_at) if record else now
    if not record or record.used_at is not None or expires_at < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    account = await session.get(MemberPortalAccount, record.account_id)
    if account is None or account.tenant_id != tenant.id or account.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    account.password_hash = await hash_password(payload.new_password)
    record.used_at = now
    # Invalidate every existing session on a password reset.
    await revoke_member_refresh_tokens(session, tenant_id=tenant.id, account_id=account.id)
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=account.email,
        event_type="member.password_reset.completed",
        payload={"tenant": tenant.key, "ip": client_ip(request)},
    )
    await session.commit()
    return None


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_member: AuthenticatedMember = Depends(get_current_member),
) -> None:
    account = await session.get(MemberPortalAccount, current_member.id)
    if account is None or account.tenant_id != tenant.id or account.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account unavailable")
    if not await verify_password(payload.old_password, account.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if payload.old_password == payload.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must differ from current")

    account.password_hash = await hash_password(payload.new_password)
    await revoke_member_refresh_tokens(session, tenant_id=tenant.id, account_id=account.id)
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=account.email,
        event_type="member.password_change.completed",
        payload={"tenant": tenant.key, "ip": client_ip(request)},
    )
    await session.commit()
    return None


# --------------------------------------------------------------------------- #
# MFA (TOTP)
# --------------------------------------------------------------------------- #


@router.post("/mfa/enroll", response_model=MfaEnrollResponse)
async def mfa_enroll(
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_member: AuthenticatedMember = Depends(get_current_member),
) -> MfaEnrollResponse:
    account = await session.get(MemberPortalAccount, current_member.id)
    if account is None or account.tenant_id != tenant.id or account.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account unavailable")
    secret = pyotp.random_base32()
    account.mfa_secret = secret
    account.mfa_enrolled_at = None  # only verification locks it in
    await session.commit()
    return MfaEnrollResponse(
        otpauth_url=_otpauth_url(secret, account.email, tenant.key),
        secret=secret,
    )


@router.post("/mfa/verify", status_code=status.HTTP_204_NO_CONTENT)
async def mfa_verify(
    payload: MfaVerifyRequest,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_member: AuthenticatedMember = Depends(get_current_member),
) -> None:
    account = await session.get(MemberPortalAccount, current_member.id)
    if account is None or account.tenant_id != tenant.id or not account.mfa_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA enrollment not started")
    if not verify_totp(account.mfa_secret, payload.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid MFA code")
    account.mfa_enrolled_at = datetime.now(timezone.utc)
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=account.email,
        event_type="member.mfa.enrolled",
        payload={"tenant": tenant.key, "ip": client_ip(request)},
    )
    await session.commit()
    return None


@router.post("/mfa/disable", status_code=status.HTTP_204_NO_CONTENT)
async def mfa_disable(
    payload: MfaDisableRequest,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_member: AuthenticatedMember = Depends(get_current_member),
) -> None:
    account = await session.get(MemberPortalAccount, current_member.id)
    if account is None or account.tenant_id != tenant.id or not account.mfa_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA is not enabled")
    if not await verify_password(payload.password, account.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password is incorrect")
    if not verify_totp(account.mfa_secret, payload.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid MFA code")
    account.mfa_secret = None
    account.mfa_enrolled_at = None
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=account.email,
        event_type="member.mfa.disabled",
        payload={"tenant": tenant.key, "ip": client_ip(request)},
    )
    await session.commit()
    return None
