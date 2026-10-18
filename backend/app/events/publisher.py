"""Event Hub publisher with outbox drain loop.

The publisher runs as a background asyncio task inside the API container (one
replica per tenant connection is fine — Event Hub's ``send_batch`` is
thread-safe and the SQL ``FOR UPDATE SKIP LOCKED`` ensures different replicas
don't double-emit). It is intentionally simple:

  1. Poll the outbox every ``EVENT_OUTBOX_POLL_INTERVAL_SECONDS``.
  2. Claim up to ``EVENT_OUTBOX_BATCH_SIZE`` unpublished rows with FOR UPDATE
     SKIP LOCKED.
  3. Send them to Event Hub in a single batched call.
  4. UPDATE ``published_at = NOW()`` on success, in the same transaction.

Failure modes:

  * **Event Hub unavailable** — we log and back off. The outbox grows; on next
    successful publish, all pending rows go out in order.
  * **Single row's payload too big** — Event Hub message limit is 1 MB. If the
    batch's serialized size exceeds the limit, the SDK raises. We split the
    batch in half and retry; the row that's individually too large gets
    ``last_error`` set and ``attempts += 1`` so ops can inspect.
  * **Partial batch success** — the SDK is all-or-nothing per ``send_batch``
    call, so we don't have to track per-row outcomes.

Out of scope for MVP: dead-letter queue, exponential backoff with jitter,
publishing to multiple topics per aggregate type (we send everything to the
members topic for now; downstream consumers filter by ``aggregate_type``).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..db.tenant_manager import TenantContext, tenant_connection_manager
from .envelope import EventEnvelope
from .outbox import EventOutbox

if TYPE_CHECKING:
    from azure.eventhub.aio import EventHubProducerClient


log = logging.getLogger("nexora.events.publisher")


class PublisherError(RuntimeError):
    """Raised on unrecoverable publish failures."""


class EventHubPublisher:
    """Owns a single ``EventHubProducerClient`` (one per topic).

    The client is lazily constructed because at import time the Azure SDK
    isn't always installed (test environments) and because the credential
    chain validation hits the network.
    """

    def __init__(self, topic: Optional[str] = None) -> None:
        settings = get_settings()
        if not settings.AZURE_EVENT_HUB_NAMESPACE:
            raise PublisherError(
                "AZURE_EVENT_HUB_NAMESPACE is not configured. Set it in Bicep output."
            )
        self._namespace = settings.AZURE_EVENT_HUB_NAMESPACE
        self._topic = topic or settings.AZURE_EVENT_HUB_MEMBERS_TOPIC
        self._client: Optional["EventHubProducerClient"] = None
        self._credential = None
        self._lock = asyncio.Lock()

    async def _ensure_client(self) -> "EventHubProducerClient":
        if self._client is not None:
            return self._client
        async with self._lock:
            if self._client is not None:  # double-check under lock
                return self._client
            try:
                from azure.eventhub.aio import EventHubProducerClient
                from azure.identity.aio import DefaultAzureCredential
            except ImportError as exc:  # pragma: no cover
                raise PublisherError(
                    "azure-eventhub must be installed (`pip install azure-eventhub>=5.13.0`)."
                ) from exc
            self._credential = DefaultAzureCredential()
            self._client = EventHubProducerClient(
                fully_qualified_namespace=self._namespace,
                eventhub_name=self._topic,
                credential=self._credential,
            )
            return self._client

    async def send(self, envelopes: list[EventEnvelope]) -> None:
        """Send a batch. Splits in half on size errors so a single oversized
        message can't poison a whole batch.
        """
        if not envelopes:
            return
        client = await self._ensure_client()
        try:
            from azure.eventhub import EventData
            from azure.eventhub.exceptions import EventDataSendError
        except ImportError as exc:  # pragma: no cover
            raise PublisherError(f"azure-eventhub import failed: {exc}") from exc

        # Group by partition key so order is preserved per aggregate.
        by_partition: dict[str, list[EventEnvelope]] = {}
        for env in envelopes:
            by_partition.setdefault(env.partition_key(), []).append(env)

        for partition_key, group in by_partition.items():
            await self._send_group(client, EventData, EventDataSendError, partition_key, group)

    async def _send_group(self, client, EventData, EventDataSendError, partition_key, group):
        try:
            batch = await client.create_batch(partition_key=partition_key)
            for env in group:
                event = EventData(env.model_dump_json())
                event.content_type = "application/json; charset=utf-8"
                event.properties = {
                    "schema_version": env.schema_version,
                    "event_type": env.event_type,
                    "aggregate_type": env.aggregate_type,
                    "tenant_id": env.tenant_id,
                }
                # Returns False if the event won't fit; in that case we send
                # the current batch and start a new one.
                if not batch.try_add(event):
                    await client.send_batch(batch)
                    batch = await client.create_batch(partition_key=partition_key)
                    batch.try_add(event)
            await client.send_batch(batch)
        except EventDataSendError:
            # Split-and-retry. Single-row batches that still fail get
            # surfaced; the publisher loop will mark them with last_error.
            if len(group) == 1:
                raise
            mid = len(group) // 2
            await self._send_group(client, EventData, EventDataSendError, partition_key, group[:mid])
            await self._send_group(client, EventData, EventDataSendError, partition_key, group[mid:])

    async def close(self) -> None:
        if self._client is not None:
            try:
                await self._client.close()
            except Exception:
                pass
        if self._credential is not None:
            try:
                await self._credential.close()
            except Exception:
                pass


# ── Outbox drain loop ────────────────────────────────────────────────────────


async def _claim_batch(session: AsyncSession, batch_size: int) -> list[EventOutbox]:
    """Lock and return up to ``batch_size`` unpublished rows.

    ``FOR UPDATE SKIP LOCKED`` lets concurrent publishers run side-by-side
    without serializing on the same row. SQLite (used in tests) doesn't
    support ``SKIP LOCKED``; the select still works without it, which is fine
    because tests are single-threaded.
    """
    stmt = (
        select(EventOutbox)
        .where(EventOutbox.published_at.is_(None))
        .order_by(EventOutbox.id)
        .limit(batch_size)
    )
    dialect = session.bind.dialect.name if session.bind else ""
    if dialect == "postgresql":
        stmt = stmt.with_for_update(skip_locked=True)
    return (await session.execute(stmt)).scalars().all()


async def _mark_published(session: AsyncSession, event_ids: list[str]) -> None:
    if not event_ids:
        return
    now = datetime.now(timezone.utc)
    await session.execute(
        update(EventOutbox)
        .where(EventOutbox.event_id.in_(event_ids))
        .values(published_at=now)
    )


async def _drain_tenant_once(
    tenant: TenantContext,
    publisher: EventHubPublisher,
    batch_size: int,
) -> int:
    """Drain a single tenant's outbox once. Returns rows published."""
    async with tenant_connection_manager.get_session(tenant) as session:
        rows = await _claim_batch(session, batch_size)
        if not rows:
            return 0
        envelopes: list[EventEnvelope] = []
        for r in rows:
            # The full envelope was serialized into payload at enqueue time
            # — rehydrate so the partition key calculation has all the fields.
            try:
                envelopes.append(EventEnvelope.model_validate(r.payload))
            except Exception as exc:  # noqa: BLE001
                log.error(
                    "outbox_payload_invalid",
                    extra={"event_id": r.event_id, "error": str(exc)},
                )
                r.last_error = f"envelope_invalid: {exc}"[:1024]
                r.attempts += 1
                continue
        if not envelopes:
            await session.commit()
            return 0
        try:
            await publisher.send(envelopes)
        except Exception as exc:  # noqa: BLE001
            # Don't commit — leave rows unpublished for the next pass.
            log.exception("outbox_publish_failed", extra={"error": str(exc), "count": len(envelopes)})
            for r in rows:
                r.last_error = str(exc)[:1024]
                r.attempts += 1
            await session.commit()
            return 0
        await _mark_published(session, [e.event_id for e in envelopes])
        await session.commit()
        return len(envelopes)


