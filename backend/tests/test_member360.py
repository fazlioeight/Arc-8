"""Integration tests for the Nexora Lab Member360 routes.

Coverage strategy:
- Negative-path auth tests (missing token, missing application permission)
- Happy-path for every route shape that's customer-visible
- One regression test per bug we shipped a fix for:
    * #1 — submission export must not NameError on `datetime.utcnow()`
    * #5 — routes must 403 a user lacking the `member360` app permission
    * #6 — aggregate endpoints denormalize member fields onto every row
    * #7 — aggregate endpoints honour `limit` + `offset`

Member ingestion does not go through an HTTP endpoint (PATCH only updates
existing rows; rows are imported from external systems). The fixture below
seeds rows directly via SQLAlchemy so the tests can exercise read/list
behaviour without having to invent a Create endpoint just for tests.
"""

import pytest
from httpx import ASGITransport, AsyncClient

BASE_URL = "https://prominencehealth.localhost"
TENANT_KEY = "prominencehealth"
LOGIN_PATH = "/api/login"

pytestmark = pytest.mark.anyio("asyncio")


# ---- helpers ----------------------------------------------------------------


async def _login(client: AsyncClient, email: str = "user@example.com", password: str = "password") -> str:
    resp = await client.post(
        LOGIN_PATH,
        json={"email": email, "password": password, "tenant": TENANT_KEY},
        headers={"X-Tenant-Key": TENANT_KEY},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "X-Tenant-Key": TENANT_KEY}


