"""Nexora platform-staff endpoints.

Staff identities live in `staff_users` on the control plane — they are not
tied to any tenant. The login flow returns an identity-only JWT (`typ=staff`);
to administer a specific tenant the staff member calls
`POST /api/staff/tenants/{key}/impersonate`, which mints a short-lived
tenant-scoped JWT carrying `act_typ=staff` so the existing `/api/admin/*`
routes treat them as `platform_admin` for that tenant.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import quote

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..db.session import control_session, get_control_session
from ..models.tables import StaffUser, Tenant
from ..schemas.types import NormalizedEmail
from ..services.tenant_registry import tenant_registry
from ..utils.audit_logger import record_audit_event
from ..utils.auth_throttle import clear_failures, client_ip, is_locked_out, record_failure
from ..utils.security import (
    AuthenticatedStaff,
    create_staff_impersonation_token,
    create_staff_token,
    decode_token,
    get_current_staff,
    hash_password,
    is_jti_revoked,
    revoke_jti,
    staff_oauth2_scheme,
    verify_password,
)

router = APIRouter(prefix="/api/staff", tags=["staff"])
logger = logging.getLogger("nexora.staff")

_STAFF_LOCKOUT_TENANT_KEY = "__staff__"
_MIN_PASSWORD_LENGTH = 12


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class StaffLoginRequest(BaseModel):
    email: NormalizedEmail
    password: str
    mfa_code: str | None = None


class StaffLoginResponse(BaseModel):
    token: str
    email: str
    name: str | None
    is_superuser: bool
    must_change_password: bool
    mfa_enrolled: bool
    mfa_enrollment_required: bool


class StaffMeResponse(BaseModel):
    email: str
    name: str | None
    is_superuser: bool
    mfa_enrolled: bool
    must_change_password: bool


class StaffMfaEnrollResponse(BaseModel):
    otpauth_url: str
    secret: str


class StaffMfaVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=8)


class StaffMfaDisableRequest(BaseModel):
    password: str
    code: str = Field(min_length=6, max_length=8)


class StaffChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(min_length=_MIN_PASSWORD_LENGTH)


class StaffUserCreate(BaseModel):
    email: NormalizedEmail
    name: str | None = None
    password: str = Field(min_length=_MIN_PASSWORD_LENGTH)
    is_active: bool = True
    is_superuser: bool = True


class StaffUserUpdate(BaseModel):
    name: str | None = None
    password: str | None = Field(default=None, min_length=_MIN_PASSWORD_LENGTH)
    is_active: bool | None = None
    is_superuser: bool | None = None


class StaffUserOut(BaseModel):
    id: int
    email: str
    name: str | None
    is_active: bool
    is_superuser: bool
    mfa_enrolled: bool
    must_change_password: bool
    last_login_at: datetime | None
    created_at: datetime


class StaffUserListResponse(BaseModel):
    users: list[StaffUserOut]


class StaffBootstrapRequest(BaseModel):
    email: NormalizedEmail
    name: str | None = None
    password: str = Field(min_length=_MIN_PASSWORD_LENGTH)


class TenantSummary(BaseModel):
    id: int
    key: str
    slug: str
    name: str
    status: str
    region: str | None
    billing_plan: str
    user_count: int
    purchased_applications: list[str]
    created_at: datetime


class TenantListResponse(BaseModel):
    tenants: list[TenantSummary]


class ImpersonationResponse(BaseModel):
    token: str
    tenant: TenantSummary
    expires_in_seconds: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _otpauth_url(secret: str, email: str) -> str:
    label = quote(f"{settings.MFA_ISSUER}:nexora-staff:{email}", safe="")
    issuer = quote(settings.MFA_ISSUER, safe="")
    return f"otpauth://totp/{label}?secret={secret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30"


def _verify_totp(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    try:
        return pyotp.TOTP(secret).verify(code.strip(), valid_window=1)
    except Exception:
        return False


def _serialize_staff(staff: StaffUser) -> StaffUserOut:
    return StaffUserOut(
        id=staff.id,
        email=staff.email,
        name=staff.name,
        is_active=bool(staff.is_active),
        is_superuser=bool(staff.is_superuser),
        mfa_enrolled=staff.mfa_enrolled_at is not None,
        must_change_password=bool(staff.must_change_password),
        last_login_at=staff.last_login_at,
        created_at=staff.created_at,
    )


def _staff_audit(event_type: str, actor: str, **fields) -> None:
    """Lightweight platform-staff audit. Lives in app logs only (the
    tenant_audit_events table requires a tenant_id and these events aren't
    tenant-scoped). Tenant-scoped staff actions (e.g. impersonation start)
    also record into tenant_audit_events so they appear in each tenant's
    audit feed."""
    logger.info(
        "staff_audit",
        extra={"event_type": event_type, "actor": actor, **fields},
    )


# ---------------------------------------------------------------------------
# Bootstrap (one-time, only while table is empty)
# ---------------------------------------------------------------------------


@router.post("/bootstrap", response_model=StaffUserOut, status_code=status.HTTP_201_CREATED)
async def bootstrap_first_staff(
    payload: StaffBootstrapRequest,
    request: Request,
    session: AsyncSession = Depends(get_control_session),
) -> StaffUserOut:
    """Create the first Nexora staff account.

    Only works while `staff_users` is empty — otherwise existing staff must
    create new staff via `POST /api/staff/users` (authenticated).
    """
    count = await session.scalar(select(func.count(StaffUser.id)))
    if count and count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Staff already provisioned. Use /api/staff/users.",
        )
    new_staff = StaffUser(
        email=payload.email,
        name=payload.name,
        password_hash=await hash_password(payload.password),
        is_active=True,
        is_superuser=True,
        must_change_password=False,
    )
    session.add(new_staff)
    await session.commit()
    await session.refresh(new_staff)
    _staff_audit(
        "staff.bootstrap",
        actor=new_staff.email,
        ip=client_ip(request),
    )
    return _serialize_staff(new_staff)


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


@router.post("/login", response_model=StaffLoginResponse)
async def staff_login(
    credentials: StaffLoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_control_session),
) -> StaffLoginResponse:
    ip = client_ip(request)
    user_agent = request.headers.get("user-agent", "")

    if await is_locked_out(_STAFF_LOCKOUT_TENANT_KEY, ip, credentials.email):
        _staff_audit("staff.login.locked_out", actor=credentials.email, ip=ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Try again later.",
        )

    staff: Optional[StaffUser] = await session.scalar(
        select(StaffUser).where(StaffUser.email == credentials.email).limit(1)
    )
    password_ok = (
        bool(staff)
        and bool(staff.is_active)
        and await verify_password(credentials.password, staff.password_hash)
    )
    if not password_ok:
        await record_failure(_STAFF_LOCKOUT_TENANT_KEY, ip, credentials.email)
        _staff_audit(
            "staff.login.failed",
            actor=credentials.email,
            ip=ip,
            user_agent=user_agent,
            reason="no_such_staff" if not staff else "bad_password",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    mfa_enrolled = staff.mfa_enrolled_at is not None
    mfa_required = bool(settings.REQUIRE_ADMIN_MFA)

    if mfa_enrolled:
        if not credentials.mfa_code:
            _staff_audit("staff.login.mfa_required", actor=staff.email, ip=ip)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="mfa_required")
        if not _verify_totp(staff.mfa_secret or "", credentials.mfa_code):
            await record_failure(_STAFF_LOCKOUT_TENANT_KEY, ip, credentials.email)
            _staff_audit("staff.login.failed", actor=staff.email, ip=ip, reason="bad_mfa_code")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MFA code")

    await clear_failures(_STAFF_LOCKOUT_TENANT_KEY, ip, credentials.email)
    staff.last_login_at = datetime.now(timezone.utc)
    await session.commit()

    _staff_audit(
        "staff.login.success",
        actor=staff.email,
        ip=ip,
        user_agent=user_agent,
        mfa="verified" if mfa_enrolled else ("enrollment_required" if mfa_required else "not_required"),
    )

    token = create_staff_token(staff)
    return StaffLoginResponse(
        token=token,
        email=staff.email,
        name=staff.name,
        is_superuser=bool(staff.is_superuser),
        must_change_password=bool(staff.must_change_password),
        mfa_enrolled=mfa_enrolled,
        mfa_enrollment_required=bool(mfa_required and not mfa_enrolled),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def staff_logout(
    request: Request,
    token: str = Depends(staff_oauth2_scheme),
) -> None:
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
    _staff_audit(
        "staff.logout",
        actor=payload.get("sub") or "unknown",
        ip=client_ip(request),
        jti=jti,
    )
    return None


@router.get("/me", response_model=StaffMeResponse)
async def staff_me(
    current_staff: AuthenticatedStaff = Depends(get_current_staff),
) -> StaffMeResponse:
    return StaffMeResponse(
        email=current_staff.email,
        name=current_staff.name,
        is_superuser=current_staff.is_superuser,
        mfa_enrolled=current_staff.mfa_enrolled,
        must_change_password=current_staff.must_change_password,
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def staff_change_password(
    payload: StaffChangePasswordRequest,
    request: Request,
    session: AsyncSession = Depends(get_control_session),
    current_staff: AuthenticatedStaff = Depends(get_current_staff),
) -> None:
    staff = await session.get(StaffUser, current_staff.id)
    if not staff or not staff.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Staff unavailable")
    if not await verify_password(payload.old_password, staff.password_hash):
        _staff_audit("staff.password_change.failed", actor=staff.email, ip=client_ip(request))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if payload.old_password == payload.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must differ from current")
    staff.password_hash = await hash_password(payload.new_password)
    staff.must_change_password = False
    await session.commit()
    _staff_audit("staff.password_change.completed", actor=staff.email, ip=client_ip(request))
    return None


# ---------------------------------------------------------------------------
# MFA
# ---------------------------------------------------------------------------


@router.post("/mfa/enroll", response_model=StaffMfaEnrollResponse)
async def staff_mfa_enroll(
    session: AsyncSession = Depends(get_control_session),
    current_staff: AuthenticatedStaff = Depends(get_current_staff),
) -> StaffMfaEnrollResponse:
    staff = await session.get(StaffUser, current_staff.id)
    if not staff or not staff.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Staff unavailable")
    new_secret = pyotp.random_base32()
    staff.mfa_secret = new_secret
    staff.mfa_enrolled_at = None
    await session.commit()
    return StaffMfaEnrollResponse(otpauth_url=_otpauth_url(new_secret, staff.email), secret=new_secret)


@router.post("/mfa/verify", status_code=status.HTTP_204_NO_CONTENT)
async def staff_mfa_verify(
    payload: StaffMfaVerifyRequest,
    request: Request,
    session: AsyncSession = Depends(get_control_session),
    current_staff: AuthenticatedStaff = Depends(get_current_staff),
) -> None:
    staff = await session.get(StaffUser, current_staff.id)
    if not staff or not staff.mfa_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA enrollment not started")
    if not _verify_totp(staff.mfa_secret, payload.code):
        _staff_audit("staff.mfa.verify_failed", actor=staff.email, ip=client_ip(request))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid MFA code")
    staff.mfa_enrolled_at = datetime.now(timezone.utc)
    await session.commit()
    _staff_audit("staff.mfa.enrolled", actor=staff.email, ip=client_ip(request))
    return None


@router.post("/mfa/disable", status_code=status.HTTP_204_NO_CONTENT)
async def staff_mfa_disable(
    payload: StaffMfaDisableRequest,
    request: Request,
    session: AsyncSession = Depends(get_control_session),
    current_staff: AuthenticatedStaff = Depends(get_current_staff),
) -> None:
    staff = await session.get(StaffUser, current_staff.id)
    if not staff or not staff.mfa_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA is not enabled")
    if not await verify_password(payload.password, staff.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password is incorrect")
    if not _verify_totp(staff.mfa_secret, payload.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid MFA code")
    if settings.REQUIRE_ADMIN_MFA:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="MFA is required for Nexora staff and cannot be disabled while REQUIRE_ADMIN_MFA is on",
        )
    staff.mfa_secret = None
    staff.mfa_enrolled_at = None
    await session.commit()
    _staff_audit("staff.mfa.disabled", actor=staff.email, ip=client_ip(request))
    return None


# ---------------------------------------------------------------------------
# Tenants + impersonation
# ---------------------------------------------------------------------------


@router.get("/tenants", response_model=TenantListResponse)
async def list_tenants(
    session: AsyncSession = Depends(get_control_session),
    current_staff: AuthenticatedStaff = Depends(get_current_staff),
) -> TenantListResponse:
    from ..models.tables import User  # local import keeps the staff module light

    stmt = select(Tenant).order_by(Tenant.name.asc())
    tenants = (await session.execute(stmt)).scalars().all()
    counts_stmt = select(User.tenant_id, func.count(User.id)).group_by(User.tenant_id)
    counts = {row[0]: row[1] for row in (await session.execute(counts_stmt)).all()}

    summaries: list[TenantSummary] = []
    for tenant in tenants:
        purchased = sorted(
            key for key, enabled in (tenant.purchased_applications or {}).items() if enabled
        )
        summaries.append(
            TenantSummary(
                id=tenant.id,
                key=tenant.key,
                slug=tenant.slug,
                name=tenant.name,
                status=tenant.status,
                region=tenant.region,
                billing_plan=tenant.billing_plan,
                user_count=int(counts.get(tenant.id, 0)),
                purchased_applications=purchased,
                created_at=tenant.created_at,
            )
        )
    return TenantListResponse(tenants=summaries)


@router.post(
    "/tenants/{tenant_key}/impersonate",
    response_model=ImpersonationResponse,
)
async def impersonate_tenant(
    tenant_key: str,
    request: Request,
    session: AsyncSession = Depends(get_control_session),
    current_staff: AuthenticatedStaff = Depends(get_current_staff),
) -> ImpersonationResponse:
    """Mint a tenant-scoped JWT that grants the staff member platform_admin
    access to the requested tenant. The token carries `act_typ=staff` and
    `act_sid` so `get_current_user` materializes a virtual user with full
    platform_admin powers without touching the tenant's `users` table."""

    # Resolve via the registry so we get the same cached/hydrated context the
    # tenant middleware would. Don't depend on get_tenant_context — staff
    # routes bypass that middleware.
    tenant_context = None
    try:
        tenant_context = await tenant_registry.resolve(
            tenant_key=tenant_key,
            host=None,
            session=session,
        )
    except Exception:
        tenant_context = None
    if not tenant_context:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    staff = await session.get(StaffUser, current_staff.id)
    if not staff or not staff.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Staff unavailable")

    ttl = timedelta(minutes=min(settings.JWT_EXPIRES_MINUTES, 60))
    token = create_staff_impersonation_token(staff, tenant_context, expires_delta=ttl)

    # Tenant-scoped audit so it shows up in that tenant's feed.
    tenant = await session.get(Tenant, tenant_context.id)
    if tenant:
        await record_audit_event(
            session,
            tenant_id=tenant.id,
            actor=staff.email,
            event_type="staff.impersonation.start",
            payload={
                "tenant": tenant.key,
                "ip": client_ip(request),
                "staff_id": staff.id,
                "ttl_seconds": int(ttl.total_seconds()),
            },
        )
        await session.commit()

    purchased = sorted(
        key for key, enabled in (tenant_context.purchased_applications or {}).items() if enabled
    ) if tenant_context.purchased_applications else []
    summary = TenantSummary(
        id=tenant.id if tenant else tenant_context.id,
        key=tenant_context.key,
        slug=tenant_context.slug,
        name=tenant.name if tenant else tenant_context.key,
        status=tenant.status if tenant else "active",
        region=tenant.region if tenant else None,
        billing_plan=tenant_context.billing_plan or "standard",
        user_count=0,
        purchased_applications=purchased,
        created_at=tenant.created_at if tenant else datetime.now(timezone.utc),
    )

    _staff_audit(
        "staff.impersonation.start",
        actor=staff.email,
        tenant=tenant_context.key,
        ip=client_ip(request),
        ttl_seconds=int(ttl.total_seconds()),
    )

    return ImpersonationResponse(
        token=token,
        tenant=summary,
        expires_in_seconds=int(ttl.total_seconds()),
    )


