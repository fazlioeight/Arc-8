from datetime import date
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.types import ASGIApp
from sqlalchemy.orm import Session

from ..db.session import SessionLocal
from ..core.config import settings
from ..models.tables import Tenant
from ..models.usage import UsageCounter, ensure_tables


class UsageMiddleware(BaseHTTPMiddleware):
    """Simple per-tenant daily usage counter enforcing a soft limit on API calls."""

    def __init__(self, app: ASGIApp, limit_per_day: int | None = None):
        super().__init__(app)
        self.limit = limit_per_day if limit_per_day is not None else getattr(settings, "USAGE_DAILY_LIMIT", 10000)

    async def dispatch(self, request: Request, call_next):
        # Only count /api/* endpoints
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        db: Session = SessionLocal()
        try:
            ensure_tables(db)
            tenant_key = getattr(request.state, "tenant_id", None) or "demo"
            tenant = db.query(Tenant).filter(Tenant.key == tenant_key).first()
            if not tenant:
                # let it pass; endpoints may handle unknown tenant
                return await call_next(request)
            today = date.today()
            counter = (
                db.query(UsageCounter)
                .filter(UsageCounter.tenant_id == tenant.id, UsageCounter.date == today, UsageCounter.key == "api_calls")
                .first()
            )
            if not counter:
                counter = UsageCounter(tenant_id=tenant.id, date=today, key="api_calls", count=0)
                db.add(counter)
                db.flush()
            if counter.count >= self.limit:
                from fastapi import HTTPException

                raise HTTPException(status_code=429, detail="Daily API call limit reached")
            counter.count += 1
            db.commit()
        finally:
            db.close()

        return await call_next(request)

