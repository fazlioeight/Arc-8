import pytest

from app.core.config import settings
from app.services import email as email_module

pytestmark = pytest.mark.anyio("asyncio")


class _FakeResponse:
    def __init__(self, status_code: int, text: str = "") -> None:
        self.status_code = status_code
        self.text = text


class _FakeAsyncClient:
    """Stand-in for httpx.AsyncClient that records the last POST."""

    status_code = 202
    captured: dict = {}

    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, json=None, headers=None):
        _FakeAsyncClient.captured = {"url": url, "json": json, "headers": headers}
        return _FakeResponse(_FakeAsyncClient.status_code)


async def test_send_email_uses_sendgrid(monkeypatch):
    monkeypatch.setattr(settings, "SENDGRID_API_KEY", "SG.test-key")
    monkeypatch.setattr(settings, "EMAIL_FROM", "no-reply@nexoralab.co")
    _FakeAsyncClient.status_code = 202
    monkeypatch.setattr(email_module.httpx, "AsyncClient", _FakeAsyncClient)

    sent = await email_module.send_email(
        to="contact@nexoralab.co",
        subject="Demo request",
        body="Body text",
        reply_to="jane@example.com",
    )

    assert sent is True
    cap = _FakeAsyncClient.captured
    assert cap["url"] == email_module.SENDGRID_API_URL
    assert cap["headers"]["Authorization"] == "Bearer SG.test-key"
    assert cap["json"]["from"] == {"email": "no-reply@nexoralab.co"}
    assert cap["json"]["personalizations"][0]["to"] == [{"email": "contact@nexoralab.co"}]
    assert cap["json"]["reply_to"] == {"email": "jane@example.com"}
    assert cap["json"]["subject"] == "Demo request"
    assert cap["json"]["content"][0]["value"] == "Body text"


async def test_send_email_sendgrid_failure_raises(monkeypatch):
    monkeypatch.setattr(settings, "SENDGRID_API_KEY", "SG.test-key")
    monkeypatch.setattr(settings, "EMAIL_FROM", "no-reply@nexoralab.co")
    _FakeAsyncClient.status_code = 403
    monkeypatch.setattr(email_module.httpx, "AsyncClient", _FakeAsyncClient)

    with pytest.raises(email_module.EmailSendError):
        await email_module.send_email(to="x@y.com", subject="s", body="b")