# ---------------------------------------------------------------------------
# Staff CRUD (manage other Nexora employees)
# ---------------------------------------------------------------------------


@router.get("/users", response_model=StaffUserListResponse)
async def list_staff(
    session: AsyncSession = Depends(get_control_session),
    current_staff: AuthenticatedStaff = Depends(get_current_staff),
) -> StaffUserListResponse:
    rows = (
        await session.execute(select(StaffUser).order_by(StaffUser.email.asc()))
    ).scalars().all()
    return StaffUserListResponse(users=[_serialize_staff(s) for s in rows])


@router.post("/users", response_model=StaffUserOut, status_code=status.HTTP_201_CREATED)
async def create_staff(
    payload: StaffUserCreate,
    request: Request,
    session: AsyncSession = Depends(get_control_session),
    current_staff: AuthenticatedStaff = Depends(get_current_staff),
) -> StaffUserOut:
    existing = await session.scalar(select(StaffUser).where(StaffUser.email == payload.email))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Staff already exists")
    new_staff = StaffUser(
        email=payload.email,
        name=payload.name,
        password_hash=await hash_password(payload.password),
        is_active=payload.is_active,
        is_superuser=payload.is_superuser,
        must_change_password=True,
    )
    session.add(new_staff)
    await session.commit()
    await session.refresh(new_staff)
    _staff_audit(
        "staff.user.create",
        actor=current_staff.email,
        target=new_staff.email,
        ip=client_ip(request),
    )
    return _serialize_staff(new_staff)


