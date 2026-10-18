from __future__ import annotations

from typing import Awaitable, Callable, Iterable, Tuple

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from ..core.config import settings

Sender = Callable[[Message], Awaitable[None]]
HeaderPair = Tuple[bytes, bytes]


# Backend is JSON-only; the SPA is served from Static Web Apps with its own CSP.
# We lock everything off here so any unexpected HTML response (e.g. an FastAPI
# error page) can't run inline scripts or be framed.
_BASE_HEADERS: Tuple[HeaderPair, ...] = (
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
    (
        b"content-security-policy",
        b"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    ),
    (
        b"permissions-policy",
        b"accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
    ),
)

_HSTS_HEADER: HeaderPair = (
    b"strict-transport-security",
    b"max-age=31536000; includeSubDomains",
)


class SecurityHeadersMiddleware:
    """Pure ASGI middleware so it doesn't buffer streaming responses (chat SSE)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._headers = _BASE_HEADERS + ((_HSTS_HEADER,) if settings.is_production else ())

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                existing = {k.lower() for k, _ in message.get("headers", [])}
                headers: list[HeaderPair] = list(message.get("headers", []))
                for name, value in self._headers:
                    if name not in existing:
                        headers.append((name, value))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_wrapper)
