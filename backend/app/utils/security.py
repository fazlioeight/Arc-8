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
from ..models.tables import User

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
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
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

