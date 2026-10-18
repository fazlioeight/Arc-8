from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from .core.config import assert_required_settings, settings
from .core.logging_config import setup_logging
from .dependencies.tenant import get_tenant_context
from .db.session import get_control_session
from .db.tenant_manager import TenantContext, tenant_connection_manager
from .middleware.member_edge_guard import MemberEdgeGuardMiddleware
from .middleware.rate_limit import RateLimitMiddleware, auth_rate_limit
from .middleware.request_logging import RequestLoggingMiddleware
from .middleware.security_headers import SecurityHeadersMiddleware
from .middleware.tenant import TenantMiddleware
from .models.tables import User
from .routes import admin as admin_router
from .routes import ai as ai_router
from .routes import analytics as analytics_router
from .routes import auth as auth_router
from .routes import chat as chat_router
from .routes import coding as coding_router
from .routes import contact as contact_router
from .routes import coding_dashboards as coding_dashboards_router
from .routes import dashboard as dashboard_router
from .routes import imports as imports_router
from .routes import docs as docs_router
from .routes import terminology as terminology_router
from .routes import member_cost as member_cost_router
from .routes import member_risk as member_risk_router
from .routes import member360 as member360_router
from .routes import member360_admin as member360_admin_router
from .routes import member_portal as member_portal_router
from .routes import member_portal_session as member_portal_session_router
from .routes import member_portal_dashboard as member_portal_dashboard_router
from .routes import member_portal_documents as member_portal_documents_router
from .routes import member_portal_providers as member_portal_providers_router
from .routes import portal as portal_router
from .routes import ride_booking as ride_booking_router
from .routes import settings as settings_router
from .routes import staff as staff_router
from .routes import workbench as workbench_router
from .routes import utilization as utilization_router
from .schemas.types import NormalizedEmail
from .services.azure_auth import exchange_code_for_id_token, resolve_email_from_claims, validate_id_token
from .utils.audit_logger import record_audit_event
from .utils.auth_throttle import clear_failures, client_ip, is_locked_out, record_failure
from .utils.security import (
    AuthenticatedUser,
    create_access_token,
    decode_token,
    filter_application_permissions,
    get_current_user,
    issue_refresh_token,
    oauth2_scheme,
    revoke_jti,
    revoke_user_refresh_tokens,
    rotate_refresh_token,
    tenant_application_keys,
    verify_password,
)

setup_logging()

# Fail fast on boot if required production configuration is missing, rather
# than surfacing as obscure runtime errors on the first request.
assert_required_settings(settings)


app = FastAPI(title="Nexora Lab API", version="2.0.0")

app.add_middleware(RequestLoggingMiddleware)
# Reject /api/member/* requests that didn't come through the member edge (when
# the shared secret is provisioned). Added before TenantMiddleware so a bypass
# attempt is refused before any tenant/DB work; its 404 still flows back out
# through SecurityHeaders + CORS.
app.add_middleware(MemberEdgeGuardMiddleware)
app.add_middleware(
    TenantMiddleware,
    default_tenant=None if settings.is_production else "prominencehealth",
    require_known_tenant=settings.HIPAA_MODE or settings.is_production,
)

cors_origins = []
for origin in settings.CORS_ORIGINS:
    origin_str = str(origin).rstrip('/')
    cors_origins.append(origin_str)
    cors_origins.append(f"{origin_str}/")

app.add_middleware(SecurityHeadersMiddleware)
# Global per-IP rate limit. Added before CORS so CORS remains the outermost
# layer and a 429 still carries Access-Control-Allow-Origin (otherwise browsers
# surface a misleading CORS error instead of the real 429).
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(set(cors_origins)),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Convert uncaught exceptions into a JSONResponse so the response flows back
# through user middleware (CORS) instead of bubbling to Starlette's
# ServerErrorMiddleware, which sits outside CORS and emits a 500 with no
# Access-Control-Allow-Origin header — surfacing in browsers as a misleading
# CORS error rather than the real exception message.
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    import logging
    logging.getLogger("nexora.unhandled").exception(
        "unhandled_exception", extra={"path": request.url.path}
    )
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {exc}"},
    )


