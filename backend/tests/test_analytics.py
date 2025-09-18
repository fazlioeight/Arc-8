import pytest
from httpx import AsyncClient

from app.main import app

BASE_URL = "https://demo.localhost"


@pytest.mark.anyio
async def test_analytics_summary_requires_token():
    async with AsyncClient(app=app, base_url=BASE_URL) as client:
        resp = await client.get("/api/analytics/summary")
    assert resp.status_code in (401, 403)


@pytest.mark.anyio
async def test_analytics_summary_with_token_returns_shape():
    async with AsyncClient(app=app, base_url=BASE_URL) as client:
        login_resp = await client.post(
            "/api/login",
            json={"email": "user@example.com", "password": "password", "tenant": "demo"},
            headers={"X-Tenant-Key": "demo"},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["token"]

        resp = await client.get(
            "/api/analytics/summary",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Tenant-Key": "demo",
            },
        )
    assert resp.status_code == 200
    data = resp.json()
    assert set(data.keys()) == {"tenant", "total_claims", "total_cost"}
    assert data["tenant"] == "demo"

