"""Feature 6 — provider / PCP search.

Covers filtering (specialty, name, PCP, plan/network), distance sort + radius,
geocode caching + the privacy wall (only the location string reaches Google),
map-config key handling, the PCP-request stub, and session gating. Tests scope
each search by a unique specialty tag so the shared tenant DB stays isolated.
"""
from __future__ import annotations

import itertools
from datetime import datetime, timezone

import bcrypt
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.session import control_session
from app.models.member360 import (
    Member360GeocodeCache,
    Member360Provider,
    Member360ProviderLocation,
    Member360ProviderNetwork,
)
from app.models.member_portal import MemberPortalAccount
from app.models.tables import Tenant
from app.utils.security import create_access_token

from conftest import TEST_TENANT_DB_TEMPLATE, TEST_TENANT_KEY

pytestmark = pytest.mark.anyio("asyncio")

BASE_URL = "https://prominencehealth.localhost"
PASSWORD = "Sup3r-Secret-Pass!"
_counter = itertools.count(1)

# Approx coordinates.
NYC = (40.7128, -74.0060)
LA = (34.0522, -118.2437)


def _headers(bearer: str | None = None, ip: str | None = None) -> dict:
    h = {"X-Tenant-Key": TEST_TENANT_KEY}
    if bearer:
        h["Authorization"] = f"Bearer {bearer}"
    if ip:
        h["X-Forwarded-For"] = ip
    return h


