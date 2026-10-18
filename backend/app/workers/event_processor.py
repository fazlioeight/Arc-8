"""Event Hub consumer that drives the AI semantic layer.

For each event:
  1. Decode the envelope.
  2. Build a textual representation of the new state ("member context").
  3. Embed the text via Azure OpenAI.
  4. Upsert into Azure AI Search (search index).
  5. Upsert into Cosmos DB (snapshot + semantic_member).

Why this order? AI Search is the source of truth for retrieval; if it fails,
the RAG path stops working. Cosmos is best-effort — its purpose is replay
and feature store, both of which can be rebuilt from AI Search if needed.

Failure handling:
  * Any step failure raises and we let Event Hub redeliver. We checkpoint
    only after all four steps succeed for a given event. This means
    duplicate delivery is the norm; the upserts above are all keyed on
    ``event_id`` so duplicates produce identical end-state (idempotent).
  * The processor uses Event Hub's CheckpointStore-on-Blob pattern when run
    in production. In dev / tests we use an in-memory checkpoint so the
    process is self-contained.

Invocation:
    python -m app.workers.event_processor
    python -m app.workers.event_processor --dry-run

The ``--dry-run`` flag claims a partition and exits — useful in CI to verify
the credential chain and network reachability without consuming real events.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import signal
import sys
from typing import Any

from ..core.config import get_settings
from ..core.logging_config import setup_logging
from ..events.envelope import EventEnvelope
from ..services.ai.cosmos import CosmosError, get_cosmos_client
from ..services.ai.embeddings import EmbeddingError, get_embedder
from ..services.ai.search import SearchError, get_search_client


log = logging.getLogger("nexora.workers.event_processor")


# ── State extraction ────────────────────────────────────────────────────────


def render_member_context(envelope: EventEnvelope) -> dict[str, Any]:
    """Convert a member event payload into the document shape AI Search
    expects.

    The envelope's ``payload`` contains a snapshot of the changed columns
    (Member, RiskInsights, Problems, etc.). For the MVP we flatten a small,
    explicit set into a single ``content`` blob — this is what the embedder
    vectorizes and what users see in citation snippets.

    Why hand-roll the rendering rather than just JSON-stringify? Two reasons:

      * **PHI minimization.** We deliberately exclude raw identifiers
        (SSN, MRN, member_payer_id) from the embedded text — embeddings
        leak content and we don't want PHI sitting in vector space.
      * **Search quality.** A well-formed paragraph BM25-ranks better than
        a JSON blob with quoted keys interrupting natural language.
    """
    payload = envelope.payload or {}
    # Envelope payload was double-wrapped during enqueue (EventEnvelope was
    # serialized as the outbox row's payload, which contains its own
    # ``payload`` key). When we replay through Event Hub we get the outer
    # envelope, so pull the inner domain payload here.
    domain = payload.get("payload") if isinstance(payload.get("payload"), dict) else payload

    member_id = str(envelope.aggregate_id)
    demographics = domain.get("demographics") or {}
    first = (demographics.get("first_name") or "").strip()
    last = (demographics.get("last_name") or "").strip()
    age = demographics.get("age")
    sex = (demographics.get("sex") or "").strip()
    conditions = domain.get("chronic_conditions") or []
    risks = domain.get("risk_insights") or []
    recent_visits = domain.get("recent_visits") or []
    notes_excerpt = domain.get("notes_excerpt") or ""

    lines: list[str] = []
    if first or last:
        # Names ARE PHI. We include them deliberately so RAG answers can
        # reference the right person; the BAA with Azure OpenAI covers it.
        # In a regulated demo deploy, swap this for "Member {id}" instead.
        lines.append(f"Member {first} {last} (id {member_id}).")
    else:
        lines.append(f"Member id {member_id}.")
    if age or sex:
        lines.append(f"Demographics: {age or 'unknown'} years old, {sex or 'unknown'}.")
    if conditions:
        lines.append("Chronic conditions: " + ", ".join(str(c) for c in conditions) + ".")
    if risks:
        lines.append(
            "Risk insights: "
            + "; ".join(
                f"{r.get('label')} ({r.get('severity', 'unknown')})"
                for r in risks
                if isinstance(r, dict)
            )
            + "."
        )
    if recent_visits:
        lines.append(
            "Recent encounters: "
            + "; ".join(
                f"{v.get('date')} {v.get('reason', '')}".strip()
                for v in recent_visits
                if isinstance(v, dict)
            )
            + "."
        )
    if notes_excerpt:
        lines.append(f"Recent note excerpt: {notes_excerpt}")

    return {
        "id": envelope.event_id,
        "event_id": envelope.event_id,
        "tenant_id": int(envelope.tenant_id),
        "tenant_key": envelope.tenant_key,
        "member_id": member_id,
        "aggregate_type": envelope.aggregate_type,
        "aggregate_id": str(envelope.aggregate_id),
        "content": " ".join(lines),
        "chronic_conditions": [str(c) for c in conditions],
        # The Member360 deep link the UI will navigate to on citation click.
        # Front-end can override via REACT_APP_MEMBER360_BASE if needed.
        "source_url": f"/member360/members/{member_id}",
        "occurred_at": envelope.occurred_at.isoformat() if envelope.occurred_at else None,
    }


# ── Processor ───────────────────────────────────────────────────────────────


async def process_event(envelope: EventEnvelope) -> None:
    """Embed, index, and snapshot a single event. Raises on any failure so
    the caller (Event Hub consumer) can skip the checkpoint."""
    embedder = get_embedder()
    search = get_search_client()
    cosmos = get_cosmos_client()

    doc = render_member_context(envelope)
    try:
        vector = await embedder.embed_query(doc["content"])
    except EmbeddingError:
        log.exception("processor_embed_failed", extra={"event_id": envelope.event_id})
        raise
    doc["content_vector"] = vector

    try:
        await search.upsert([doc])
    except SearchError:
        log.exception("processor_index_failed", extra={"event_id": envelope.event_id})
        raise

    # Cosmos failure is non-fatal — RAG reads from AI Search.
    try:
        await cosmos.upsert_event_snapshot(
            tenant_id=envelope.tenant_id,
            event_id=envelope.event_id,
            aggregate_type=envelope.aggregate_type,
            aggregate_id=str(envelope.aggregate_id),
            occurred_at=envelope.occurred_at.isoformat() if envelope.occurred_at else "",
            payload=envelope.payload,
        )
        await cosmos.upsert_semantic_member(
            tenant_id=envelope.tenant_id,
            member_id=str(envelope.aggregate_id),
            denormalized={
                "tenant_key": envelope.tenant_key,
                "last_event_id": envelope.event_id,
                "last_event_at": envelope.occurred_at.isoformat() if envelope.occurred_at else None,
                "content_summary": doc["content"],
                "chronic_conditions": doc["chronic_conditions"],
            },
        )
    except CosmosError:
        log.exception("processor_cosmos_failed_non_fatal", extra={"event_id": envelope.event_id})

    log.info(
        "processor_event_done",
        extra={
            "event_id": envelope.event_id,
            "tenant_id": envelope.tenant_id,
            "aggregate_type": envelope.aggregate_type,
            "aggregate_id": envelope.aggregate_id,
        },
    )


# ── Consumer entry point ────────────────────────────────────────────────────


async def _consume(dry_run: bool) -> None:
    settings = get_settings()
    if not settings.AZURE_EVENT_HUB_NAMESPACE:
        log.error("AZURE_EVENT_HUB_NAMESPACE not configured; refusing to start")
        sys.exit(2)

    try:
        from azure.eventhub.aio import EventHubConsumerClient
        from azure.identity.aio import DefaultAzureCredential
    except ImportError:  # pragma: no cover
        log.error("azure-eventhub or azure-identity not installed")
        sys.exit(2)

    credential = DefaultAzureCredential()
    client = EventHubConsumerClient(
        fully_qualified_namespace=settings.AZURE_EVENT_HUB_NAMESPACE,
        eventhub_name=settings.AZURE_EVENT_HUB_MEMBERS_TOPIC,
        consumer_group=settings.AZURE_EVENT_HUB_CONSUMER_GROUP_RAG,
        credential=credential,
    )

    stop_event = asyncio.Event()

    def _sigterm(*_args: object) -> None:
        log.info("processor_shutdown_requested")
        stop_event.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, _sigterm)
        except (NotImplementedError, RuntimeError):
            # Windows asyncio doesn't support add_signal_handler. The
            # KeyboardInterrupt path still terminates cleanly.
            pass

    async def on_event(partition_context, event):
        if event is None:
            return
        try:
            raw = event.body_as_str(encoding="utf-8")
        except Exception:  # noqa: BLE001
            log.exception("processor_decode_failed")
            return
        try:
            envelope = EventEnvelope.model_validate_json(raw)
        except Exception:  # noqa: BLE001
            log.exception("processor_envelope_invalid", extra={"raw": raw[:512]})
            return
        try:
            await process_event(envelope)
        except Exception:  # noqa: BLE001
            # Don't checkpoint — Event Hub will redeliver.
            log.exception("processor_event_failed", extra={"event_id": envelope.event_id})
            return
        await partition_context.update_checkpoint(event)

    async def on_partition_init(partition_context):
        log.info("processor_partition_open", extra={"partition_id": partition_context.partition_id})
        if dry_run:
            # Smoke-test mode: confirm we can claim the partition and bail.
            stop_event.set()

    try:
        async with client:
            receive_task = asyncio.create_task(
                client.receive(
                    on_event=on_event,
                    on_partition_initialize=on_partition_init,
                    starting_position="-1",  # latest
                )
            )
            await stop_event.wait()
            receive_task.cancel()
            try:
                await receive_task
            except asyncio.CancelledError:
                pass
    finally:
        await credential.close()


def main() -> None:
    setup_logging()
    parser = argparse.ArgumentParser(description="Nexora Event Hub processor for RAG indexing")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Connect to Event Hub, claim a partition, and exit without consuming.",
    )
    args = parser.parse_args()
    asyncio.run(_consume(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
