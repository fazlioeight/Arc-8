from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context
from ..models.tables import User
from ..schemas.admin import (
    AdminUser,
    AdminUserCreate,
    AdminUserListResponse,
    AdminUserUpdate,
    ApplicationDefinition,
    ApplicationListResponse,
)
from ..utils.audit_logger import record_audit_event
from ..utils.security import AuthenticatedUser, hash_password, require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])

_ALLOWED_LEVELS = {"admin", "user"}
_ADMIN_ONLY_APPS = {"admin_console"}


def _validate_applications_payload(apps: dict[str, str] | None) -> dict[str, str]:
    if not apps:
        return {}

    normalized: dict[str, str] = {}
    known_apps = settings.PORTAL_APPLICATIONS
    for key, level in apps.items():
        if key not in known_apps:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown application '{key}'")
        if level not in _ALLOWED_LEVELS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid access level '{level}' for {key}")
        if key in _ADMIN_ONLY_APPS and level != "admin":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Master Admin requires admin access")
        normalized[key] = level

    if "portal" in known_apps and "portal" not in normalized:
        normalized["portal"] = "user"
    return normalized


def _clean_permissions(raw: dict[str, str] | None) -> dict[str, str]:
    if not raw:
        return {}
    normalized = {}
    known_apps = settings.PORTAL_APPLICATIONS
    for key, level in raw.items():
        if key not in known_apps:
            continue
        if level not in _ALLOWED_LEVELS:
            continue
        if key in _ADMIN_ONLY_APPS and level != "admin":
            continue
        normalized[key] = level

    if "portal" in known_apps and "portal" not in normalized:
        normalized["portal"] = "user"
    return normalized


def _serialize_user(user: User) -> AdminUser:
    return AdminUser(
        id=user.id,
        email=user.email,
        role=user.role or "user",
        is_active=bool(user.is_active),
        applications=_clean_permissions(user.app_permissions),
        created_at=user.created_at,
    )


@router.get("/applications", response_model=ApplicationListResponse)
async def list_applications(
    current_user: AuthenticatedUser = Depends(require_admin),
) -> ApplicationListResponse:
    apps = [
        ApplicationDefinition(key=key, label=meta.get("label", key.title()), description=meta.get("description"))
        for key, meta in settings.PORTAL_APPLICATIONS.items()
    ]
    apps.sort(key=lambda item: item.label.lower())
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
    return AdminUserListResponse(users=[_serialize_user(user) for user in users])


@router.post("/users", response_model=AdminUser, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: AdminUserCreate,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(require_admin),
) -> AdminUser:
    email = payload.email.lower().strip()
    existing_stmt = select(User).where(User.email == email, User.tenant_id == tenant.id)
    existing_user = await session.scalar(existing_stmt)
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists for this tenant")

    app_permissions = _validate_applications_payload(payload.applications)
    password_hash = await hash_password(payload.password)

    new_user = User(
        tenant_id=tenant.id,
        email=email,
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

    return _serialize_user(new_user)


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

    changed = False

    if payload.role is not None and payload.role != user.role:
        user.role = payload.role
        changed = True

    if payload.is_active is not None and payload.is_active != user.is_active:
        user.is_active = payload.is_active
        changed = True

    if payload.password:
        user.password_hash = await hash_password(payload.password)
        changed = True

    if payload.applications is not None:
        new_permissions = _validate_applications_payload(payload.applications)
        if new_permissions != _clean_permissions(user.app_permissions):
            user.app_permissions = new_permissions
            changed = True

    if not changed:
        return _serialize_user(user)

    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="user.update",
        payload={"user_id": user.id, "updates": payload.model_dump(exclude_none=True)},
    )
    await session.commit()
    await session.refresh(user)

    return _serialize_user(user)

