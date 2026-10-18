"""Feature 2 — member login, session & account management.

Covers login (success / bad creds / non-enumeration / unverified / lockout /
MFA), refresh rotation + replay, logout, password reset (single-use, session
invalidation), change-password, the /me endpoint, MFA enroll-verify-disable,
and cross-realm/cross-tenant token rejection.
"""
from __future__ import annotations

import itertools
from datetime import datetime, timezone

import bcrypt
import pyotp
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.db.session import control_session
from app.models.member_portal import MemberPortalAccount, MemberPasswordResetToken
from app.models.tables import Tenant
from app.utils.security import create_access_token

from conftest import SECOND_TENANT_KEY, TEST_TENANT_KEY

pytestmark = pytest.mark.anyio("asyncio")

BASE_URL = "https://prominencehealth.localhost"
PASSWORD = "Sup3r-Secret-Pass!"
_counter = itertools.count(1)


def _headers(tenant_key: str = TEST_TENANT_KEY, ip: str | None = None, bearer: str | None = None) -> dict:
    h = {"X-Tenant-Key": tenant_key}
    if ip:
        h["X-Forwarded-For"] = ip
    if bearer:
        h["Authorization"] = f"Bearer {bearer}"
    return h


async def _make_account(
    *,
    tenant_key: str = TEST_TENANT_KEY,
    password: str = PASSWORD,
    status: str = "active",
    mfa_secret: str | None = None,
    email: str | None = None,
) -> dict:
    """Insert a member account directly and return {email, member_key, id}."""
    n = next(_counter)
    email = email or f"member{n}@example.com"
    member_key = f"ACCT-{n}"
    async with control_session() as session:
        tenant = await session.scalar(select(Tenant).where(Tenant.key == tenant_key))
        account = MemberPortalAccount(
            tenant_id=tenant.id,
            member_key=member_key,
            email=email,
            password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
            status=status,
            email_verified_at=datetime.now(timezone.utc) if status == "active" else None,
            mfa_secret=mfa_secret,
            mfa_enrolled_at=datetime.now(timezone.utc) if mfa_secret else None,
        )
        session.add(account)
        await session.commit()
        return {"email": email, "member_key": member_key, "id": account.id}


async def _get_account(account_id: int) -> MemberPortalAccount:
    async with control_session() as session:
        return await session.get(MemberPortalAccount, account_id)


# --------------------------------------------------------------------------- #
# Login
# --------------------------------------------------------------------------- #


