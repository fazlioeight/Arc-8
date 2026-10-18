"""Azure AI Search client and index management.

Two responsibilities:

  1. **Index lifecycle.** ``ensure_member_index()`` creates the ``idx-members-v1``
     index if missing. It's idempotent and safe to run on every deploy — Azure
     AI Search treats ``CreateOrUpdate`` as upsert. The schema is defined in
     code (not portal) so PR review captures every breaking change.

  2. **Hybrid query.** ``hybrid_search()`` runs BM25 over the text fields and
     k-NN over the vector field in a single request, fused by RRF (reciprocal
     rank fusion). This is the cheapest way to get robust retrieval for the
     RAG MVP — pure-vector misses keyword-heavy queries ("HCC code 19"), pure
     BM25 misses paraphrase ("diabetes" vs "T2DM").

All operations carry the ``tenant_id`` as a hard filter on every search to
prevent cross-tenant leakage even if the index ever ends up with mixed-tenant
documents (e.g. during a backfill bug). This is defense-in-depth — the event
processor should never write across tenants — but cheap to enforce.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from ...core.config import get_settings


log = logging.getLogger("nexora.ai.search")


class SearchError(RuntimeError):
    """Raised on AI Search failures. Routes translate this to 503."""


# The index schema is hoisted to module level so tests can assert on it
# without instantiating an SDK client.
def build_member_index_schema(index_name: str, vector_dim: int) -> dict[str, Any]:
    """Member-search index. Fields:

    Filterable / tenant scoping:
      ``tenant_id``       — *every* query MUST filter on this.
      ``member_id``       — exact-match lookups for "show me this member".
      ``aggregate_type``  — supports future multi-aggregate share of this index.

    Searchable (BM25):
      ``content``        — the chunked text the embedder vectorized; users see
                          this in citations.
      ``chronic_conditions`` — collection of strings (HCC labels) for
                          keyword filtering.

    Retrievable but not searched:
      ``source_url``     — deep-link the UI uses to navigate the citation back
                          to Member360.
      ``occurred_at``    — when the underlying event happened, for ranking
                          recency.

    Vector:
      ``content_vector`` — HNSW algorithm, cosine similarity, dimension
                          matches the Azure OpenAI deployment.
    """
    return {
        "name": index_name,
        "fields": [
            {"name": "id", "type": "Edm.String", "key": True, "filterable": True},
            {"name": "event_id", "type": "Edm.String", "filterable": True},
            {"name": "tenant_id", "type": "Edm.Int64", "filterable": True},
            {"name": "tenant_key", "type": "Edm.String", "filterable": True},
            {"name": "member_id", "type": "Edm.String", "filterable": True},
            {"name": "aggregate_type", "type": "Edm.String", "filterable": True},
            {"name": "aggregate_id", "type": "Edm.String", "filterable": True},
            {"name": "content", "type": "Edm.String", "searchable": True, "analyzer": "en.microsoft"},
            {
                "name": "chronic_conditions",
                "type": "Collection(Edm.String)",
                "searchable": True,
                "filterable": True,
            },
            {"name": "source_url", "type": "Edm.String", "retrievable": True},
            {"name": "occurred_at", "type": "Edm.DateTimeOffset", "filterable": True, "sortable": True},
            {
                "name": "content_vector",
                "type": "Collection(Edm.Single)",
                "searchable": True,
                "dimensions": vector_dim,
                "vectorSearchProfile": "hnsw-cosine",
            },
        ],
        "vectorSearch": {
            "algorithms": [
                {
                    "name": "hnsw-cosine",
                    "kind": "hnsw",
                    "hnswParameters": {"m": 4, "efConstruction": 400, "metric": "cosine"},
                }
            ],
            "profiles": [
                {"name": "hnsw-cosine", "algorithm": "hnsw-cosine"},
            ],
        },
        "semantic": {
            "configurations": [
                {
                    "name": "members-semantic-config",
                    "prioritizedFields": {
                        "contentFields": [{"fieldName": "content"}],
                        "keywordsFields": [{"fieldName": "chronic_conditions"}],
                    },
                }
            ]
        },
    }


class AzureSearchClient:
    """Wrapper over ``azure.search.documents.aio.SearchClient`` +
    ``SearchIndexClient`` (for index management). Operates against a single
    index — instantiate one client per index you need to touch.
    """

    def __init__(self, index_name: Optional[str] = None) -> None:
        settings = get_settings()
        endpoint = settings.AZURE_SEARCH_ENDPOINT
        if not endpoint:
            raise SearchError(
                "AZURE_SEARCH_ENDPOINT is not configured. Set it in Bicep output."
            )
        try:
            from azure.core.credentials_async import AsyncTokenCredential  # noqa: F401
            from azure.identity.aio import DefaultAzureCredential
            from azure.search.documents.aio import SearchClient
            from azure.search.documents.indexes.aio import SearchIndexClient
        except ImportError as exc:  # pragma: no cover
            raise SearchError(
                "azure-search-documents must be installed (`pip install azure-search-documents>=11.5.0`)."
            ) from exc

        self._endpoint = endpoint
        self._credential = DefaultAzureCredential()
        self._index_name = index_name or settings.AZURE_SEARCH_MEMBERS_INDEX
        self._client = SearchClient(
            endpoint=endpoint,
            index_name=self._index_name,
            credential=self._credential,
        )
        self._index_client = SearchIndexClient(endpoint=endpoint, credential=self._credential)

    @property
    def index_name(self) -> str:
        return self._index_name

    async def ensure_member_index(self) -> None:
        """Create-or-update the members index. Idempotent — safe on every boot.

        Index creation on Azure AI Search is a control-plane operation that
        takes 10-30 seconds; calling this on every container start would be
        wasteful. Production callers should invoke from a one-shot Bicep
        deployment script or a manual ops job instead. We expose it on the
        client for tests + local dev.
        """
        settings = get_settings()
        schema = build_member_index_schema(self._index_name, settings.AZURE_OPENAI_EMBEDDING_DIMENSIONS)
        # The SDK's `create_or_update_index` wants a typed `SearchIndex`
        # object, but the typed builder is verbose. The REST endpoint accepts
        # the raw dict via ``send_request``, which is closer to the schema
        # definition above and easier to keep in sync with Bicep / portal.
        try:
            from azure.core.rest import HttpRequest

            request = HttpRequest(
                method="PUT",
                url=f"{self._endpoint}/indexes/{self._index_name}?api-version=2024-07-01",
                json=schema,
            )
            response = await self._index_client._client.send_request(request)  # type: ignore[attr-defined]
            if response.status_code >= 400:
                raise SearchError(
                    f"Index upsert failed ({response.status_code}): {response.text()}"
                )
        except Exception as exc:  # noqa: BLE001
            raise SearchError(f"Failed to ensure index {self._index_name}: {exc}") from exc

    async def upsert(self, documents: list[dict[str, Any]]) -> None:
        """Idempotent upsert. ``documents`` must each include ``id`` and the
        full payload — partial updates are *not* supported because the vector
        field has to stay in sync with ``content``.
        """
        if not documents:
            return
        try:
            result = await self._client.merge_or_upload_documents(documents=documents)
        except Exception as exc:  # noqa: BLE001
            raise SearchError(f"AI Search upload failed: {exc}") from exc
        failed = [r for r in result if not r.succeeded]
        if failed:
            raise SearchError(
                f"AI Search upload partial failure: {len(failed)}/{len(documents)} rejected; "
                f"first error: {failed[0].error_message}"
            )

    async def hybrid_search(
        self,
        *,
        query: str,
        query_vector: list[float],
        tenant_id: int,
        top_k: int,
        member_id: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """Run BM25 + k-NN in a single request, with RRF fusion.

        ``tenant_id`` is a hard filter — if a caller forgets it, the OData
        filter expression below is malformed and the request fails closed.
        """
        # Build OData filter. Tenant is mandatory; member is optional narrowing.
        filters = [f"tenant_id eq {int(tenant_id)}"]
        if member_id:
            # Strings need single-quote escaping for OData; member_id should
            # be alphanumeric in practice but be defensive.
            safe = str(member_id).replace("'", "''")
            filters.append(f"member_id eq '{safe}'")
        odata_filter = " and ".join(filters)

        try:
            from azure.search.documents.models import VectorizedQuery

            vector_query = VectorizedQuery(
                vector=query_vector,
                k_nearest_neighbors=top_k,
                fields="content_vector",
            )
            results = await self._client.search(
                search_text=query,
                vector_queries=[vector_query],
                filter=odata_filter,
                top=top_k,
                select=[
                    "id",
                    "event_id",
                    "tenant_id",
                    "tenant_key",
                    "member_id",
                    "aggregate_type",
                    "aggregate_id",
                    "content",
                    "source_url",
                    "occurred_at",
                ],
                query_type="semantic",
                semantic_configuration_name="members-semantic-config",
                query_caption="extractive",
            )
            docs: list[dict[str, Any]] = []
            async for hit in results:
                # The SDK returns SearchItemPaged; each ``hit`` is a dict-like
                # with ``@search.score`` and any retrievable fields. Copy into
                # a plain dict so callers don't depend on the SDK type.
                docs.append({k: v for k, v in hit.items() if not k.startswith("@search.")})
            return docs
        except Exception as exc:  # noqa: BLE001
            raise SearchError(f"AI Search hybrid query failed: {exc}") from exc

    async def close(self) -> None:
        try:
            await self._client.close()
            await self._index_client.close()
            await self._credential.close()
        except Exception:
            pass


_INSTANCES: dict[str, AzureSearchClient] = {}


def get_search_client(index_name: Optional[str] = None) -> AzureSearchClient:
    """Return a process-level singleton per index. The SDK pools connections
    so creating one per request would burn TLS handshakes on every search."""
    settings = get_settings()
    name = index_name or settings.AZURE_SEARCH_MEMBERS_INDEX
    if name not in _INSTANCES:
        _INSTANCES[name] = AzureSearchClient(index_name=name)
    return _INSTANCES[name]


def reset_search_clients() -> None:
    """Drop cached clients — for tests that mutate settings."""
    _INSTANCES.clear()
