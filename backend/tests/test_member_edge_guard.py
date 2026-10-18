"""Fast-follow hardening tests:

  * MemberEdgeGuardMiddleware — when MEMBER_EDGE_SHARED_SECRET is set, /api/member/*
    is reachable only with the matching X-Edge-Auth header (else 404); dormant
    when unset; staff routes unaffected.
  * Member JWT realm key separation — member tokens are signed/verified with
    MEMBER_JWT_SECRET_KEY when set, isolated from the staff SECRET_KEY.

Settings are patched on each module's own bound ``settings`` object (the test
harness reassigns ``config.settings``, so patching that singleton wouldn't reach
the module-level references the code actually reads).
"""
from __future__ import annotations

from datetime import datetime, timezone

import bcrypt
import jwt
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.db.session import control_session
from app.middleware import member_edge_guard as guard_mod
from app.models.member_portal import MemberPortalAccount
from app.models.tables import Tenant
from app.utils import member_auth

from conftest import TEST_TENANT_KEY

pytestmark = pytest.mark.anyio("asyncio")

BASE_URL = "https://prominencehealth.localhost"
PASSWORD = "Sup3r-Secret-Pass!"


def _h(extra=None):
    h = {"X-Tenant-Key": TEST_TENANT_KEY}
    if extra:
        h.update(extra)
    return h


async def _make_active_account(email):
    async with control_session() as session:
        tenant = await session.scalar(select(Tenant).where(Tenant.key == TEST_TENANT_KEY))
        session.add(
            MemberPortalAccount(
                tenant_id=tenant.id,
                member_key=f"EDGE-{email}",
                email=email,
                password_hash=bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt()).decode(),
                status="active",
                email_verified_at=datetime.now(timezone.utc),
            )
        )
        await session.commit()


# --------------------------------------------------------------------------- #
# Edge guard middleware
# --------------------------------------------------------------------------- #


async def test_guard_dormant_when_secret_unset(fastapi_app):
    assert not guard_mod.settings.MEMBER_EDGE_SHARED_SECRET
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        resp = await client.get("/api/member/auth/me", headers=_h())
    # Reaches the route (401 missing auth), not a guard 404.
    assert resp.status_code == 401


async def test_guard_blocks_member_route_without_header(fastapi_app, monkeypatch):
    monkeypatch.setattr(guard_mod.settings, "MEMBER_EDGE_SHARED_SECRET", "edge-shhh")
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        blocked = await client.get("/api/member/auth/me", headers=_h())
        assert blocked.status_code == 404
        wrong = await client.get("/api/member/auth/me", headers=_h({"X-Edge-Auth": "nope"}))
        assert wrong.status_code == 404
        ok = await client.get("/api/member/auth/me", headers=_h({"X-Edge-Auth": "edge-shhh"}))
        assert ok.status_code == 401  # guard passed; route ran


async def test_guard_does_not_affect_staff_routes(fastapi_app, monkeypatch):
    monkeypatch.setattr(guard_mod.settings, "MEMBER_EDGE_SHARED_SECRET", "edge-shhh")
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        resp = await client.post(
            "/api/login", headers=_h(), json={"email": "user@example.com", "password": "password"}
        )
    assert resp.status_code == 200


async def test_member_login_works_through_guard_with_header(fastapi_app, monkeypatch):
    monkeypatch.setattr(guard_mod.settings, "MEMBER_EDGE_SHARED_SECRET", "edge-shhh")
    await _make_active_account("edge-login@example.com")
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        resp = await client.post(
            "/api/member/auth/login",
            headers=_h({"X-Edge-Auth": "edge-shhh", "X-Forwarded-For": "20.0.0.1"}),
            json={"email": "edge-login@example.com", "password": PASSWORD},
        )
    assert resp.status_code == 200, resp.text


# --------------------------------------------------------------------------- #
# Member JWT key separation
# --------------------------------------------------------------------------- #


def test_member_secret_falls_back_to_secret_key(monkeypatch):
    monkeypatch.setattr(member_auth.settings, "MEMBER_JWT_SECRET_KEY", None)
    assert member_auth._member_secret() == member_auth.settings.SECRET_KEY


def test_member_token_uses_dedicated_key(monkeypatch):
    monkeypatch.setattr(member_auth.settings, "MEMBER_JWT_SECRET_KEY", "member-only-key-distinct")

    class _Acct:
        id = 7
        email = "k@example.com"
        member_key = "MK-7"
        mfa_enrolled_at = None

    class _Tenant:
        key = TEST_TENANT_KEY

    token = member_auth.create_member_access_token(_Acct(), _Tenant())
    payload = member_auth.decode_member_token(token)
    assert payload["typ"] == "member" and payload["mid"] == 7

    # A token signed with the staff SECRET_KEY must NOT validate as a member token.
    staff_signed = jwt.encode(
        {"sub": "x", "typ": "member"}, member_auth.settings.SECRET_KEY, algorithm="HS256"
    )
    with pytest.raises(Exception):
        member_auth.decode_member_token(staff_signed)
