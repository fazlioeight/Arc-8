"""Feature 4 — member document download (EOBs & plan documents).

Covers listing (no storage key leaked), the grant -> capability-token -> stream
flow, expiry, cross-member IDOR at both grant and access, and rejection of a
non-grant token on the streaming endpoint.
"""
from __future__ import annotations

import itertools
from datetime import datetime, timedelta, timezone

import bcrypt
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.session import control_session
from app.models.member360 import Member360Document, Member360Member
from app.models.member_portal import MemberPortalAccount
from app.models.tables import Tenant
from app.services.member360_storage import get_document_backend
from app.utils.security import create_access_token

from conftest import TEST_TENANT_DB_TEMPLATE, TEST_TENANT_KEY

pytestmark = pytest.mark.anyio("asyncio")

BASE_URL = "https://prominencehealth.localhost"
PASSWORD = "Sup3r-Secret-Pass!"
DOC_BODY = b"%PDF-1.4 fake EOB body bytes"
_counter = itertools.count(1)


def _headers(bearer: str | None = None, ip: str | None = None) -> dict:
    h = {"X-Tenant-Key": TEST_TENANT_KEY}
    if bearer:
        h["Authorization"] = f"Bearer {bearer}"
    if ip:
        h["X-Forwarded-For"] = ip
    return h


async def _seed_member_with_doc() -> dict:
    n = next(_counter)
    member_key = f"DOC-{n}"
    email = f"doc{n}@example.com"
    engine = create_async_engine(TEST_TENANT_DB_TEMPLATE.format(tenant_key=TEST_TENANT_KEY), future=True)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as s:
            member = Member360Member(member_key=member_key, first_name="Doc", last_name=f"Holder{n}")
            s.add(member)
            await s.flush()
            doc = Member360Document(
                member_id=member.id, file_name=f"eob-{n}.pdf", document_type="EOB",
                content_type="application/pdf", status="active",
            )
            s.add(doc)
            await s.flush()
            backend = get_document_backend()
            storage_path = await backend.write(
                tenant_key=TEST_TENANT_KEY, member_id=member.id, doc_id=doc.id,
                file_name=doc.file_name, body=DOC_BODY,
            )
            doc.storage_backend = backend.name
            doc.storage_path = storage_path
            doc.size_bytes = len(DOC_BODY)
            await s.commit()
            doc_id = doc.id
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
        acct_id = (await session.scalar(
            select(MemberPortalAccount).where(MemberPortalAccount.email == email)
        )).id
    return {"member_key": member_key, "email": email, "doc_id": doc_id, "account_id": acct_id}


async def _login(client, email, ip):
    r = await client.post("/api/member/auth/login", headers=_headers(ip=ip), json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


async def test_list_documents_hides_storage_key(fastapi_app):
    seeded = await _seed_member_with_doc()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        token = await _login(client, seeded["email"], "30.0.0.1")
        resp = await client.get("/api/member/documents", headers=_headers(bearer=token))
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    doc = items[0]
    assert doc["document_type"] == "EOB"
    # No storage path / key / backend leaked to the client.
    assert "storage_path" not in doc and "storage_backend" not in doc


async def test_grant_then_download_streams_bytes(fastapi_app):
    seeded = await _seed_member_with_doc()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        token = await _login(client, seeded["email"], "30.0.0.2")
        grant = await client.post(
            f"/api/member/documents/{seeded['doc_id']}/grant", headers=_headers(bearer=token)
        )
        assert grant.status_code == 200, grant.text
        url = grant.json()["download_url"]
        assert "token=" in url and str(seeded["doc_id"]) not in url.split("token=")[1][:5]

        # Download needs NO Authorization header — the signed token is the capability.
        dl = await client.get(url, headers={"X-Tenant-Key": TEST_TENANT_KEY})
    assert dl.status_code == 200
    assert dl.content == DOC_BODY
    assert dl.headers["content-type"].startswith("application/pdf")
    assert "attachment" in dl.headers["content-disposition"]


async def test_expired_grant_token_rejected(fastapi_app):
    seeded = await _seed_member_with_doc()
    expired = create_access_token(
        {"typ": "mdl", "tid": TEST_TENANT_KEY, "mid": seeded["account_id"], "did": seeded["doc_id"]},
        expires_delta=timedelta(seconds=-5),
    )
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        resp = await client.get(
            f"/api/member/documents/access?token={expired}", headers={"X-Tenant-Key": TEST_TENANT_KEY}
        )
    assert resp.status_code == 401  # decode_token surfaces expiry as 401


async def test_non_grant_token_rejected_on_access(fastapi_app):
    seeded = await _seed_member_with_doc()
    # A normal member session token (no typ=mdl) must not stream documents.
    member_session = create_access_token(
        {"typ": "member", "tid": TEST_TENANT_KEY, "mid": seeded["account_id"], "did": seeded["doc_id"]}
    )
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        resp = await client.get(
            f"/api/member/documents/access?token={member_session}", headers={"X-Tenant-Key": TEST_TENANT_KEY}
        )
    assert resp.status_code == 403


async def test_member_cannot_grant_or_access_other_members_document(fastapi_app):
    a = await _seed_member_with_doc()
    b = await _seed_member_with_doc()
    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url=BASE_URL) as client:
        token_a = await _login(client, a["email"], "30.0.0.3")
        # A cannot mint a grant for B's document.
        grant = await client.post(
            f"/api/member/documents/{b['doc_id']}/grant", headers=_headers(bearer=token_a)
        )
        assert grant.status_code == 404

        # Even a forged token naming A's account but B's doc fails the ownership re-check.
        forged = create_access_token(
            {"typ": "mdl", "tid": TEST_TENANT_KEY, "mid": a["account_id"], "did": b["doc_id"]},
            expires_delta=timedelta(seconds=120),
        )
        access = await client.get(
            f"/api/member/documents/access?token={forged}", headers={"X-Tenant-Key": TEST_TENANT_KEY}
        )
    assert access.status_code == 403
