"""Versioned event envelope shared by the outbox, Event Hub, and processors.

The envelope is the only contract between event producers and consumers — once
it's published, schema changes are additive only (new optional fields), and a
breaking change requires bumping ``schema_version`` and the topic name (the
``.v1`` suffix on ``AZURE_EVENT_HUB_MEMBERS_TOPIC`` is intentional).

CloudEvents 1.0 was the inspiration for the field names so downstream tools
(Azure Functions trigger bindings, Azure Logic Apps connectors) work without
a translation layer. We don't claim *full* CloudEvents compliance — we don't
emit the spec headers when publishing to Event Hub, just the JSON body.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


AggregateType = Literal[
    "member",
    "claim",
    "encounter",
    "provider",
    "document",
    "workflow_instance",
    "audit_event",
]

EventType = Literal[
    # Lifecycle. Use ``upserted`` when a single SQL statement performs an
    # insert-or-update so consumers don't need to disambiguate.
    "created",
    "updated",
    "upserted",
    "deleted",
    # Domain-specific transitions can be added here as we grow. Keep the set
    # small — high-cardinality event types make consumer routing brittle.
    "transitioned",
]


class EventEnvelope(BaseModel):
    """JSON shape written to ``event_outbox.payload`` and Event Hub.

    Required by every consumer:
      - ``event_id``       — uuid4, used for idempotency
      - ``tenant_id``      — Nexora tenant integer id (NOT Entra tenant)
      - ``tenant_key``     — slug, useful for log filtering
      - ``aggregate_type`` — see ``AggregateType``
      - ``aggregate_id``   — string-safe id (we cast ints to str on emit so
                             different aggregate types can share the index)
      - ``event_type``     — see ``EventType``
      - ``occurred_at``    — UTC ISO 8601
      - ``schema_version`` — bumped only on breaking field changes
      - ``payload``        — opaque domain dict; consumers validate per-type

    Optional:
      - ``causation_id``   — event id that caused this one (for sagas)
      - ``correlation_id`` — request id, ties events back to the HTTP call
      - ``actor``          — who triggered the change (email or "system")
    """

    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    schema_version: int = 1
    tenant_id: int
    tenant_key: str
    aggregate_type: AggregateType
    aggregate_id: str
    event_type: EventType
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    payload: dict[str, Any] = Field(default_factory=dict)
    correlation_id: str | None = None
    causation_id: str | None = None
    actor: str | None = None

    def partition_key(self) -> str:
        """Stable Event Hub partition key so all events for a given aggregate
        land on the same partition (preserves order). Tenant prefix prevents
        cross-tenant collisions on numeric ids."""
        return f"{self.tenant_id}:{self.aggregate_type}:{self.aggregate_id}"
