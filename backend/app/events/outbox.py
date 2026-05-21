"""Transactional outbox primitives.

The outbox is the *only* path from Postgres to the event bus. Domain writes
that need to surface as events MUST insert into ``event_outbox`` in the same
transaction as the domain mutation, otherwise a crash between the SQL commit
and the Event Hub publish would silently drop events.

The publisher (``app.events.publisher``) drains the table by:
  1. selecting up to ``EVENT_OUTBOX_BATCH_SIZE`` rows where ``published_at IS NULL``
     ordered by ``id``, with ``FOR UPDATE SKIP LOCKED`` so multiple replicas
     don't double-publish;
  2. publishing the batch to Event Hub;
  3. updating ``published_at`` to ``NOW()`` on success.

The Postgres trigger in the matching Alembic migration forbids UPDATE/DELETE
on rows where ``published_at IS NOT NULL`` — once an event has been emitted
to Event Hub, the outbox row is immutable forensic evidence. Archival to a
separate ``event_outbox_archive`` table is the future cleanup mechanism;
for the MVP we accept unbounded growth and revisit when storage > 10 GB.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from ..models.tables import TenantDataBase
from .envelope import EventEnvelope


class EventOutbox(TenantDataBase):
    """Per-tenant outbox table.

    Lives in the tenant schema (alongside ``members``, ``claims``, ...) so it
    is captured by the same row-level isolation we apply elsewhere. The
    ``tenant_id`` column is denormalized into the envelope payload for
    downstream consumers — the row's physical schema is the source of truth.
    """

    __tablename__ = "event_outbox"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # The envelope's ``event_id`` is the deduplication key downstream. We
    # store it as a column (not just inside ``payload``) so the unique index
    # below can enforce at-least-once-but-don't-double-write semantics.
    event_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False, unique=True, index=True)
    aggregate_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    aggregate_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    # ``published_at`` is NULL until the publisher hands the row off to Event
    # Hub. The partial index below makes the publisher's "give me unpublished
    # rows" query a sub-millisecond seek even when the table has millions of
    # acknowledged rows.
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    correlation_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


# Partial index: only rows the publisher cares about. Postgres skips this
# index for already-published rows entirely, keeping it small.
Index(
    "ix_event_outbox_unpublished",
    EventOutbox.id,
    postgresql_where=text("published_at IS NULL"),
)


async def enqueue_event(session: AsyncSession, envelope: EventEnvelope) -> EventOutbox:
    """Insert ``envelope`` into the outbox within the caller's transaction.

    The caller MUST be operating against the tenant schema (i.e. the session
    returned by ``get_tenant_session``). We do not call ``session.commit()`` —
    that's the caller's job, so the domain write and the outbox row land
    atomically.

    Idempotency: the ``event_id`` column is unique. If the caller is retrying
    a write and supplies the same event_id, the second insert will surface as
    an ``IntegrityError`` — callers should swallow this only when the intent
    really was to be idempotent.
    """
    row = EventOutbox(
        event_id=envelope.event_id or str(uuid.uuid4()),
        aggregate_type=envelope.aggregate_type,
        aggregate_id=envelope.aggregate_id,
        event_type=envelope.event_type,
        schema_version=envelope.schema_version,
        # Pydantic's ``model_dump(mode="json")`` converts datetimes to ISO
        # strings, which is what we want for JSONB.
        payload=envelope.model_dump(mode="json"),
        occurred_at=envelope.occurred_at,
        correlation_id=envelope.correlation_id,
    )
    session.add(row)
    # ``flush`` populates the autoincrement id without committing; lets the
    # caller include the outbox row's id in logs.
    await session.flush()
    return row
