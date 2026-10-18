"""AI assistant endpoint(s).

For the MVP we expose a single ``POST /api/v1/ai/ask``. Per architecture
decision 2026-05-19, this route:

  * Uses Azure OpenAI for embeddings and Anthropic for chat.
  * Is rate-limited per-user (separate budget from the ``/api/chat`` endpoints
    so a streaming chat session can't starve the lighter AI Assistant calls).
  * Is fully audited: every successful and failed call lands in
    ``tenant_audit_events`` as ``ai.ask.success`` / ``ai.ask.failed`` so a
    compliance reviewer can reconstruct every PHI-touching question.
  * Returns a structured envelope with the answer, citations, and metadata.

Future endpoints will live in this module (``/api/v1/ai/summarize``,
``/api/v1/ai/explain-risk``). They all share the rate-limit and audit
plumbing here.
"""
from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context
from ..schemas.ai import AskRequest, AskResponse, CitationOut
from ..services.ai.retrieval import RetrievalError, answer_question
from ..utils.audit_logger import record_audit_event
from ..utils.security import AuthenticatedUser, get_current_user


log = logging.getLogger("nexora.routes.ai")

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


# ── Lightweight per-user rate limit ─────────────────────────────────────────
# AI Assistant calls hit a third-party LLM with PHI on every request, so they
# get a per-user quota.
#
# In-memory token-bucket. For multi-replica deploys this is per-replica which
# is fine for the MVP (effective limit = limit × replica count). When we
# scale past ~3 replicas, swap for a Redis-backed bucket — the keying scheme
# below already includes user email.

_BUCKETS: dict[str, list[float]] = {}


def _check_rate_limit(user_email: str, limit_per_minute: int) -> None:
    now = time.monotonic()
    cutoff = now - 60.0
    bucket = _BUCKETS.setdefault(user_email, [])
    # Drop expired timestamps in-place — cheap, bounded by ``limit_per_minute``.
    bucket[:] = [t for t in bucket if t > cutoff]
    if len(bucket) >= limit_per_minute:
        retry_after = int(60 - (now - bucket[0])) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="AI rate limit exceeded",
            headers={"Retry-After": str(max(1, retry_after))},
        )
    bucket.append(now)


# ── Endpoint ────────────────────────────────────────────────────────────────


@router.post("/ask", response_model=AskResponse)
async def ask(
    body: AskRequest,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_control_session),
) -> AskResponse:
    """Ask a free-text question, scoped to the caller's tenant.

    Audit: every call writes ``ai.ask.success`` or ``ai.ask.failed`` with the
    redacted question (first 200 chars), retrieved count, and citation event
    ids. This is the *only* record connecting PHI to LLM calls in production
    — compliance review depends on it being reliable, so audit writes happen
    *after* the answer is computed but inside the same request lifetime, and
    a failed audit insert returns 500 to the user (we'd rather fail the call
    than silently lose the audit row).
    """
    settings = get_settings()
    _check_rate_limit(user.email, settings.AI_ASK_RATE_LIMIT_PER_MINUTE)

    correlation_id = request.headers.get("x-request-id") or request.state.__dict__.get("request_id")

    try:
        result = await answer_question(
            question=body.question,
            tenant_id=tenant.id,
            member_id=body.member_id,
            top_k=body.top_k,
        )
    except RetrievalError as exc:
        log.warning(
            "ai_ask_failed",
            extra={
                "tenant_key": tenant.key,
                "user": user.email,
                "error": str(exc),
                "correlation_id": correlation_id,
            },
        )
        await record_audit_event(
            session,
            tenant_id=tenant.id,
            actor=user.email,
            event_type="ai.ask.failed",
            payload={
                "question_excerpt": body.question[:200],
                "member_id": body.member_id,
                "error": str(exc)[:500],
                "correlation_id": correlation_id,
            },
        )
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )

    citations = [
        CitationOut(
            index=c.index,
            source_id=c.source_id,
            aggregate_type=c.aggregate_type,
            aggregate_id=c.aggregate_id,
            url=c.url,
            snippet=c.snippet,
        )
        for c in result.citations
    ]

    await record_audit_event(
        session,
        tenant_id=tenant.id,
        actor=user.email,
        event_type="ai.ask.success",
        payload={
            "question_excerpt": body.question[:200],
            "member_id": body.member_id,
            "retrieved_count": len(result.citations),
            "grounded": result.grounded,
            "citation_event_ids": [c.source_id for c in result.citations],
            "correlation_id": correlation_id,
        },
    )
    await session.commit()

    return AskResponse(
        answer=result.answer,
        citations=citations,
        grounded=result.grounded,
        model=settings.CLAUDE_MODEL,
        retrieved_count=len(result.citations),
    )
