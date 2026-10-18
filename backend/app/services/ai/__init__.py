"""AI semantic layer clients and orchestration.

Four building blocks:

  * ``embeddings`` — Azure OpenAI client, used by the event processor to
    vectorize chunks and by the retriever when the caller passes a free-text
    query (we embed the question once and reuse it for both BM25 and vector
    components of the hybrid search).
  * ``search``     — Azure AI Search client: index management + hybrid query.
  * ``cosmos``     — Cosmos DB client for event snapshots and feature store.
  * ``retrieval``  — High-level RAG orchestration: hybrid search → context
    assembly → Anthropic chat completion → answer + citations.

All four authenticate via ``DefaultAzureCredential``. Imports of the Azure
SDKs happen lazily inside class ``__init__`` so the module is importable in
test environments that don't have the SDKs installed.
"""
