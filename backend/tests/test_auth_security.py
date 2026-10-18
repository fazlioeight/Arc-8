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


async def test_password_reset_flow(fastapi_app):
    """Request a reset, fetch the token from the DB, confirm with a new password, log in."""
    from app.models.tables import PasswordResetToken, Tenant

    email = "reset-user@example.com"
    await _ensure_user(email, "old-password-1234", role="user")

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        req = await client.post(
            "/api/auth/password-reset/request",
            json={"email": email},
            headers=TENANT_HEADER,
        )
        assert req.status_code == 204, req.text

        # No enumeration: unknown email also returns 204.
        req2 = await client.post(
            "/api/auth/password-reset/request",
            json={"email": "ghost@example.com"},
            headers=TENANT_HEADER,
        )
        assert req2.status_code == 204

        async with control_session() as db:
            tenant = await db.scalar(select(Tenant).where(Tenant.key == TENANT_KEY))
            record = await db.scalar(
                select(PasswordResetToken)
                .where(PasswordResetToken.tenant_id == tenant.id)
                .order_by(PasswordResetToken.id.desc())
            )
            assert record, "reset token was not persisted"
            token_hash = record.token_hash

        # The test mirrors how an operator would retrieve the token until an
        # email sender is integrated: it knows the sha256 and brute-forces it
        # against a deterministic value isn't possible, so we drive the DB
        # directly to pick a known token. To exercise the endpoint without
        # access to the raw token, we manufacture a fresh known one.
        from app.routes.auth import _hash_token
        manufactured = "test-reset-token-" + "x" * 40
        async with control_session() as db:
            record = await db.get(PasswordResetToken, record.id)
            record.token_hash = _hash_token(manufactured)
            await db.commit()

        confirm = await client.post(
            "/api/auth/password-reset/confirm",
            json={"token": manufactured, "new_password": "new-password-1234"},
            headers=TENANT_HEADER,
        )
        assert confirm.status_code == 204, confirm.text

        # Old password no longer works.
        bad = await client.post(
            "/api/login",
            json={"email": email, "password": "old-password-1234", "tenant": TENANT_KEY},
            headers=TENANT_HEADER,
        )
        assert bad.status_code == 401, bad.text

        # New password works.
        good = await client.post(
            "/api/login",
            json={"email": email, "password": "new-password-1234", "tenant": TENANT_KEY},
            headers=TENANT_HEADER,
        )
        assert good.status_code == 200, good.text

        # Used token can't be replayed.
        replay = await client.post(
            "/api/auth/password-reset/confirm",
            json={"token": manufactured, "new_password": "another-pw-1234"},
            headers=TENANT_HEADER,
        )
    assert replay.status_code == 400, replay.text


async def test_change_password_requires_current(fastapi_app):
    """POST /api/auth/change-password with wrong old password is rejected."""
    await _ensure_user("changer@example.com", "right-password-1234", role="user")
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client, "changer@example.com", "right-password-1234")

        bad = await client.post(
            "/api/auth/change-password",
            json={"old_password": "wrong", "new_password": "new-password-1234"},
            headers={"Authorization": f"Bearer {token}", **TENANT_HEADER},
        )
        assert bad.status_code == 400, bad.text

        ok = await client.post(
            "/api/auth/change-password",
            json={"old_password": "right-password-1234", "new_password": "new-password-1234"},
            headers={"Authorization": f"Bearer {token}", **TENANT_HEADER},
        )
        assert ok.status_code == 204, ok.text

        new_login = await client.post(
            "/api/login",
            json={"email": "changer@example.com", "password": "new-password-1234", "tenant": TENANT_KEY},
            headers=TENANT_HEADER,
        )
    assert new_login.status_code == 200, new_login.text


async def test_logout_revokes_token(fastapi_app, monkeypatch):
    """After /api/logout, the token must be rejected by subsequent requests."""
    revoked: set[str] = set()

    async def fake_revoke(jti: str, ttl_seconds: int) -> bool:
        if ttl_seconds > 0 and jti:
            revoked.add(jti)
        return True

    async def fake_is_revoked(jti):
        return bool(jti) and jti in revoked

    monkeypatch.setattr("app.utils.security.revoke_jti", fake_revoke)
    monkeypatch.setattr("app.utils.security.is_jti_revoked", fake_is_revoked)
    monkeypatch.setattr("app.main.revoke_jti", fake_revoke)

    await _ensure_user("logout-user@example.com", "password", role="user")
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client, "logout-user@example.com", "password")

        ok = await client.get("/api/portal/overview", headers={"Authorization": f"Bearer {token}", **TENANT_HEADER})
        assert ok.status_code == 200, ok.text

        logout = await client.post("/api/logout", headers={"Authorization": f"Bearer {token}", **TENANT_HEADER})
        assert logout.status_code == 204, logout.text

        denied = await client.get("/api/portal/overview", headers={"Authorization": f"Bearer {token}", **TENANT_HEADER})
    assert denied.status_code == 401, denied.text


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


async def test_mfa_enroll_verify_then_login_requires_code(fastapi_app):
    """End-to-end TOTP flow: enroll, verify, then login refuses without code."""
    import pyotp
    from app.models.tables import User

    await _ensure_user("mfa-user@example.com", "password-1234567", role="user")
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client, "mfa-user@example.com", "password-1234567")
        headers = {"Authorization": f"Bearer {token}", **TENANT_HEADER}

        enroll = await client.post("/api/auth/mfa/enroll", headers=headers)
        assert enroll.status_code == 200, enroll.text
        secret = enroll.json()["secret"]

        # Wrong code: 400
        bad = await client.post("/api/auth/mfa/verify", json={"code": "000000"}, headers=headers)
        assert bad.status_code == 400

        good_code = pyotp.TOTP(secret).now()
        verify = await client.post("/api/auth/mfa/verify", json={"code": good_code}, headers=headers)
        assert verify.status_code == 204, verify.text

        # New login without code should now be denied with mfa_required.
        no_code = await client.post(
            "/api/login",
            json={"email": "mfa-user@example.com", "password": "password-1234567", "tenant": TENANT_KEY},
            headers=TENANT_HEADER,
        )
        assert no_code.status_code == 401
        assert no_code.json().get("detail") == "mfa_required"

        # Login with a fresh code succeeds.
        with_code = await client.post(
            "/api/login",
            json={
                "email": "mfa-user@example.com",
                "password": "password-1234567",
                "tenant": TENANT_KEY,
                "mfa_code": pyotp.TOTP(secret).now(),
            },
            headers=TENANT_HEADER,
        )
    assert with_code.status_code == 200, with_code.text


async def test_admin_login_flags_mfa_enrollment_required(fastapi_app):
    """An admin with no MFA enrolled gets mfa_enrollment_required=true."""
    await _ensure_user("mfa-admin@prominencehealth.test", "adminpw-12345", role="admin")
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        resp = await client.post(
            "/api/login",
            json={"email": "mfa-admin@prominencehealth.test", "password": "adminpw-12345", "tenant": TENANT_KEY},
            headers=TENANT_HEADER,
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body.get("mfa_enrollment_required") is True


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
