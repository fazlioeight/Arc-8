import uuid

import pytest
from httpx import ASGITransport, AsyncClient

BASE_URL = "https://prominencehealth.localhost"
TENANT_KEY = "prominencehealth"
LOGIN_PATH = "/api/login"


pytestmark = pytest.mark.anyio("asyncio")

async def _login(client: AsyncClient) -> str:
    resp = await client.post(
        LOGIN_PATH,
        json={"email": "user@example.com", "password": "password", "tenant": TENANT_KEY},
        headers={"X-Tenant-Key": TENANT_KEY},
    )
    assert resp.status_code == 200
    return resp.json()["token"]


async def test_coding_members_requires_token(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        resp = await client.get("/api/coding/members", headers={"X-Tenant-Key": TENANT_KEY})
    assert resp.status_code in (401, 403)


async def test_coding_members_list_success(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        resp = await client.get(
            "/api/coding/members",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Tenant-Key": TENANT_KEY,
            },
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data and "total" in data
    assert data["total"] >= 1
    assert {"id", "member_key", "status"}.issubset(data["items"][0].keys())


async def test_create_member_chase_and_note_flow(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        headers = {"Authorization": f"Bearer {token}", "X-Tenant-Key": TENANT_KEY}

        member_key = f"AUTO-{uuid.uuid4().hex[:8]}"
        create_resp = await client.post(
            "/api/coding/members",
            json={
                "member_key": member_key,
                "first_name": "Alex",
                "last_name": "Tester",
                "status": "active",
                "line_of_business": "Commercial",
            },
            headers=headers,
        )
        assert create_resp.status_code == 201, create_resp.text
        member_id = create_resp.json()["id"]

        chase_resp = await client.post(
            f"/api/coding/members/{member_id}/chases",
            json={"chase_code": "NEW-CHASE", "priority": "normal"},
            headers=headers,
        )
        assert chase_resp.status_code == 201, chase_resp.text
        chase = chase_resp.json()
        assert chase["status"] == "open"

        update_resp = await client.patch(
            f"/api/coding/chases/{chase['id']}",
            json={"status": "in_review", "priority": "high"},
            headers=headers,
        )
        assert update_resp.status_code == 200, update_resp.text
        assert update_resp.json()["status"] == "in_review"

        note_resp = await client.post(
            f"/api/coding/members/{member_id}/notes",
            json={"body": "Chart reviewed"},
            headers=headers,
        )
        assert note_resp.status_code == 201, note_resp.text
        assert note_resp.json()["body"] == "Chart reviewed"

        detail_resp = await client.get(
            f"/api/coding/members/{member_id}",
            headers=headers,
        )
        assert detail_resp.status_code == 200, detail_resp.text
        detail = detail_resp.json()
        assert detail["member"]["member_key"] == member_key
        assert any(ch["chase_code"] == "NEW-CHASE" for ch in detail["chases"])
        assert any(note["body"] == "Chart reviewed" for note in detail["notes"])


async def test_list_providers(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        resp = await client.get(
            "/api/coding/providers",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Tenant-Key": TENANT_KEY,
            },
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    assert body["items"][0]["name"]


async def test_get_provider_detail(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        list_resp = await client.get(
            "/api/coding/providers",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Tenant-Key": TENANT_KEY,
            },
        )
        assert list_resp.status_code == 200
        provider_id = list_resp.json()["items"][0]["id"]

        detail_resp = await client.get(
            f"/api/coding/providers/{provider_id}",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Tenant-Key": TENANT_KEY,
            },
        )
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["id"] == provider_id


async def test_update_provider_npi(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        headers = {"Authorization": f"Bearer {token}", "X-Tenant-Key": TENANT_KEY}

        list_resp = await client.get("/api/coding/providers", headers=headers)
        items = list_resp.json()["items"]
        provider_id = items[0]["id"]

        new_npi = f"99{uuid.uuid4().int % 10_000_000:07d}"
        patch_resp = await client.patch(
            f"/api/coding/providers/{provider_id}",
            json={"npi": new_npi},
            headers=headers,
        )
        assert patch_resp.status_code == 200, patch_resp.text
        assert patch_resp.json()["npi"] == new_npi

        # A second provider cannot take the same (unique) NPI — expect 409.
        other = next((p for p in items if p["id"] != provider_id), None)
        if other is not None:
            conflict_resp = await client.patch(
                f"/api/coding/providers/{other['id']}",
                json={"npi": new_npi},
                headers=headers,
            )
            assert conflict_resp.status_code == 409, conflict_resp.text
