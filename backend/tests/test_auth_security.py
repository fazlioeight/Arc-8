"""Regression tests guarding the auth + admin paths we've fixed.

Each test exists because of a real bug that shipped: covered are login email
casing, the admin PATCH /users/{id} applications payload, cross-tenant access
isolation, and role-escalation prevention.
"""

from __future__ import annotations

import bcrypt
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.db.session import control_session
from app.models.tables import Tenant, TenantDataBase, User
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

BASE_URL = "https://prominencehealth.localhost"
TENANT_KEY = "prominencehealth"
TENANT_HEADER = {"X-Tenant-Key": TENANT_KEY}

pytestmark = pytest.mark.anyio("asyncio")


async def _ensure_user(email: str, password: str, *, role: str, tenant_key: str = TENANT_KEY) -> int:
    """Seed (or replace) a user in the control DB; return its id.

    Email is stored normalized (lowercase, stripped) to match the schema's
    NormalizedEmail behavior the admin route applies on create.
    """
    normalized = email.strip().lower()
    async with control_session() as session:
        tenant = await session.scalar(select(Tenant).where(Tenant.key == tenant_key))
        assert tenant, f"tenant {tenant_key!r} not seeded"
        existing = await session.scalar(
            select(User).where(User.email == normalized, User.tenant_id == tenant.id)
        )
        if existing:
            existing.password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
            existing.role = role
            existing.is_active = True
            await session.commit()
            return existing.id
        user = User(
            tenant_id=tenant.id,
            email=normalized,
            password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
            role=role,
            is_active=True,
            app_permissions={"portal": "user", "admin_console": "admin"},
        )
        session.add(user)
        await session.commit()
        return user.id


async def _ensure_tenant(key: str) -> None:
    """Seed an extra tenant + its empty SQLite tenant DB (for cross-tenant tests)."""
    from app.core.config import settings
    tenant_db = settings.DEFAULT_TENANT_DATABASE_URL.format(tenant_key=key)
    async with control_session() as session:
        existing = await session.scalar(select(Tenant).where(Tenant.key == key))
        if not existing:
            session.add(
                Tenant(
                    key=key,
                    slug=key,
                    name=key.title(),
                    db_connection_uri=tenant_db,
                    billing_plan="standard",
                    phi_data_classification="restricted",
                    purchased_applications={"portal": True},
                )
            )
            await session.commit()
    engine = create_async_engine(tenant_db, future=True, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(TenantDataBase.metadata.create_all)
    await engine.dispose()


async def _login(client: AsyncClient, email: str, password: str, tenant: str = TENANT_KEY) -> str:
    resp = await client.post(
        "/api/login",
        json={"email": email, "password": password, "tenant": tenant},
        headers={"X-Tenant-Key": tenant},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


async def test_login_is_case_insensitive(fastapi_app):
    """Stored email is lowercase; logging in with mixed case must still succeed."""
    await _ensure_user("CaseTest@Example.com", "password", role="user")
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        for variant in ("CaseTest@Example.com", "casetest@example.com", "  CASETEST@example.com  "):
            resp = await client.post(
                "/api/login",
                json={"email": variant, "password": "password", "tenant": TENANT_KEY},
                headers=TENANT_HEADER,
            )
            assert resp.status_code == 200, f"variant {variant!r} got {resp.status_code}: {resp.text}"


async def test_admin_patch_user_with_applications_payload(fastapi_app):
    """PATCH /api/admin/users/{id} with applications payload; regression for _clean_permissions arity bug."""
    await _ensure_user("admin@prominencehealth.test", "adminpw1", role="admin")
    target_id = await _ensure_user("patchtarget@example.com", "password", role="user")
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client, "admin@prominencehealth.test", "adminpw1")
        resp = await client.patch(
            f"/api/admin/users/{target_id}",
            headers={"Authorization": f"Bearer {token}", **TENANT_HEADER},
            json={"applications": {"coding": "user", "dashboard": "user"}},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["applications"].get("coding") == "user"
    assert body["applications"].get("dashboard") == "user"


async def test_cross_tenant_patch_user_returns_404(fastapi_app):
    """An admin in tenant A cannot PATCH a user belonging to tenant B."""
    await _ensure_tenant("othertenant")
    admin_id = await _ensure_user("admin2@prominencehealth.test", "adminpw1", role="admin")
    other_user_id = await _ensure_user("other@example.com", "password", role="user", tenant_key="othertenant")
    assert admin_id != other_user_id
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client, "admin2@prominencehealth.test", "adminpw1")
        resp = await client.patch(
            f"/api/admin/users/{other_user_id}",
            headers={"Authorization": f"Bearer {token}", **TENANT_HEADER},
            json={"is_active": False},
        )
    assert resp.status_code == 404, resp.text


async def test_admin_can_delete_user(fastapi_app):
    """DELETE /api/admin/users/{id} removes the user and returns 204."""
    await _ensure_user("admin4@prominencehealth.test", "adminpw1", role="admin")
    target_id = await _ensure_user("deletable@example.com", "password", role="user")
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client, "admin4@prominencehealth.test", "adminpw1")
        resp = await client.delete(
            f"/api/admin/users/{target_id}",
            headers={"Authorization": f"Bearer {token}", **TENANT_HEADER},
        )
        assert resp.status_code == 204, resp.text
        # second delete is a 404 (user no longer exists)
        resp2 = await client.delete(
            f"/api/admin/users/{target_id}",
            headers={"Authorization": f"Bearer {token}", **TENANT_HEADER},
        )
    assert resp2.status_code == 404, resp2.text


async def test_admin_cannot_delete_self(fastapi_app):
    """An admin must not be able to delete their own account."""
    admin_id = await _ensure_user("admin5@prominencehealth.test", "adminpw1", role="admin")
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client, "admin5@prominencehealth.test", "adminpw1")
        resp = await client.delete(
            f"/api/admin/users/{admin_id}",
            headers={"Authorization": f"Bearer {token}", **TENANT_HEADER},
        )
    assert resp.status_code == 400, resp.text


async def test_tenant_admin_cannot_promote_to_platform_admin(fastapi_app):
    """A tenant admin must not be able to promote any user (including self) to platform_admin."""
    await _ensure_user("admin3@prominencehealth.test", "adminpw1", role="admin")
    target_id = await _ensure_user("promotee@example.com", "password", role="user")
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client, "admin3@prominencehealth.test", "adminpw1")
        resp = await client.patch(
            f"/api/admin/users/{target_id}",
            headers={"Authorization": f"Bearer {token}", **TENANT_HEADER},
            json={"role": "platform_admin"},
        )
    assert resp.status_code == 403, resp.text
