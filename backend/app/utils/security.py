from __future__ import annotations

import logging
import secrets as _secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

import asyncio
import bcrypt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.redis import get_redis_client
from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context
from ..models.tables import StaffUser, User

_revocation_logger = logging.getLogger(__name__)
_REVOCATION_KEY_PREFIX = "nexora:jwt:revoked:"


async def hash_password(password: str) -> str:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _hash_password_sync, password)


async def verify_password(plain_password: str, password_hash: str) -> bool:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _verify_password_sync, plain_password, password_hash)


def _hash_password_sync(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def _verify_password_sync(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
    except ValueError:
        return False

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")


@dataclass(slots=True)
class AuthenticatedUser:
    id: int
    email: str
    tenant_id: int
    tenant_key: str
    role: str
    scopes: list[str]
    app_permissions: Dict[str, str]


_BASE_TENANT_APPS = {"portal", "admin_console", "settings", "chat"}


def tenant_application_keys(tenant: TenantContext) -> set[str]:
    purchased = {key for key, enabled in (tenant.purchased_applications or {}).items() if enabled}
    available = {key for key in _BASE_TENANT_APPS if key in settings.PORTAL_APPLICATIONS}
    for key in purchased:
        if key in settings.PORTAL_APPLICATIONS:
            available.add(key)
    return available


def filter_application_permissions(app_permissions: Dict[str, str] | None, tenant: TenantContext) -> Dict[str, str]:
    allowed = tenant_application_keys(tenant)
    filtered: Dict[str, str] = {}
    for key, level in (app_permissions or {}).items():
        if key not in allowed:
            continue
        if level not in {"admin", "manager", "user"}:
            continue
        if key == "admin_console" and level != "admin":
            continue
        filtered[key] = level
    if "portal" in settings.PORTAL_APPLICATIONS and "portal" not in filtered:
        filtered["portal"] = "user"
    return filtered


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.JWT_EXPIRES_MINUTES))
    to_encode.setdefault("jti", _secrets.token_urlsafe(16))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        # Algorithm list is intentionally not driven by settings: an attacker
        # who can flip JWT_ALGORITHM to "none" or to an asymmetric alg (RS256)
        # could forge tokens or trick the verifier into treating a public key
        # as the HMAC secret. We always issue HS256 (create_access_token), so
        # we always require HS256 on decode.
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc


async def revoke_jti(jti: str, ttl_seconds: int) -> bool:
    """Add a JWT jti to the revocation blacklist. Returns True if persisted."""
    if not jti or ttl_seconds <= 0:
        return False
    redis = get_redis_client()
    if not redis:
        _revocation_logger.warning("revoke_jti: Redis not configured; jti %s not blacklisted", jti)
        return False
    try:
        await redis.set(f"{_REVOCATION_KEY_PREFIX}{jti}", "1", ex=ttl_seconds)
        return True
    except Exception:
        _revocation_logger.exception("revoke_jti: Redis set failed for jti %s", jti)
        return False


async def is_jti_revoked(jti: Optional[str]) -> bool:
    """Check the revocation blacklist. Fails open (returns False) if Redis is down."""
    if not jti:
        return False
    redis = get_redis_client()
    if not redis:
        return False
    try:
        value = await redis.get(f"{_REVOCATION_KEY_PREFIX}{jti}")
        return bool(value)
    except Exception:
        _revocation_logger.exception("is_jti_revoked: Redis get failed for jti %s", jti)
        return False