@app.on_event("startup")
async def probe_member360_storage() -> None:
    """Verify the document storage backend can talk to its target on boot.

    For the Azure backend, this logs which identity (managed identity,
    service principal, or az-login user) actually won the credential
    chain — saves a lot of "is the right principal making the call"
    detective work later. Non-fatal: a failure logs an error but doesn't
    block startup, because the rest of the app shouldn't go dark over a
    misconfigured optional subsystem.
    """
    if (settings.MEMBER360_STORAGE_BACKEND or "local").lower() != "azure":
        return
    import logging

    log = logging.getLogger("member360.storage")
    try:
        from .services import member360_storage

        backend = member360_storage.get_document_backend()
        probe = getattr(backend, "probe", None)
        if probe is None:
            return
        result = await probe()
        if result.get("ok"):
            log.info("member360_storage_ready", extra={"probe": result})
        else:
            log.error("member360_storage_probe_failed", extra={"probe": result})
    except Exception as exc:  # noqa: BLE001
        log.error("member360_storage_probe_exception", extra={"error": str(exc)})


@app.on_event("shutdown")
async def shutdown_connections() -> None:
    await tenant_connection_manager.close_all()


class LoginRequest(BaseModel):
    email: NormalizedEmail
    password: str
    tenant: str | None = None
    mfa_code: str | None = None


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
            # Carries MFA state into the session so require_mfa can gate PHI
            # routes without an extra DB round-trip per request.
            "mfa": user.mfa_enrolled_at is not None,
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
        "must_change_password": bool(user.must_change_password),
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
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    _rl: None = Depends(auth_rate_limit),
):
    if credentials.tenant and credentials.tenant != tenant.key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant mismatch")

    ip = client_ip(request)
    user_agent = request.headers.get("user-agent", "")

    if await is_locked_out(tenant.key, ip, credentials.email):
        await record_audit_event(
            session,
            tenant_id=tenant.id,
            actor=credentials.email,
            event_type="login.locked_out",
            payload={"tenant": tenant.key, "ip": ip, "user_agent": user_agent},
        )
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Try again later.",
        )

    DUMMY_ROLES = {
        "admin@admin.com": ("admin", ["admin_console", "chat", "coding", "dashboard", "docs", "job_center", "member360", "portal", "ride_booking", "settings", "providers"]),
        "dr.chen@prominencehealth.com": ("clinician", ["member360", "providers", "portal", "chat", "docs", "dashboard"]),
        "elena.nurse@prominencehealth.com": ("nurse", ["member360", "ride_booking", "portal", "chat", "docs"]),
        "marcus.coder@prominencehealth.com": ("coder", ["coding", "member360", "portal", "dashboard", "docs"]),
        "rachel.billing@prominencehealth.com": ("billing", ["dashboard", "portal", "docs", "member360"]),
        "james.member@prominencehealth.com": ("patient", ["portal", "ride_booking"]),
    }
    if settings.ALLOW_DUMMY_LOGIN and credentials.email in DUMMY_ROLES and credentials.password in ("admin", "demo123", "password"):
        demo_role, demo_apps = DUMMY_ROLES[credentials.email]
        user_in_db = await session.scalar(
            select(User).where(User.email == credentials.email, User.tenant_id == tenant.id).limit(1)
        )
        user_id = user_in_db.id if user_in_db else None
        available_app_keys = tenant_application_keys(tenant)
        applications = {key: "admin" if demo_role == "admin" else "user" for key in demo_apps if key in available_app_keys}
        purchased_applications = sorted(
            key for key, enabled in (tenant.purchased_applications or {}).items() if enabled
        )
        token = create_access_token({
            "sub": credentials.email,
            "tid": tenant.key,
            "uid": user_id,
            "role": demo_role,
            "scp": sorted(applications.keys()),
            "mfa": True,
        })
        return {
            "token": token,
            "email": credentials.email,
            "tenant": tenant.key,
            "role": demo_role,
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
    password_ok = bool(user) and await verify_password(credentials.password, user.password_hash)

    if not password_ok:
        await record_failure(tenant.key, ip, credentials.email)
        await record_audit_event(
            session,
            tenant_id=tenant.id,
            actor=credentials.email,
            event_type="login.failed",
            payload={
                "tenant": tenant.key,
                "ip": ip,
                "user_agent": user_agent,
                "reason": "no_such_user" if not user else "bad_password",
            },
        )
        await session.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # MFA check happens after password verification but before issuing a token.
    role = (user.role or "user")
    mfa_enrolled = user.mfa_enrolled_at is not None
    mfa_required_for_role = settings.REQUIRE_ADMIN_MFA and role in {"admin", "platform_admin"}

    if mfa_enrolled:
        if not credentials.mfa_code:
            await record_audit_event(
                session,
                tenant_id=tenant.id,
                actor=credentials.email,
                event_type="login.mfa_required",
                payload={"tenant": tenant.key, "ip": ip},
            )
            await session.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="mfa_required",
            )
        from .routes.auth import verify_totp
        if not verify_totp(user.mfa_secret or "", credentials.mfa_code):
            await record_failure(tenant.key, ip, credentials.email)
            await record_audit_event(
                session,
                tenant_id=tenant.id,
                actor=credentials.email,
                event_type="login.failed",
                payload={
                    "tenant": tenant.key,
                    "ip": ip,
                    "user_agent": user_agent,
                    "reason": "bad_mfa_code",
                },
            )
            await session.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid MFA code",
            )
    elif mfa_required_for_role:
        # Allow the user in but flag enrollment as required so the SPA can
        # redirect to /mfa/enroll. We do NOT block login here because the
        # enrollment endpoints require an authenticated session.
        await record_audit_event(
            session,
            tenant_id=tenant.id,
            actor=credentials.email,
            event_type="login.mfa_enrollment_required",
            payload={"tenant": tenant.key, "ip": ip, "role": role},
        )

    await clear_failures(tenant.key, ip, credentials.email)
    user.last_login_at = datetime.now(timezone.utc)
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=credentials.email,
        event_type="login.success",
        payload={
            "tenant": tenant.key,
            "ip": ip,
            "user_agent": user_agent,
            "mfa": "verified" if mfa_enrolled else ("enrollment_required" if mfa_required_for_role else "not_required"),
        },
    )
    refresh_token = await issue_refresh_token(session, tenant_id=tenant.id, user_id=user.id, ip=ip)
    await session.commit()

    response = _build_login_response(user, tenant)
    response["refresh_token"] = refresh_token
    response["expires_in"] = settings.ACCESS_TOKEN_EXPIRES_MINUTES * 60
    response["mfa_enrollment_required"] = bool(mfa_required_for_role and not mfa_enrolled)
    return response


