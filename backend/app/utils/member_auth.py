"""Authentication primitives for the member-facing portal realm.

Kept deliberately separate from ``app.utils.security`` (the staff/internal
realm). Member access tokens carry ``typ="member"`` and an ``mid`` (member
portal account id) claim; ``get_current_member`` refuses any token lacking
``typ="member"`` so a staff token can never authenticate as a member and vice
versa, even though both realms share the same signing key and tenant context.

Reuses the staff realm's lower-level building blocks where the trust model
allows: bcrypt hashing, HS256 encode/decode, and the Redis ``jti`` revocation
list. Refresh-token rotation is reimplemented against ``member_refresh_tokens``
so the two realms never share token state.
"""
from __future__ import annotations

import hashlib
import secrets as _secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context
from ..models.member_portal import MemberPortalAccount, MemberRefreshToken
from .security import is_jti_revoked

MEMBER_TOKEN_TYPE = "member"


def _member_secret() -> str:
    """Signing key for the member JWT realm.

    Falls back to the staff ``SECRET_KEY`` when ``MEMBER_JWT_SECRET_KEY`` is not
    set, so deployments keep working until the dedicated key is provisioned.
    Once a distinct key is set, member and staff token signing are isolated: a
    leak of one realm's key cannot forge tokens for the other. Rotating to a new
    member key invalidates only in-flight member access tokens (≤15 min); the
    SPA silently re-mints via its opaque refresh token.
    """
    return settings.MEMBER_JWT_SECRET_KEY or settings.SECRET_KEY


def decode_member_token(token: str) -> dict:
    """Decode + verify a member access token with the member realm's key."""
    try:
        return jwt.decode(token, _member_secret(), algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

member_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/member/auth/login", auto_error=True)


@dataclass(slots=True)
class AuthenticatedMember:
    """Resolved identity for a member-portal request."""

    id: int  # member_portal_accounts.id
    email: str
    tenant_id: int
    tenant_key: str
    member_key: str
    mfa_authenticated: bool = False


def create_member_access_token(
    account: MemberPortalAccount,
    tenant: TenantContext,
    *,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Issue a short-lived member access token bound to one tenant + account.

    Signed with the member realm's own key (see ``_member_secret``); shares the
    15-minute default lifetime, a random ``jti`` and the HS256 algorithm pin,
    and stamps ``typ=member`` so the realms stay distinct.
    """
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRES_MINUTES)
    )
    payload = {
        "sub": account.email,
        "tid": tenant.key,
        "mid": account.id,
        "mbr": account.member_key,
        "typ": MEMBER_TOKEN_TYPE,
        "mfa": account.mfa_enrolled_at is not None,
        "jti": _secrets.token_urlsafe(16),
        "exp": expire,
    }
    return jwt.encode(payload, _member_secret(), algorithm="HS256")


async def get_current_member(
    request: Request,
    token: str = Depends(member_oauth2_scheme),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
) -> AuthenticatedMember:
    """Resolve and authorize the current member.

    Rejects (401/403) on: wrong realm (``typ != member``), tenant mismatch,
    revoked ``jti``, missing/inactive account, or an identity mismatch between
    the token ``sub`` and the stored email.
    """
    payload = decode_member_token(token)
    if payload.get("typ") != MEMBER_TOKEN_TYPE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not a member token")
    sub = payload.get("sub")
    tenant_key = payload.get("tid")
    account_id = payload.get("mid")
    jti = payload.get("jti")
    if not sub or tenant_key is None or not account_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    if tenant_key != tenant.key:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    if await is_jti_revoked(jti):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")

    account = await session.scalar(
        select(MemberPortalAccount)
        .where(
            MemberPortalAccount.id == account_id,
            MemberPortalAccount.tenant_id == tenant.id,
            MemberPortalAccount.status == "active",
        )
        .limit(1)
    )
    if not account or account.email != sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found or inactive")

    request.state.user_email = account.email
    request.state.member_account_id = account.id
    return AuthenticatedMember(
        id=account.id,
        email=account.email,
        tenant_id=account.tenant_id,
        tenant_key=tenant.key,
        member_key=account.member_key,
        mfa_authenticated=bool(payload.get("mfa", False)),
    )


# ---------------------------------------------------------------------------
# Member refresh-token rotation (mirrors app.utils.security, member realm)
# ---------------------------------------------------------------------------


def _hash_opaque(raw: str) -> str:
    return hashlib.sha256((raw or "").encode("utf-8")).hexdigest()


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


async def issue_member_refresh_token(
    session: AsyncSession,
    *,
    tenant_id: int,
    account_id: int,
    ip: Optional[str] = None,
    session_id: Optional[str] = None,
    max_expires_at: Optional[datetime] = None,
) -> str:
    now = datetime.now(timezone.utc)
    raw = _secrets.token_urlsafe(48)
    absolute = max_expires_at or (now + timedelta(minutes=settings.REFRESH_TOKEN_MAX_LIFETIME_MINUTES))
    idle_expiry = now + timedelta(minutes=settings.REFRESH_TOKEN_IDLE_MINUTES)
    expires_at = min(idle_expiry, absolute)
    record = MemberRefreshToken(
        tenant_id=tenant_id,
        account_id=account_id,
        session_id=session_id or uuid.uuid4().hex,
        token_hash=_hash_opaque(raw),
        expires_at=expires_at,
        max_expires_at=absolute,
        created_ip=ip,
    )
    session.add(record)
    await session.flush()
    return raw


async def rotate_member_refresh_token(
    session: AsyncSession,
    *,
    raw_token: str,
    tenant_id: int,
    ip: Optional[str] = None,
) -> Tuple[int, str]:
    """Validate, consume, and rotate a member refresh token.

    Returns ``(account_id, new_raw_token)``. Replaying a consumed/revoked token
    revokes the whole rotation chain (stolen-token defense).
    """
    record = await session.scalar(
        select(MemberRefreshToken)
        .where(
            MemberRefreshToken.token_hash == _hash_opaque(raw_token),
            MemberRefreshToken.tenant_id == tenant_id,
        )
        .limit(1)
    )
    invalid = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    if record is None:
        raise invalid

    now = datetime.now(timezone.utc)
    if record.revoked or record.used_at is not None:
        await session.execute(
            update(MemberRefreshToken)
            .where(MemberRefreshToken.session_id == record.session_id)
            .values(revoked=True)
        )
        await session.commit()
        raise invalid

    if _aware(record.expires_at) < now or _aware(record.max_expires_at) < now:
        raise invalid

    record.used_at = now
    new_raw = await issue_member_refresh_token(
        session,
        tenant_id=record.tenant_id,
        account_id=record.account_id,
        ip=ip,
        session_id=record.session_id,
        max_expires_at=_aware(record.max_expires_at),
    )
    return record.account_id, new_raw


async def revoke_member_refresh_tokens(session: AsyncSession, *, tenant_id: int, account_id: int) -> None:
    await session.execute(
        update(MemberRefreshToken)
        .where(
            MemberRefreshToken.tenant_id == tenant_id,
            MemberRefreshToken.account_id == account_id,
            MemberRefreshToken.revoked.is_(False),
        )
        .values(revoked=True)
    )
