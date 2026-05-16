from __future__ import annotations

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp

from ..core.config import settings
from ..core.redis import get_redis_client

logger = logging.getLogger(__name__)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-tenant sliding window rate limiter backed by Redis."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self.redis = get_redis_client()
        self.limit = settings.RATE_LIMIT_MAX_PER_MINUTE + settings.RATE_LIMIT_BURST
        self.window = settings.RATE_LIMIT_WINDOW_SECONDS

    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith("/api/") or not self.redis:
            return await call_next(request)

        tenant = getattr(request.state, "tenant", None)
        if not tenant:
            # Raising HTTPException from BaseHTTPMiddleware bubbles to uvicorn
            # as a bare 500 without CORS headers (see middleware/tenant.py).
            return JSONResponse({"detail": "Tenant context missing"}, status_code=400)

        key = f"{settings.RATE_LIMIT_STORAGE_KEY_PREFIX}{tenant.key}"

        try:
            count = await self.redis.incr(key)
            if count == 1:
                await self.redis.expire(key, self.window)
            ttl = await self.redis.ttl(key)
        except Exception:
            # Don't let a transient Redis failure 500 every API request.
            logger.exception("rate-limit Redis call failed; bypassing limiter for this request")
            return await call_next(request)

        if count > self.limit:
            return JSONResponse(
                {"detail": "Rate limit exceeded"},
                status_code=429,
                headers={
                    "X-RateLimit-Limit": str(self.limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(max(ttl, 0)),
                    "Retry-After": str(max(ttl, 1)),
                },
            )

        response = await call_next(request)
        remaining = max(self.limit - count, 0)
        response.headers["X-RateLimit-Limit"] = str(self.limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(max(ttl, 0))
        return response
