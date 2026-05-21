"""Azure OpenAI embedding client.

Used by the event processor (batch embedding of member snapshots) and by the
retriever (query-time embedding of the user question). The client is a
process-level singleton — DefaultAzureCredential caches its tokens and the
underlying HTTP client pools connections, so creating one per call would burn
a lot of TLS handshakes for nothing.

Operational notes:

  * The Azure OpenAI endpoint is fronted by a **private endpoint** in
    production. Egress goes via the Container App's outbound subnet; the
    public endpoint is disabled by Bicep.
  * Tokens-per-minute (TPM) is the bottleneck in practice, not requests.
    ``embed_batch`` enforces ``AZURE_OPENAI_EMBEDDING_TPM_BUDGET`` via a
    leaky-bucket sleeper so a backfill job can't starve live ingestion.
  * Empty inputs are silently filtered — the API returns 400 on a blank
    string, which would otherwise abort an entire batch.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Iterable, Optional

from ...core.config import get_settings


log = logging.getLogger("nexora.ai.embeddings")


class EmbeddingError(RuntimeError):
    """Raised on embedding failures. Routes translate this to 503 so callers
    know the retrieval path is degraded but the system is otherwise healthy."""


class AzureOpenAIEmbedder:
    """Thin wrapper around ``openai.AsyncAzureOpenAI`` for embeddings.

    Auth: ``DefaultAzureCredential`` exchanged for a bearer token against the
    Cognitive Services audience. No API key is ever read from config — the
    Container App's managed identity is the *only* path to the endpoint, and
    that's enforced by the Bicep role assignment.
    """

    def __init__(self) -> None:
        settings = get_settings()
        if not settings.AZURE_OPENAI_ENDPOINT:
            raise EmbeddingError(
                "AZURE_OPENAI_ENDPOINT is not configured. Set it in Bicep "
                "output and inject via Container App env var."
            )
        try:
            from azure.identity.aio import DefaultAzureCredential, get_bearer_token_provider
            from openai import AsyncAzureOpenAI
        except ImportError as exc:  # pragma: no cover
            raise EmbeddingError(
                "azure-identity and openai must be installed. Add `openai>=1.43` "
                "and ensure `azure-identity` is present in requirements.txt."
            ) from exc

        self._credential = DefaultAzureCredential()
        # get_bearer_token_provider returns a callable that yields a fresh
        # token, transparently refreshing before expiry. The OpenAI SDK calls
        # it on every request, so we don't need our own caching.
        self._token_provider = get_bearer_token_provider(
            self._credential, "https://cognitiveservices.azure.com/.default"
        )
        self._client = AsyncAzureOpenAI(
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
            api_version=settings.AZURE_OPENAI_API_VERSION,
            azure_ad_token_provider=self._token_provider,
        )
        self._deployment = settings.AZURE_OPENAI_EMBEDDING_DEPLOYMENT
        self._dimensions = settings.AZURE_OPENAI_EMBEDDING_DIMENSIONS
        self._tpm_budget = settings.AZURE_OPENAI_EMBEDDING_TPM_BUDGET

        # Leaky-bucket state for TPM enforcement. Reset every 60s.
        self._window_start = time.monotonic()
        self._tokens_in_window = 0
        self._lock = asyncio.Lock()

    @property
    def dimensions(self) -> int:
        return self._dimensions

    async def _throttle(self, estimated_tokens: int) -> None:
        """Block until ``estimated_tokens`` fits inside the current TPM budget.

        Called once per ``embed_batch`` invocation. We over-estimate by using
        the input character count / 3 as a tokens proxy — embedding models
        roughly hit 3-4 chars/token on English text, so this is a safe upper
        bound that ensures we never accidentally exceed the deployment quota.
        """
        async with self._lock:
            now = time.monotonic()
            if now - self._window_start >= 60:
                self._window_start = now
                self._tokens_in_window = 0
            if self._tokens_in_window + estimated_tokens > self._tpm_budget:
                wait = max(0.0, 60 - (now - self._window_start))
                log.info(
                    "embedding_throttled",
                    extra={
                        "wait_seconds": wait,
                        "tokens_in_window": self._tokens_in_window,
                        "estimated_tokens": estimated_tokens,
                    },
                )
                await asyncio.sleep(wait)
                self._window_start = time.monotonic()
                self._tokens_in_window = 0
            self._tokens_in_window += estimated_tokens

    async def embed_batch(self, texts: Iterable[str]) -> list[list[float]]:
        """Embed up to ~16 inputs at a time (the Azure OpenAI batch limit for
        ``text-embedding-3-large``).

        Returns one vector per input in the same order. Empty / whitespace-
        only inputs yield a zero-vector so callers can keep their indexing
        loop in lockstep without filtering.
        """
        items: list[str] = [t for t in texts]
        non_empty: list[tuple[int, str]] = [
            (i, t) for i, t in enumerate(items) if t and t.strip()
        ]
        if not non_empty:
            return [[0.0] * self._dimensions for _ in items]

        estimated_tokens = sum(len(t) // 3 + 1 for _, t in non_empty)
        await self._throttle(estimated_tokens)

        try:
            response = await self._client.embeddings.create(
                model=self._deployment,
                input=[t for _, t in non_empty],
                dimensions=self._dimensions,
            )
        except Exception as exc:  # noqa: BLE001
            raise EmbeddingError(f"Azure OpenAI embeddings request failed: {exc}") from exc

        out: list[Optional[list[float]]] = [None] * len(items)
        for (orig_idx, _), embedding in zip(non_empty, response.data):
            out[orig_idx] = list(embedding.embedding)
        # Fill empties with zero-vectors.
        return [v if v is not None else [0.0] * self._dimensions for v in out]

    async def embed_query(self, text: str) -> list[float]:
        """Convenience for single-query embeddings (the retriever's hot path)."""
        vectors = await self.embed_batch([text])
        return vectors[0]

    async def close(self) -> None:
        """Release SDK clients. Tests call this between scenarios."""
        try:
            await self._client.close()
            await self._credential.close()
        except Exception:
            pass


_INSTANCE: AzureOpenAIEmbedder | None = None


def get_embedder() -> AzureOpenAIEmbedder:
    """Return the process-level singleton. Cached because the underlying HTTP
    client pools connections and DefaultAzureCredential caches its tokens —
    a per-call construction would burn dozens of TLS handshakes per second
    on a busy event processor."""
    global _INSTANCE
    if _INSTANCE is None:
        _INSTANCE = AzureOpenAIEmbedder()
    return _INSTANCE


def reset_embedder() -> None:
    """Drop the cached embedder. For tests that mutate settings."""
    global _INSTANCE
    _INSTANCE = None