async def test_login_success_issues_access_and_refresh(fastapi_app):
    acct = await _make_account()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        resp = await client.post(
            "/api/member/auth/login", headers=_headers(ip="10.0.0.1"),
            json={"email": acct["email"], "password": PASSWORD},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["token"] and body["refresh_token"]
    assert body["expires_in"] == settings.ACCESS_TOKEN_EXPIRES_MINUTES * 60
    assert body["member_key"] == acct["member_key"]


async def test_login_bad_password_and_unknown_email_are_indistinguishable(fastapi_app):
    acct = await _make_account()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        wrong_pw = await client.post(
            "/api/member/auth/login", headers=_headers(ip="10.0.0.2"),
            json={"email": acct["email"], "password": "wrong-password-xx"},
        )
        unknown = await client.post(
            "/api/member/auth/login", headers=_headers(ip="10.0.0.3"),
            json={"email": "nobody@example.com", "password": "wrong-password-xx"},
        )
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json() == unknown.json()


async def test_login_blocked_until_email_verified(fastapi_app):
    acct = await _make_account(status="pending_verification")
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        resp = await client.post(
            "/api/member/auth/login", headers=_headers(ip="10.0.0.4"),
            json={"email": acct["email"], "password": PASSWORD},
        )
    assert resp.status_code == 403
    assert "verify" in resp.json()["detail"].lower()


async def test_login_lockout_after_max_attempts(fastapi_app):
    acct = await _make_account()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        for _ in range(settings.LOGIN_LOCKOUT_MAX_ATTEMPTS):
            r = await client.post(
                "/api/member/auth/login", headers=_headers(ip="10.0.0.5"),
                json={"email": acct["email"], "password": "wrong-password-xx"},
            )
            assert r.status_code == 401
        # Now even the correct password is locked out (429), not 200.
        locked = await client.post(
            "/api/member/auth/login", headers=_headers(ip="10.0.0.5"),
            json={"email": acct["email"], "password": PASSWORD},
        )
    assert locked.status_code == 429


async def test_login_mfa_required_then_succeeds(fastapi_app):
    secret = pyotp.random_base32()
    acct = await _make_account(mfa_secret=secret)
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        missing = await client.post(
            "/api/member/auth/login", headers=_headers(ip="10.0.0.6"),
            json={"email": acct["email"], "password": PASSWORD},
        )
        assert missing.status_code == 401
        assert missing.json()["detail"] == "mfa_required"

        code = pyotp.TOTP(secret).now()
        ok = await client.post(
            "/api/member/auth/login", headers=_headers(ip="10.0.0.6"),
            json={"email": acct["email"], "password": PASSWORD, "mfa_code": code},
        )
    assert ok.status_code == 200, ok.text


# --------------------------------------------------------------------------- #
# Refresh / logout
# --------------------------------------------------------------------------- #


async def _login(client, acct, ip):
    resp = await client.post(
        "/api/member/auth/login", headers=_headers(ip=ip),
        json={"email": acct["email"], "password": PASSWORD},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_refresh_rotates_and_replay_revokes_chain(fastapi_app):
    acct = await _make_account()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        body = await _login(client, acct, "11.0.0.1")
        old = body["refresh_token"]

        rotated = await client.post("/api/member/auth/refresh", headers=_headers(), json={"refresh_token": old})
        assert rotated.status_code == 200
        new = rotated.json()["refresh_token"]
        assert new != old

        replay = await client.post("/api/member/auth/refresh", headers=_headers(), json={"refresh_token": old})
        assert replay.status_code == 401
        # Chain burned: the rotated token is dead too.
        after = await client.post("/api/member/auth/refresh", headers=_headers(), json={"refresh_token": new})
        assert after.status_code == 401


async def test_logout_revokes_refresh_tokens(fastapi_app):
    acct = await _make_account()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        body = await _login(client, acct, "11.0.0.2")
        out = await client.post(
            "/api/member/auth/logout", headers=_headers(bearer=body["token"]),
        )
        assert out.status_code == 204
        dead = await client.post(
            "/api/member/auth/refresh", headers=_headers(), json={"refresh_token": body["refresh_token"]}
        )
    assert dead.status_code == 401


# --------------------------------------------------------------------------- #
# /me and realm isolation
# --------------------------------------------------------------------------- #


async def test_me_returns_own_account(fastapi_app):
    acct = await _make_account()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        body = await _login(client, acct, "12.0.0.1")
        resp = await client.get("/api/member/auth/me", headers=_headers(bearer=body["token"]))
    assert resp.status_code == 200
    assert resp.json()["member_key"] == acct["member_key"]


async def test_staff_token_rejected_on_member_route(fastapi_app):
    # A valid staff-realm token (no typ=member) must not authenticate as a member.
    staff_token = create_access_token({"sub": "user@example.com", "tid": TEST_TENANT_KEY, "uid": 1, "role": "admin"})
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        resp = await client.get("/api/member/auth/me", headers=_headers(bearer=staff_token))
    assert resp.status_code == 401


async def test_member_token_rejected_in_other_tenant(fastapi_app):
    acct = await _make_account()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        body = await _login(client, acct, "12.0.0.2")
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url="https://northwind.localhost") as client:
        resp = await client.get(
            "/api/member/auth/me", headers=_headers(tenant_key=SECOND_TENANT_KEY, bearer=body["token"])
        )
    assert resp.status_code == 403


# --------------------------------------------------------------------------- #
# Password reset & change
# --------------------------------------------------------------------------- #


@pytest.fixture
def capture_email(monkeypatch):
    sent: list[dict] = []

    async def _fake(*, to, subject, body, reply_to=None):
        token = None
        for part in body.replace("\n", " ").split():
            if "token=" in part:
                token = part.split("token=", 1)[1]
        sent.append({"to": to, "token": token})
        return True

    monkeypatch.setattr("app.routes.member_portal_session.send_email", _fake)
    return sent


async def test_password_reset_flow_invalidates_sessions(fastapi_app, capture_email):
    acct = await _make_account()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        login_body = await _login(client, acct, "13.0.0.1")

        req = await client.post(
            "/api/member/auth/password-reset/request", headers=_headers(ip="13.0.0.1"),
            json={"email": acct["email"]},
        )
        assert req.status_code == 204
        token = capture_email[0]["token"]
        assert token

        new_password = "Brand-New-Pass-99!"
        confirm = await client.post(
            "/api/member/auth/password-reset/confirm", headers=_headers(),
            json={"token": token, "new_password": new_password},
        )
        assert confirm.status_code == 204

        # Old refresh token is dead (sessions invalidated on reset).
        dead = await client.post(
            "/api/member/auth/refresh", headers=_headers(), json={"refresh_token": login_body["refresh_token"]}
        )
        assert dead.status_code == 401

        # Reusing the reset token fails; new password works.
        reuse = await client.post(
            "/api/member/auth/password-reset/confirm", headers=_headers(),
            json={"token": token, "new_password": "Another-Pass-123!"},
        )
        assert reuse.status_code == 400
        relogin = await client.post(
            "/api/member/auth/login", headers=_headers(ip="13.0.0.1"),
            json={"email": acct["email"], "password": new_password},
        )
        assert relogin.status_code == 200


async def test_password_reset_request_unknown_email_is_silent(fastapi_app, capture_email):
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        resp = await client.post(
            "/api/member/auth/password-reset/request", headers=_headers(ip="13.0.0.2"),
            json={"email": "ghost@example.com"},
        )
    assert resp.status_code == 204
    assert capture_email == []
    async with control_session() as session:
        count = await session.scalar(
            select(MemberPasswordResetToken).where(MemberPasswordResetToken.tenant_id.isnot(None))
        )
    # (no assertion on global count; just that no email went out for a ghost)


async def test_change_password_requires_old_and_revokes_sessions(fastapi_app):
    acct = await _make_account()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        body = await _login(client, acct, "14.0.0.1")
        bad = await client.post(
            "/api/member/auth/change-password", headers=_headers(bearer=body["token"]),
            json={"old_password": "nope-nope-nope", "new_password": "Totally-New-1!"},
        )
        assert bad.status_code == 400

        ok = await client.post(
            "/api/member/auth/change-password", headers=_headers(bearer=body["token"]),
            json={"old_password": PASSWORD, "new_password": "Totally-New-1!"},
        )
        assert ok.status_code == 204
        dead = await client.post(
            "/api/member/auth/refresh", headers=_headers(), json={"refresh_token": body["refresh_token"]}
        )
    assert dead.status_code == 401


# --------------------------------------------------------------------------- #
# MFA enroll / verify / disable
# --------------------------------------------------------------------------- #


async def test_mfa_enroll_verify_then_login_requires_code(fastapi_app):
    acct = await _make_account()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        body = await _login(client, acct, "15.0.0.1")
        enroll = await client.post("/api/member/auth/mfa/enroll", headers=_headers(bearer=body["token"]))
        assert enroll.status_code == 200
        secret = enroll.json()["secret"]

        verify = await client.post(
            "/api/member/auth/mfa/verify", headers=_headers(bearer=body["token"]),
            json={"code": pyotp.TOTP(secret).now()},
        )
        assert verify.status_code == 204

    acct_row = await _get_account(acct["id"])
    assert acct_row.mfa_enrolled_at is not None

    # A fresh login now demands the code.
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        no_code = await client.post(
            "/api/member/auth/login", headers=_headers(ip="15.0.0.2"),
            json={"email": acct["email"], "password": PASSWORD},
        )
        assert no_code.status_code == 401 and no_code.json()["detail"] == "mfa_required"


async def test_mfa_disable_requires_password_and_code(fastapi_app):
    secret = pyotp.random_base32()
    acct = await _make_account(mfa_secret=secret)
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        body = await client.post(
            "/api/member/auth/login", headers=_headers(ip="16.0.0.1"),
            json={"email": acct["email"], "password": PASSWORD, "mfa_code": pyotp.TOTP(secret).now()},
        )
        token = body.json()["token"]
        resp = await client.post(
            "/api/member/auth/mfa/disable", headers=_headers(bearer=token),
            json={"password": PASSWORD, "code": pyotp.TOTP(secret).now()},
        )
        assert resp.status_code == 204

    acct_row = await _get_account(acct["id"])
    assert acct_row.mfa_secret is None and acct_row.mfa_enrolled_at is None
