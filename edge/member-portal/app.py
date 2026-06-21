"""Member-portal edge (BFF reverse proxy) — internet-facing tier.

This is the public face of the member portal. It runs as its own Azure Container
App behind Front Door + WAF and forwards member-API traffic to the INTERNAL
backend over the Container Apps environment's private network.

Trust-boundary guarantees (by construction):
  * It holds NO database credentials and never imports the backend's data layer.
  * It holds NO JWT signing key (``SECRET_KEY``) or field-encryption key — the
    internal backend validates member tokens; the edge only forwards the
    Authorization header.
  * It will ONLY proxy paths under ``ALLOWED_PATH_PREFIX`` (``/api/member/``).
    Every other path is refused with a generic 404, so the staff API surface is
    unreachable through this tier even though it lives in the same backend.

Configuration (env only — no secrets):
  * MEMBER_BACKEND_INTERNAL_URL  — backend base URL inside the ACA environment
                                   (e.g. https://nexora-chat-v2.internal.<env>.azurecontainerapps.io)
  * ALLOWED_PATH_PREFIX          — default ``/api/member/``
  * PROXY_TIMEOUT_SECONDS        — default 30
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

import httpx
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

BACKEND_URL = os.environ.get("MEMBER_BACKEND_INTERNAL_URL", "").rstrip("/")
ALLOWED_PREFIX = os.environ.get("ALLOWED_PATH_PREFIX", "/api/member/")
TIMEOUT = float(os.environ.get("PROXY_TIMEOUT_SECONDS", "30"))
# When set (to the Front Door profile's frontDoorId), the edge rejects any
# request that doesn't carry the matching X-Azure-FDID header — i.e. only this
# Front Door (and its WAF) can reach the edge, not its raw ingress FQDN. Left
# unset in dev/test so local runs aren't blocked.
EXPECTED_FRONT_DOOR_ID = os.environ.get("EXPECTED_FRONT_DOOR_ID", "").strip()
# Shared secret presented to the backend as X-Edge-Auth so the backend can
# refuse member requests that didn't come through this edge. This is the ONLY
# secret the edge holds — a narrow edge->backend authorizer, never a DB cred or
# signing key.
EDGE_AUTH_SECRET = os.environ.get("MEMBER_EDGE_SHARED_SECRET", "").strip()

# Hop-by-hop headers must not be forwarded (RFC 7230 §6.1). Host is dropped so
# httpx sets it from the backend URL.
_HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
    # Never let a client smuggle the edge->backend authorizer; the edge sets it.
    "x-edge-auth",
}

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
}

# Reused across requests; created on startup so connections pool to the backend.
_client: httpx.AsyncClient | None = None


@asynccontextmanager
async def lifespan(_app):
    global _client
    if BACKEND_URL:
        _client = httpx.AsyncClient(base_url=BACKEND_URL, timeout=TIMEOUT)
    try:
        yield
    finally:
        if _client is not None:
            await _client.aclose()


async def health_live(_request: Request) -> JSONResponse:
    return JSONResponse({"status": "ok"})


async def health_ready(_request: Request) -> JSONResponse:
    # Ready only when the backend URL is configured; deliberately does NOT call
    # the backend on every probe (avoids cascading readiness flaps).
    if not BACKEND_URL or _client is None:
        return JSONResponse({"status": "not_configured"}, status_code=503)
    return JSONResponse({"status": "ready"})


def _filter_request_headers(request: Request) -> dict:
    headers = {k: v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP}
    # Preserve the real client IP so the backend's lockout / rate-limit / PHI
    # audit see the originating address (Front Door populates X-Forwarded-For).
    # Stamp the edge->backend authorizer so the backend accepts the request.
    if EDGE_AUTH_SECRET:
        headers["X-Edge-Auth"] = EDGE_AUTH_SECRET
    return headers


def _filter_response_headers(resp: httpx.Response) -> dict:
    headers = {k: v for k, v in resp.headers.items() if k.lower() not in _HOP_BY_HOP}
    headers.update(_SECURITY_HEADERS)
    return headers


async def proxy(request: Request) -> Response:
    # Origin lock: when configured, only accept traffic proxied by our Front Door.
    if EXPECTED_FRONT_DOOR_ID:
        if request.headers.get("x-azure-fdid", "") != EXPECTED_FRONT_DOOR_ID:
            return JSONResponse({"detail": "Not found"}, status_code=404)

    path = request.url.path
    # Path allowlist: only the member API is reachable through the edge.
    if not path.startswith(ALLOWED_PREFIX):
        return JSONResponse({"detail": "Not found"}, status_code=404)
    if _client is None:
        return JSONResponse({"detail": "Edge not configured"}, status_code=503)

    body = await request.body()
    target = path
    if request.url.query:
        target = f"{path}?{request.url.query}"

    try:
        upstream = await _client.request(
            request.method,
            target,
            headers=_filter_request_headers(request),
            content=body,
        )
    except httpx.RequestError:
        # Never leak backend internals; generic 502.
        return JSONResponse({"detail": "Upstream unavailable"}, status_code=502)

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=_filter_response_headers(upstream),
        media_type=upstream.headers.get("content-type"),
    )


routes = [
    Route("/health/live", health_live, methods=["GET"]),
    Route("/health/ready", health_ready, methods=["GET"]),
    Route(
        "/{path:path}",
        proxy,
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    ),
]

app = Starlette(routes=routes, lifespan=lifespan)
