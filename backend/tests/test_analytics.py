from fastapi.testclient import TestClient
from app.main import app
from app.utils.security import create_access_token


client = TestClient(app)


def test_analytics_summary_requires_token():
    resp = client.get("/api/analytics/summary")
    assert resp.status_code in (401, 403)


def test_analytics_summary_with_token_returns_shape():
    token = create_access_token({"sub": "user@example.com", "tid": "demo"})
    resp = client.get("/api/analytics/summary", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert set(data.keys()) == {"tenant", "total_claims", "total_cost"}
    assert data["tenant"] == "demo"

