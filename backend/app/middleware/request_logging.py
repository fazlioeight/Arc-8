from __future__ import annotations

import logging
import re
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.types import ASGIApp

logger = logging.getLogger("request")

# Replace any segment that looks like an opaque identifier (long alphanumeric)
# or a pure number with `:id` so PHI-like member keys never land in logs.
_OPAQUE_SEGMENT = re.compile(r"/(\d+|[A-Za-z0-9_-]{16,})(?=/|$)")


def scrub_path(path: str) -> str:
    return _OPAQUE_SEGMENT.sub("/:id", path)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Structured request logging with tenant context. Path segments that
    look like member ids / opaque keys are redacted before logging."""

    async def dispatch(self, request: Request, call_next):
        start = time.time()
        tenant = getattr(request.state, "tenant", None)
        authenticated_user = getattr(request.state, "user_email", None)
        response = await call_next(request)
        duration_ms = (time.time() - start) * 1000
        logger.info(
            {
                "method": request.method,
                "path": scrub_path(request.url.path),
                "status": response.status_code,
                "duration_ms": round(duration_ms, 2),
                "tenant": getattr(tenant, "key", None),
                "user": authenticated_user,
            }
        )
        return response
