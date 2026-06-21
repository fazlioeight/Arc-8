"""Feature 3 — member dashboard (eligibility, claims, accumulators).

Asserts the read-only views return the member's own data, the individual-vs-
family accumulator split, claim detail with line-items + denial reason + EOB
link, and — critically — that a member cannot read another member's claim
(IDOR) or reach the routes without a member session.
"""
from __future__ import annotations

import itertools
from datetime import date, datetime, timezone
from decimal import Decimal

import bcrypt
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.session import control_session
from app.models.member360 import (
    Member360AccumulatorScope,
    Member360Claim,
    Member360ClaimDetail,
    Member360ClaimLine,
    Member360Coverage,
    Member360Dependent,
    Member360Document,
    Member360Member,
)
from app.models.member_portal import MemberPortalAccount
from app.models.tables import Tenant

from conftest import TEST_TENANT_DB_TEMPLATE, TEST_TENANT_KEY

pytestmark = pytest.mark.anyio("asyncio")

BASE_URL = "https://prominencehealth.localhost"
PASSWORD = "Sup3r-Secret-Pass!"
_counter = itertools.count(1)


def _headers(bearer: str | None = None, ip: str | None = None) -> dict:
    h = {"X-Tenant-Key": TEST_TENANT_KEY}
    if bearer:
        h["Authorization"] = f"Bearer {bearer}"
    if ip:
        h["X-Forwarded-For"] = ip
    return h


async def _seed_member(*, with_claims: bool = True) -> dict:
    """Seed an m360 member (coverage, dependents, claims, accumulators) and a
    matching active portal account. Returns identifiers + login email."""
    n = next(_counter)
    member_key = f"DASH-{n}"
    email = f"dash{n}@example.com"
    out: dict = {"member_key": member_key, "email": email}

    engine = create_async_engine(TEST_TENANT_DB_TEMPLATE.format(tenant_key=TEST_TENANT_KEY), future=True)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as s:
            member = Member360Member(
                member_key=member_key, first_name="Dash", last_name=f"Member{n}",
                date_of_birth=date(1955, 5, 5), plan_name="Gold PPO",
                line_of_business="Medicare Advantage", primary_care_provider="Dr. House",
                address_zip="30301",
            )
            s.add(member)
            await s.flush()
            out["member_id"] = member.id

            s.add(Member360Coverage(
                member_id=member.id, plan_name="Gold PPO", line_of_business="Medicare Advantage",
                coverage_status="active", effective_date=date(2026, 1, 1), coverage_tier="family",
                relationship_to_subscriber="subscriber", is_primary=True, as_of_date=date(2026, 6, 1),
            ))
            s.add(Member360Dependent(
                subscriber_member_id=member.id, first_name="Kid", last_name=f"Member{n}",
                relationship_type="child", date_of_birth=date(2015, 3, 3), coverage_status="active",
            ))
            s.add(Member360AccumulatorScope(
                member_id=member.id, scope="individual", deductible=Decimal("1000.00"),
                deductible_met=Decimal("250.00"), out_of_pocket_max=Decimal("5000.00"),
                out_of_pocket_met=Decimal("1200.00"), plan_year_start=date(2026, 1, 1), as_of_date=date(2026, 6, 1),
            ))
            s.add(Member360AccumulatorScope(
                member_id=member.id, scope="family", deductible=Decimal("2000.00"),
                deductible_met=Decimal("600.00"), out_of_pocket_max=Decimal("10000.00"),
                out_of_pocket_met=Decimal("2400.00"), plan_year_start=date(2026, 1, 1), as_of_date=date(2026, 6, 1),
            ))

            if with_claims:
                doc = Member360Document(
                    member_id=member.id, file_name="eob.pdf", document_type="EOB",
                    storage_backend="local", storage_path=f"t/{member_key}/eob.pdf",
                )
                s.add(doc)
                await s.flush()

                paid = Member360Claim(
                    member_id=member.id, claim_number=f"CLM-{n}-A", service_date=date(2026, 3, 1),
                    provider="City Clinic", category="office_visit", status="paid",
                    billed_amount=Decimal("300.00"), paid_amount=Decimal("250.00"),
                    member_responsibility=Decimal("50.00"),
                )
                s.add(paid)
                await s.flush()
                out["paid_claim_id"] = paid.id
                s.add(Member360ClaimLine(
                    claim_id=paid.id, line_number=1, service_date=date(2026, 3, 1),
                    procedure_code="99213", procedure_description="Office visit",
                    billed_amount=Decimal("300.00"), allowed_amount=Decimal("280.00"),
                    paid_amount=Decimal("250.00"), member_responsibility=Decimal("50.00"),
                    copay=Decimal("50.00"), status="paid",
                ))
                s.add(Member360ClaimDetail(claim_id=paid.id, eob_document_id=doc.id, remittance_date=date(2026, 3, 15)))

                denied = Member360Claim(
                    member_id=member.id, claim_number=f"CLM-{n}-B", service_date=date(2026, 4, 1),
                    provider="Imaging Co", category="radiology", status="denied",
                    billed_amount=Decimal("900.00"), paid_amount=Decimal("0.00"),
                    member_responsibility=Decimal("0.00"),
                )
                s.add(denied)
                await s.flush()
                out["denied_claim_id"] = denied.id
                s.add(Member360ClaimDetail(claim_id=denied.id, denial_reason="Prior authorization required"))
                s.add(Member360ClaimLine(
                    claim_id=denied.id, line_number=1, procedure_code="74177",
                    procedure_description="CT abdomen", billed_amount=Decimal("900.00"),
                    status="denied", denial_reason="Prior authorization required",
                ))

            await s.commit()
    finally:
        await engine.dispose()

    async with control_session() as session:
        tenant = await session.scalar(select(Tenant).where(Tenant.key == TEST_TENANT_KEY))
        session.add(MemberPortalAccount(
            tenant_id=tenant.id, member_key=member_key, email=email,
            password_hash=bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt()).decode(),
            status="active", email_verified_at=datetime.now(timezone.utc),
        ))
        await session.commit()
    return out