@pytest.fixture
async def seeded_member():
    """Insert one Member360Member straight into the tenant DB and return its id.

    Yields after commit so the row is visible to subsequent HTTP calls
    through the test FastAPI app. Cleans up the row at teardown so tests
    after this one start fresh.
    """
    from sqlalchemy import delete
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.config import get_settings
    from app.models.member360 import (
        Member360CareOption,
        Member360Member,
        Member360Note,
        Member360Savings,
        Member360Task,
    )

    uri = get_settings().DEFAULT_TENANT_DATABASE_URL.format(tenant_key=TENANT_KEY)
    engine = create_async_engine(uri, future=True, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    member_id = None
    try:
        async with factory() as session:
            member = Member360Member(
                member_key="T360-001",
                first_name="Test",
                last_name="Member",
                plan_name="Test Plan",
                line_of_business="Commercial",
                preferred_channel="SMS",
                primary_care_provider="Dr. Test",
                risk_score_composite=8.5,
                risk_tier="High",
                clinical_risk_score=8.0,
                utilization_risk_score=7.5,
                cost_risk_score=8.0,
                engagement_risk_score=6.0,
                open_care_gaps=2,
                next_best_action="Schedule follow-up",
            )
            session.add(member)
            await session.commit()
            await session.refresh(member)
            member_id = member.id

        yield member_id
    finally:
        # Best-effort cleanup so subsequent tests in the same session start
        # from a clean m360 baseline. Child rows cascade via FK ON DELETE.
        async with factory() as session:
            await session.execute(delete(Member360Savings))
            await session.execute(delete(Member360CareOption))
            await session.execute(delete(Member360Note))
            await session.execute(delete(Member360Task))
            await session.execute(delete(Member360Member).where(Member360Member.id == member_id))
            await session.commit()
        await engine.dispose()


# ---- Negative path tests ----------------------------------------------------


async def test_dashboard_requires_token(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        resp = await client.get(
            "/api/member360/dashboard",
            headers={"X-Tenant-Key": TENANT_KEY},
        )
    assert resp.status_code in (401, 403)


async def test_member_detail_returns_404_for_unknown_id(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        resp = await client.get("/api/member360/members/999999", headers=_auth_headers(token))
    assert resp.status_code == 404


async def test_task_create_rejects_unknown_member(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        resp = await client.post(
            "/api/member360/tasks",
            json={"member_id": 999999, "title": "Will not stick"},
            headers=_auth_headers(token),
        )
    assert resp.status_code == 404


async def test_member360_routes_blocked_without_app_permission(fastapi_app):
    """#5 regression — users without member360 in app_permissions get 403.

    The seed user has every app permission, so we provision a second user
    with no member360 entry and verify the gate rejects them.
    """
    import bcrypt
    from sqlalchemy import delete, select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.config import get_settings
    from app.models.tables import Tenant, User

    control_uri = get_settings().CONTROL_DATABASE_URL
    engine = create_async_engine(control_uri, future=True, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with factory() as session:
            tenant = await session.scalar(select(Tenant).where(Tenant.key == TENANT_KEY))
            session.add(
                User(
                    tenant_id=tenant.id,
                    email="nomember360@example.com",
                    password_hash=bcrypt.hashpw(b"password", bcrypt.gensalt()).decode(),
                    role="analyst",
                    app_permissions={"portal": "user", "coding": "user"},  # no member360
                )
            )
            await session.commit()

        transport = ASGITransport(app=fastapi_app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
            token = await _login(client, email="nomember360@example.com")
            resp = await client.get(
                "/api/member360/dashboard",
                headers=_auth_headers(token),
            )
        assert resp.status_code == 403, resp.text
    finally:
        async with factory() as session:
            await session.execute(delete(User).where(User.email == "nomember360@example.com"))
            await session.commit()
        await engine.dispose()


# ---- Happy path tests -------------------------------------------------------


async def test_dashboard_returns_expected_shape(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        resp = await client.get("/api/member360/dashboard", headers=_auth_headers(token))

    assert resp.status_code == 200, resp.text
    body = resp.json()
    for key in ("metrics", "high_priority_members", "top_risk_drivers", "recent_activity", "upcoming_actions"):
        assert key in body, f"missing key {key}"

    metric_keys = {m["key"] for m in body["metrics"]}
    expected = {
        "total_members", "high_risk", "critical_risk", "open_tasks",
        "overdue_tasks", "active_journeys", "estimated_savings", "validated_savings",
    }
    assert expected <= metric_keys, f"missing metric keys {expected - metric_keys}"


async def test_members_list_returns_seeded_row(fastapi_app, seeded_member):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        resp = await client.get("/api/member360/members", headers=_auth_headers(token))

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] >= 1
    keys = [m["member_key"] for m in body["items"]]
    assert "T360-001" in keys


async def test_member_detail_payload_has_all_collections(fastapi_app, seeded_member):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        resp = await client.get(
            f"/api/member360/members/{seeded_member}",
            headers=_auth_headers(token),
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["member"]["member_key"] == "T360-001"
    # The detail wrapper always carries these arrays even if empty
    for collection in ("risk_insights", "tasks", "care_journeys", "notes", "messages",
                       "claims", "care_options", "savings", "documents"):
        assert collection in body, f"missing {collection}"
        assert isinstance(body[collection], list)


async def test_member_update_patches_editable_fields(fastapi_app, seeded_member):
    """`MemberUpdate` deliberately whitelists editable fields. Demographic
    contact fields are user-editable; derived risk and `next_best_action`
    are not."""
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        resp = await client.patch(
            f"/api/member360/members/{seeded_member}",
            json={
                "preferred_channel": "Email",
                "primary_care_provider": "Dr. Updated",
                "preferred_language": "Spanish",
            },
            headers=_auth_headers(token),
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["member"]["preferred_channel"] == "Email"
    assert body["member"]["primary_care_provider"] == "Dr. Updated"
    assert body["member"]["preferred_language"] == "Spanish"


async def test_task_create_then_appears_in_aggregate(fastapi_app, seeded_member):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        headers = _auth_headers(token)

        create = await client.post(
            "/api/member360/tasks",
            json={
                "member_id": seeded_member,
                "title": "Smoke test task",
                "priority": "high",
                "status": "open",
                "sbar": {"situation": "S", "background": "B", "assessment": "A", "recommendation": "R"},
            },
            headers=headers,
        )
        assert create.status_code == 201, create.text
        task_id = create.json()["id"]

        # PATCH the task to 'in_progress'
        upd = await client.patch(
            f"/api/member360/tasks/{task_id}",
            json={"status": "in_progress"},
            headers=headers,
        )
        assert upd.status_code == 200
        assert upd.json()["status"] == "in_progress"

        # And the aggregate endpoint should surface it with denormalized member fields
        agg = await client.get("/api/member360/tasks?limit=10", headers=headers)
        assert agg.status_code == 200
        rows = agg.json()["items"]
        row = next((r for r in rows if r["id"] == task_id), None)
        assert row is not None, "newly-created task did not appear in /api/member360/tasks"
        assert row["member_name"] == "Test Member"
        assert row["member_key"] == "T360-001"
        assert row["risk_tier"] == "High"


async def test_aggregate_tasks_pagination(fastapi_app, seeded_member):
    """#7 regression — limit + offset return distinct pages."""
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        headers = _auth_headers(token)

        for i in range(5):
            await client.post(
                "/api/member360/tasks",
                json={"member_id": seeded_member, "title": f"task-{i}", "priority": "medium"},
                headers=headers,
            )

        page1 = (await client.get("/api/member360/tasks?limit=2&offset=0", headers=headers)).json()
        page2 = (await client.get("/api/member360/tasks?limit=2&offset=2", headers=headers)).json()

    assert page1["total"] >= 5
    assert len(page1["items"]) == 2
    assert len(page2["items"]) == 2
    ids1 = {t["id"] for t in page1["items"]}
    ids2 = {t["id"] for t in page2["items"]}
    assert ids1 & ids2 == set(), "page 1 and page 2 should not share rows"


async def test_aggregate_member_id_filter(fastapi_app, seeded_member):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        headers = _auth_headers(token)

        await client.post(
            "/api/member360/tasks",
            json={"member_id": seeded_member, "title": "Only one"},
            headers=headers,
        )

        scoped = await client.get(
            f"/api/member360/tasks?member_id={seeded_member}",
            headers=headers,
        )
    assert scoped.status_code == 200
    body = scoped.json()
    assert body["total"] >= 1
    assert all(t["member_id"] == seeded_member for t in body["items"])


async def test_note_and_message_create(fastapi_app, seeded_member):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        headers = _auth_headers(token)

        note = await client.post(
            f"/api/member360/members/{seeded_member}/notes",
            json={"body": "Spoke with member", "channel": "Phone", "note_type": "Outreach"},
            headers=headers,
        )
        assert note.status_code == 201, note.text
        assert note.json()["body"] == "Spoke with member"

        msg = await client.post(
            f"/api/member360/members/{seeded_member}/messages",
            json={"channel": "SMS", "direction": "outbound", "body": "Hi, calling back."},
            headers=headers,
        )
        assert msg.status_code == 201, msg.text
        assert msg.json()["channel"] == "SMS"


async def test_care_option_create_also_creates_savings_row(fastapi_app, seeded_member):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        headers = _auth_headers(token)

        opt = await client.post(
            "/api/member360/care-options",
            json={
                "member_id": seeded_member,
                "service_type": "MRI",
                "cost_estimate": 640,
                "potential_savings": 620,
                "rationale": "Lower-cost equivalent imaging",
            },
            headers=headers,
        )
        assert opt.status_code == 201, opt.text

        detail = await client.get(
            f"/api/member360/members/{seeded_member}",
            headers=headers,
        )
    assert detail.status_code == 200
    body = detail.json()
    assert len(body["care_options"]) == 1
    assert len(body["savings"]) == 1
    assert body["savings"][0]["estimated_savings"] == 620


async def test_submission_export_returns_csv(fastapi_app, seeded_member):
    """#1 regression — datetime.utcnow() must resolve in the submission export.

    Pre-fix this endpoint NameError'd because services/member360.py only
    imported `date`, not `datetime`. Calling it must now succeed end-to-end.
    """
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        resp = await client.post(
            "/api/member360/submissions/export",
            json={"submission_year": 2026},
            headers=_auth_headers(token),
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "batch_id" in body and isinstance(body["batch_id"], int)
    assert body["submission_year"] == 2026
    assert "csv" in body and isinstance(body["csv"], str)
    assert body["csv"].splitlines()[0].startswith("MemberID,MemberKey,SubmissionYear")


async def test_care_journey_templates_list(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        resp = await client.get(
            "/api/member360/care-journey-templates",
            headers=_auth_headers(token),
        )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


# ---- Care journey create + escalation flow (action-dialog wiring) ----------
#
# These exercise the surfaces that back the workspace's "Start Journey" and
# "Escalate" action dialogs. Start Journey is a fresh endpoint; Escalate
# reuses the existing /tasks endpoint with status='escalated' so we just
# verify the contract holds end-to-end.


async def test_care_journey_create_freeform(fastapi_app, seeded_member):
    """Start Journey without a template — backend should accept name+description
    alone and return a journey row with no scaffolded stages."""
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        resp = await client.post(
            "/api/member360/care-journeys",
            json={
                "member_id": seeded_member,
                "name": "Heart failure stabilization",
                "description": "30-day post-discharge support",
                "source": "manual",
            },
            headers=_auth_headers(token),
        )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["member_id"] == seeded_member
    assert body["name"] == "Heart failure stabilization"
    assert body["status"] == "active"
    assert body["source"] == "manual"
    assert body["stages"] == []


async def test_care_journey_create_from_template_copies_stages(fastapi_app, seeded_member):
    """When a template_id is supplied, the template's default_stages should
    be copied verbatim onto the new journey (preserving order)."""
    from sqlalchemy import delete
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.config import get_settings
    from app.models.member360 import Member360CareJourneyTemplate

    uri = get_settings().DEFAULT_TENANT_DATABASE_URL.format(tenant_key=TENANT_KEY)
    engine = create_async_engine(uri, future=True, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    template_id = None
    try:
        async with factory() as session:
            template = Member360CareJourneyTemplate(
                name="CHF 30-day",
                description="Post-discharge CHF protocol",
                category="Cardiac",
                recommended_for_risk_tier="High",
                default_stages=[
                    {"sequence": 0, "name": "Intake", "status": "pending"},
                    {"sequence": 1, "name": "Medication reconciliation", "status": "pending"},
                    {"sequence": 2, "name": "PCP follow-up", "status": "pending"},
                ],
                default_tasks=[],
            )
            session.add(template)
            await session.commit()
            await session.refresh(template)
            template_id = template.id

        transport = ASGITransport(app=fastapi_app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
            token = await _login(client)
            resp = await client.post(
                "/api/member360/care-journeys",
                json={"member_id": seeded_member, "template_id": template_id},
                headers=_auth_headers(token),
            )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        # When no name is supplied, the template name is used.
        assert body["name"] == "CHF 30-day"
        assert body["template_name"] == "CHF 30-day"
        # Stages copied in order.
        assert [s["name"] for s in body["stages"]] == [
            "Intake", "Medication reconciliation", "PCP follow-up",
        ]
        assert all(s["status"] == "pending" for s in body["stages"])
    finally:
        async with factory() as session:
            await session.execute(
                delete(Member360CareJourneyTemplate).where(
                    Member360CareJourneyTemplate.id == template_id
                )
            )
            await session.commit()
        await engine.dispose()


async def test_care_journey_create_rejects_unknown_member(fastapi_app):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        resp = await client.post(
            "/api/member360/care-journeys",
            json={"member_id": 999999, "name": "Will not stick"},
            headers=_auth_headers(token),
        )
    assert resp.status_code == 404


async def test_care_journey_create_rejects_unknown_template(fastapi_app, seeded_member):
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        resp = await client.post(
            "/api/member360/care-journeys",
            json={"member_id": seeded_member, "template_id": 9999999},
            headers=_auth_headers(token),
        )
    assert resp.status_code == 400


async def test_care_journey_create_requires_name_without_template(fastapi_app, seeded_member):
    """With no template and no name, there's nothing to label the journey —
    the service should refuse rather than create an unnamed row."""
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        resp = await client.post(
            "/api/member360/care-journeys",
            json={"member_id": seeded_member},
            headers=_auth_headers(token),
        )
    assert resp.status_code == 400


async def test_escalation_creates_task_with_escalated_status(fastapi_app, seeded_member):
    """The Escalate dialog routes through POST /tasks with status='escalated'
    and priority='urgent'. The aggregate /tasks list should surface it."""
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        headers = _auth_headers(token)
        resp = await client.post(
            "/api/member360/tasks",
            json={
                "member_id": seeded_member,
                "title": "Escalation: HF readmit risk",
                "priority": "urgent",
                "status": "escalated",
                "assigned_queue": "RN",
                "sbar": {
                    "situation": "Member missed follow-up; weight trending up.",
                    "recommendation": "RN outreach within 24h.",
                },
                "auto_generated_reason": "Manual escalation",
            },
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        task_id = resp.json()["id"]
        assert resp.json()["status"] == "escalated"
        assert resp.json()["priority"] == "urgent"
        assert resp.json()["assigned_queue"] == "RN"

        agg = await client.get(
            f"/api/member360/tasks?member_id={seeded_member}&status=escalated",
            headers=headers,
        )
    assert agg.status_code == 200
    rows = agg.json()["items"]
    assert any(r["id"] == task_id for r in rows), "escalated task missing from filtered list"
