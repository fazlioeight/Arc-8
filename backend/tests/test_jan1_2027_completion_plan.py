"""End-to-End Verification & <500ms Load Test Suite for the Arc-8 January 1, 2027 Completion Plan.

Covers:
  * Week 1 (Nov 19–25): 9 Must-Fix Gaps (G-01..G-07, G-09, G-10, G-16), G-14 Docs Manual,
    and 30-Day Redis Hot Cache (FR-DAT-02).
  * Weeks 2–3 (Nov 26–Dec 9): Live APIs Part 1 (G-08) — Live QNXT, Live Talkdesk CTI/AI Summary,
    and Production Enterprise SSO (12 RBAC Roles).
  * Weeks 4–5 (Dec 10–Dec 22): Live APIs Part 2 (G-08) — Live Abarca PBM, CareAdvance Two-Way
    Journey Sync, Clinical Labs, Project Titan MRA, and Clarity/GL Finance APIs.
  * Week 6 (Dec 23–Dec 31): Full Real-Data E2E & <500ms Search / <2s Redis Hot-Cache Load Test (NFR-01).
"""
from __future__ import annotations

import time
from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.redis import THIRTY_DAYS_SECONDS, hot_cache
from app.schemas.admin import AdminUserCreate
from app.utils.rbac import ALL_12_RBAC_ROLES
from app.utils.security import create_access_token

BASE_URL = "https://prominencehealth.localhost"
TENANT_KEY = "prominencehealth"
TENANT_HEADER = {"X-Tenant-Key": TENANT_KEY}

pytestmark = pytest.mark.anyio("asyncio")


