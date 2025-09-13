from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from starlette.requests import Request


class TenantMiddleware(BaseHTTPMiddleware):
    """Resolve tenant from subdomain or X-Tenant header and attach to request.state."""

    def __init__(self, app: ASGIApp, default_tenant: str = "demo"):
        super().__init__(app)
        self.default_tenant = default_tenant

    async def dispatch(self, request: Request, call_next):
        tenant = None

        # Dev override header
        hdr_tenant = request.headers.get("x-tenant")
        if hdr_tenant:
            tenant = hdr_tenant.strip()

        # Subdomain extraction (e.g., tenant.localhost or tenant.example.com)
        if not tenant:
            host = request.headers.get("host", "")
            host = host.split(":")[0]  # strip port
            parts = host.split(".")
            if len(parts) > 2:  # foo.example.com
                tenant = parts[0]
            elif len(parts) == 1 and parts[0] not in ("localhost", "127", "127.0.0.1"):
                tenant = parts[0]

        request.state.tenant_id = tenant or self.default_tenant

        response = await call_next(request)
        return response

