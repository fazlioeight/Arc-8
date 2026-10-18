"""RBAC + IDOR-prevention tests for app.utils.rbac.

Covers:
  * require_role allows listed roles, denies others, and platform_admin bypass.
  * Clinical-alias role mapping (spec vocab -> real roles).
  * authorize_access: owner access OK; non-owner, cross-tenant, and missing all
    raise an *identical* 403 (never 404, no existence leak).
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models.tables import PortalSavedItem, Tenant, User
from app.db.session import control_session
from app.utils.rbac import Role, authorize_access, normalize_role, require_role
from app.utils.security import AuthenticatedUser

pytestmark = pytest.mark.anyio("asyncio")


def _user(role: str, *, uid: int = 1, email: str = "u@example.com", tenant_id: int = 1) -> AuthenticatedUser:
    return AuthenticatedUser(
        id=uid, email=email, tenant_id=tenant_id, tenant_key="prominencehealth",
        role=role, scopes=[], app_permissions={},
    )


# ── require_role ──────────────────────────────────────────────────────────


async def test_require_role_allows_listed_role():
    dep = require_role(Role.ADMIN)
    user = _user("admin")
    assert await dep(current_user=user) is user


async def test_require_role_denies_unlisted_role():
    dep = require_role(Role.ADMIN)
    with pytest.raises(HTTPException) as exc:
        await dep(current_user=_user("user"))
    assert exc.value.status_code == 403
    assert exc.value.detail == "Access denied"


async def test_platform_admin_bypasses_any_role_requirement():
    dep = require_role(Role.USER)  # platform_admin not even listed
    user = _user("platform_admin")
    assert await dep(current_user=user) is user


async def test_clinical_aliases_map_to_real_roles():
    # "clinician" maps to analyst; an analyst should satisfy require_role("clinician")
    assert normalize_role("CLINICIAN") == Role.ANALYST.value
    dep = require_role("clinician")
    assert await dep(current_user=_user("analyst")) is not None
    with pytest.raises(HTTPException):
        await dep(current_user=_user("user"))


# ── authorize_access (IDOR prevention) ──────────────────────────────────────


async def _seed_saved_item():
    async with control_session() as session:
        tenant = await session.scalar(select(Tenant).where(Tenant.key == "prominencehealth"))
        user = await session.scalar(
            select(User).where(User.email == "user@example.com", User.tenant_id == tenant.id)
        )
        item = PortalSavedItem(tenant_id=tenant.id, user_id=user.id, title="My saved view")
        session.add(item)
        await session.commit()
        await session.refresh(item)
        return tenant.id, user.id, item.id


async def test_owner_can_access_own_resource():
    tenant_id, user_id, item_id = await _seed_saved_item()
    async with control_session() as session:
        user = _user("user", uid=user_id, email="user@example.com", tenant_id=tenant_id)
        tenant_ctx = SimpleNamespace(id=tenant_id)
        resource = await authorize_access(session, user, tenant_ctx, item_id, "portal_saved_item")
        assert resource.id == item_id


async def test_non_owner_is_forbidden_not_found():
    tenant_id, _owner_id, item_id = await _seed_saved_item()
    async with control_session() as session:
        attacker = _user("user", uid=999_999, email="attacker@example.com", tenant_id=tenant_id)
        tenant_ctx = SimpleNamespace(id=tenant_id)
        with pytest.raises(HTTPException) as exc:
            await authorize_access(session, attacker, tenant_ctx, item_id, "portal_saved_item")
        assert exc.value.status_code == 403  # not 404
        assert exc.value.detail == "Access denied"


async def test_cross_tenant_access_is_forbidden():
    tenant_id, user_id, item_id = await _seed_saved_item()
    async with control_session() as session:
        user = _user("user", uid=user_id, email="user@example.com", tenant_id=tenant_id)
        other_tenant = SimpleNamespace(id=tenant_id + 9_999)
        with pytest.raises(HTTPException) as exc:
            await authorize_access(session, user, other_tenant, item_id, "portal_saved_item")
        assert exc.value.status_code == 403


async def test_missing_resource_is_forbidden_not_found():
    tenant_id, user_id, item_id = await _seed_saved_item()
    async with control_session() as session:
        user = _user("user", uid=user_id, email="user@example.com", tenant_id=tenant_id)
        tenant_ctx = SimpleNamespace(id=tenant_id)
        with pytest.raises(HTTPException) as exc:
            await authorize_access(session, user, tenant_ctx, item_id + 1_000_000, "portal_saved_item")
        # Same 403/"Access denied" as a real-but-forbidden row: no existence leak.
        assert exc.value.status_code == 403
        assert exc.value.detail == "Access denied"


async def test_admin_bypasses_ownership_within_tenant():
    tenant_id, _owner_id, item_id = await _seed_saved_item()
    async with control_session() as session:
        admin = _user("admin", uid=42, email="admin@example.com", tenant_id=tenant_id)
        tenant_ctx = SimpleNamespace(id=tenant_id)
        resource = await authorize_access(session, admin, tenant_ctx, item_id, "portal_saved_item")
        assert resource.id == item_id


async def test_unknown_resource_type_fails_closed():
    async with control_session() as session:
        user = _user("user")
        with pytest.raises(HTTPException) as exc:
            await authorize_access(session, user, SimpleNamespace(id=1), 1, "no_such_type")
        assert exc.value.status_code == 403
