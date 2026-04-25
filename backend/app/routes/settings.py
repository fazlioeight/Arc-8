from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context
from ..models.tables import UserPreference
from ..schemas.settings import UserPreferencesPayload, UserPreferencesResponse
from ..utils.audit_logger import record_audit_event
from ..utils.security import AuthenticatedUser, get_current_user, require_application

router = APIRouter(
    prefix="/api/settings",
    tags=["settings"],
    dependencies=[Depends(require_application("settings"))],
)

_PREFERENCE_KEY = "workspace"


async def _get_preference(
    session: AsyncSession,
    *,
    tenant_id: int,
    user_id: int,
) -> UserPreference | None:
    stmt = select(UserPreference).where(
        UserPreference.tenant_id == tenant_id,
        UserPreference.user_id == user_id,
        UserPreference.preference_key == _PREFERENCE_KEY,
    )
    return await session.scalar(stmt)


@router.get("/preferences", response_model=UserPreferencesResponse)
async def get_preferences(
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> UserPreferencesResponse:
    row = await _get_preference(session, tenant_id=tenant.id, user_id=current_user.id)
    value = dict(row.value or {}) if row else {}
    return UserPreferencesResponse(
        settings=dict(value.get("settings") or {}),
        memories=list(value.get("memories") or []),
    )


@router.patch("/preferences", response_model=UserPreferencesResponse)
async def update_preferences(
    payload: UserPreferencesPayload,
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_control_session),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> UserPreferencesResponse:
    row = await _get_preference(session, tenant_id=tenant.id, user_id=current_user.id)
    value = {
        "settings": payload.settings,
        "memories": payload.memories,
    }
    if row is None:
        row = UserPreference(
            tenant_id=tenant.id,
            user_id=current_user.id,
            preference_key=_PREFERENCE_KEY,
            value=value,
        )
        session.add(row)
    else:
        row.value = value

    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="settings.preferences.update",
        payload={"keys": sorted(payload.settings.keys()), "memory_count": len(payload.memories)},
    )
    await session.commit()
    return UserPreferencesResponse(**value)
