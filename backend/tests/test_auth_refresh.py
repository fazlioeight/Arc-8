"""Refresh-token rotation + 15-minute access token tests."""
import pytest
from httpx import ASGITransport, AsyncClient

from app.utils.security import decode_token

BASE_URL = "https://prominencehealth.localhost"
TENANT_HEADER = {"X-Tenant-Key": "prominencehealth"}

pytestmark = pytest.mark.anyio("asyncio")


async def _login(client):
    resp = await client.post(
        "/api/login",
        headers=TENANT_HEADER,
        json={"email": "user@example.com", "password": "password"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_login_issues_access_and_refresh_tokens(fastapi_app):
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        body = await _login(client)
    assert body["token"]
    assert body["refresh_token"]
    assert body["expires_in"] == 15 * 60  # 15-minute access token


async def test_refresh_rotates_token_and_revokes_old(fastapi_app):
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        body = await _login(client)
        old_refresh = body["refresh_token"]

        # First refresh succeeds and returns a *different* refresh token.
        resp = await client.post(
            "/api/auth/refresh", headers=TENANT_HEADER, json={"refresh_token": old_refresh}
        )
        assert resp.status_code == 200, resp.text
        rotated = resp.json()
        assert rotated["refresh_token"] != old_refresh
        assert rotated["token"]

        # Replaying the consumed token is rejected (and burns the chain).
        replay = await client.post(
            "/api/auth/refresh", headers=TENANT_HEADER, json={"refresh_token": old_refresh}
        )
        assert replay.status_code == 401

        # Because reuse revokes the whole chain, the rotated token is dead too.
        after_breach = await client.post(
            "/api/auth/refresh", headers=TENANT_HEADER, json={"refresh_token": rotated["refresh_token"]}
        )
        assert after_breach.status_code == 401


async def test_access_token_carries_mfa_claim(fastapi_app):
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        body = await _login(client)
    payload = decode_token(body["token"])
    # Seed user is not MFA-enrolled, so the claim is present and False.
    assert payload.get("mfa") is False
    assert payload["sub"] == "user@example.com"