@router.patch("/users/{staff_id}", response_model=StaffUserOut)
async def update_staff(
    staff_id: int,
    payload: StaffUserUpdate,
    request: Request,
    session: AsyncSession = Depends(get_control_session),
    current_staff: AuthenticatedStaff = Depends(get_current_staff),
) -> StaffUserOut:
    staff = await session.get(StaffUser, staff_id)
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")

    if payload.name is not None:
        staff.name = payload.name
    if payload.password:
        staff.password_hash = await hash_password(payload.password)
        if staff.id != current_staff.id:
            staff.must_change_password = True
    if payload.is_active is not None:
        if staff.id == current_staff.id and not payload.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot deactivate your own account")
        staff.is_active = payload.is_active
    if payload.is_superuser is not None:
        staff.is_superuser = payload.is_superuser

    await session.commit()
    await session.refresh(staff)
    _staff_audit(
        "staff.user.update",
        actor=current_staff.email,
        target=staff.email,
        ip=client_ip(request),
        updates=payload.model_dump(exclude_none=True, exclude={"password"}),
    )
    return _serialize_staff(staff)


@router.delete("/users/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_staff(
    staff_id: int,
    request: Request,
    session: AsyncSession = Depends(get_control_session),
    current_staff: AuthenticatedStaff = Depends(get_current_staff),
) -> None:
    staff = await session.get(StaffUser, staff_id)
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")
    if staff.id == current_staff.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")
    target_email = staff.email
    await session.delete(staff)
    await session.commit()
    _staff_audit(
        "staff.user.delete",
        actor=current_staff.email,
        target=target_email,
        ip=client_ip(request),
    )
    return None