@app.post("/api/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    token: str = Depends(oauth2_scheme),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
) -> None:
    # Decode the token directly (do NOT call get_current_user — we want to be
    # able to revoke even a tenant-mismatched or already-revoked token so the
    # client can clean up its state).
    try:
        payload = decode_token(token)
    except HTTPException:
        return None
    jti = payload.get("jti")
    exp = payload.get("exp")
    if jti and exp:
        ttl = int(exp) - int(datetime.now(timezone.utc).timestamp())
        if ttl > 0:
            await revoke_jti(jti, ttl)
    sub = payload.get("sub") or "unknown"
    if tenant and tenant.id:
        # Revoke this user's refresh tokens so a logged-out session can't be
        # resurrected via a still-valid refresh token.
        uid = payload.get("uid")
        if uid:
            await revoke_user_refresh_tokens(session, tenant_id=tenant.id, user_id=uid)
        await record_audit_event(
            session,
            tenant_id=tenant.id,
            actor=sub,
            event_type="logout",
            payload={
                "tenant": tenant.key,
                "ip": client_ip(request),
                "jti": jti,
            },
        )
        await session.commit()
    return None


@app.post("/api/account/deactivate", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_account(
    request: Request,
    token: str = Depends(oauth2_scheme),
    tenant: TenantContext = Depends(get_tenant_context),
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_control_session),
) -> None:
    """Self-service account deactivation (soft close).

    Sets the user inactive, revokes the current access token and all of their
    refresh tokens, and writes an audit event. The row is retained for the
    audit trail; an admin can reactivate. The SPA logs out after calling this.
    """
    user = await session.get(User, current_user.id)
    if user is None or user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = False

    # Revoke the current access token (by jti) and every refresh token so the
    # session can't continue or be resurrected.
    try:
        payload = decode_token(token)
        jti = payload.get("jti")
        exp = payload.get("exp")
        if jti and exp:
            ttl = int(exp) - int(datetime.now(timezone.utc).timestamp())
            if ttl > 0:
                await revoke_jti(jti, ttl)
    except HTTPException:
        pass
    await revoke_user_refresh_tokens(session, tenant_id=tenant.id, user_id=user.id)

    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="account.deactivated",
        payload={"tenant": tenant.key, "ip": client_ip(request)},
    )
    await session.commit()
    return None


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
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
):
    if payload.tenant and payload.tenant != tenant.key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant mismatch")

    ip = client_ip(request)
    user_agent = request.headers.get("user-agent", "")

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
        await record_audit_event(
            session,
            tenant_id=tenant.id,
            actor=email,
            event_type="login.azure.failed",
            payload={"tenant": tenant.key, "ip": ip, "user_agent": user_agent, "reason": "not_provisioned"},
        )
        await session.commit()
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
        payload={"tenant": tenant.key, "azure_oid": claims.get("oid", ""), "ip": ip, "user_agent": user_agent},
    )
    refresh_token = await issue_refresh_token(session, tenant_id=tenant.id, user_id=user.id, ip=ip)
    await session.commit()

    response = _build_login_response(user, tenant)
    response["refresh_token"] = refresh_token
    response["expires_in"] = settings.ACCESS_TOKEN_EXPIRES_MINUTES * 60
    return response


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20)


