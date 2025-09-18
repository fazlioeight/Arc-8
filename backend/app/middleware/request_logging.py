from __future__ import annotations

import logging
import time
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.types import ASGIApp

logger = logging.getLogger("request")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Structured request logging with tenant context."""

    async def dispatch(self, request: Request, call_next):
        start = time.time()
        tenant = getattr(request.state, "tenant", None)
        authenticated_user = getattr(request.state, "user_email", None)
        response = await call_next(request)
        duration_ms = (time.time() - start) * 1000
        logger.info(
            {
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round(duration_ms, 2),
                "tenant": getattr(tenant, "key", None),
                "user": authenticated_user,
            }
        )
        return response
