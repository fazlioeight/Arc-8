from __future__ import annotations

from functools import lru_cache
from typing import Optional

try:
    from redis.asyncio import Redis
except ImportError:  # pragma: no cover
    Redis = None  # type: ignore

from .config import settings


@lru_cache(maxsize=1)
def get_redis_client() -> Optional["Redis"]:
    if not settings.redis_enabled or Redis is None:
        return None
    return Redis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)
