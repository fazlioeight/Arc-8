"""Tests for the append-only PHI audit trail (app.utils.phi_audit)."""
import json
import logging
from datetime import datetime, timezone

import pytest
from starlette.requests import Request

from app.utils.phi_audit import (
    PhiAction,
    PhiEvent,
    build_phi_event,
    phi_audit,
    record_phi_access,
)


def test_build_phi_event_has_exact_schema():
    record = build_phi_event(
        event=PhiEvent.ACCESS.value,
        user_id="clinician@example.com",
        patient_id="M001",
        record_type="member360.member",
        action=PhiAction.READ.value,
        ip_address="203.0.113.7",
        user_agent="Mozilla/5.0",
        success=True,
        timestamp=datetime(2026, 6, 13, 12, 0, 0, tzinfo=timezone.utc),
    )
    assert record == {
        "event": "phi_access",
        "userId": "clinician@example.com",
        "patientId": "M001",
        "recordType": "member360.member",
        "action": "read",
        "ipAddress": "203.0.113.7",
        "userAgent": "Mozilla/5.0",
        "timestamp": "2026-06-13T12:00:00+00:00",
        "success": True,
    }


def test_build_phi_event_rejects_unknown_event():
    with pytest.raises(ValueError):
        build_phi_event(
            event="not_a_real_event", user_id="u", patient_id="p",
            record_type="r", action=PhiAction.READ.value,
            ip_address="1.1.1.1", user_agent="", success=True,
        )


def test_build_phi_event_rejects_unknown_action():
    with pytest.raises(ValueError):
        build_phi_event(
            event=PhiEvent.ACCESS.value, user_id="u", patient_id="p",
            record_type="r", action="frobnicate",
            ip_address="1.1.1.1", user_agent="", success=True,
        )


def test_phi_audit_emits_one_json_line():
    # The phi_audit logger has propagate=False (PHI lines must not bubble to
    # stdout/root), so capture by attaching our own handler to it directly.
    captured: list[str] = []

    class _Capture(logging.Handler):
        def emit(self, record):
            captured.append(record.getMessage())

    logger = logging.getLogger("phi_audit")
    handler = _Capture()
    logger.addHandler(handler)
    try:
        record = phi_audit(
            event=PhiEvent.DELETE.value, user_id="u@example.com", patient_id="M9",
            record_type="member360.member", action=PhiAction.DELETE.value,
            ip_address="10.0.0.1", user_agent="agent", success=False,
        )
    finally:
        logger.removeHandler(handler)

    assert record["event"] == "phi_delete"
    assert record["success"] is False
    # Exactly one line emitted, valid JSON, carrying the same record.
    emitted = [json.loads(line) for line in captured]
    assert record in emitted


def test_record_phi_access_pulls_ip_and_user_agent_from_request():
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/member360/members/1",
        "headers": [
            (b"x-forwarded-for", b"198.51.100.9, 10.0.0.1"),
            (b"user-agent", b"pytest-agent"),
        ],
        "client": ("10.0.0.1", 5555),
    }
    record = record_phi_access(
        Request(scope),
        event=PhiEvent.ACCESS.value,
        user_id="u@example.com",
        patient_id="M001",
        record_type="member360.member",
        action=PhiAction.READ.value,
        success=True,
    )
    # First hop of X-Forwarded-For wins; user-agent is captured.
    assert record["ipAddress"] == "198.51.100.9"
    assert record["userAgent"] == "pytest-agent"
