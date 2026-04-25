import pytest
from httpx import ASGITransport, AsyncClient

BASE_URL = "https://prominencehealth.localhost"
TENANT_KEY = "prominencehealth"
TENANT_HEADER = {"X-Tenant-Key": TENANT_KEY}

pytestmark = pytest.mark.anyio("asyncio")


async def _login(client: AsyncClient) -> str:
    resp = await client.post(
        "/api/login",
        json={"email": "user@example.com", "password": "password", "tenant": TENANT_KEY},
        headers=TENANT_HEADER,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


async def test_portal_overview_returns_real_application_registry(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        resp = await client.get(
            "/api/portal/overview",
            headers={"Authorization": f"Bearer {token}", **TENANT_HEADER},
        )

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    app_keys = {app["key"] for app in payload["applications"]}
    assert {"portal", "coding", "member360", "ride_booking", "job_center", "docs", "settings"} <= app_keys
    assert payload["profile"]["email"] == "user@example.com"


async def test_ride_booking_partner_and_ride_flow(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        headers = {"Authorization": f"Bearer {token}", **TENANT_HEADER}

        partners_resp = await client.get("/api/ride-booking/partners", headers=headers)
        assert partners_resp.status_code == 200, partners_resp.text
        assert partners_resp.json()["total"] >= 1

        create_resp = await client.post(
            "/api/ride-booking/rides",
            headers=headers,
            json={
                "member_id": "M-RIDE-1",
                "first_name": "Riley",
                "last_name": "Walker",
                "ride_type": "Uber Health",
                "pickup": "Clinic",
                "pickup_address": "1 Clinic Way",
                "dropoff": "Home",
                "dropoff_address": "9 Home Ave",
                "scheduled_pickup": "2026-04-25T15:30:00Z",
                "cost_usd": 18.75,
            },
        )
        assert create_resp.status_code == 201, create_resp.text
        ride = create_resp.json()
        assert ride["member_id"] == "M-RIDE-1"
        assert ride["status"] == "queued"

        rides_resp = await client.get("/api/ride-booking/rides", headers=headers)
        assert rides_resp.status_code == 200, rides_resp.text
        assert any(item["id"] == ride["id"] for item in rides_resp.json()["items"])

        options_resp = await client.get(
            "/api/ride-booking/ride-options",
            params={"date": "2026-04-25"},
            headers=headers,
        )
        assert options_resp.status_code == 200
        assert "Uber Health" in options_resp.json()["options"]


async def test_settings_preferences_roundtrip(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        headers = {"Authorization": f"Bearer {token}", **TENANT_HEADER}

        update_resp = await client.patch(
            "/api/settings/preferences",
            headers=headers,
            json={"settings": {"theme": "dark", "language": "English"}, "memories": ["team: blue"]},
        )
        assert update_resp.status_code == 200, update_resp.text
        assert update_resp.json()["settings"]["theme"] == "dark"

        get_resp = await client.get("/api/settings/preferences", headers=headers)
        assert get_resp.status_code == 200, get_resp.text
        body = get_resp.json()
        assert body["settings"]["theme"] == "dark"
        assert body["memories"] == ["team: blue"]


async def test_docs_search_requires_access_and_returns_shape(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        resp = await client.get(
            "/api/docs/articles",
            params={"q": "coding"},
            headers={"Authorization": f"Bearer {token}", **TENANT_HEADER},
        )

    assert resp.status_code == 200, resp.text
    assert {"articles", "total"} <= resp.json().keys()
