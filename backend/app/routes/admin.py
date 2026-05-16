from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context
from ..services.tenant_registry import tenant_registry
from ..models.tables import Tenant, User
from ..schemas.admin import (
    AdminUser,
    AdminUserCreate,
    AdminUserListResponse,
    AdminUserUpdate,
    ApplicationDefinition,
    ApplicationListResponse,
    ApplicationUpdateRequest,
)
from ..utils.audit_logger import record_audit_event
from ..utils.security import (
    AuthenticatedUser,
    filter_application_permissions,
    hash_password,
    require_admin,
    require_platform_admin,
    tenant_application_keys,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])

_ALLOWED_LEVELS = {"admin", "manager", "user"}
_ADMIN_ONLY_APPS = {"admin_console"}
_CORE_APPS = {"portal", "admin_console", "settings"}



def _ensure_role_assignment_allowed(actor: AuthenticatedUser, requested_role: str) -> None:
    if requested_role == "platform_admin" and actor.role != "platform_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform admin role can only be assigned by a platform admin")


def _validate_applications_payload(tenant: TenantContext, apps: dict[str, str] | None) -> dict[str, str]:
    if not apps:
        apps = {}

    normalized: dict[str, str] = {}
    known_apps = settings.PORTAL_APPLICATIONS
    available_keys = tenant_application_keys(tenant)
    for key, level in apps.items():
        if key not in known_apps:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown application '{key}'")
        if key not in available_keys:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Application '{key}' is not enabled for this tenant")
        if level not in _ALLOWED_LEVELS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid access level '{level}' for {key}")
        if key in _ADMIN_ONLY_APPS and level != "admin":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Master Admin requires admin access")
        normalized[key] = level

    if "portal" in known_apps and "portal" not in normalized:
        normalized["portal"] = "user"
    if "settings" in _CORE_APPS and "settings" in known_apps and normalized.get("settings") not in {"admin", "manager", "user"}:
        normalized["settings"] = "user"
    return normalized


def _clean_permissions(tenant: TenantContext, raw: dict[str, str] | None) -> dict[str, str]:
    return filter_application_permissions(raw, tenant)


def _serialize_user(user: User, tenant: TenantContext) -> AdminUser:
    return AdminUser(
        id=user.id,
        email=user.email,
        role=user.role or "user",
        is_active=bool(user.is_active),
        applications=_clean_permissions(tenant, user.app_permissions),
        created_at=user.created_at,
    )


def _build_application_definitions(tenant: TenantContext) -> list[ApplicationDefinition]:
    available_keys = tenant_application_keys(tenant)
    apps: list[ApplicationDefinition] = []
    for key, meta in settings.PORTAL_APPLICATIONS.items():
        is_core = key in _CORE_APPS
        is_enabled = key in available_keys
        apps.append(
            ApplicationDefinition(
                key=key,
                label=meta.get("label", key.title()),
                description=meta.get("description"),
                purchased=is_enabled,
                core=is_core,
            )
        )
    apps.sort(key=lambda item: item.label.lower())
    return apps


