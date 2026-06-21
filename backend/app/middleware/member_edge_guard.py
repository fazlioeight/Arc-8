"""Lock the member API to the edge tier.

When ``MEMBER_EDGE_SHARED_SECRET`` is configured, every request under
``/api/member/`` must carry a matching ``X-Edge-Auth`` header — which only the
member edge (BFF) injects. Direct hits to the backend's public FQDN therefore
get a generic 404, so member routes are reachable **only** through the Front
Door + WAF + edge path, even though the code still lives in the shared backend.

Dormant by design: with no secret set (the default, and in tests), the
middleware is a pass-through. This lets the backend deploy first and the edge
start sending the header before enforcement is switched on by provisioning the
secret. ``OPTIONS`` is exempt so any CORS preflight still works.
"""
from __future__ import annotations

import hmac

from starlette.types import ASGIApp, Receive, Scope, Send

from ..core.config import settings

_PROTECTED_PREFIX = "/api/member/"
_NOT_FOUND = b'{"detail":"Not found"}'


class MemberEdgeGuardMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        secret = settings.MEMBER_EDGE_SHARED_SECRET
        # Enforcement is off until the secret is provisioned.
        if not secret:
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        method = scope.get("method", "GET")
        if method == "OPTIONS" or not path.startswith(_PROTECTED_PREFIX):
            await self.app(scope, receive, send)
            return

        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        presented = headers.get("x-edge-auth", "")
        if not hmac.compare_digest(presented, secret):
            await self._not_found(send)
            return

        await self.app(scope, receive, send)

    @staticmethod
    async def _not_found(send: Send) -> None:
        await send(
            {
                "type": "http.response.start",
                "status": 404,
                "headers": [(b"content-type", b"application/json")],
            }
        )
        await send({"type": "http.response.body", "body": _NOT_FOUND})
