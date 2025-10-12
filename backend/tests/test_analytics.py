import pytest
from httpx import ASGITransport, AsyncClient

BASE_URL = "https://prominencehealth.localhost"


pytestmark = pytest.mark.anyio("asyncio")

async def test_analytics_summary_requires_token(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        resp = await client.get("/api/analytics/summary")
    assert resp.status_code in (401, 403)


async def test_analytics_summary_with_token_returns_shape(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        login_resp = await client.post(
            "/api/login",
            json={"email": "user@example.com", "password": "password", "tenant": "prominencehealth"},
            headers={"X-Tenant-Key": "prominencehealth"},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["token"]

        resp = await client.get(
            "/api/analytics/summary",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Tenant-Key": "prominencehealth",
            },
        )
    assert resp.status_code == 200
    data = resp.json()
    assert set(data.keys()) == {"tenant", "total_claims", "total_cost"}
    assert data["tenant"] == "prominencehealth"

