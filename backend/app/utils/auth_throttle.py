from __future__ import annotations

import logging
from typing import Optional

from starlette.requests import Request

from ..core.config import settings
from ..core.redis import get_redis_client

logger = logging.getLogger(__name__)

_KEY_PREFIX = "nexora:login:fail:"


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return (request.client.host if request.client else "") or "unknown"


def _key(tenant_key: str, ip: str, email: str) -> str:
    return f"{_KEY_PREFIX}{tenant_key}:{ip}:{email}"


async def is_locked_out(tenant_key: str, ip: str, email: str) -> bool:
    redis = get_redis_client()
    if not redis:
        return False
    try:
        count = await redis.get(_key(tenant_key, ip, email))
    except Exception:
        logger.exception("auth-throttle Redis read failed; failing open")
        return False
    return bool(count) and int(count) >= settings.LOGIN_LOCKOUT_MAX_ATTEMPTS


async def record_failure(tenant_key: str, ip: str, email: str) -> Optional[int]:
    redis = get_redis_client()
    if not redis:
        return None
    key = _key(tenant_key, ip, email)
    try:
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, settings.LOGIN_LOCKOUT_WINDOW_SECONDS)
        return int(count)
    except Exception:
        logger.exception("auth-throttle Redis incr failed; failing open")
        return None


async def clear_failures(tenant_key: str, ip: str, email: str) -> None:
    redis = get_redis_client()
    if not redis:
        return
    try:
        await redis.delete(_key(tenant_key, ip, email))
    except Exception:
        logger.exception("auth-throttle Redis delete failed; ignoring")