async def run_outbox_drain_loop(
    tenants: list[TenantContext],
    *,
    publisher: Optional[EventHubPublisher] = None,
    stop_event: Optional[asyncio.Event] = None,
) -> None:
    """Long-running drain loop. Call from app startup as a fire-and-forget task.

    ``tenants`` is the list of tenants this replica is responsible for. For
    the MVP we pass *all* tenants on every replica; the FOR UPDATE SKIP
    LOCKED in ``_claim_batch`` ensures no double-publishing. When we have
    hundreds of tenants this becomes a bottleneck and we should shard by
    consistent hashing on tenant_id.
    """
    settings = get_settings()
    publisher = publisher or EventHubPublisher()
    stop = stop_event or asyncio.Event()
    interval = settings.EVENT_OUTBOX_POLL_INTERVAL_SECONDS
    batch_size = settings.EVENT_OUTBOX_BATCH_SIZE

    log.info(
        "outbox_drain_loop_started",
        extra={"tenants": [t.key for t in tenants], "interval": interval, "batch_size": batch_size},
    )
    try:
        while not stop.is_set():
            total = 0
            for tenant in tenants:
                try:
                    total += await _drain_tenant_once(tenant, publisher, batch_size)
                except Exception as exc:  # noqa: BLE001
                    log.exception(
                        "outbox_drain_tenant_failed",
                        extra={"tenant_key": tenant.key, "error": str(exc)},
                    )
            # If we did real work, immediately loop — likely more pending.
            # If empty, sleep so we don't beat on the DB.
            try:
                if total == 0:
                    await asyncio.wait_for(stop.wait(), timeout=interval)
            except asyncio.TimeoutError:
                pass
    finally:
        await publisher.close()
        log.info("outbox_drain_loop_stopped")
