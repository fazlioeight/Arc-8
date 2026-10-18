from __future__ import annotations

from typing import Optional

from sqlalchemy.exc import NoResultFound
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp

from ..core.config import settings
from ..db.session import control_session
from ..services.tenant_registry import tenant_registry


class TenantMiddleware(BaseHTTPMiddleware):
    """Resolve tenant context securely from allowed hosts or headers."""

    def __init__(
        self,
        app: ASGIApp,
        default_tenant: Optional[str] = None,
        require_known_tenant: bool = True,
    ) -> None:
        super().__init__(app)
        self.default_tenant = default_tenant
        self.require_known_tenant = require_known_tenant

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        # Health checks and signed-URL artifact downloads bypass tenant
        # resolution. Artifact endpoints carry a JWT token in the query
        # string that already binds the request to (tenant, user, artifact);
        # they're invoked directly by the browser via <img> / anchor click,
        # so no X-Tenant-Key header is attached and the middleware would
        # otherwise 404 every download.
        # /api/staff/* is the Nexora platform-staff surface — its identity
        # tokens are not tenant-bound, and the impersonate route resolves the
        # tenant itself via path param + tenant_registry.
        # /api/contact is the public marketing contact form — unauthenticated
        # visitors carry no tenant header, and a lead is global, not
        # tenant-scoped, so it must not 404 on tenant resolution.
        if (
            path.startswith("/health/")
            or path.startswith("/api/chat/artifacts/")
            or path.startswith("/api/staff/")
            or path == "/api/contact"
        ):
            request.state.tenant = None
            request.state.tenant_key = None
            return await call_next(request)

        tenant_header = request.headers.get("x-tenant-key") or request.headers.get("x-tenant")
        host = request.headers.get("host")
        tenant_key = tenant_header or self.default_tenant

        async with control_session() as session:
            try:
                tenant_context = await tenant_registry.resolve(
                    tenant_key=tenant_key,
                    host=host,
                    session=session,
                )
            except NoResultFound:
                if self.require_known_tenant or settings.HIPAA_MODE:
                    # Return a Response rather than raising. Raising HTTPException
                    # from BaseHTTPMiddleware bubbles to uvicorn as a bare 500
                    # without CORS headers, which the browser surfaces as
                    # "Failed to fetch" on the frontend.
                    return JSONResponse(
                        {"detail": "Unknown tenant"}, status_code=404
                    )
                tenant_context = None

        request.state.tenant = tenant_context
        request.state.tenant_key = tenant_context.key if tenant_context else None

        response = await call_next(request)
        return response