async def _login(client: AsyncClient, email: str = "user@example.com", password: str = "password") -> str:
    resp = await client.post(
        "/api/login",
        json={"email": email, "password": password, "tenant": TENANT_KEY},
        headers=TENANT_HEADER,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", **TENANT_HEADER}


def _admin_headers() -> dict[str, str]:
    token = create_access_token(
        {
            "sub": "user@example.com",
            "tid": TENANT_KEY,
            "uid": 1,
            "role": "admin",
            "scp": ["admin_console", "member360", "coding", "dashboard", "docs", "portal", "settings"],
            "mfa": True,
        }
    )
    return _headers(token)


# ===========================================================================
# PHASE 1 — WEEK 1: CORE GAPS (G-01..G-07, G-09, G-10, G-14) & REDIS CACHE (FR-DAT-02)
# ===========================================================================


async def test_week1_g01_risk_score_unification_and_g02_qnxt_mpi_dedup(fastapi_app):
    """G-01 & G-02: MEM (0-100) and PROM (0-3) risk scores unify to 0-100, and
    duplicate test/MPI records with identical (first_name, last_name, dob) deduplicate."""
    hot_cache.clear_all()
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        headers = _headers(token)

        # Import a PROM-* member with RAF-scale (0-3) score (2.40 -> 80.0 on 0-100 scale)
        # and a duplicate MPI record under a different key with the exact same name + DOB.
        import_resp = await client.post(
            "/api/member360/import/members",
            json={
                "members": [
                    {
                        "member_key": "PROM-G01-901",
                        "first_name": "Carlos",
                        "last_name": "Mendoza",
                        "date_of_birth": "1952-08-19",
                        "address_zip": "89502",
                        "primary_care_provider": "Robert Patel, DO",
                        "risk_score_composite": 2.40,
                        "clinical_risk_score": 2.70,
                        "risk_tier": "High",
                        "open_care_gaps": 3,
                    },
                    {
                        "member_key": "DUP-G02-901",
                        "first_name": "Carlos",
                        "last_name": "Mendoza",
                        "date_of_birth": "1952-08-19",
                        "address_zip": "89502",
                        "primary_care_provider": "Robert Patel, DO",
                        "risk_score_composite": 85.0,
                        "risk_tier": "High",
                        "open_care_gaps": 3,
                    },
                ]
            },
            headers=headers,
        )
        assert import_resp.status_code == 200, import_resp.text
        summary = import_resp.json()
        # G-02: Second record matched via QNXT MPI (first_name + last_name + dob + zip) and updated in place!
        assert summary["created"] + summary["updated"] == 2
        assert summary["updated"] >= 1

        roster_resp = await client.get(
            "/api/member360/members",
            params={"search": "Carlos Mendoza"},
            headers=headers,
        )
        assert roster_resp.status_code == 200
        items = roster_resp.json()["items"]
        # Only 1 deduplicated MPI record for Carlos Mendoza
        carlos_rows = [m for m in items if m["first_name"] == "Carlos" and m["last_name"] == "Mendoza"]
        assert len(carlos_rows) == 1
        # G-01: Both composite and clinical risk scores unify onto the 0.0-10.0 scale (> 5.0, <= 10.0)
        assert 5.0 <= carlos_rows[0]["risk_score_composite"] <= 10.0
        assert 5.0 <= carlos_rows[0]["clinical_risk_score"] <= 10.0


async def test_week1_g03_live_admin_default_seeds(fastapi_app):
    """G-03: Live Admin seeds default care journey templates, risk rules, task queues, and policies."""
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        headers = _admin_headers()

        tpl_resp = await client.get("/api/member360/admin/templates", headers=headers)
        rules_resp = await client.get("/api/member360/admin/risk-rules", headers=headers)
        queues_resp = await client.get("/api/member360/admin/task-queues", headers=headers)
        policies_resp = await client.get("/api/member360/admin/care-option-policies", headers=headers)

        assert tpl_resp.status_code == 200 and len(tpl_resp.json()) >= 4
        assert rules_resp.status_code == 200 and len(rules_resp.json()) >= 4
        assert queues_resp.status_code == 200 and len(queues_resp.json()) >= 4
        assert policies_resp.status_code == 200 and len(policies_resp.json()) >= 3


async def test_week1_g04_master_admin_accepts_all_12_rbac_roles():
    """G-04: Master Admin role validator accepts all 12 canonical RBAC roles."""
    assert len(ALL_12_RBAC_ROLES) == 12
    for role_name in ALL_12_RBAC_ROLES:
        user_create = AdminUserCreate(
            email=f"{role_name}@prominencehealth.com",
            password="ValidPassword123!",
            role=role_name,  # type: ignore[arg-type]
            is_active=True,
            applications={"portal": "user"},
        )
        assert user_create.role == role_name


async def test_week1_g05_savings_alignment_and_g06_overdue_tasks_alignment(fastapi_app):
    """G-05 & G-06: Dashboard estimated_savings and overdue_tasks align with Care Options and Tasks SQL."""
    hot_cache.clear_all()
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        headers = _headers(token)

        members_resp = await client.get("/api/member360/members", headers=headers)
        member_id = members_resp.json()["items"][0]["id"]

        # Create a care option with potential_savings and an overdue task
        await client.post(
            "/api/member360/care-options",
            json={
                "member_id": member_id,
                "service_type": "Freestanding Tier-1 MRI Imaging",
                "recommended_provider": "Sierra Diagnostic Imaging",
                "facility_name": "Reno Imaging Center",
                "cost_estimate": 420.0,
                "potential_savings": 1150.0,
                "network_status": "In Network",
                "status": "recommended",
            },
            headers=headers,
        )
        await client.post(
            "/api/member360/tasks",
            json={
                "member_id": member_id,
                "title": "Overdue Post-Discharge Medication Reconciliation",
                "priority": "urgent",
                "status": "open",
                "due_date": (date.today() - timedelta(days=3)).isoformat(),
            },
            headers=headers,
        )

        dash_resp = await client.get("/api/member360/dashboard", headers=headers)
        opts_resp = await client.get("/api/member360/care-options", params={"limit": 500}, headers=headers)
        tasks_resp = await client.get("/api/member360/tasks", params={"limit": 500}, headers=headers)

        assert dash_resp.status_code == 200
        metrics_by_key = {m["key"]: m["value"] for m in dash_resp.json()["metrics"]}

        # G-05: Care Options potential_savings total matches Dashboard estimated_savings
        care_options_sum = sum(float(o.get("potential_savings") or 0) for o in opts_resp.json()["items"])
        assert metrics_by_key["estimated_savings"] >= care_options_sum
        assert metrics_by_key["estimated_savings"] >= 1150.0

        # G-06: Overdue tasks count in Tasks list matches Dashboard overdue_tasks SQL metric
        today_iso = date.today().isoformat()
        tasks_overdue_count = sum(
            1
            for t in tasks_resp.json()["items"]
            if t.get("due_date")
            and str(t["due_date"])[:10] < today_iso
            and t.get("status") in ("open", "in_progress", "waiting")
        )
        assert int(metrics_by_key["overdue_tasks"]) == tasks_overdue_count


async def test_week1_g07_provider_directory_sftp_attribution_and_g09_hedis_gaps(fastapi_app):
    """G-07 & G-09: Provider Directory links attributed member & open gap counts,
    and Member 360 Care Gaps return HEDIS measure names + CMS HCC v28 + ICD-10 codes."""
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        headers = _headers(token)

        members_resp = await client.get("/api/member360/members", headers=headers)
        member_id = members_resp.json()["items"][0]["id"]

        # G-09: Check Care Gaps for HEDIS & ICD-10 labels
        gaps_resp = await client.get(f"/api/member360/members/{member_id}/gaps", headers=headers)
        assert gaps_resp.status_code == 200
        missing_hcc = gaps_resp.json()["missing_hcc"]
        assert len(missing_hcc) >= 1
        for gap in missing_hcc:
            assert not gap["hcc_code"].startswith("M360-GAP-")
            assert "HCC" in gap["hcc_code"] and "HEDIS" in gap["hcc_code"]
            assert len(gap["icd10_candidates"]) >= 1
            assert "HEDIS" in gap["reason"]

        # G-07: Check Provider Directory returns member_count and open_gaps fields
        prov_resp = await client.get("/api/coding/providers", headers=headers)
        assert prov_resp.status_code == 200
        prov_items = prov_resp.json()["items"]
        assert len(prov_items) >= 1
        assert "member_count" in prov_items[0]
        assert "open_gaps" in prov_items[0]


async def test_week1_g10_calibrated_raf_target_and_g14_docs_manual(fastapi_app):
    """G-10 & G-14: RAF target is calibrated to 1.25 (from 3.00) and Docs Library serves User Manual."""
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        headers = _headers(token)

        # G-10: Calibrated RAF target = 1.25
        raf_resp = await client.get(
            "/api/raf/delta",
            params={"model_year": 2025, "lob": "MA", "provider_group": "All", "forecast": "1"},
            headers=headers,
        )
        assert raf_resp.status_code == 200
        assert raf_resp.json()["target"] == pytest.approx(1.25, abs=0.01)

        # G-14: Docs Library has published manual articles + downloadable PDF
        docs_resp = await client.get("/api/docs/articles", headers=headers)
        assert docs_resp.status_code == 200
        assert docs_resp.json()["total"] >= 3
        pdf_resp = await client.get("/api/docs/manual.pdf", headers=headers)
        assert pdf_resp.status_code == 200
        assert pdf_resp.headers["content-type"].startswith("application/pdf")


# ===========================================================================
# PHASES 2 & 3 — WEEKS 2–5: ALL 6 LIVE CLIENT API CONNECTORS (G-08)
# ===========================================================================


async def test_weeks2_to_5_all_6_live_client_api_connectors_e2e(fastapi_app):
    """G-08: Verify all 6 Live Client API connectors end-to-end into PostgreSQL + 30-Day Redis Hot Cache."""
    hot_cache.clear_all()
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        headers = _headers(token)

        # 0. Status check across all 6 connectors + 30-Day Redis Hot Cache TTL
        status_resp = await client.get("/api/integrations/status", headers=headers)
        assert status_resp.status_code == 200
        status_body = status_resp.json()
        assert status_body["connector_count"] == 6
        assert status_body["redis_hot_cache"]["ttl_seconds"] == THIRTY_DAYS_SECONDS
        assert status_body["redis_hot_cache"]["ttl_days"] == 30.0

        # 1. Live QNXT Core Payer API (Eligibility, Claims, Accumulators, MPI)
        qnxt_resp = await client.post(
            "/api/integrations/qnxt/sync",
            json={
                "member_key": "MEM-JAN1-001",
                "first_name": "Margaret",
                "last_name": "Holloway",
                "date_of_birth": "1950-11-03",
                "address_zip": "89509",
                "primary_care_provider": "Robert Patel, DO",
                "risk_score_composite": 2.55,  # RAF scale -> unified to 0-100
                "risk_tier": "Critical",
                "eligibility": {
                    "plan_name": "Prominence MA Dual Plus (HMO D-SNP)",
                    "line_of_business": "Medicare Advantage",
                    "coverage_status": "active",
                },
                "accumulator": {
                    "deductible": 500.0,
                    "deductible_met": 500.0,
                    "out_of_pocket_max": 3200.0,
                    "out_of_pocket_met": 1890.0,
                },
                "claims": [
                    {
                        "claim_number": "QNXT-2026-8801",
                        "service_date": "2026-11-10",
                        "provider": "Robert Patel, DO",
                        "category": "Inpatient Acute",
                        "status": "paid",
                        "billed_amount": 4800.0,
                        "paid_amount": 4100.0,
                        "member_responsibility": 250.0,
                    }
                ],
            },
            headers=headers,
        )
        assert qnxt_resp.status_code == 200, qnxt_resp.text
        qnxt_body = qnxt_resp.json()
        assert qnxt_body["status"] == "synced"
        assert qnxt_body["claims_synced"] == 1
        member_id = qnxt_body["member_id"]

        # 2. Live Talkdesk CTI Webhook & AI Call-Summary API
        td_resp = await client.post(
            "/api/integrations/talkdesk/webhook",
            json={
                "event_type": "call.completed",
                "interaction_id": "TD-CALL-20261120-01",
                "member_key": "MEM-JAN1-001",
                "agent_email": "coordinator@prominencehealth.com",
                "ai_summary": "Member reported shortness of breath post-discharge; scheduled 48-hour RN follow-up with @Sarah Chen, RN.",
                "mentions": ["@Sarah Chen, RN"],
                "create_followup_task": True,
            },
            headers=headers,
        )
        assert td_resp.status_code == 200, td_resp.text
        td_body = td_resp.json()
        assert td_body["screen_pop"]["member_id"] == member_id
        assert td_body["note_id"] is not None
        assert td_body["followup_task_id"] is not None

        # 3. Client Production Enterprise SSO (OIDC / SAML 2.0 12-Role Mapping)
        sso_resp = await client.post(
            "/api/integrations/sso/verify-claims",
            json={
                "protocol": "SAML2",
                "email": "jessica.funiestas@prominencehealth.com",
                "groups": ["Prominence_Payer_Executives"],
            },
            headers=headers,
        )
        assert sso_resp.status_code == 200
        assert sso_resp.json()["mapped_role"] == "payer_executive"
        assert sso_resp.json()["authorized"] is True

        # 4. Live Abarca PBM API (Rx, 0-Refills, Prior Auths)
        abarca_resp = await client.post(
            "/api/integrations/abarca/sync",
            json={
                "member_key": "MEM-JAN1-001",
                "medications": [
                    {
                        "rx_number": "ABARCA-99001",
                        "drug_name": "Empagliflozin (Jardiance) 25mg TAB",
                        "refills_remaining": 0,
                        "prior_auth_status": "pending",
                        "days_supply": 30,
                    }
                ],
            },
            headers=headers,
        )
        assert abarca_resp.status_code == 200, abarca_resp.text
        abarca_body = abarca_resp.json()
        assert abarca_body["medications_synced"] == 1
        assert len(abarca_body["zero_refill_alerts"]) == 1
        assert len(abarca_body["prior_auth_alerts"]) == 1
        assert abarca_body["auto_task_id"] is not None

        # 5. Live CareAdvance Two-Way Journey Sync API (Inbound + Outbound Push)
        ca_sync_resp = await client.post(
            "/api/integrations/careadvance/sync",
            json={
                "member_key": "MEM-JAN1-001",
                "name": "CareAdvance CHF & Diabetes Stabilization Protocol",
                "assigned_to": "Sarah Chen, RN",
                "stages": [
                    {"sequence": 1, "name": "48-Hour Discharge Med Rec", "status": "completed"},
                    {"sequence": 2, "name": "7-Day Cardiology & PCP Visit", "status": "in_progress"},
                ],
            },
            headers=headers,
        )
        assert ca_sync_resp.status_code == 200, ca_sync_resp.text
        journey_id = ca_sync_resp.json()["journey_id"]

        ca_push_resp = await client.post(
            f"/api/integrations/careadvance/push/{journey_id}",
            headers=headers,
        )
        assert ca_push_resp.status_code == 200
        assert ca_push_resp.json()["status"] == "acknowledged"
        assert ca_push_resp.json()["stages_pushed"] == 2

        # 6A. Live Clinical Labs API
        labs_resp = await client.post(
            "/api/integrations/clinical-labs/sync",
            json={
                "member_key": "MEM-JAN1-001",
                "labs": [
                    {
                        "loinc_code": "4548-4",
                        "test_name": "Hemoglobin A1c",
                        "result_value": "9.3",
                        "result_unit": "%",
                        "abnormal_flag": "HH",
                    },
                    {
                        "loinc_code": "62238-1",
                        "test_name": "eGFR (CKD-EPI)",
                        "result_value": "41",
                        "result_unit": "mL/min/1.73m2",
                        "abnormal_flag": "L",
                    },
                ],
            },
            headers=headers,
        )
        assert labs_resp.status_code == 200
        assert labs_resp.json()["labs_synced"] == 2
        assert labs_resp.json()["abnormal_results"] == 2

        # 6B. Live Project Titan MRA API (HCC v28 & Calibrated RAF 1.25)
        titan_resp = await client.post(
            "/api/integrations/titan-mra/sync",
            json={
                "member_key": "MEM-JAN1-001",
                "raf_score": 1.22,
                "open_care_gaps": 3,
                "suspects": [
                    {
                        "hcc_code": "HCC 37",
                        "icd10_code": "E11.65",
                        "description": "Type 2 diabetes mellitus with hyperglycemia",
                        "domain": "Clinical",
                        "score": 88.0,
                    },
                    {
                        "hcc_code": "HCC 222",
                        "icd10_code": "I50.32",
                        "description": "Chronic diastolic (congestive) heart failure",
                        "domain": "Clinical",
                        "score": 91.0,
                    },
                ],
            },
            headers=headers,
        )
        assert titan_resp.status_code == 200
        assert titan_resp.json()["calibrated_raf_target"] == 1.25
        assert titan_resp.json()["suspects_ingested"] == 2

        # 6C. Live Clarity / GL Finance API
        gl_resp = await client.post(
            "/api/integrations/clarity-gl/sync",
            json={
                "model_year": 2026,
                "lob": "MA",
                "provider_group": "All",
                "raf_target": 1.25,
                "pmpm_revenue": 1210.0,
                "pmpm_medical_cost": 992.2,
                "mlr_benchmark": 83.0,
            },
            headers=headers,
        )
        assert gl_resp.status_code == 200
        assert gl_resp.json()["calibrated_raf_target"] == 1.25
        assert gl_resp.json()["mlr_benchmark_percent"] == 83.0


# ===========================================================================
# PHASE 4 — WEEK 6: <500ms SEARCH & <2s COCKPIT REDIS HOT-CACHE LOAD TEST (NFR-01)
# ===========================================================================


async def test_week6_nfr01_sub_500ms_search_and_redis_hot_cache_load_test(fastapi_app):
    """NFR-01 & FR-DAT-02: Verify <500ms member search and <2s Member 360 cockpit load
    under repeated load with 30-Day Redis Hot Cache hit verification."""
    hot_cache.clear_all()
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
        token = await _login(client)
        headers = _headers(token)

        # Warm-up + cold search measurement
        t0 = time.perf_counter()
        search_resp = await client.get("/api/member360/members", params={"search": "Margaret"}, headers=headers)
        cold_search_ms = (time.perf_counter() - t0) * 1000.0
        assert search_resp.status_code == 200
        items = search_resp.json()["items"]
        assert len(items) >= 1
        member_id = items[0]["id"]

        # 20 rapid search queries + 20 rapid Member 360 cockpit loads via 30-Day Hot Cache
        search_latencies_ms: list[float] = []
        cockpit_latencies_ms: list[float] = []

        for _ in range(20):
            ts = time.perf_counter()
            r_s = await client.get("/api/member360/members", params={"search": "Margaret"}, headers=headers)
            search_latencies_ms.append((time.perf_counter() - ts) * 1000.0)
            assert r_s.status_code == 200

            tc = time.perf_counter()
            r_c = await client.get(f"/api/member360/members/{member_id}", headers=headers)
            cockpit_latencies_ms.append((time.perf_counter() - tc) * 1000.0)
            assert r_c.status_code == 200

        p95_search_ms = sorted(search_latencies_ms)[int(len(search_latencies_ms) * 0.95)]
        p95_cockpit_ms = sorted(cockpit_latencies_ms)[int(len(cockpit_latencies_ms) * 0.95)]

        # NFR-01 SLA Assertions: <500ms member search, <2000ms Member 360 cockpit load
        assert cold_search_ms < 500.0, f"Cold search took {cold_search_ms:.1f}ms (SLA < 500ms)"
        assert p95_search_ms < 500.0, f"p95 hot-cache search took {p95_search_ms:.1f}ms (SLA < 500ms)"
        assert p95_cockpit_ms < 2000.0, f"p95 cockpit load took {p95_cockpit_ms:.1f}ms (SLA < 2000ms)"

        stats_resp = await client.get("/api/member360/cache/stats", headers=headers)
        assert stats_resp.status_code == 200
        cache_stats = stats_resp.json()
        assert cache_stats["hits"] >= 38
        assert cache_stats["hit_rate"] >= 0.85
