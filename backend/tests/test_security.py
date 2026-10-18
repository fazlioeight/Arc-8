import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.utils.security import create_access_token, decode_token

BASE_URL = "https://prominencehealth.localhost"
TENANT_KEY = "prominencehealth"
TENANT_HEADER = {"X-Tenant-Key": TENANT_KEY}

pytestmark = pytest.mark.anyio("asyncio")


def test_token_roundtrip():
    token = create_access_token({"sub": "user@example.com", "tid": "prominencehealth"})
    payload = decode_token(token)
    assert payload["sub"] == "user@example.com"
    assert payload["tid"] == "prominencehealth"


async def test_azure_exchange_issues_app_session_for_provisioned_user(fastapi_app, monkeypatch):
    async def fake_exchange_code_for_id_token(**kwargs):
        assert kwargs["code"] == "auth-code"
        assert kwargs["code_verifier"] == "verifier"
        assert kwargs["redirect_uri"] == "https://app.example.com/login"
        return "id-token"

    def fake_validate_id_token(id_token, *, nonce=None):
        assert id_token == "id-token"
        assert nonce == "nonce"
        return {"preferred_username": "user@example.com", "oid": "azure-user-id"}

    monkeypatch.setattr(settings, "AZURE_AUTH_ENABLED", True)
    monkeypatch.setattr(settings, "AZURE_TENANT_ID", "azure-tenant")
    monkeypatch.setattr(settings, "AZURE_CLIENT_ID", "azure-client")
    monkeypatch.setattr("app.main.exchange_code_for_id_token", fake_exchange_code_for_id_token)
    monkeypatch.setattr("app.main.validate_id_token", fake_validate_id_token)

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        resp = await client.post(
            "/api/auth/azure/exchange",
            headers=TENANT_HEADER,
            json={
                "code": "auth-code",
                "code_verifier": "verifier",
                "redirect_uri": "https://app.example.com/login",
                "nonce": "nonce",
                "tenant": TENANT_KEY,
            },
        )

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["email"] == "user@example.com"
    assert payload["tenant"] == TENANT_KEY
    assert payload["token"]
