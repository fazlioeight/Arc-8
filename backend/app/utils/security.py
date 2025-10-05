from __future__ import annotations

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
from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context
from ..models.tables import User


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


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.JWT_EXPIRES_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc


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
    if not sub or tenant_key is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    if tenant_key != tenant.key:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")

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

    app_permissions = dict(user.app_permissions or {})

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
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return current_user