async def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
) -> AuthenticatedUser:
    payload = decode_token(token)
    sub = payload.get("sub")
    tenant_key = payload.get("tid")
    user_id = payload.get("uid")
    role = payload.get("role") or "user"
    scopes = payload.get("scp", [])
    jti = payload.get("jti")
    if not sub or tenant_key is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    if tenant_key != tenant.key:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    if await is_jti_revoked(jti):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")

    # Nexora staff impersonation token: the actor is a row in `staff_users`,
    # not in `users`. We don't materialize a shadow user inside the tenant DB
    # — instead we synthesize an AuthenticatedUser with platform_admin role
    # and full application access for the target tenant. All existing
    # /api/admin/* routes operate on it exactly like a real platform_admin.
    if payload.get("act_typ") == "staff":
        staff_id = payload.get("act_sid")
        if not staff_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid staff impersonation token")
        staff = await session.scalar(
            select(StaffUser)
            .where(StaffUser.id == staff_id, StaffUser.is_active.is_(True))
            .limit(1)
        )
        if not staff or staff.email != sub:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Staff identity mismatch")
        available = sorted(tenant_application_keys(tenant))
        app_permissions = {key: "admin" for key in available}
        request.state.user_email = staff.email
        request.state.staff_actor_id = staff.id
        return AuthenticatedUser(
            id=0,  # virtual: no row in tenant `users` table
            email=staff.email,
            tenant_id=tenant.id,
            tenant_key=tenant.key,
            role="platform_admin",
            scopes=available,
            app_permissions=app_permissions,
        )

    if not user_id:
        stmt = select(User).where(User.email == sub, User.tenant_id == tenant.id)
    else:
        stmt = select(User).where(User.id == user_id, User.tenant_id == tenant.id)
    stmt = stmt.where(User.is_active.is_(True)).limit(1)
    user = await session.scalar(stmt)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    if user.email != sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User identity mismatch")

    raw_permissions = dict(user.app_permissions or {})
    app_permissions = filter_application_permissions(raw_permissions, tenant)

    request.state.user_email = user.email
    return AuthenticatedUser(
        id=user.id,
        email=user.email,
        tenant_id=user.tenant_id,
        tenant_key=tenant.key,
        role=role,
        scopes=scopes if isinstance(scopes, list) else [str(scopes)],
        app_permissions=app_permissions,
    )


# ---------------------------------------------------------------------------
# Nexora platform staff authentication
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class AuthenticatedStaff:
    id: int
    email: str
    name: str | None
    is_superuser: bool
    mfa_enrolled: bool
    must_change_password: bool


staff_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/staff/login", auto_error=True)


def create_staff_token(staff: StaffUser, expires_delta: Optional[timedelta] = None) -> str:
    """Issue an identity-only staff JWT. Not bound to any tenant."""
    return create_access_token(
        {
            "sub": staff.email,
            "sid": staff.id,
            "typ": "staff",
        },
        expires_delta=expires_delta or timedelta(minutes=settings.JWT_EXPIRES_MINUTES),
    )


def create_staff_impersonation_token(
    staff: StaffUser,
    tenant: TenantContext,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Issue a tenant-scoped JWT that grants `staff` platform_admin access to `tenant`.

    Carries `act_typ=staff` so `get_current_user` can route to the virtual-user
    code path. The `sub` field is the staff email so audit log `actor` rows
    show the real human, not a fabricated tenant user.
    """
    # Impersonation tokens are short-lived — staff can re-enter the tenant
    # at will from the staff console.
    ttl = expires_delta or timedelta(minutes=min(settings.JWT_EXPIRES_MINUTES, 60))
    return create_access_token(
        {
            "sub": staff.email,
            "tid": tenant.key,
            "role": "platform_admin",
            "act_typ": "staff",
            "act_sid": staff.id,
        },
        expires_delta=ttl,
    )


async def get_current_staff(
    request: Request,
    token: str = Depends(staff_oauth2_scheme),
    session: AsyncSession = Depends(get_control_session),
) -> AuthenticatedStaff:
    payload = decode_token(token)
    if payload.get("typ") != "staff":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not a staff token")
    staff_id = payload.get("sid")
    sub = payload.get("sub")
    jti = payload.get("jti")
    if not staff_id or not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    if await is_jti_revoked(jti):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")
    staff = await session.scalar(
        select(StaffUser).where(StaffUser.id == staff_id, StaffUser.is_active.is_(True)).limit(1)
    )
    if not staff or staff.email != sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Staff not found or inactive")
    request.state.staff_email = staff.email
    return AuthenticatedStaff(
        id=staff.id,
        email=staff.email,
        name=staff.name,
        is_superuser=bool(staff.is_superuser),
        mfa_enrolled=staff.mfa_enrolled_at is not None,
        must_change_password=bool(staff.must_change_password),
    )

async def require_admin(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> AuthenticatedUser:
    if current_user.role not in {"admin", "platform_admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return current_user


async def require_platform_admin(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> AuthenticatedUser:
    if current_user.role != "platform_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform admin privileges required")
    return current_user


def require_application(app_key: str, required_level: str = "user"):
    async def _dependency(
        tenant: TenantContext = Depends(get_tenant_context),
        current_user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        available = tenant_application_keys(tenant)
        if app_key not in available:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Application not enabled for this tenant")
        level = current_user.app_permissions.get(app_key)
        if not level:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User does not have access to this application")
        if required_level == "admin" and level != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
        return current_user

    return _dependency

