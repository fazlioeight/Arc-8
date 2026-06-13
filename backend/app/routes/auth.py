"""Self-serve account endpoints: password reset request/confirm + change-password."""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import quote

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
from ..models.tables import PasswordResetToken, User
from ..schemas.types import NormalizedEmail
from ..utils.audit_logger import record_audit_event
from ..utils.auth_throttle import client_ip
from ..utils.security import AuthenticatedUser, get_current_user, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)

PASSWORD_RESET_TTL_MINUTES = 60


class PasswordResetRequest(BaseModel):
    email: NormalizedEmail


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=20)
    new_password: str = Field(min_length=12)


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(min_length=12)


class MfaEnrollResponse(BaseModel):
    otpauth_url: str
    secret: str


class MfaVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=8)


class MfaDisableRequest(BaseModel):
    password: str
    code: str = Field(min_length=6, max_length=8)


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@router.post("/password-reset/request", status_code=status.HTTP_204_NO_CONTENT)
async def password_reset_request(
    payload: PasswordResetRequest,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    _rl: None = Depends(auth_rate_limit),
) -> None:
    # Always respond 204 regardless of whether the user exists; this prevents
    # account enumeration via the reset endpoint.
    user = await session.scalar(
        select(User).where(User.email == payload.email, User.tenant_id == tenant.id)
    )
    if not user or not user.is_active:
        logger.info(
            "password_reset_request: no active user; tenant=%s email=%s",
            tenant.key,
            payload.email,
        )
        return None

    raw_token = secrets.token_urlsafe(32)
    record = PasswordResetToken(
        tenant_id=tenant.id,
        user_id=user.id,
        token_hash=_hash_token(raw_token),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=PASSWORD_RESET_TTL_MINUTES),
        requested_ip=client_ip(request),
    )
    session.add(record)
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=user.email,
        event_type="password_reset.requested",
        payload={
            "tenant": tenant.key,
            "ip": client_ip(request),
            "ttl_minutes": PASSWORD_RESET_TTL_MINUTES,
        },
    )
    await session.commit()

    # Email integration deliberately stubbed: production deploys will need a
    # BAA-eligible sender (Azure Communication Services / SendGrid + BAA).
    # Until then this token must be fetched out-of-band by an operator.
    if settings.is_production:
        logger.info("password_reset_request: token issued for user_id=%s (do NOT log token in production)", user.id)
    else:
        logger.warning(
            "password_reset_request DEV: tenant=%s email=%s token=%s expires_at=%s",
            tenant.key,
            user.email,
            raw_token,
            record.expires_at.isoformat(),
        )
    return None


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def password_reset_confirm(
    payload: PasswordResetConfirm,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    _rl: None = Depends(auth_rate_limit),
) -> None:
    token_hash = _hash_token(payload.token)
    record: Optional[PasswordResetToken] = await session.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.tenant_id == tenant.id,
        )
    )
    now = datetime.now(timezone.utc)
    # SQLite strips tzinfo even on DateTime(timezone=True) columns; coerce.
    expires_at = record.expires_at if record else now
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if not record or record.used_at is not None or expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired token",
        )

    user = await session.get(User, record.user_id)
    if not user or user.tenant_id != tenant.id or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    user.password_hash = await hash_password(payload.new_password)
    user.must_change_password = False
    record.used_at = now

    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=user.email,
        event_type="password_reset.completed",
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
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    user = await session.get(User, current_user.id)
    if not user or user.tenant_id != tenant.id or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User unavailable")
    if not await verify_password(payload.old_password, user.password_hash):
        await record_audit_event(
            session,
            tenant_id=tenant.id,
            actor=user.email,
            event_type="password_change.failed",
            payload={"tenant": tenant.key, "ip": client_ip(request), "reason": "bad_old_password"},
        )
        await session.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if payload.old_password == payload.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must differ from current")

    user.password_hash = await hash_password(payload.new_password)
    user.must_change_password = False
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=user.email,
        event_type="password_change.completed",
        payload={"tenant": tenant.key, "ip": client_ip(request)},
    )
    await session.commit()
    return None


def _otpauth_url(secret: str, email: str, tenant_key: str) -> str:
    label = quote(f"{settings.MFA_ISSUER}:{tenant_key}:{email}", safe="")
    issuer = quote(settings.MFA_ISSUER, safe="")
    return f"otpauth://totp/{label}?secret={secret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30"


def verify_totp(secret: str, code: str) -> bool:
    """One-step tolerance for clock skew (±30s)."""
    if not secret or not code:
        return False
    try:
        return pyotp.TOTP(secret).verify(code.strip(), valid_window=1)
    except Exception:
        return False


@router.post("/mfa/enroll", response_model=MfaEnrollResponse)
async def mfa_enroll(
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> MfaEnrollResponse:
    user = await session.get(User, current_user.id)
    if not user or user.tenant_id != tenant.id or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User unavailable")

    # Re-issue the secret on every enroll call; only persisted mfa_enrolled_at
    # locks it in. This lets a user restart enrollment if they lose the QR.
    new_secret = pyotp.random_base32()
    user.mfa_secret = new_secret
    user.mfa_enrolled_at = None
    await session.commit()
    return MfaEnrollResponse(
        otpauth_url=_otpauth_url(new_secret, user.email, tenant.key),
        secret=new_secret,
    )


@router.post("/mfa/verify", status_code=status.HTTP_204_NO_CONTENT)
async def mfa_verify(
    payload: MfaVerifyRequest,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    user = await session.get(User, current_user.id)
    if not user or user.tenant_id != tenant.id or not user.mfa_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA enrollment not started")
    if not verify_totp(user.mfa_secret, payload.code):
        await record_audit_event(
            session,
            tenant_id=tenant.id,
            actor=user.email,
            event_type="mfa.verify_failed",
            payload={"tenant": tenant.key, "ip": client_ip(request)},
        )
        await session.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid MFA code")
    user.mfa_enrolled_at = datetime.now(timezone.utc)
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=user.email,
        event_type="mfa.enrolled",
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
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    user = await session.get(User, current_user.id)
    if not user or user.tenant_id != tenant.id or not user.mfa_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA is not enabled")
    if not await verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password is incorrect")
    if not verify_totp(user.mfa_secret, payload.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid MFA code")

    if settings.REQUIRE_ADMIN_MFA and (user.role or "user") in {"admin", "platform_admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="MFA is required for admin accounts and cannot be disabled while REQUIRE_ADMIN_MFA is on",
        )

    user.mfa_secret = None
    user.mfa_enrolled_at = None
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=user.email,
        event_type="mfa.disabled",
        payload={"tenant": tenant.key, "ip": client_ip(request)},
    )
    await session.commit()
    return None
