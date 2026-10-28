"""Pydantic schemas for the chat export endpoint.

Separated from the chat route file so OpenAPI consumers (and any future
frontend codegen) can import these without dragging in the route's runtime
dependencies (anthropic client, file handlers, etc).
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


# Chart images are sent as full data URLs (``data:image/png;base64,iVBOR...``).
# We accept either the prefixed form or a bare base64 string — the export
# service tolerates both. Limit per image is 4 MB after base64 decode
# (Chart.js exports are typically 30-80 KB at 280×600 px, so this is generous).
class ChatExportMessage(BaseModel):
    """One message in the conversation to be exported.

    ``timestamp`` is optional because the existing client doesn't persist one
    — we'll fall back to the export's generation time so the doc still has a
    sensible header.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    role: Literal["user", "assistant", "system"]
    content: str = Field(..., min_length=0, max_length=200_000)
    timestamp: Optional[str] = Field(default=None, max_length=64)
    model: Optional[str] = Field(default=None, max_length=64)
    file: Optional[str] = Field(
        default=None,
        max_length=256,
        description="Optional filename the user attached for this turn.",
    )


class ChatExportRequest(BaseModel):
    """Body of ``POST /api/chat/export``.

    ``charts`` maps a chart-block id to a base64-encoded PNG produced by
    ``canvas.toDataURL('image/png')`` on the rendered Chart.js instance.
    The ids are computed deterministically as ``chart-{message_index}-{chart_index}``
    matching the order chart blocks appear in the assistant's markdown.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    format: Literal["docx", "pdf", "pptx"] = Field(
        ...,
        description=(
            "Output container. ``docx`` and ``pdf`` share a flat-document "
            "rendering; ``pptx`` uses a deck-shaped layout where charts and "
            "tables get their own slides."
        ),
    )
    title: Optional[str] = Field(
        default=None,
        max_length=200,
        description="Optional document title. Defaults to 'Arc-8 Chat Transcript'.",
    )
    messages: list[ChatExportMessage] = Field(
        ...,
        min_length=1,
        max_length=200,
        description="The conversation, in display order.",
    )
    charts: dict[str, str] = Field(
        default_factory=dict,
        description=(
            "Optional map of chart_id -> data URL (or bare base64 PNG). Missing "
            "entries fall back to a textual placeholder so an export never fails "
            "because the client forgot to capture a chart."
        ),
    )
    include_user_messages: bool = Field(
        default=True,
        description="Set false to export only assistant replies.",
    )


class ChatExportError(BaseModel):
    code: Literal["empty_conversation", "invalid_chart", "render_failed", "rate_limited"]
    message: str
