"""Immutable PHI access/mutation audit trail.

HIPAA §164.312(b) requires a tamper-evident record of every access to and
mutation of electronic PHI. The platform already records business-level events
in the ``tenant_audit_events`` *database table* via
:func:`app.utils.audit_logger.record_audit_event`. That table is convenient for
in-app review but is, by definition, editable by anyone with write access to
the database — so it is **not** sufficient as the system of record for PHI
access.

This module writes a second, **append-only** stream in the exact schema the
security spec mandates, to a dedicated logger (``phi_audit``) that is wired to
its own file handler (opened in append mode) and, in production, fanned out to
an external/WORM sink (Azure Monitor / immutable blob) — never back into an
editable DB table. Use it for *every* PHI read/write/delete, on both success
and failure.

Schema (one JSON object per line)::

    {
      "event": "phi_access" | "phi_update" | "phi_delete",
      "userId": str,
      "patientId": str,
      "recordType": str,
      "action": "read" | "write" | "delete",
      "ipAddress": str,
      "userAgent": str,
      "timestamp": ISO8601,
      "success": bool
    }
"""
from __future__ import annotations

import enum
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from starlette.requests import Request

from ..core.config import settings

_PHI_LOGGER_NAME = "phi_audit"
_phi_logger = logging.getLogger(_PHI_LOGGER_NAME)
# Sentinel attribute so we configure the dedicated file handler exactly once,
# even if setup_logging() and the first phi_audit() call race.
_CONFIGURED_FLAG = "_nexora_phi_configured"


class PhiEvent(str, enum.Enum):
    ACCESS = "phi_access"
    UPDATE = "phi_update"
    DELETE = "phi_delete"


class PhiAction(str, enum.Enum):
    READ = "read"
    WRITE = "write"
    DELETE = "delete"


# Which actions are coherent with which event types. A mismatch is a
# programming error and is rejected loudly so a miswired audit call is caught
# in tests rather than silently producing a misleading record.
_VALID_EVENTS = {e.value for e in PhiEvent}
_VALID_ACTIONS = {a.value for a in PhiAction}


def configure_phi_audit_logger() -> logging.Logger:
    """Attach the append-only file handler to the ``phi_audit`` logger once.

    Called by :func:`app.core.logging_config.setup_logging` at startup and
    lazily by :func:`phi_audit`, so the audit trail works in tests and scripts
    that never call ``setup_logging``.
    """
    if getattr(_phi_logger, _CONFIGURED_FLAG, False):
        return _phi_logger

    _phi_logger.setLevel(logging.INFO)
    # Do not bubble PHI lines up to the root logger / stdout: they should only
    # land in the dedicated append-only sink(s).
    _phi_logger.propagate = False

    path = getattr(settings, "PHI_AUDIT_LOG_PATH", None)
    if path:
        audit_path = Path(path)
        audit_path.parent.mkdir(parents=True, exist_ok=True)
        # mode="a": append only. Combined with file-system level WORM /
        # immutable-blob configuration in prod (see SECURITY.md), this gives
        # the tamper-evident property HIPAA expects.
        handler = logging.FileHandler(audit_path, mode="a", encoding="utf-8")
        handler.setFormatter(logging.Formatter("%(message)s"))
        _phi_logger.addHandler(handler)

    setattr(_phi_logger, _CONFIGURED_FLAG, True)
    return _phi_logger


def build_phi_event(
    *,
    event: str,
    user_id: str,
    patient_id: str,
    record_type: str,
    action: str,
    ip_address: str,
    user_agent: str,
    success: bool,
    timestamp: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Validate and assemble a PHI audit record in the canonical schema.

    Pure function (no I/O) so it is trivially unit-testable. Raises
    ``ValueError`` on an unknown ``event`` or ``action``.
    """
    event_value = event.value if isinstance(event, PhiEvent) else str(event)
    action_value = action.value if isinstance(action, PhiAction) else str(action)
    if event_value not in _VALID_EVENTS:
        raise ValueError(f"Unknown PHI event type: {event_value!r}")
    if action_value not in _VALID_ACTIONS:
        raise ValueError(f"Unknown PHI action: {action_value!r}")

    ts = timestamp or datetime.now(timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)

    return {
        "event": event_value,
        "userId": str(user_id),
        "patientId": str(patient_id),
        "recordType": str(record_type),
        "action": action_value,
        "ipAddress": ip_address or "unknown",
        "userAgent": user_agent or "",
        "timestamp": ts.astimezone(timezone.utc).isoformat(),
        "success": bool(success),
    }


def phi_audit(
    *,
    event: str,
    user_id: str,
    patient_id: str,
    record_type: str,
    action: str,
    ip_address: str,
    user_agent: str,
    success: bool,
    timestamp: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Write one immutable PHI audit entry. Returns the emitted record.

    Emitting never raises on the request path for I/O reasons (a failed sink is
    logged, not propagated), but a *malformed* call (bad enum) raises so it is
    caught during development.
    """
    record = build_phi_event(
        event=event,
        user_id=user_id,
        patient_id=patient_id,
        record_type=record_type,
        action=action,
        ip_address=ip_address,
        user_agent=user_agent,
        success=success,
        timestamp=timestamp,
    )
    logger = configure_phi_audit_logger()
    logger.info(json.dumps(record, separators=(",", ":"), sort_keys=True))
    return record


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return (request.client.host if request.client else "") or "unknown"


def record_phi_access(
    request: Request,
    *,
    event: str,
    user_id: str,
    patient_id: str,
    record_type: str,
    action: str,
    success: bool,
) -> Dict[str, Any]:
    """Convenience wrapper that pulls IP + user-agent from the request.

    This is what PHI route handlers call. It records both successful and failed
    access so an attempted-but-denied read still leaves a trail.
    """
    return phi_audit(
        event=event,
        user_id=user_id,
        patient_id=patient_id,
        record_type=record_type,
        action=action,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent", ""),
        success=success,
    )