@router.get("/applications", response_model=ApplicationListResponse)
async def list_applications(
    tenant: TenantContext = Depends(get_tenant_context),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> ApplicationListResponse:
    apps = _build_application_definitions(tenant)
    return ApplicationListResponse(applications=apps)


@router.patch("/applications", response_model=ApplicationListResponse)
async def update_applications(
    payload: ApplicationUpdateRequest,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_platform_admin),
) -> ApplicationListResponse:
    known_apps = settings.PORTAL_APPLICATIONS.keys()
    requested = set(payload.purchased or [])
    invalid = sorted(requested - set(known_apps))
    if invalid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown application keys: {', '.join(invalid)}")

    optional_keys = {key for key in requested if key not in _CORE_APPS}
    purchased_map = {key: True for key in optional_keys}

    tenant_row = await session.get(Tenant, tenant.id)
    if not tenant_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    tenant_row.purchased_applications = purchased_map

    updated_context = TenantContext(
        id=tenant.id,
        key=tenant.key,
        slug=tenant.slug,
        db_connection_uri=tenant.db_connection_uri,
        db_schema=tenant.db_schema,
        billing_plan=tenant.billing_plan,
        feature_flags=tenant.feature_flags,
        purchased_applications=purchased_map,
        request_host=tenant.request_host,
    )

    result = await session.execute(select(User).where(User.tenant_id == tenant.id))
    users = result.scalars().all()
    updated_user_ids: list[int] = []
    for user in users:
        filtered = filter_application_permissions(user.app_permissions, updated_context)
        if filtered != (user.app_permissions or {}):
            user.app_permissions = filtered
            updated_user_ids.append(user.id)

    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="tenant.applications.update",
        payload={"purchased": sorted(optional_keys), "users_updated": updated_user_ids},
    )
    await session.commit()

    tenant_registry.invalidate(tenant.key)
    tenant.purchased_applications = purchased_map

    apps = _build_application_definitions(updated_context)
    return ApplicationListResponse(applications=apps)


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> AdminUserListResponse:
    stmt = select(User).where(User.tenant_id == tenant.id).order_by(User.email.asc())
    result = await session.execute(stmt)
    users = result.scalars().all()
    if current_user.role != "platform_admin":
        users = [record for record in users if (record.role or "user") != "platform_admin"]
    return AdminUserListResponse(users=[_serialize_user(user, tenant) for user in users])


@router.post("/users", response_model=AdminUser, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: AdminUserCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> AdminUser:
    existing_stmt = select(User).where(User.email == payload.email, User.tenant_id == tenant.id)
    existing_user = await session.scalar(existing_stmt)
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists for this tenant")

    _ensure_role_assignment_allowed(current_user, payload.role)

    app_permissions = _validate_applications_payload(tenant, payload.applications)
    password_hash = await hash_password(payload.password)

    new_user = User(
        tenant_id=tenant.id,
        email=payload.email,
        password_hash=password_hash,
        role=payload.role,
        is_active=payload.is_active,
        app_permissions=app_permissions,
    )
    session.add(new_user)
    await session.flush()

    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="user.create",
        payload={"user_id": new_user.id, "email": new_user.email, "role": new_user.role, "applications": app_permissions},
    )
    await session.commit()
    await session.refresh(new_user)

    return _serialize_user(new_user, tenant)


@router.patch("/users/{user_id}", response_model=AdminUser)
async def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> AdminUser:
    user = await session.get(User, user_id)
    if not user or user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if (user.role or "user") == "platform_admin" and current_user.role != "platform_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform admin records can only be managed by a platform admin")

    changed = False

    if payload.role is not None and payload.role != user.role:
        _ensure_role_assignment_allowed(current_user, payload.role)
        user.role = payload.role
        changed = True

    if payload.is_active is not None and payload.is_active != user.is_active:
        user.is_active = payload.is_active
        changed = True

    if payload.password:
        user.password_hash = await hash_password(payload.password)
        changed = True

    if payload.applications is not None:
        new_permissions = _validate_applications_payload(tenant, payload.applications)
        if new_permissions != _clean_permissions(tenant, user.app_permissions):
            user.app_permissions = new_permissions
            changed = True

    if not changed:
        return _serialize_user(user, tenant)

    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="user.update",
        payload={"user_id": user.id, "updates": payload.model_dump(exclude_none=True)},
    )
    await session.commit()
    await session.refresh(user)

    return _serialize_user(user, tenant)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> None:
    user = await session.get(User, user_id)
    if not user or user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")
    if (user.role or "user") == "platform_admin" and current_user.role != "platform_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin records can only be deleted by a platform admin",
        )

    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="user.delete",
        payload={"user_id": user.id, "email": user.email, "role": user.role},
    )
    await session.delete(user)
    await session.commit()

