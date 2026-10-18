import pytest
from httpx import ASGITransport, AsyncClient
from app.utils.security import create_access_token

BASE_URL = "https://prominencehealth.localhost"


pytestmark = pytest.mark.anyio("asyncio")

async def test_cross_tenant_access_denied(fastapi_app):
    token = create_access_token({"sub": "user@example.com", "tid": "other", "uid": 999})
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        resp = await client.get(
            "/api/analytics/summary",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Tenant-Key": "prominencehealth",
            },
        )
    assert resp.status_code == 403

