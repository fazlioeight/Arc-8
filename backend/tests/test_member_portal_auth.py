"""Feature 1 — member self-registration & identity verification.

Covers: successful proofing + account binding, every failure path, the
anti-enumeration guarantee (identical response for no-match / already-registered
/ success), DB-backed lockout, email verification, and cross-tenant isolation.
"""
from __future__ import annotations

import itertools
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.db.session import control_session
from app.models.member360 import Member360Member
from app.models.member_portal import MemberPortalAccount

from conftest import (
    NORTHWIND_MEMBER,
    PROMINENCE_MEMBER,
    SECOND_TENANT_KEY,
    TEST_TENANT_DB_TEMPLATE,
    TEST_TENANT_KEY,
)

pytestmark = pytest.mark.anyio("asyncio")

BASE_URL = "https://prominencehealth.localhost"
_counter = itertools.count(1)


def _headers(tenant_key: str = TEST_TENANT_KEY, ip: str | None = None) -> dict:
    h = {"X-Tenant-Key": tenant_key}
    if ip:
        h["X-Forwarded-For"] = ip
    return h


async def _insert_member(tenant_key: str, **fields) -> None:
    engine = create_async_engine(TEST_TENANT_DB_TEMPLATE.format(tenant_key=tenant_key), future=True)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            session.add(Member360Member(**fields))
            await session.commit()
    finally:
        await engine.dispose()


async def _fresh_member(tenant_key: str = TEST_TENANT_KEY) -> dict:
    """Seed a unique m360 member and return registration-ready proofing factors."""
    n = next(_counter)
    key = f"GEN-{tenant_key[:3]}-{n}"
    await _insert_member(
        tenant_key,
        member_key=key,
        first_name="Test",
        last_name=f"Person{n}",
        date_of_birth=date(1960, 1, (n % 27) + 1),
        address_zip="30301",
    )
    return {
        "member_id": key,
        "date_of_birth": "1960-01-%02d" % ((n % 27) + 1),
        "last_name": f"Person{n}",
        "zip_code": "30301",
        "email": f"gen{n}@example.com",
        "password": "Sup3r-Secret-Pass!",
    }


@pytest.fixture
def capture_email(monkeypatch):
    """Capture the raw verification token the route hands to send_email."""
    sent: list[dict] = []

    async def _fake_send_email(*, to, subject, body, reply_to=None):
        token = None
        for part in body.replace("\n", " ").split():
            if part.startswith("token="):
                token = part.split("token=", 1)[1]
            elif "verify-email?token=" in part:
                token = part.split("token=", 1)[1]
        sent.append({"to": to, "subject": subject, "token": token})
        return True

    monkeypatch.setattr("app.routes.member_portal.send_email", _fake_send_email)
    return sent


async def _account_count(tenant_key_id_email=None, *, email: str) -> int:
    async with control_session() as session:
        return (
            await session.scalar(
                select(func.count()).select_from(MemberPortalAccount).where(MemberPortalAccount.email == email)
            )
        ) or 0


# --------------------------------------------------------------------------- #
# Happy path
# --------------------------------------------------------------------------- #


async def test_register_success_creates_pending_account_and_sends_email(fastapi_app, capture_email):
    factors = await _fresh_member()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        resp = await client.post("/api/member/auth/register", headers=_headers(ip="1.0.0.1"), json=factors)
    assert resp.status_code == 202, resp.text
    assert len(capture_email) == 1
    assert capture_email[0]["to"] == factors["email"]
    assert capture_email[0]["token"]

    async with control_session() as session:
        account = await session.scalar(
            select(MemberPortalAccount).where(MemberPortalAccount.email == factors["email"])
        )
    assert account is not None
    assert account.member_key == factors["member_id"]
    assert account.status == "pending_verification"
    assert account.email_verified_at is None


async def test_verify_email_activates_account(fastapi_app, capture_email):
    factors = await _fresh_member()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        await client.post("/api/member/auth/register", headers=_headers(ip="1.0.0.2"), json=factors)
        token = capture_email[0]["token"]
        resp = await client.post("/api/member/auth/verify-email", headers=_headers(), json={"token": token})
        assert resp.status_code == 204, resp.text

        # Reusing the now-consumed token fails.
        replay = await client.post("/api/member/auth/verify-email", headers=_headers(), json={"token": token})
        assert replay.status_code == 400

    async with control_session() as session:
        account = await session.scalar(
            select(MemberPortalAccount).where(MemberPortalAccount.email == factors["email"])
        )
    assert account.status == "active"
    assert account.email_verified_at is not None


async def test_verify_email_invalid_token_rejected(fastapi_app):
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        resp = await client.post(
            "/api/member/auth/verify-email", headers=_headers(), json={"token": "x" * 40}
        )
    assert resp.status_code == 400


# --------------------------------------------------------------------------- #
# Failure paths — never reveal which field failed, never create an account
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "override",
    [
        {"date_of_birth": "1999-09-09"},   # wrong DOB
        {"last_name": "Wrongname"},         # wrong last name
        {"zip_code": "99999"},              # wrong ZIP
        {"member_id": "DOES-NOT-EXIST"},   # unknown member id
    ],
)
async def test_register_failure_paths_no_account(fastapi_app, capture_email, override):
    factors = await _fresh_member()
    factors.update(override)
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        resp = await client.post("/api/member/auth/register", headers=_headers(ip="2.0.0.1"), json=factors)
    assert resp.status_code == 202
    assert capture_email == []  # no email on a non-match
    assert await _account_count(email=factors["email"]) == 0


