"""Input-validation rejection tests.

Confirms the Pydantic validation layer rejects malformed request bodies with a
4xx and a generic (non-leaky) error, rather than 500-ing or accepting garbage.
"""
import pytest
from httpx import ASGITransport, AsyncClient

BASE_URL = "https://prominencehealth.localhost"
TENANT_HEADER = {"X-Tenant-Key": "prominencehealth"}

pytestmark = pytest.mark.anyio("asyncio")


async def _client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL)


async def test_login_rejects_wrong_typed_email(fastapi_app):
    # email must be a string; a structured value is a type error. (Email format
    # itself is intentionally not validated — see schemas.types.NormalizedEmail.)
    async with await _client(fastapi_app) as client:
        resp = await client.post(
            "/api/login",
            headers=TENANT_HEADER,
            json={"email": ["a", "b"], "password": "whatever"},
        )
    assert resp.status_code == 422  # FastAPI/Pydantic validation error


async def test_login_rejects_missing_password(fastapi_app):
    async with await _client(fastapi_app) as client:
        resp = await client.post(
            "/api/login",
            headers=TENANT_HEADER,
            json={"email": "user@example.com"},
        )
    assert resp.status_code == 422


async def test_refresh_rejects_short_token(fastapi_app):
    # RefreshRequest enforces min_length=20 on refresh_token.
    async with await _client(fastapi_app) as client:
        resp = await client.post(
            "/api/auth/refresh",
            headers=TENANT_HEADER,
            json={"refresh_token": "short"},
        )
    assert resp.status_code == 422


async def test_refresh_with_unknown_token_is_401_generic(fastapi_app):
    # A well-formed but unknown token is rejected with a generic 401 — no hint
    # about whether the token ever existed.
    async with await _client(fastapi_app) as client:
        resp = await client.post(
            "/api/auth/refresh",
            headers=TENANT_HEADER,
            json={"refresh_token": "x" * 40},
        )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid refresh token"
