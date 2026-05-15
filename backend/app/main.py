from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import select, text
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
from .routes import chat as chat_router
from .routes import coding as coding_router
from .routes import coding_dashboards as coding_dashboards_router
from .routes import dashboard as dashboard_router
from .routes import imports as imports_router
from .routes import docs as docs_router
from .routes import terminology as terminology_router
from .routes import member_cost as member_cost_router
from .routes import member_risk as member_risk_router
from .routes import portal as portal_router
from .routes import ride_booking as ride_booking_router
from .routes import settings as settings_router
from .routes import workbench as workbench_router
from .routes import utilization as utilization_router
from .services.azure_auth import exchange_code_for_id_token, resolve_email_from_claims, validate_id_token
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



app = FastAPI(title="Nexora Lab API", version="2.0.0")

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


class AzureAuthCodeRequest(BaseModel):
    code: str
    code_verifier: str
    redirect_uri: str
    nonce: str | None = None
    tenant: str | None = None


def _build_login_response(user: User, tenant: TenantContext) -> dict:
    raw_permissions = dict(user.app_permissions or {})
    applications = filter_application_permissions(raw_permissions, tenant)
    available_app_keys = tenant_application_keys(tenant)
    purchased_applications = sorted(
        key for key, enabled in (tenant.purchased_applications or {}).items() if enabled
    )
    token = create_access_token(
        {
            "sub": user.email,
            "tid": tenant.key,
            "uid": user.id,
            "role": user.role or "user",
            "scp": sorted(applications.keys()),
        }
    )
    return {
        "token": token,
        "email": user.email,
        "tenant": tenant.key,
        "role": user.role or "user",
        "applications": applications,
        "purchased_applications": purchased_applications,
        "available_applications": sorted(available_app_keys),
    }


@app.get("/")
async def read_root():
    return {"message": "Nexora Lab Backend"}


@app.get("/health/live", tags=["health"])
async def health_live():
    return {"status": "ok"}


@app.get("/health/ready", tags=["health"])
async def health_ready(session: AsyncSession = Depends(get_control_session)):
    await session.execute(text("SELECT 1"))
    return {"status": "ready"}


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

    return _build_login_response(user, tenant)


@app.get("/api/auth/azure/config")
async def azure_auth_config():
    return {
        "enabled": settings.AZURE_AUTH_ENABLED and bool(settings.AZURE_TENANT_ID and settings.AZURE_CLIENT_ID),
        "tenant_id": settings.AZURE_TENANT_ID,
        "client_id": settings.AZURE_CLIENT_ID,
        "authority_host": settings.AZURE_AUTHORITY_HOST.rstrip("/"),
        "scopes": settings.AZURE_AUTH_SCOPES,
    }


@app.post("/api/auth/azure/exchange")
async def azure_auth_exchange(
    payload: AzureAuthCodeRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
):
    if payload.tenant and payload.tenant != tenant.key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant mismatch")

    id_token = await exchange_code_for_id_token(
        code=payload.code,
        code_verifier=payload.code_verifier,
        redirect_uri=payload.redirect_uri,
    )
    claims = validate_id_token(id_token, nonce=payload.nonce)
    email = resolve_email_from_claims(claims)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Azure login did not include an email address",
        )

    user_stmt = (
        select(User)
        .where(
            User.email == email,
            User.tenant_id == tenant.id,
            User.is_active.is_(True),
        )
        .limit(1)
    )
    user = await session.scalar(user_stmt)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Azure user is not provisioned for this tenant",
        )

    user.last_login_at = datetime.now(timezone.utc)
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=email,
        event_type="login.azure.success",
        payload={"tenant": tenant.key, "azure_oid": claims.get("oid", "")},
    )
    await session.commit()

    return _build_login_response(user, tenant)


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
app.include_router(dashboard_router.router)
app.include_router(portal_router.router)
app.include_router(workbench_router.router)
app.include_router(terminology_router.router)
app.include_router(member_cost_router.router)
app.include_router(utilization_router.router)
app.include_router(member_risk_router.router)
app.include_router(imports_router.router)
app.include_router(ride_booking_router.router)
app.include_router(docs_router.router)
app.include_router(settings_router.router)
app.include_router(chat_router.router)