async def test_no_enumeration_response_is_identical(fastapi_app, capture_email):
    """Success, no-match, and already-registered must be byte-identical responses."""
    good = await _fresh_member()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        success = await client.post("/api/member/auth/register", headers=_headers(ip="3.0.0.1"), json=good)
        # Second time for same member => already registered.
        already = await client.post("/api/member/auth/register", headers=_headers(ip="3.0.0.2"), json=good)
        nomatch = await client.post(
            "/api/member/auth/register",
            headers=_headers(ip="3.0.0.3"),
            json={**good, "member_id": "NOPE-123", "email": "other@example.com"},
        )

    assert success.status_code == already.status_code == nomatch.status_code == 202
    assert success.json() == already.json() == nomatch.json()
    # Only the first (genuine) registration sent an email and created one account.
    assert len(capture_email) == 1
    assert await _account_count(email=good["email"]) == 1


# --------------------------------------------------------------------------- #
# Lockout (DB-backed, no Redis required)
# --------------------------------------------------------------------------- #


async def test_lockout_after_max_failed_attempts(fastapi_app, capture_email):
    ip = "4.4.4.4"
    bad = {
        "member_id": "LOCKME-1",
        "date_of_birth": "1900-01-01",
        "last_name": "Nobody",
        "zip_code": "00000",
        "email": "lockme@example.com",
        "password": "Sup3r-Secret-Pass!",
    }
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        for _ in range(settings.LOGIN_LOCKOUT_MAX_ATTEMPTS):
            r = await client.post("/api/member/auth/register", headers=_headers(ip=ip), json=bad)
            assert r.status_code == 202

        # Now this IP is locked: even a genuine match is refused (no account).
        good = await _fresh_member()
        r = await client.post("/api/member/auth/register", headers=_headers(ip=ip), json=good)
        assert r.status_code == 202

    assert await _account_count(email=good["email"]) == 0


# --------------------------------------------------------------------------- #
# Cross-tenant isolation
# --------------------------------------------------------------------------- #


async def test_member_cannot_register_in_wrong_tenant(fastapi_app, capture_email):
    """A Prominence member's id must not proof against the Northwind tenant."""
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url="https://northwind.localhost") as client:
        resp = await client.post(
            "/api/member/auth/register",
            headers=_headers(tenant_key=SECOND_TENANT_KEY, ip="5.0.0.1"),
            json={
                "member_id": PROMINENCE_MEMBER["member_key"],
                "date_of_birth": PROMINENCE_MEMBER["date_of_birth"].isoformat(),
                "last_name": PROMINENCE_MEMBER["last_name"],
                "zip_code": PROMINENCE_MEMBER["address_zip"],
                "email": "crosstenant@example.com",
                "password": "Sup3r-Secret-Pass!",
            },
        )
    assert resp.status_code == 202
    assert capture_email == []
    assert await _account_count(email="crosstenant@example.com") == 0


async def test_same_member_id_resolves_per_tenant(fastapi_app, capture_email):
    """The real Northwind member proofs in Northwind and the account binds there."""
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url="https://northwind.localhost") as client:
        resp = await client.post(
            "/api/member/auth/register",
            headers=_headers(tenant_key=SECOND_TENANT_KEY, ip="5.0.0.2"),
            json={
                "member_id": NORTHWIND_MEMBER["member_key"],
                "date_of_birth": NORTHWIND_MEMBER["date_of_birth"].isoformat(),
                "last_name": NORTHWIND_MEMBER["last_name"],
                "zip_code": NORTHWIND_MEMBER["address_zip"],
                "email": "nw-real@example.com",
                "password": "Sup3r-Secret-Pass!",
            },
        )
    assert resp.status_code == 202
    assert len(capture_email) == 1

    async with control_session() as session:
        account = await session.scalar(
            select(MemberPortalAccount).where(MemberPortalAccount.email == "nw-real@example.com")
        )
    assert account is not None
    assert account.member_key == NORTHWIND_MEMBER["member_key"]


# --------------------------------------------------------------------------- #
# Resend verification
# --------------------------------------------------------------------------- #


async def test_resend_verification_uniform(fastapi_app, capture_email):
    # Unknown email => generic 202, no email sent.
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        unknown = await client.post(
            "/api/member/auth/resend-verification", headers=_headers(), json={"email": "ghost@example.com"}
        )
        assert unknown.status_code == 202
        assert capture_email == []

        # Pending account => generic 202 + a fresh email.
        factors = await _fresh_member()
        await client.post("/api/member/auth/register", headers=_headers(ip="6.0.0.1"), json=factors)
        capture_email.clear()
        resend = await client.post(
            "/api/member/auth/resend-verification", headers=_headers(), json={"email": factors["email"]}
        )
        assert resend.status_code == 202
        assert len(capture_email) == 1
        assert capture_email[0]["to"] == factors["email"]
