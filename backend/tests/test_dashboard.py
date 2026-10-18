import pytest
from httpx import ASGITransport, AsyncClient

BASE_URL = "https://prominencehealth.localhost"
TENANT_HEADER = {"X-Tenant-Key": "prominencehealth"}


pytestmark = pytest.mark.anyio("asyncio")


async def _login(client: AsyncClient) -> str:
    resp = await client.post(
        "/api/login",
        json={"email": "user@example.com", "password": "password", "tenant": "prominencehealth"},
        headers=TENANT_HEADER,
    )
    assert resp.status_code == 200
    return resp.json()["token"]


async def test_dashboard_endpoints_require_auth(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        delta_resp = await client.get("/api/raf/delta")
        funnel_resp = await client.get("/api/suspects/funnel")
        radar_resp = await client.get("/api/deadlines/radar", params={"cutoff": "2025-12-31"})
        heatmap_resp = await client.get("/api/providers/heatmap")

    for resp in (delta_resp, funnel_resp, radar_resp, heatmap_resp):
        assert resp.status_code in (401, 403)


async def test_dashboard_metrics_shapes(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        headers = {"Authorization": f"Bearer {token}", **TENANT_HEADER}

        delta_resp = await client.get(
            "/api/raf/delta",
            params={"model_year": 2025, "lob": "MA", "provider_group": "All", "forecast": "1"},
            headers=headers,
        )
        assert delta_resp.status_code == 200
        delta = delta_resp.json()
        assert {"target", "cutoff_date", "series", "forecast", "breakdown", "metadata"} <= delta.keys()
        assert len(delta["series"]) == 30
        assert all("daily_add" in point for point in delta["series"])

        funnel_resp = await client.get(
            "/api/suspects/funnel",
            params={"from": "2025-01-01", "to": "2025-01-31"},
            headers=headers,
        )
        assert funnel_resp.status_code == 200
        funnel = funnel_resp.json()
        assert len(funnel["stages"]) >= 5
        assert funnel["as_of"]

        radar_resp = await client.get(
            "/api/deadlines/radar",
            params={"cutoff": "2025-12-31", "stage": "accepted"},
            headers=headers,
        )
        assert radar_resp.status_code == 200
        radar = radar_resp.json()
        assert radar["buckets"]
        assert radar["stage"] == "accepted"

        heatmap_resp = await client.get(
            "/api/providers/heatmap",
            params={"metric": "open_raf", "lob": "MA"},
            headers=headers,
        )
        assert heatmap_resp.status_code == 200
        heatmap = heatmap_resp.json()
        assert heatmap["providers"]
        assert heatmap["metrics"]
        assert heatmap["values"]
        # pick first cell ensures required keys exist
        assert {"provider", "metric", "value"} <= set(heatmap["values"][0].keys())

        export_resp = await client.get(
            "/api/deadlines/radar/export",
            params={
                "cutoff": "2025-12-31",
                "stage": "accepted",
                "lob": "MA",
                "model_year": 2025,
                "provider_group": "All",
            },
            headers=headers,
        )
        assert export_resp.status_code == 200
        assert "text/csv" in export_resp.headers["content-type"]
        content = export_resp.text
        assert content.startswith("member_id,provider_id,stage,days_to_cutoff")
        assert "# exported_by=user@example.com" in content

