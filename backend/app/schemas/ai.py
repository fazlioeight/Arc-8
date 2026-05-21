"""Pydantic schemas for the AI assistant endpoints.

Kept separate from the service layer so the OpenAPI spec stays clean and the
frontend can codegen against this module without pulling in SDK dependencies.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    """Body of ``POST /api/v1/ai/ask``.

    ``member_id`` is optional — if supplied, retrieval is scoped to that
    member (used when the AI Assistant panel is opened inside a Member360
    workspace). Without it, retrieval spans the tenant.
    """

    question: str = Field(..., min_length=1, max_length=2_000, description="The user's question.")
    member_id: Optional[str] = Field(
        default=None,
        max_length=64,
        description="Optional: narrow retrieval to a specific member.",
    )
    top_k: Optional[int] = Field(
        default=None,
        ge=1,
        le=20,
        description="Override default top-k for retrieval.",
    )


class CitationOut(BaseModel):
    index: int
    source_id: str
    aggregate_type: str
    aggregate_id: str
    url: str
    snippet: str


class AskResponse(BaseModel):
    answer: str
    citations: list[CitationOut]
    grounded: bool = Field(
        ...,
        description=(
            "True if the answer was composed from retrieved context. "
            "False means the index returned no hits for this question and "
            "the answer should be treated as un-grounded."
        ),
    )
    # Echo back the model and retrieval params so audit / debugging tooling
    # can correlate without re-deriving from logs.
    model: str
    retrieved_count: int


class AskError(BaseModel):
    code: Literal["empty_question", "rate_limited", "retrieval_failed", "llm_failed"]
    message: str
    request_id: Optional[str] = None
