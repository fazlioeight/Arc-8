"""HTTP rate limiting: global per-IP middleware + per-route dependencies.

Three tiers, per the security spec:

  * **Global** — 100 req/min per client IP across every route. Enforced by
    :class:`RateLimitMiddleware` (pure ASGI so it doesn't buffer SSE).
  * **Auth** — 5 req/min per client IP on login / password-reset. Enforced by
    the :func:`auth_rate_limit` dependency. Complements the existing
    per-account lockout (:mod:`app.utils.auth_throttle`).
  * **PHI** — 30 req/min per *authenticated user* on PHI routes. Enforced by
    the :func:`phi_rate_limit` dependency.

All three share one fixed-window counter implementation. When ``REDIS_URL`` is
configured the counters live in Redis (correct across replicas); otherwise a
per-process in-memory map is used (fine for dev/test). The backing store fails
**open** — a Redis error never blocks a request — matching the platform's
existing throttle behaviour.

Every breach returns **429** with a ``Retry-After`` header.
"""
from __future__ import annotations

import time
from collections import defaultdict
from typing import Awaitable, Callable, Deque, Dict, Tuple
from collections import deque

from fastapi import Depends, HTTPException, Request, status
from starlette.types import ASGIApp, Receive, Scope, Send

from ..core.config import settings
from ..core.redis import get_redis_client

# Per-process fallback store: key -> deque of request timestamps (monotonic).
_MEMORY_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)

# Paths that must never be rate limited (liveness/readiness probes, root).
_EXEMPT_PATHS = frozenset({"/", "/health/live", "/health/ready"})


def _client_ip(scope_or_request) -> str:
    headers = scope_or_request.headers
    forwarded = headers.get("x-forwarded-for") if hasattr(headers, "get") else None
    if forwarded:
        return forwarded.split(",")[0].strip()
    client = getattr(scope_or_request, "client", None)
    if client:
        return client[0] if isinstance(client, (tuple, list)) else getattr(client, "host", "") or "unknown"
    return "unknown"


def _memory_check(key: str, limit: int, window_seconds: int) -> Tuple[bool, int]:
    now = time.monotonic()
    cutoff = now - window_seconds
    bucket = _MEMORY_BUCKETS[key]
    while bucket and bucket[0] <= cutoff:
        bucket.popleft()
    if len(bucket) >= limit:
        retry_after = int(window_seconds - (now - bucket[0])) + 1
        return False, max(1, retry_after)
    bucket.append(now)
    return True, 0


async def _redis_check(redis, key: str, limit: int, window_seconds: int) -> Tuple[bool, int]:
    # Fixed-window counter keyed by the current window bucket. INCR is atomic;
    # the first hit in a window sets the TTL so the key self-expires.
    bucket = int(time.time() // window_seconds)
    redis_key = f"nexora:rl:{key}:{bucket}"
    try:
        count = await redis.incr(redis_key)
        if count == 1:
            await redis.expire(redis_key, window_seconds)
    except Exception:  # noqa: BLE001 — fail open, never block on a store error
        return True, 0
    if count > limit:
        retry_after = window_seconds - int(time.time() % window_seconds)
        return False, max(1, retry_after)
    return True, 0


async def check_rate_limit(
    scope_key: str, identifier: str, limit: int, window_seconds: int = 60
) -> Tuple[bool, int]:
    """Return ``(allowed, retry_after_seconds)`` for one logical request.

    ``scope_key`` namespaces the counter (``global`` / ``auth`` / ``phi``);
    ``identifier`` is the IP or user the limit applies to.
    """
    if not settings.RATE_LIMIT_ENABLED or limit <= 0:
        return True, 0
    key = f"{scope_key}:{identifier}"
    redis = get_redis_client()
    if redis is not None:
        return await _redis_check(redis, key, limit, window_seconds)
    return _memory_check(key, limit, window_seconds)


def _too_many(retry_after: int, detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=detail,
        headers={"Retry-After": str(max(1, retry_after))},
    )


# ── Global middleware ────────────────────────────────────────────────────────


class RateLimitMiddleware:
    """Pure-ASGI global per-IP limiter (default 100/min)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not settings.RATE_LIMIT_ENABLED:
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path in _EXEMPT_PATHS:
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive=receive)
        ip = _client_ip(request)
        allowed, retry_after = await check_rate_limit(
            "global", ip, settings.GLOBAL_RATE_LIMIT_PER_MINUTE, 60
        )
        if allowed:
            await self.app(scope, receive, send)
            return

        await self._send_429(send, retry_after)

    @staticmethod
    async def _send_429(send: Send, retry_after: int) -> None:
        body = b'{"detail":"Rate limit exceeded"}'
        await send(
            {
                "type": "http.response.start",
                "status": status.HTTP_429_TOO_MANY_REQUESTS,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"retry-after", str(max(1, retry_after)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})


# ── Per-route dependencies ─────────────────────────────────────────────────


async def auth_rate_limit(request: Request) -> None:
    """5 req/min per client IP. Attach to login / password-reset routes."""
    ip = _client_ip(request)
    allowed, retry_after = await check_rate_limit(
        "auth", ip, settings.AUTH_RATE_LIMIT_PER_MINUTE, 60
    )
    if not allowed:
        raise _too_many(retry_after, "Too many authentication attempts")


def phi_rate_limit() -> Callable[..., Awaitable[None]]:
    """Factory: 30 req/min per authenticated user. Attach to PHI routes.

    Imports ``get_current_user`` lazily to avoid a circular import (security ->
    rbac -> this module is not a cycle, but keeping it lazy is cheap insurance).
    """
    from ..utils.security import AuthenticatedUser, get_current_user

    async def _dependency(
        current_user: "AuthenticatedUser" = Depends(get_current_user),
    ) -> None:
        allowed, retry_after = await check_rate_limit(
            "phi", str(current_user.id) or current_user.email,
            settings.PHI_RATE_LIMIT_PER_MINUTE, 60,
        )
        if not allowed:
            raise _too_many(retry_after, "PHI rate limit exceeded")

    return _dependency


def member_phi_rate_limit() -> Callable[..., Awaitable[None]]:
    """Factory: 30 req/min per authenticated *member*. Attach to member-portal
    PHI routes. Same counter/limit as ``phi_rate_limit`` but keyed off the
    member account so the two realms don't share a budget."""
    from ..utils.member_auth import AuthenticatedMember, get_current_member

    async def _dependency(
        current_member: "AuthenticatedMember" = Depends(get_current_member),
    ) -> None:
        allowed, retry_after = await check_rate_limit(
            "phi-member", str(current_member.id) or current_member.email,
            settings.PHI_RATE_LIMIT_PER_MINUTE, 60,
        )
        if not allowed:
            raise _too_many(retry_after, "PHI rate limit exceeded")

    return _dependency
