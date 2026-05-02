from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy.exc import NoResultFound
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
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
        if request.url.path.startswith("/health/"):
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
                    raise HTTPException(status_code=404, detail="Unknown tenant")
                tenant_context = None

        request.state.tenant = tenant_context
        request.state.tenant_key = tenant_context.key if tenant_context else None

        response = await call_next(request)
        return response
