from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .core.config import settings
from .core.logging_config import setup_logging
from .dependencies.tenant import get_tenant_context
from .db.session import get_control_session
from .db.tenant_manager import TenantContext, tenant_connection_manager
from .middleware.rate_limit import RateLimitMiddleware
from .middleware.request_logging import RequestLoggingMiddleware
from .middleware.tenant import TenantMiddleware
from .models.tables import User
from .routes import admin as admin_router
from .routes import analytics as analytics_router
from .routes import coding as coding_router
from .routes import coding_dashboards as coding_dashboards_router
from .routes import member_cost as member_cost_router
from .routes import member_risk as member_risk_router
from .routes import utilization as utilization_router
from .utils.audit_logger import record_audit_event
from .utils.security import (
    AuthenticatedUser,
    create_access_token,
    filter_application_permissions,
    get_current_user,
    tenant_application_keys,
    verify_password,
)

setup_logging()



app = FastAPI(title="Nexora Analytics API", version="2.0.0")

app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(TenantMiddleware, default_tenant="prominencehealth", require_known_tenant=settings.HIPAA_MODE)

cors_origins = []
for origin in settings.CORS_ORIGINS:
    origin_str = str(origin).rstrip('/')
    cors_origins.append(origin_str)
    cors_origins.append(f"{origin_str}/")

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(set(cors_origins)),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_connections() -> None:
    await tenant_connection_manager.close_all()


class LoginRequest(BaseModel):
    email: str
    password: str
    tenant: str | None = None


@app.get("/")
async def read_root():
    return {"message": "Nexora Analytics Backend"}


@app.post("/api/login")
async def login(
    credentials: LoginRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
):
    if credentials.tenant and credentials.tenant != tenant.key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant mismatch")

    if settings.ALLOW_DUMMY_LOGIN and credentials.email == "admin@admin.com" and credentials.password == "admin":
        available_app_keys = tenant_application_keys(tenant)
        applications = {key: "admin" for key in available_app_keys}
        purchased_applications = sorted(
            key for key, enabled in (tenant.purchased_applications or {}).items() if enabled
        )
        token = create_access_token({"sub": credentials.email, "tid": tenant.key, "role": "admin", "scp": sorted(applications.keys())})
        return {
            "token": token,
            "email": credentials.email,
            "tenant": tenant.key,
            "role": "admin",
            "applications": applications,
            "purchased_applications": purchased_applications,
            "available_applications": sorted(available_app_keys),
        }

    user_stmt = (
        select(User)
        .where(
            User.email == credentials.email,
            User.tenant_id == tenant.id,
            User.is_active.is_(True),
        )
        .limit(1)
    )
    user = await session.scalar(user_stmt)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not await verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    user.last_login_at = datetime.now(timezone.utc)
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=credentials.email,
        event_type="login.success",
        payload={"tenant": tenant.key},
    )
    await session.commit()

    raw_permissions = dict(user.app_permissions or {})
    applications = filter_application_permissions(raw_permissions, tenant)
    available_app_keys = tenant_application_keys(tenant)
    purchased_applications = sorted(
        key for key, enabled in (tenant.purchased_applications or {}).items() if enabled
    )
    token = create_access_token({"sub": credentials.email, "tid": tenant.key, "uid": user.id, "role": user.role or "user", "scp": sorted(applications.keys())})
    return {
        "token": token,
        "email": credentials.email,
        "tenant": tenant.key,
        "role": user.role or "user",
        "applications": applications,
        "purchased_applications": purchased_applications,
        "available_applications": sorted(available_app_keys),
    }


@app.get("/api/tenant/self")
async def tenant_self(
    tenant: TenantContext = Depends(get_tenant_context),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    purchased_applications = sorted(
        key for key, enabled in (tenant.purchased_applications or {}).items() if enabled
    )
    available_applications = sorted(tenant_application_keys(tenant))
    return {
        "tenant": tenant.key,
        "tenant_id": tenant.id,
        "billing_plan": tenant.billing_plan,
        "feature_flags": tenant.feature_flags,
        "purchased_applications": purchased_applications,
        "available_applications": available_applications,
        "user": {"email": current_user.email, "role": current_user.role, "applications": current_user.app_permissions},
    }


app.include_router(admin_router.router)
app.include_router(analytics_router.router)
app.include_router(coding_router.router)
app.include_router(coding_dashboards_router.router)
app.include_router(member_cost_router.router)
app.include_router(utilization_router.router)
app.include_router(member_risk_router.router)

