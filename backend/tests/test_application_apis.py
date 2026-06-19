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


async def test_portal_overview_aggregates_todos_from_purchased_apps(fastapi_app):
    """Tasks surfaced on the portal must include items from each purchased app."""
    from sqlalchemy import select as _select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.config import settings as app_settings
    from app.db.session import control_session
    from app.models.coding import CodingMember, CodingMemberChase
    from app.models.member360 import Member360Member, Member360Task
    from app.models.ride_booking import RideReconciliationItem
    from app.models.tables import DataImportJob, Tenant as _Tenant

    tenant_uri = app_settings.DEFAULT_TENANT_DATABASE_URL.format(tenant_key=TENANT_KEY)
    engine = create_async_engine(tenant_uri, future=True, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        coder_member = CodingMember(member_key="COD-ASSIGNED", first_name="Assignee", last_name="One", status="active")
        session.add(coder_member)
        await session.flush()
        session.add(
            CodingMemberChase(
                member_id=coder_member.id,
                chase_code="CHASE-USER",
                status="open",
                priority="high",
                assigned_coder_email="user@example.com",
            )
        )

        m360_member = Member360Member(member_key="M360-ASSIGNED", first_name="Care", last_name="Target")
        session.add(m360_member)
        await session.flush()
        session.add(
            Member360Task(
                member_id=m360_member.id,
                title="Outreach call",
                status="open",
                priority="high",
                assigned_user="user@example.com",
            )
        )

        session.add(
            RideReconciliationItem(
                title="Match invoice #42",
                detail="Vendor charge missing rider",
                status="open",
                priority="high",
            )
        )
        await session.commit()
    await engine.dispose()

    async with control_session() as ctrl:
        tenant_row = (await ctrl.scalars(_select(_Tenant).where(_Tenant.key == TENANT_KEY))).first()
        ctrl.add(
            DataImportJob(
                tenant_id=tenant_row.id,
                name="Eligibility import",
                source_type="upload",
                status="failed",
                progress=42,
                error="Row 17 malformed",
                initiated_by="user@example.com",
            )
        )
        await ctrl.commit()

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        resp = await client.get(
            "/api/portal/overview",
            headers={"Authorization": f"Bearer {token}", **TENANT_HEADER},
        )

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    app_keys_in_todos = {todo["app_key"] for todo in payload["todos"]}
    assert {"coding", "member360", "ride_booking", "job_center"} <= app_keys_in_todos


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


async def test_contact_form_accepts_submission_without_tenant(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        # No auth, no X-Tenant-Key: the public contact endpoint must be exempt
        # from tenant resolution and still accept the submission.
        resp = await client.post(
            "/api/contact",
            json={
                "name": "Jane Doe",
                "email": "jane@example.com",
                "subject": "Demo request",
                "message": "I'd like a demo of the platform.",
            },
        )
    assert resp.status_code == 202, resp.text
    body = resp.json()
    assert body["status"] == "received"
    # No SMTP backend configured in tests, so it logs instead of dispatching.
    assert body["delivered"] is False


async def test_contact_form_rejects_missing_message(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        resp = await client.post(
            "/api/contact",
            json={"name": "Jane Doe", "email": "jane@example.com"},
        )
    assert resp.status_code == 422, resp.text


async def test_clear_chat_history_archives_all_conversations(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        headers = {"Authorization": f"Bearer {token}", **TENANT_HEADER}

        for title in ("First chat", "Second chat"):
            created = await client.post("/api/chat/conversations", headers=headers, json={"title": title})
            assert created.status_code == 201, created.text

        listed = await client.get("/api/chat/conversations", headers=headers)
        assert listed.status_code == 200
        assert len(listed.json()["conversations"]) >= 2

        cleared = await client.delete("/api/chat/conversations", headers=headers)
        assert cleared.status_code == 204, cleared.text

        after = await client.get("/api/chat/conversations", headers=headers)
        assert after.status_code == 200
        assert after.json()["conversations"] == []


async def test_account_deactivate_disables_login(fastapi_app):
    import bcrypt
    from sqlalchemy import select as _select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.config import settings as app_settings
    from app.models.tables import Tenant as _Tenant, User as _User

    # A dedicated user so deactivating it can't poison the shared test user.
    ctrl_engine = create_async_engine(app_settings.CONTROL_DATABASE_URL, future=True, echo=False)
    ctrl_factory = async_sessionmaker(ctrl_engine, expire_on_commit=False)
    async with ctrl_factory() as session:
        tenant_row = await session.scalar(_select(_Tenant).where(_Tenant.key == TENANT_KEY))
        session.add(
            _User(
                tenant_id=tenant_row.id,
                email="deactivate-me@example.com",
                password_hash=bcrypt.hashpw(b"password", bcrypt.gensalt()).decode(),
                role="analyst",
                app_permissions={"portal": "user", "settings": "user"},
            )
        )
        await session.commit()
    await ctrl_engine.dispose()

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        login = await client.post(
            "/api/login",
            json={"email": "deactivate-me@example.com", "password": "password", "tenant": TENANT_KEY},
            headers=TENANT_HEADER,
        )
        assert login.status_code == 200, login.text
        headers = {"Authorization": f"Bearer {login.json()['token']}", **TENANT_HEADER}

        resp = await client.post("/api/account/deactivate", headers=headers)
        assert resp.status_code == 204, resp.text

        # Account is now inactive: re-login is rejected.
        relogin = await client.post(
            "/api/login",
            json={"email": "deactivate-me@example.com", "password": "password", "tenant": TENANT_KEY},
            headers=TENANT_HEADER,
        )
        assert relogin.status_code == 401
