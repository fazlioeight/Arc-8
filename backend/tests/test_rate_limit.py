"""Tests for app.middleware.rate_limit.

Rate limiting is disabled suite-wide in conftest; these tests re-enable it on
the shared settings singleton and reset the in-memory buckets so they run
deterministically (no Redis configured in the test env).
"""
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.middleware import rate_limit as rl

pytestmark = pytest.mark.anyio("asyncio")


@pytest.fixture
def limiter_on(monkeypatch):
    monkeypatch.setattr(rl.settings, "RATE_LIMIT_ENABLED", True)
    rl._MEMORY_BUCKETS.clear()
    yield
    rl._MEMORY_BUCKETS.clear()


def _request(ip: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/login",
            "headers": [(b"x-forwarded-for", ip.encode())],
            "client": (ip, 1234),
        }
    )


async def test_check_rate_limit_blocks_after_limit(limiter_on):
    for _ in range(5):
        allowed, _ = await rl.check_rate_limit("authtest", "1.2.3.4", 5, 60)
        assert allowed
    allowed, retry_after = await rl.check_rate_limit("authtest", "1.2.3.4", 5, 60)
    assert not allowed
    assert retry_after >= 1


async def test_check_rate_limit_is_per_identifier(limiter_on):
    for _ in range(5):
        await rl.check_rate_limit("authtest", "10.0.0.1", 5, 60)
    # A different IP has its own budget.
    allowed, _ = await rl.check_rate_limit("authtest", "10.0.0.2", 5, 60)
    assert allowed


async def test_disabled_limiter_never_blocks(monkeypatch):
    monkeypatch.setattr(rl.settings, "RATE_LIMIT_ENABLED", False)
    rl._MEMORY_BUCKETS.clear()
    for _ in range(50):
        allowed, _ = await rl.check_rate_limit("authtest", "9.9.9.9", 5, 60)
        assert allowed


async def test_auth_rate_limit_dependency_raises_429_with_retry_after(limiter_on, monkeypatch):
    monkeypatch.setattr(rl.settings, "AUTH_RATE_LIMIT_PER_MINUTE", 5)
    req = _request("5.5.5.5")
    for _ in range(5):
        assert await rl.auth_rate_limit(req) is None
    with pytest.raises(HTTPException) as exc:
        await rl.auth_rate_limit(req)
    assert exc.value.status_code == 429
    assert "Retry-After" in exc.value.headers
    assert int(exc.value.headers["Retry-After"]) >= 1