async def _login(client, email, ip):
    resp = await client.post(
        "/api/member/auth/login", headers=_headers(ip=ip), json={"email": email, "password": PASSWORD}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


# --------------------------------------------------------------------------- #


async def test_eligibility_returns_coverage_and_dependents(fastapi_app):
    seeded = await _seed_member()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        token = await _login(client, seeded["email"], "20.0.0.1")
        resp = await client.get("/api/member/eligibility", headers=_headers(bearer=token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["member_key"] == seeded["member_key"]
    assert body["line_of_business"] == "Medicare Advantage"
    assert body["primary_care_provider"] == "Dr. House"
    assert len(body["coverages"]) == 1
    assert body["coverages"][0]["coverage_status"] == "active"
    assert body["coverages"][0]["coverage_tier"] == "family"
    assert len(body["dependents"]) == 1
    assert body["dependents"][0]["relationship_type"] == "child"


async def test_claims_list_and_detail(fastapi_app):
    seeded = await _seed_member()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        token = await _login(client, seeded["email"], "20.0.0.2")
        lst = await client.get("/api/member/claims", headers=_headers(bearer=token))
        assert lst.status_code == 200
        body = lst.json()
        assert body["total"] == 2
        assert {c["status"] for c in body["items"]} == {"paid", "denied"}

        # Filter by status.
        denied_list = await client.get("/api/member/claims?status=denied", headers=_headers(bearer=token))
        assert denied_list.json()["total"] == 1

        # Detail of the denied claim: denial reason + line + (no EOB).
        detail = await client.get(
            f"/api/member/claims/{seeded['denied_claim_id']}", headers=_headers(bearer=token)
        )
        assert detail.status_code == 200
        d = detail.json()
        assert d["denial_reason"] == "Prior authorization required"
        assert len(d["lines"]) == 1
        assert d["lines"][0]["procedure_code"] == "74177"

        # Paid claim links its EOB document.
        paid = await client.get(
            f"/api/member/claims/{seeded['paid_claim_id']}", headers=_headers(bearer=token)
        )
        assert paid.json()["eob_document_id"] is not None


async def test_accumulators_individual_and_family_split(fastapi_app):
    seeded = await _seed_member(with_claims=False)
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        token = await _login(client, seeded["email"], "20.0.0.3")
        resp = await client.get("/api/member/accumulators", headers=_headers(bearer=token))
    assert resp.status_code == 200
    scopes = {s["scope"]: s for s in resp.json()["scopes"]}
    assert set(scopes) == {"individual", "family"}
    assert scopes["individual"]["deductible_remaining"] == 750.0   # 1000 - 250
    assert scopes["family"]["out_of_pocket_remaining"] == 7600.0   # 10000 - 2400


# --------------------------------------------------------------------------- #
# Isolation
# --------------------------------------------------------------------------- #


async def test_member_cannot_read_another_members_claim(fastapi_app):
    a = await _seed_member()
    b = await _seed_member()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        token_a = await _login(client, a["email"], "21.0.0.1")
        # A tries to fetch B's claim id directly -> 404 (IDOR blocked).
        resp = await client.get(
            f"/api/member/claims/{b['denied_claim_id']}", headers=_headers(bearer=token_a)
        )
    assert resp.status_code == 404


async def test_dashboard_requires_member_session(fastapi_app):
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        # No token.
        anon = await client.get("/api/member/eligibility", headers=_headers())
        assert anon.status_code == 401

        # A staff-realm token must not work on member routes.
        from app.utils.security import create_access_token
        staff = create_access_token({"sub": "user@example.com", "tid": TEST_TENANT_KEY, "uid": 1, "role": "admin"})
        resp = await client.get("/api/member/eligibility", headers=_headers(bearer=staff))
    assert resp.status_code == 401
