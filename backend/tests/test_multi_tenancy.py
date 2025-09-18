import pytest
from httpx import AsyncClient

from app.main import app
from app.utils.security import create_access_token

BASE_URL = "https://demo.localhost"


@pytest.mark.anyio
async def test_cross_tenant_access_denied():
    token = create_access_token({"sub": "user@example.com", "tid": "other", "uid": 999})
    async with AsyncClient(app=app, base_url=BASE_URL) as client:
        resp = await client.get(
            "/api/analytics/summary",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Tenant-Key": "demo",
            },
        )
    assert resp.status_code == 403