async def _make_account_token(client, ip: str) -> str:
    n = next(_counter)
    email = f"prov{n}@example.com"
    async with control_session() as session:
        tenant = await session.scalar(select(Tenant).where(Tenant.key == TEST_TENANT_KEY))
        session.add(MemberPortalAccount(
            tenant_id=tenant.id, member_key=f"PROV-ACCT-{n}", email=email,
            password_hash=bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt()).decode(),
            status="active", email_verified_at=datetime.now(timezone.utc),
        ))
        await session.commit()
    r = await client.post("/api/member/auth/login", headers=_headers(ip=ip), json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


async def _seed_providers(specs: list[dict]) -> None:
    engine = create_async_engine(TEST_TENANT_DB_TEMPLATE.format(tenant_key=TEST_TENANT_KEY), future=True)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as s:
            for spec in specs:
                provider = Member360Provider(
                    name=spec["name"], specialty=spec["specialty"], is_pcp=spec.get("is_pcp", False),
                    accepting_new_patients=True, status="active",
                )
                s.add(provider)
                await s.flush()
                latlng = spec.get("latlng")
                s.add(Member360ProviderLocation(
                    provider_id=provider.id, address_line1="1 Care Way", city=spec.get("city", "Town"),
                    state="NY", postal_code="10001",
                    latitude=latlng[0] if latlng else None, longitude=latlng[1] if latlng else None,
                    geocode_status="ok" if latlng else "pending",
                ))
                for net in spec.get("networks", []):
                    s.add(Member360ProviderNetwork(
                        provider_id=provider.id, plan_name=net.get("plan"),
                        line_of_business=net.get("lob"), network_status=net.get("status", "in_network"),
                    ))
            await s.commit()
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------- #


async def test_filter_by_specialty_and_name_and_pcp(fastapi_app):
    tag = f"Cardio{next(_counter)}"
    await _seed_providers([
        {"name": "Alice Heart", "specialty": tag, "is_pcp": False},
        {"name": "Bob Heart", "specialty": tag, "is_pcp": True},
    ])
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        token = await _make_account_token(client, "40.0.0.1")
        # Specialty scopes to this test's two providers.
        by_spec = await client.get(f"/api/member/providers?specialty={tag}", headers=_headers(bearer=token))
        assert by_spec.status_code == 200
        assert by_spec.json()["total"] == 2

        # PCP filter narrows to one.
        pcp_only = await client.get(f"/api/member/providers?specialty={tag}&pcp=true", headers=_headers(bearer=token))
        assert pcp_only.json()["total"] == 1
        assert pcp_only.json()["items"][0]["name"] == "Bob Heart"

        # Name filter (case-insensitive substring).
        by_name = await client.get(f"/api/member/providers?specialty={tag}&name=alice", headers=_headers(bearer=token))
        assert by_name.json()["total"] == 1


async def test_network_plan_filter(fastapi_app):
    tag = f"Derm{next(_counter)}"
    await _seed_providers([
        {"name": "In Network Doc", "specialty": tag, "networks": [{"plan": "Gold PPO", "lob": "Medicare Advantage"}]},
        {"name": "Other Plan Doc", "specialty": tag, "networks": [{"plan": "Silver HMO", "lob": "Commercial"}]},
    ])
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        token = await _make_account_token(client, "40.0.0.2")
        resp = await client.get(
            f"/api/member/providers?specialty={tag}&plan=Gold%20PPO", headers=_headers(bearer=token)
        )
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["name"] == "In Network Doc"


async def test_distance_sort_and_radius_with_coords(fastapi_app):
    tag = f"Ortho{next(_counter)}"
    await _seed_providers([
        {"name": "Far LA Doc", "specialty": tag, "latlng": LA},
        {"name": "Near NYC Doc", "specialty": tag, "latlng": NYC},
    ])
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        token = await _make_account_token(client, "40.0.0.3")
        # Origin near NYC -> NYC doc first, with a small distance.
        resp = await client.get(
            f"/api/member/providers?specialty={tag}&lat=40.70&lng=-74.00", headers=_headers(bearer=token)
        )
        body = resp.json()
        assert [i["name"] for i in body["items"]] == ["Near NYC Doc", "Far LA Doc"]
        assert body["items"][0]["nearest_distance_miles"] < 10
        assert body["origin"]["source"] == "coords"

        # Radius filter drops the LA doc.
        radius = await client.get(
            f"/api/member/providers?specialty={tag}&lat=40.70&lng=-74.00&radius_miles=50",
            headers=_headers(bearer=token),
        )
    assert radius.json()["total"] == 1
    assert radius.json()["items"][0]["name"] == "Near NYC Doc"


async def test_zip_geocode_is_cached_and_privacy_walled(fastapi_app, monkeypatch):
    tag = f"Peds{next(_counter)}"
    await _seed_providers([{"name": "Zip Doc", "specialty": tag, "latlng": NYC}])

    captured: list[str] = []

    async def _fake_google(address: str):
        captured.append(address)
        return NYC

    monkeypatch.setattr("app.services.geocoding._call_google_geocode", _fake_google)

    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        token = await _make_account_token(client, "40.0.0.4")
        first = await client.get(f"/api/member/providers?specialty={tag}&zip=10001", headers=_headers(bearer=token))
        assert first.status_code == 200
        assert first.json()["origin"]["source"] == "geocoded"
        # Second identical search hits the cache: Google is not called again.
        await client.get(f"/api/member/providers?specialty={tag}&zip=10001", headers=_headers(bearer=token))

    # Google was called exactly once, and ONLY the location string was sent —
    # never a member id, name, or any PHI.
    assert captured == ["10001"]

    async with control_session() as _:
        pass
    engine = create_async_engine(TEST_TENANT_DB_TEMPLATE.format(tenant_key=TEST_TENANT_KEY), future=True)
    try:
        async with async_sessionmaker(engine)() as s:
            cached = await s.scalar(select(Member360GeocodeCache).where(Member360GeocodeCache.query_text == "10001"))
        assert cached is not None and cached.status == "ok"
    finally:
        await engine.dispose()


async def test_map_config_and_pcp_stub_and_gating(fastapi_app):
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        token = await _make_account_token(client, "40.0.0.5")

        cfg = await client.get("/api/member/providers/map-config", headers=_headers(bearer=token))
        assert cfg.status_code == 200
        assert cfg.json()["has_key"] is False  # no browser key configured in tests

        stub = await client.post("/api/member/providers/1/request-pcp", headers=_headers(bearer=token))
        assert stub.status_code == 501

        # No session -> 401; staff token -> 401 (wrong realm).
        anon = await client.get("/api/member/providers", headers=_headers())
        assert anon.status_code == 401
        staff = create_access_token({"sub": "user@example.com", "tid": TEST_TENANT_KEY, "uid": 1, "role": "admin"})
        wrong_realm = await client.get("/api/member/providers", headers=_headers(bearer=staff))
    assert wrong_realm.status_code == 401
