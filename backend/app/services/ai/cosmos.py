"""Cosmos DB client for event snapshots and the semantic store.

Two containers in scope for the RAG MVP:

  * ``event_snapshots``  — one document per event, partitioned by ``/tenant_id``.
                          Acts as the durable replay log so a future consumer
                          can rebuild an AI Search index from scratch without
                          replaying Event Hub (which has a 7-day retention).
  * ``semantic_member``  — one document per member, partitioned by
                          ``/tenant_id``. Holds the denormalized "current
                          state" view that powers inline AI insights.

Auth: ``DefaultAzureCredential`` via the data-plane RBAC roles
``Cosmos DB Built-in Data Contributor`` (writer) and ``Data Reader`` (reader).
The Bicep module wires these to the Container App's managed identity. Master
keys are never read from config.

We use ``upsert_item`` rather than separate create/replace so the processor's
idempotency story is "submit the same event_id twice, get the same document
twice" — no error handling for `409 Conflict` in the hot path.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from ...core.config import get_settings


log = logging.getLogger("nexora.ai.cosmos")


class CosmosError(RuntimeError):
    """Raised on Cosmos failures. Indexing degrades, RAG still works (it
    reads from AI Search, not Cosmos), so routes log + continue."""


class CosmosClient:
    """Wrapper over ``azure.cosmos.aio.CosmosClient`` for the two MVP containers.

    Database and containers are *not* created by this class — Bicep does that
    with the right partition keys and indexing policies. If the database is
    missing at boot, that's a deploy ordering bug and we want to fail loud.
    """

    def __init__(self) -> None:
        settings = get_settings()
        if not settings.AZURE_COSMOS_ENDPOINT:
            raise CosmosError(
                "AZURE_COSMOS_ENDPOINT is not configured. Set it in Bicep output."
            )
        try:
            from azure.cosmos.aio import CosmosClient as _SdkCosmosClient
            from azure.identity.aio import DefaultAzureCredential
        except ImportError as exc:  # pragma: no cover
            raise CosmosError(
                "azure-cosmos and azure-identity must be installed "
                "(`pip install azure-cosmos>=4.7.0`)."
            ) from exc

        self._credential = DefaultAzureCredential()
        self._client = _SdkCosmosClient(
            url=settings.AZURE_COSMOS_ENDPOINT,
            credential=self._credential,
        )
        self._db = self._client.get_database_client(settings.AZURE_COSMOS_DATABASE)
        self._snapshots = self._db.get_container_client(settings.AZURE_COSMOS_SNAPSHOTS_CONTAINER)
        self._semantic_member = self._db.get_container_client(
            settings.AZURE_COSMOS_SEMANTIC_MEMBER_CONTAINER
        )

    async def upsert_event_snapshot(
        self,
        *,
        tenant_id: int,
        event_id: str,
        aggregate_type: str,
        aggregate_id: str,
        occurred_at: str,
        payload: dict[str, Any],
    ) -> None:
        """Idempotent insert. ``id`` is the event_id so a replay overwrites
        the same document. ``/tenant_id`` is the partition key."""
        doc = {
            "id": event_id,
            "tenant_id": tenant_id,
            "aggregate_type": aggregate_type,
            "aggregate_id": aggregate_id,
            "occurred_at": occurred_at,
            "payload": payload,
        }
        try:
            await self._snapshots.upsert_item(doc)
        except Exception as exc:  # noqa: BLE001
            raise CosmosError(f"event_snapshots upsert failed: {exc}") from exc

    async def upsert_semantic_member(
        self,
        *,
        tenant_id: int,
        member_id: str,
        denormalized: dict[str, Any],
    ) -> None:
        """Replace the member's current-state document. Composite id keeps
        different aggregate types in the same container collision-free."""
        doc = {
            "id": f"member:{member_id}",
            "tenant_id": tenant_id,
            "member_id": member_id,
            **denormalized,
        }
        try:
            await self._semantic_member.upsert_item(doc)
        except Exception as exc:  # noqa: BLE001
            raise CosmosError(f"semantic_member upsert failed: {exc}") from exc

    async def get_semantic_member(self, *, tenant_id: int, member_id: str) -> Optional[dict[str, Any]]:
        try:
            return await self._semantic_member.read_item(
                item=f"member:{member_id}",
                partition_key=tenant_id,
            )
        except Exception as exc:  # noqa: BLE001
            # CosmosResourceNotFoundError is the expected miss path. Avoid a
            # hard SDK import to keep this module testable without azure-cosmos.
            if exc.__class__.__name__ == "CosmosResourceNotFoundError":
                return None
            raise CosmosError(f"semantic_member read failed: {exc}") from exc

    async def close(self) -> None:
        try:
            await self._client.close()
            await self._credential.close()
        except Exception:
            pass


_INSTANCE: CosmosClient | None = None


def get_cosmos_client() -> CosmosClient:
    """Process-level singleton. SDK pools HTTP connections internally."""
    global _INSTANCE
    if _INSTANCE is None:
        _INSTANCE = CosmosClient()
    return _INSTANCE


def reset_cosmos_client() -> None:
    """Drop the cached client — for tests."""
    global _INSTANCE
    _INSTANCE = None