@app.post("/api/auth/refresh")
async def refresh_access_token(
    payload: RefreshRequest,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    _rl: None = Depends(auth_rate_limit),
):
    """Rotate a refresh token and mint a fresh 15-minute access token.

    The old refresh token is consumed; a new one is returned. Replaying a
    consumed token revokes the whole session chain (see rotate_refresh_token).
    """
    ip = client_ip(request)
    user_id, new_refresh = await rotate_refresh_token(
        session, raw_token=payload.refresh_token, tenant_id=tenant.id, ip=ip
    )
    user = await session.get(User, user_id)
    if not user or user.tenant_id != tenant.id or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=user.email,
        event_type="token.refreshed",
        payload={"tenant": tenant.key, "ip": ip},
    )
    await session.commit()

    response = _build_login_response(user, tenant)
    response["refresh_token"] = new_refresh
    response["expires_in"] = settings.ACCESS_TOKEN_EXPIRES_MINUTES * 60
    return response


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
app.include_router(auth_router.router)
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
app.include_router(member360_router.router)
app.include_router(member360_admin_router.router)
app.include_router(member_portal_router.router)
app.include_router(member_portal_session_router.router)
app.include_router(member_portal_dashboard_router.router)
app.include_router(member_portal_documents_router.router)
app.include_router(member_portal_providers_router.router)
app.include_router(imports_router.router)
app.include_router(ride_booking_router.router)
app.include_router(docs_router.router)
app.include_router(settings_router.router)
app.include_router(chat_router.router)
app.include_router(ai_router.router)
app.include_router(staff_router.router)
app.include_router(contact_router.router)

