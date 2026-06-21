"""Tests for the member-portal edge proxy.

Validate the trust-boundary behavior: only /api/member/* is proxied, hop-by-hop
and Host headers are stripped, the Authorization header is forwarded, and
security headers are added. No real backend is contacted — the upstream client
is replaced with a recording fake.
"""
import httpx
import pytest
from starlette.testclient import TestClient

import app as edge


class FakeClient:
    def __init__(self):
        self.calls = []

    async def request(self, method, target, headers=None, content=None):
        self.calls.append({"method": method, "target": target, "headers": headers, "content": content})
        return httpx.Response(200, json={"ok": True, "echo_target": target})

    async def aclose(self):
        pass


@pytest.fixture
def client_and_fake():
    fake = FakeClient()
    with TestClient(edge.app) as client:
        edge._client = fake  # inject after startup
        yield client, fake
    edge._client = None


def test_non_member_path_is_404(client_and_fake):
    client, fake = client_and_fake
    resp = client.get("/api/staff/secrets")
    assert resp.status_code == 404
    assert fake.calls == []  # never forwarded


def test_member_path_is_proxied_with_query(client_and_fake):
    client, fake = client_and_fake
    resp = client.get("/api/member/claims?limit=5", headers={"Authorization": "Bearer t"})
    assert resp.status_code == 200
    assert len(fake.calls) == 1
    call = fake.calls[0]
    assert call["method"] == "GET"
    assert call["target"] == "/api/member/claims?limit=5"
    # Authorization is forwarded; Host is stripped.
    assert call["headers"].get("authorization") == "Bearer t"
    assert "host" not in {k.lower() for k in call["headers"]}


def test_security_headers_added(client_and_fake):
    client, _ = client_and_fake
    resp = client.get("/api/member/eligibility", headers={"Authorization": "Bearer t"})
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["x-frame-options"] == "DENY"
    assert resp.headers["cache-control"] == "no-store"


def test_post_body_forwarded(client_and_fake):
    client, fake = client_and_fake
    resp = client.post("/api/member/auth/login", json={"email": "a@b.com", "password": "x"})
    assert resp.status_code == 200
    assert b"a@b.com" in fake.calls[0]["content"]


def test_edge_auth_header_injected_and_client_value_stripped(monkeypatch):
    monkeypatch.setattr(edge, "EDGE_AUTH_SECRET", "edge-shhh")
    fake = FakeClient()
    with TestClient(edge.app) as client:
        edge._client = fake
        # A client trying to smuggle its own X-Edge-Auth is overwritten.
        client.get("/api/member/claims", headers={"Authorization": "Bearer t", "X-Edge-Auth": "spoof"})
        sent = fake.calls[0]["headers"]
        assert sent.get("X-Edge-Auth") == "edge-shhh"
    edge._client = None


def test_front_door_id_guard(monkeypatch):
    monkeypatch.setattr(edge, "EXPECTED_FRONT_DOOR_ID", "fd-123")
    fake = FakeClient()
    with TestClient(edge.app) as client:
        edge._client = fake
        # Missing/incorrect FDID -> 404, never forwarded.
        blocked = client.get("/api/member/claims")
        assert blocked.status_code == 404
        assert fake.calls == []
        # Correct FDID -> proxied.
        ok = client.get("/api/member/claims", headers={"X-Azure-FDID": "fd-123"})
        assert ok.status_code == 200
        assert len(fake.calls) == 1
    edge._client = None


def test_health_ready_503_when_unconfigured():
    # Without MEMBER_BACKEND_INTERNAL_URL, startup leaves the client unset.
    with TestClient(edge.app) as client:
        edge._client = None
        assert client.get("/health/ready").status_code == 503
        assert client.get("/health/live").status_code == 200
