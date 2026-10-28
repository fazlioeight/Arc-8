"""RAG orchestration: hybrid search → prompt assembly → Anthropic chat.

This is the only place in the codebase that knows the full RAG choreography.
Routes call ``answer_question`` and get back ``RagAnswer`` — they don't see
the SDK clients.

Design notes:

  * **Embeddings via Azure OpenAI, chat via Anthropic.** Per the architecture
    decision on 2026-05-19, Azure OpenAI provides embeddings (and only
    embeddings) so the AI Search index stays consistent with a single
    vectorization story; Anthropic continues to provide chat because the
    existing integration is mature and Claude Sonnet 4.6 performs well on
    healthcare summarization.

  * **Citations are inline.** We instruct the model to emit citations as
    ``[1]``, ``[2]``, ... matching the order of retrieved chunks. The
    frontend parses these and renders them as clickable chips back to
    Member360. We could ask the model to emit JSON citations instead, but
    that increases hallucination risk on the structured output — inline
    references are robust.

  * **Tenant scoping is non-negotiable.** Every search carries ``tenant_id``
    as a hard filter; even if the LLM is somehow induced to ask for "all
    members", the retrieval layer returns only the caller's tenant.

  * **No streaming for MVP.** Streaming requires more careful citation
    parsing on the client (chunks arrive before brackets are closed). We
    can add it in week 5 once the panel UX is settled.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from ...core.config import get_settings
from ..chat import client as chat_client
from .embeddings import EmbeddingError, get_embedder
from .search import SearchError, get_search_client


log = logging.getLogger("nexora.ai.retrieval")


class RetrievalError(RuntimeError):
    """Raised on retrieval failures. Routes translate this to 503."""


@dataclass(frozen=True)
class Citation:
    """One source the LLM cited. Renders as a chip in the frontend."""

    index: int            # 1-based — matches the bracketed marker in the answer text
    source_id: str        # event_id from AI Search
    aggregate_type: str   # e.g. "member"
    aggregate_id: str     # e.g. "12345"
    url: str              # deep link the UI navigates to on click
    snippet: str          # short excerpt for the chip's tooltip


@dataclass(frozen=True)
class RagAnswer:
    answer: str
    citations: list[Citation]
    # Whether we actually had context to ground on. ``False`` means the
    # answer is from model parametric knowledge — the route should warn
    # the user that no source records were found.
    grounded: bool


# ── Prompt assembly ─────────────────────────────────────────────────────────


_SYSTEM_PROMPT = """You are Arc-8, an AI assistant embedded in a healthcare analytics platform.
You answer clinicians' and care managers' questions about specific members and claims using ONLY the context blocks provided below.

