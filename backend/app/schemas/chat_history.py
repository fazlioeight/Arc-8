"""Pydantic schemas for the chat history API.

Separate from ``chat_export`` and from the route-local schemas in chat.py so
the OpenAPI surface is well-organised and the frontend can codegen against
this module in isolation (no codegen pipeline yet — manual sync for now).
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── List + detail ──────────────────────────────────────────────────────────


class ConversationSummary(BaseModel):
    """Sidebar list shape — no message contents, just enough to render the
    list and pick one to open."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: Optional[str] = None
    model: Optional[str] = None
    message_count: int = 0
    created_at: datetime
    updated_at: datetime


class ChatHistoryMessageOut(BaseModel):
    """One message in a conversation's detail view."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    role: Literal["user", "assistant", "system"]
    content: str
    model: Optional[str] = None
    attached_file_name: Optional[str] = None
    workbook_id: Optional[str] = None
    created_at: datetime


class ConversationDetail(BaseModel):
    """Conversation header + all messages, ordered by ``created_at`` ASC."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: Optional[str] = None
    model: Optional[str] = None
    message_count: int = 0
    created_at: datetime
    updated_at: datetime
    messages: list[ChatHistoryMessageOut] = Field(default_factory=list)


class ConversationListResponse(BaseModel):
    conversations: list[ConversationSummary]


# ── Mutations ──────────────────────────────────────────────────────────────


class CreateConversationRequest(BaseModel):
    """Optional title at create-time. If omitted, the first user message
    will populate it on first append."""

    title: Optional[str] = Field(default=None, max_length=200)


class RenameConversationRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


class SendMessageRequest(BaseModel):
    """Body of ``POST /api/chat/conversations/{id}/messages``.

    The endpoint persists the user message, calls the LLM with the full
    conversation context, persists the assistant reply, and returns both
    rows. ``model`` lets the caller override the conversation's default
    model on a per-turn basis.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    content: str = Field(..., min_length=1, max_length=8_000)
    model: Optional[str] = Field(default=None, max_length=64)
    # Mirrors the existing ChatRequest fields so the same endpoint can be
    # used in workbook / dataset modes once we wire those through here.
    workbook_id: Optional[str] = Field(default=None, max_length=64)
    dataset: bool = Field(default=False)


class SendMessageResponse(BaseModel):
    """Both turns returned together so the frontend's sidebar list can
    rerender from a single response without a follow-up GET."""

    conversation: ConversationSummary
    user_message: ChatHistoryMessageOut
    assistant_message: ChatHistoryMessageOut