Rules:
- If the answer is not in the provided context, say so plainly. Do NOT guess.
- Cite every factual claim with a bracketed marker like [1], [2] referring to the numbered context blocks. Multiple citations are fine: [1][3].
- Keep responses concise and clinically appropriate. Do not invent medications, ICD/HCC codes, or dates.
- Never reveal another tenant's data; if the context is empty, treat the question as un-answerable from your provided sources.
"""


def _build_user_prompt(question: str, contexts: list[dict]) -> str:
    """Assemble the user-turn content with numbered context blocks."""
    if not contexts:
        return (
            f"Question: {question}\n\n"
            "Context: (no relevant records were found in this tenant's data — "
            "tell the user there are no matching sources and suggest a refined question)."
        )
    blocks: list[str] = []
    for i, ctx in enumerate(contexts, start=1):
        blocks.append(
            f"[{i}] (member {ctx.get('member_id', '?')}, "
            f"occurred {ctx.get('occurred_at', 'unknown date')})\n"
            f"{ctx.get('content', '').strip()}"
        )
    return f"Question: {question}\n\nContext:\n\n" + "\n\n".join(blocks)


# ── Orchestration ───────────────────────────────────────────────────────────


async def answer_question(
    *,
    question: str,
    tenant_id: int,
    member_id: Optional[str] = None,
    top_k: Optional[int] = None,
) -> RagAnswer:
    """End-to-end RAG: embed → hybrid search → compose prompt → chat → parse citations.

    ``member_id`` narrows retrieval to a specific member's records (useful
    when the AI Assistant panel is opened inside Member360). Without it,
    retrieval scans the tenant's whole index.
    """
    settings = get_settings()
    if not question or not question.strip():
        raise RetrievalError("Question is empty")
    if len(question) > settings.AI_ASK_MAX_QUESTION_CHARS:
        raise RetrievalError(
            f"Question exceeds max length ({settings.AI_ASK_MAX_QUESTION_CHARS} chars)"
        )

    # Surface an unconfigured environment as a clean 503 (RetrievalError → 503)
    # instead of a raw client-construction 500, so the panel can show a tidy
    # "not available yet" message rather than a stack-trace detail.
    if not (settings.AZURE_SEARCH_ENDPOINT and settings.AZURE_OPENAI_ENDPOINT):
        raise RetrievalError(
            "The AI assistant isn't configured in this environment yet "
            "(Azure AI Search and Azure OpenAI must be provisioned first)."
        )

    k = top_k or settings.AZURE_SEARCH_DEFAULT_TOP_K
    k = min(k, settings.AI_ASK_MAX_CONTEXT_CHUNKS)

    embedder = get_embedder()
    search = get_search_client()
    try:
        query_vector = await embedder.embed_query(question)
    except EmbeddingError as exc:
        raise RetrievalError(f"Embedding the question failed: {exc}") from exc

    try:
        contexts = await search.hybrid_search(
            query=question,
            query_vector=query_vector,
            tenant_id=tenant_id,
            top_k=k,
            member_id=member_id,
        )
    except SearchError as exc:
        raise RetrievalError(f"Hybrid search failed: {exc}") from exc

    anthropic = chat_client.get_client()
    if anthropic is None:
        raise RetrievalError(
            "Anthropic client is not configured. Set ANTHROPIC_API_KEY in Key Vault."
        )

    user_prompt = _build_user_prompt(question, contexts)
    try:
        response = await anthropic.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=2_048,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
    except Exception as exc:  # noqa: BLE001
        raise RetrievalError(f"Anthropic chat call failed: {exc}") from exc

    # Anthropic returns content blocks; join text-typed blocks.
    answer_text = ""
    for block in getattr(response, "content", []) or []:
        if getattr(block, "type", None) == "text":
            answer_text += getattr(block, "text", "")
    answer_text = answer_text.strip()

    citations = _attach_citations(answer_text, contexts)
    return RagAnswer(
        answer=answer_text,
        citations=citations,
        grounded=bool(contexts),
    )


def _attach_citations(answer: str, contexts: list[dict]) -> list[Citation]:
    """Return one Citation per context block actually referenced by the model.

    We don't strip the markers from the answer text — the frontend uses them
    as anchor points when rendering the chip overlay.
    """
    import re

    referenced: set[int] = set()
    for match in re.finditer(r"\[(\d+)\]", answer or ""):
        try:
            referenced.add(int(match.group(1)))
        except ValueError:
            continue

    out: list[Citation] = []
    for i, ctx in enumerate(contexts, start=1):
        if i not in referenced:
            continue
        snippet = (ctx.get("content") or "").strip()
        if len(snippet) > 240:
            snippet = snippet[:240].rstrip() + "…"
        out.append(
            Citation(
                index=i,
                source_id=str(ctx.get("event_id") or ctx.get("id") or ""),
                aggregate_type=str(ctx.get("aggregate_type") or "member"),
                aggregate_id=str(ctx.get("aggregate_id") or ctx.get("member_id") or ""),
                url=str(ctx.get("source_url") or ""),
                snippet=snippet,
            )
        )
    return out
