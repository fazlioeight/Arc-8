"""
Chat module routes: Claude conversations, file analysis, workbooks, and dataset queries.

All endpoints require an authenticated platform user (`get_current_user`). Workbook
and dataset data live in the tenant DB, so cross-tenant access is impossible by
construction — the session is bound to the caller's tenant.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import uuid
from typing import Any, AsyncIterator, Awaitable, Callable, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..db.tenant_manager import TenantContext, tenant_connection_manager
from ..dependencies.tenant import get_tenant_context, get_tenant_session
from ..services.chat import artifacts as artifacts_svc
from ..services.chat import dataset as dataset_svc
from ..services.chat import workbooks as workbooks_svc
from ..services.chat.client import ALLOWED_MODELS, get_client, max_tokens, resolve_model
from ..services.chat.file_handlers import (
    ALLOWED_EXTENSIONS,
    MAX_UPLOAD_BYTES,
    MB,
    delete_from_anthropic,
    extract_text_blocks,
    get_ext,
    prepare_upload,
    upload_to_anthropic,
)
from ..services.chat.prompts import DEFAULT_SYSTEM_PROMPT
from ..services.chat.export import (
    ExportError,
    ExportMessage,
    export_to_docx,
    export_to_pdf,
    export_to_pptx,
    theme_from_branding,
)
from ..models.tables import Tenant
from sqlalchemy import select as sa_select
from ..schemas.chat_export import ChatExportRequest
from ..schemas.chat_history import (
    ConversationDetail,
    ConversationListResponse,
    ConversationSummary,
    CreateConversationRequest,
    ChatHistoryMessageOut,
    RenameConversationRequest,
    SendMessageRequest,
    SendMessageResponse,
)
from ..schemas.chat_projects import (
    AddMemberRequest,
    AttachConversationRequest,
    CreateProjectRequest,
    ProjectDetail,
    ProjectListResponse,
    ProjectMemberOut,
    ProjectSummary,
    TenantUserListResponse,
    TenantUserOut,
    UpdateMemberRoleRequest,
    UpdateProjectRequest,
)
from ..services.chat import history as history_svc
from ..services.chat import projects as projects_svc
from ..models.tables import User
from ..utils.audit_logger import record_audit_event
from ..db.session import control_session, get_control_session
from ..utils.security import AuthenticatedUser, get_current_user


logger = logging.getLogger("nexora.chat")

router = APIRouter(prefix="/api/chat", tags=["chat"])


# ── Schemas ─────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, frozen=True)

    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    messages: List[ChatMessage] = Field(..., min_length=1, max_length=20)
    model: Optional[str] = Field(default=None, max_length=64)
    workbook_id: Optional[str] = Field(default=None, max_length=64)
    dataset: bool = Field(default=False)


class ChatResponse(BaseModel):
    reply: str
    model: str


# ── Helpers ─────────────────────────────────────────────────────────────────

def _check_client():
    if get_client() is None:
        raise HTTPException(status_code=503, detail="AI service is not configured.")


def _tenant_session_factory(tenant: TenantContext):
    """Return a callable that opens a fresh session for the tenant — for background tasks."""
    @contextlib.asynccontextmanager
    async def factory():
        async with tenant_connection_manager.get_session(tenant) as session:
            yield session
    return factory


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", None) or str(uuid.uuid4())


# ── Models endpoint ────────────────────────────────────────────────────────-

@router.get("/models")
async def list_chat_models(_: AuthenticatedUser = Depends(get_current_user)):
    return {
        "default": settings.CLAUDE_MODEL,
        "models": [{"id": k, "label": v["label"]} for k, v in ALLOWED_MODELS.items()],
    }


# ── Export ──────────────────────────────────────────────────────────────────
# POST /api/chat/export — render the current conversation as a Word doc (.docx)
# or PDF and stream it back as a binary attachment. The endpoint is stateless:
# the client owns the conversation, sends the messages, gets a file. This
# preserves the chat module's "no PHI persisted on the backend" property —
# we only hold the conversation in memory long enough to render.
#
# Rate-limited per-user (separate budget from chat itself: rendering a 50-msg
# conversation with embedded charts costs more than a single chat call).

_EXPORT_BUCKETS: dict[str, list[float]] = {}
_EXPORT_LIMIT_PER_MINUTE = 6  # generous for normal use, kills runaway scripts.


def _check_export_rate_limit(user_email: str) -> None:
    import time

    now = time.monotonic()
    cutoff = now - 60.0
    bucket = _EXPORT_BUCKETS.setdefault(user_email, [])
    bucket[:] = [t for t in bucket if t > cutoff]
    if len(bucket) >= _EXPORT_LIMIT_PER_MINUTE:
        retry_after = int(60 - (now - bucket[0])) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Export rate limit exceeded",
            headers={"Retry-After": str(max(1, retry_after))},
        )
    bucket.append(now)


_EXPORT_CONTENT_TYPES = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
_EXPORT_EXTENSIONS = {"docx": "docx", "pdf": "pdf", "pptx": "pptx"}


def _safe_filename_part(value: str) -> str:
    """Sanitize a user-supplied title into a filename-safe slug.

    Defense against: header injection (CRLF in Content-Disposition), path
    traversal (/, \\), and OS-illegal characters. Also caps length so the
    final filename stays well under common 255-byte filesystem limits.
    """
    if not value:
        return "nexora-chat-transcript"
    cleaned = "".join(c if c.isalnum() or c in {"-", "_"} else "-" for c in value.strip())
    cleaned = "-".join(filter(None, cleaned.split("-")))  # collapse repeats
    return (cleaned or "nexora-chat-transcript")[:64]


@router.post("/export")
async def export_conversation(
    request: Request,
    body: ChatExportRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> Response:
    """Render a chat conversation as a Word doc or PDF and return the file.

    Audit: every successful export is recorded as ``chat.export.success`` with
    the format, message count, and (truncated) title. Failures land as
    ``chat.export.failed`` — both writes go into ``tenant_audit_events`` so a
    compliance reviewer can reconstruct who took what data out of the system.
    """
    _check_export_rate_limit(current_user.email)
    rid = _request_id(request)

    if body.include_user_messages:
        msgs_in = list(body.messages)
    else:
        msgs_in = [m for m in body.messages if m.role != "user"]
    if not msgs_in:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Conversation contains nothing exportable.",
        )

    messages = [
        ExportMessage(
            role=m.role,
            content=m.content or "",
            timestamp=m.timestamp,
            model=m.model,
            file=m.file,
        )
        for m in msgs_in
    ]

    logger.info(
        "chat_export_request",
        extra={
            "request_id": rid,
            "user": current_user.email,
            "tenant": tenant.key,
            "format": body.format,
            "message_count": len(messages),
            "chart_count": len(body.charts or {}),
        },
    )

    try:
        if body.format == "docx":
            blob = export_to_docx(messages=messages, charts=body.charts, title=body.title)
        elif body.format == "pptx":
            blob = export_to_pptx(messages=messages, charts=body.charts, title=body.title)
        else:
            blob = export_to_pdf(messages=messages, charts=body.charts, title=body.title)
    except ExportError as exc:
        logger.exception("chat_export_failed", extra={"request_id": rid, "error": str(exc)})
        # Best-effort audit on failure path.
        try:
            async with control_session() as audit_session:
                await record_audit_event(
                    audit_session,
                    tenant_id=tenant.id,
                    actor=current_user.email,
                    event_type="chat.export.failed",
                    payload={
                        "format": body.format,
                        "message_count": len(messages),
                        "error": str(exc)[:500],
                        "request_id": rid,
                    },
                )
                await audit_session.commit()
        except Exception:  # noqa: BLE001
            logger.exception("chat_export_audit_failed", extra={"request_id": rid})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to render export",
        )

    # Audit success. Use a fresh control session because the route doesn't
    # otherwise touch the DB — keeps this path cheap when audit is disabled.
    try:
        async with control_session() as audit_session:
            await record_audit_event(
                audit_session,
                tenant_id=tenant.id,
                actor=current_user.email,
                event_type="chat.export.success",
                payload={
                    "format": body.format,
                    "message_count": len(messages),
                    "chart_count": len(body.charts or {}),
                    "title": (body.title or "")[:200],
                    "byte_size": len(blob),
                    "request_id": rid,
                },
            )
            await audit_session.commit()
    except Exception:  # noqa: BLE001
        # Audit failures don't take down the export, but log loudly.
        logger.exception("chat_export_audit_failed", extra={"request_id": rid})

    filename = f"{_safe_filename_part(body.title or 'nexora-chat-transcript')}.{_EXPORT_EXTENSIONS[body.format]}"
    return Response(
        content=blob,
        media_type=_EXPORT_CONTENT_TYPES[body.format],
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-Request-ID": rid,
        },
    )


# ── Artifact download ───────────────────────────────────────────────────────
# GET /api/chat/artifacts/{artifact_id}?token=…
#
# Returns the bytes the assistant produced via the ``build_artifact`` tool.
# Authorization is via a short-lived JWT token in the query string (not the
# normal Authorization header) so the user can click a plain anchor link
# without the frontend having to attach credentials. The token is bound to a
# single artifact id + tenant + owner so leakage of one URL can't read
# anything else.


@router.get("/artifacts/{artifact_id}/meta")
async def get_chat_artifact_meta(
    artifact_id: str,
    token: str,
    request: Request,
) -> dict:
    """Return artifact metadata (title, slide count, render stats, format)
    without serving the binary. The frontend artifact card calls this to
    populate the download tile without forcing a full file fetch first."""
    rid = _request_id(request)
    try:
        tenant_key, owner_email = artifacts_svc.verify_download_token(
            token, expected_artifact_id=artifact_id,
        )
    except artifacts_svc.ArtifactTokenInvalid as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    try:
        meta = artifacts_svc.load_meta(
            tenant_key=tenant_key, owner_email=owner_email, artifact_id=artifact_id,
        )
    except artifacts_svc.ArtifactNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    # Strip server-internal fields before returning to the browser.
    return {
        "artifact_id": meta.get("artifact_id"),
        "filename": meta.get("filename"),
        "title": meta.get("title"),
        "format": meta.get("format"),
        "size_bytes": meta.get("size_bytes"),
        "created_at": meta.get("created_at"),
        "updated_at": meta.get("updated_at"),
        "has_thumbnail": bool(meta.get("has_thumbnail")),
        "stats": meta.get("stats") or {},
        "request_id": rid,
    }


@router.get("/artifacts/{artifact_id}/thumbnail.png")
async def get_chat_artifact_thumbnail(
    artifact_id: str,
    token: str,
    request: Request,
) -> Response:
    """Serve the synthetic preview tile generated at persist time."""
    rid = _request_id(request)
    try:
        tenant_key, owner_email = artifacts_svc.verify_download_token(
            token, expected_artifact_id=artifact_id,
        )
    except artifacts_svc.ArtifactTokenInvalid as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    try:
        png = artifacts_svc.load_thumbnail(
            tenant_key=tenant_key, owner_email=owner_email, artifact_id=artifact_id,
        )
    except artifacts_svc.ArtifactNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return Response(
        content=png,
        media_type="image/png",
        headers={
            "Cache-Control": "private, max-age=300",
            "X-Request-ID": rid,
        },
    )


@router.get("/artifacts/{artifact_id}")
async def download_chat_artifact(
    artifact_id: str,
    token: str,
    request: Request,
) -> Response:
    rid = _request_id(request)
    try:
        tenant_key, owner_email = artifacts_svc.verify_download_token(
            token, expected_artifact_id=artifact_id,
        )
    except artifacts_svc.ArtifactTokenInvalid as exc:
        raise HTTPException(status_code=403, detail=str(exc))

    try:
        blob, meta = artifacts_svc.load_artifact(
            tenant_key=tenant_key, owner_email=owner_email, artifact_id=artifact_id,
        )
    except artifacts_svc.ArtifactNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    logger.info(
        "chat_artifact_download",
        extra={
            "request_id": rid, "user": owner_email, "tenant": tenant_key,
            "artifact_id": artifact_id, "format": meta.get("format"),
            "size_bytes": meta.get("size_bytes"),
        },
    )

    return Response(
        content=blob,
        media_type=meta.get("mime", "application/octet-stream"),
        headers={
            "Content-Disposition": f'attachment; filename="{meta.get("filename", artifact_id)}"',
            "Cache-Control": "no-store",
            "X-Request-ID": rid,
        },
    )


# ── Chat ───────────────────────────────────────────────────────────────────-

@router.post("", response_model=ChatResponse)
async def chat(
    request: Request,
    body: ChatRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
):
    _check_client()
    rid = _request_id(request)
    client = get_client()
    model = resolve_model(body.model)

    logger.info("chat_request", extra={
        "request_id": rid, "user": current_user.email, "model": model,
        "message_count": len(body.messages),
        "workbook_id": body.workbook_id or "",
        "dataset": body.dataset,
    })

    if body.workbook_id and body.dataset:
        raise HTTPException(
            status_code=400,
            detail="workbook_id and dataset cannot be combined on the same request.",
        )

    if body.workbook_id:
        return await _chat_with_workbook(client, session, tenant, rid, current_user.email, model, body)

    if body.dataset:
        return await _chat_with_dataset(client, session, tenant, rid, current_user.email, model, body)

    # Plain chat now also exposes the artifact tools so the user can ask for
    # a deck/doc/PDF without first attaching a workbook or switching into
    # dataset mode. The system prompt gets the same hint the tool-aware paths
    # use so the model knows when to call build_artifact / revise_artifact.
    try:
        system = f"{DEFAULT_SYSTEM_PROMPT}{artifacts_svc.BUILD_ARTIFACT_PROMPT_HINT}"
        messages = [{"role": m.role, "content": m.content} for m in body.messages]
        dispatch = _artifact_tool_dispatchers(tenant, current_user.email, rid)
        tools = [artifacts_svc.BUILD_ARTIFACT_TOOL, artifacts_svc.REVISE_ARTIFACT_TOOL]
        reply, _usage = await _run_chat_loop_with_tools(
            client=client, model=model, system=system,
            messages=messages, tools=tools, dispatch=dispatch,
        )
        return ChatResponse(reply=reply, model=model)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("chat_failed", extra={"request_id": rid, "user": current_user.email})
        is_dev = settings.ENVIRONMENT.lower() != "production"
        detail = f"Chat request failed: {exc}" if is_dev else "Chat request failed."
        raise HTTPException(status_code=500, detail=detail)


@router.post("/stream")
async def chat_stream(
    request: Request,
    body: ChatRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
):
    _check_client()
    rid = _request_id(request)
    client = get_client()
    model = resolve_model(body.model)
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    if body.workbook_id and body.dataset:
        raise HTTPException(
            status_code=400,
            detail="workbook_id and dataset cannot be combined on the same request.",
        )

    # Compose tools/system the same way the persisted conversation stream does,
    # so an ephemeral (no-conversation) stream can also ground on a workbook or
    # the tenant dataset instead of falling back to non-streaming chat.
    system, tools, dispatch = await _build_conversation_tool_context(
        session=session,
        tenant=tenant,
        user_email=current_user.email,
        rid=rid,
        workbook_id=body.workbook_id,
        use_dataset=body.dataset,
    )

    logger.info("chat_stream_request", extra={
        "request_id": rid, "user": current_user.email, "model": model,
        "workbook_id": body.workbook_id or "",
        "dataset": body.dataset,
    })

    async def _generate() -> AsyncIterator[str]:
        try:
            async for event in _stream_chat_with_tools(
                client=client, model=model, system=system,
                messages=messages, tools=tools, dispatch=dispatch,
            ):
                if "error" in event:
                    yield f"data: {json.dumps({'error': event['error']})}\n\n"
                    return
                if event.get("event") == "final":
                    # Terminal informational event — don't forward to wire.
                    break
                yield f"data: {json.dumps(event)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception:
            logger.exception("chat_stream_failed", extra={"request_id": rid, "user": current_user.email})
            yield f"data: {json.dumps({'error': 'Stream interrupted. Please retry.'})}\n\n"

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Shared chat-with-tools plumbing ────────────────────────────────────────-
#
# These two helpers let plain chat (and the conversation endpoints) call the
# same tool-use loop the workbook/dataset paths already use. The workbook and
# dataset functions stay on their own implementations because they have
# additional concerns (DuckDB connection lifecycle, dataset session rollback)
# — extracting them would be more code than it removes.

# A "dispatcher" is a per-tool async callable bound with whatever context the
# handler needs (tenant key, user email, request id, etc.). Returning a dict
# matches the shape the Anthropic API expects for tool_result blocks, so the
# caller can append it directly to the messages array.
ToolDispatcher = Callable[[Any], Awaitable[Dict[str, Any]]]


def _artifact_tool_dispatchers(
    tenant: TenantContext, user_email: str, rid: str
) -> Dict[str, ToolDispatcher]:
    """Bind tenant/user/request context to the artifact tool handlers.

    Returned dict maps tool name → async handler. Plain chat and the
    conversation endpoints use this directly; workbook/dataset paths add
    their own SQL handler to the result before passing to the streaming
    or non-streaming helpers.
    """
    return {
        "build_artifact": lambda block: _run_build_artifact_tool(block, tenant, user_email, rid),
        "revise_artifact": lambda block: _run_revise_artifact_tool(block, tenant, user_email, rid),
    }


async def _run_chat_loop_with_tools(
    *,
    client,
    model: str,
    system: str,
    messages: list[dict],
    tools: list[dict],
    dispatch: Dict[str, ToolDispatcher],
    max_iterations: int = 8,
) -> tuple[str, dict]:
    """Non-streaming tool-use loop. Drives ``messages.create`` until the
    model stops with ``end_turn`` (or the iteration cap is hit). Returns
    ``(reply_text, usage)`` where usage has ``tokens_in`` and ``tokens_out``
    summed across all iterations.

    Used by ``/api/chat`` and the non-streaming conversation endpoint so
    plain chat finally gets access to the artifact tools.
    """
    last_text = ""
    tokens_in = 0
    tokens_out = 0
    for iteration in range(max_iterations):
        response = await client.messages.create(
            model=model,
            max_tokens=max_tokens(model),
            system=system,
            tools=tools,
            messages=messages,
        )
        usage = getattr(response, "usage", None)
        if usage:
            tokens_in += getattr(usage, "input_tokens", 0) or 0
            tokens_out += getattr(usage, "output_tokens", 0) or 0

        turn_text = extract_text_blocks(response)
        if turn_text and turn_text != "No text content in response.":
            last_text = turn_text

        if response.stop_reason != "tool_use":
            return last_text or turn_text, {"tokens_in": tokens_in, "tokens_out": tokens_out}

        messages.append({"role": "assistant", "content": response.content})
        tool_results: list[dict] = []
        for block in response.content:
            if getattr(block, "type", None) != "tool_use":
                continue
            handler = dispatch.get(block.name)
            if handler is None:
                tool_results.append({
                    "type": "tool_result", "tool_use_id": block.id,
                    "content": f"Unknown tool: {block.name}", "is_error": True,
                })
                continue
            tool_results.append(await handler(block))
        messages.append({"role": "user", "content": tool_results})

    return (
        last_text or "Sorry, I couldn't finish that within the tool-use limit. Try a more specific request.",
        {"tokens_in": tokens_in, "tokens_out": tokens_out},
    )


async def _stream_chat_with_tools(
    *,
    client,
    model: str,
    system: str,
    messages: list[dict],
    tools: list[dict],
    dispatch: Dict[str, ToolDispatcher],
    max_iterations: int = 8,
) -> AsyncIterator[dict]:
    """Streaming tool-use loop. Yields *event dicts* (not SSE-framed strings)
    so callers can compose them with their own framing (raw SSE for plain
    streaming; SSE + DB persistence for the conversation endpoint).

    Yield shapes:
      {'delta':    str}                            — text token
      {'event':    'tool_start', 'name': str, 'tool_use_id': str}
      {'event':    'tool_done',  'name': str, 'tool_use_id': str, 'is_error': bool}
      {'event':    'final',      'text': str, 'usage': {'tokens_in': int, 'tokens_out': int}}
      {'error':    str}                            — terminal on failure

    The terminal 'final' yield is informational — it lets the caller persist
    the accumulated assistant text and token counts without re-stitching
    the deltas. Callers should not forward the 'final' event to the wire;
    forward only 'delta', 'tool_start', 'tool_done', then emit ``[DONE]``.

    The model can iterate up to ``max_iterations`` rounds of tool-use; beyond
    that the loop returns whatever text it accumulated so a runaway model
    can't burn through tokens or wedge the stream forever.
    """
    accumulated: list[str] = []
    tokens_in = 0
    tokens_out = 0
    for iteration in range(max_iterations):
        try:
            async with client.messages.stream(
                model=model,
                max_tokens=max_tokens(model, streaming=True),
                system=system,
                tools=tools,
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    accumulated.append(text)
                    yield {"delta": text}
                final_message = await stream.get_final_message()
        except Exception as exc:  # noqa: BLE001
            logger.exception("chat_stream_with_tools_failed", extra={"iteration": iteration})
            yield {"error": f"Stream interrupted: {exc}"}
            return

        usage = getattr(final_message, "usage", None)
        if usage:
            tokens_in += getattr(usage, "input_tokens", 0) or 0
            tokens_out += getattr(usage, "output_tokens", 0) or 0

        if final_message.stop_reason != "tool_use":
            yield {
                "event": "final",
                "text": "".join(accumulated),
                "usage": {"tokens_in": tokens_in, "tokens_out": tokens_out},
            }
            return

        # Run the tools. We surface each tool call to the wire so the frontend
        # can show a "Building deck…" indicator — long-running tools would
        # otherwise look like a paused stream.
        messages.append({"role": "assistant", "content": final_message.content})
        tool_results: list[dict] = []
        for block in final_message.content:
            if getattr(block, "type", None) != "tool_use":
                continue
            yield {"event": "tool_start", "name": block.name, "tool_use_id": block.id}
            handler = dispatch.get(block.name)
            if handler is None:
                result = {
                    "type": "tool_result", "tool_use_id": block.id,
                    "content": f"Unknown tool: {block.name}", "is_error": True,
                }
            else:
                try:
                    result = await handler(block)
                except Exception as exc:  # noqa: BLE001
                    logger.exception("chat_stream_tool_handler_failed",
                                     extra={"tool": block.name})
                    result = {
                        "type": "tool_result", "tool_use_id": block.id,
                        "content": f"Tool '{block.name}' failed: {exc}", "is_error": True,
                    }
            tool_results.append(result)
            yield {
                "event": "tool_done", "name": block.name, "tool_use_id": block.id,
                "is_error": bool(result.get("is_error")),
            }
        messages.append({"role": "user", "content": tool_results})

    # Iteration cap reached without an end_turn. Surface whatever we have.
    yield {
        "event": "final",
        "text": "".join(accumulated),
        "usage": {"tokens_in": tokens_in, "tokens_out": tokens_out},
    }


async def _build_conversation_tool_context(
    *,
    session: AsyncSession,
    tenant: TenantContext,
    user_email: str,
    rid: str,
    workbook_id: Optional[str],
    use_dataset: bool,
) -> tuple[str, list[dict], Dict[str, ToolDispatcher]]:
    """Compose (system_prompt, tools, dispatch) for a conversation turn.

    The artifact tools (build_artifact / revise_artifact) are always on.
    Workbook and dataset tools are added when the request opted into them
    — this is what lets persisted conversations include workbook-grounded
    turns in the chat history table (which the previous ``/api/chat``
    workbook path bypassed entirely).
    """
    system = f"{DEFAULT_SYSTEM_PROMPT}{artifacts_svc.BUILD_ARTIFACT_PROMPT_HINT}"
    tools: list[dict] = [artifacts_svc.BUILD_ARTIFACT_TOOL, artifacts_svc.REVISE_ARTIFACT_TOOL]
    dispatch: Dict[str, ToolDispatcher] = _artifact_tool_dispatchers(tenant, user_email, rid)

    if workbook_id:
        try:
            workbook = await workbooks_svc.get_workbook(session, workbook_id, owner_email=user_email)
        except workbooks_svc.WorkbookNotFound:
            raise HTTPException(status_code=404, detail="Workbook not found.")
        if workbook["status"] != workbooks_svc.STATUS_READY:
            if workbook["status"] == workbooks_svc.STATUS_FAILED:
                detail = f"Workbook failed to ingest: {workbook.get('error_message') or 'unknown error'}"
            else:
                detail = "Workbook is still being ingested. Try again in a moment."
            raise HTTPException(status_code=409, detail=detail)
        schema_block = workbooks_svc.schema_summary_for_prompt(workbook["schema"])
        system = f"{DEFAULT_SYSTEM_PROMPT}\n\n---\n{schema_block}{artifacts_svc.BUILD_ARTIFACT_PROMPT_HINT}"
        tools.append(workbooks_svc.RUN_SQL_TOOL)

        async def _wb_dispatch(block: Any) -> dict:
            # Bind the captured session so each tool call runs against the
            # same tenant DB connection as the conversation turn.
            return await _run_sql_tool(session, tenant.key, block, workbook_id, user_email, rid)
        dispatch["run_sql"] = _wb_dispatch

    elif use_dataset:
        try:
            schema_block = await dataset_svc.schema_summary_for_prompt(session)
        except dataset_svc.DatasetError as exc:
            raise HTTPException(status_code=503, detail=f"Dataset unavailable: {exc}")
        system = f"{DEFAULT_SYSTEM_PROMPT}\n\n---\n{schema_block}{artifacts_svc.BUILD_ARTIFACT_PROMPT_HINT}"
        tools.append(dataset_svc.RUN_DATASET_SQL_TOOL)

        async def _ds_dispatch(block: Any) -> dict:
            return await _run_dataset_sql_tool(session, block, user_email, rid)
        dispatch["run_dataset_sql"] = _ds_dispatch

    return system, tools, dispatch


# ── Workbook + dataset tool-use loops ──────────────────────────────────────-

async def _chat_with_workbook(
    client,
    session: AsyncSession,
    tenant: TenantContext,
    rid: str,
    user_email: str,
    model: str,
    body: ChatRequest,
) -> ChatResponse:
    try:
        workbook = await workbooks_svc.get_workbook(session, body.workbook_id, owner_email=user_email)
    except workbooks_svc.WorkbookNotFound:
        raise HTTPException(status_code=404, detail="Workbook not found.")

    if workbook["status"] != workbooks_svc.STATUS_READY:
        if workbook["status"] == workbooks_svc.STATUS_FAILED:
            detail = f"Workbook failed to ingest: {workbook.get('error_message') or 'unknown error'}"
        else:
            detail = "Workbook is still being ingested. Try again in a moment."
        raise HTTPException(status_code=409, detail=detail)

    schema_block = workbooks_svc.schema_summary_for_prompt(workbook["schema"])
    system = (
        f"{DEFAULT_SYSTEM_PROMPT}\n\n---\n{schema_block}"
        f"{artifacts_svc.BUILD_ARTIFACT_PROMPT_HINT}"
    )
    messages: list[dict] = [{"role": m.role, "content": m.content} for m in body.messages]

    last_text = ""
    for iteration in range(settings.WORKBOOK_MAX_TOOL_ITERATIONS):
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=max_tokens(model),
                system=system,
                tools=[
                    workbooks_svc.RUN_SQL_TOOL,
                    artifacts_svc.BUILD_ARTIFACT_TOOL,
                    artifacts_svc.REVISE_ARTIFACT_TOOL,
                ],
                messages=messages,
            )
        except Exception as exc:
            logger.exception("workbook_chat_failed", extra={"request_id": rid, "user": user_email})
            is_dev = settings.ENVIRONMENT.lower() != "production"
            detail = f"Workbook chat failed: {exc}" if is_dev else "Workbook chat failed."
            raise HTTPException(status_code=500, detail=detail)

        turn_text = extract_text_blocks(response)
        if turn_text and turn_text != "No text content in response.":
            last_text = turn_text

        if response.stop_reason != "tool_use":
            return ChatResponse(reply=last_text or turn_text, model=model)

        messages.append({"role": "assistant", "content": response.content})
        tool_results: list[dict] = []
        for block in response.content:
            if getattr(block, "type", None) != "tool_use":
                continue
            if block.name == "run_sql":
                tool_results.append(await _run_sql_tool(session, tenant.key, block, body.workbook_id, user_email, rid))
                continue
            if block.name == "build_artifact":
                tool_results.append(await _run_build_artifact_tool(block, tenant, user_email, rid))
                continue
            if block.name == "revise_artifact":
                tool_results.append(await _run_revise_artifact_tool(block, tenant, user_email, rid))
                continue
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": f"Unknown tool: {block.name}",
                "is_error": True,
            })
        messages.append({"role": "user", "content": tool_results})

    return ChatResponse(
        reply=last_text or "Sorry, I couldn't answer that within the query limit. Try a more specific question.",
        model=model,
    )


async def _run_sql_tool(
    session: AsyncSession, tenant_key: str, block: Any, workbook_id: str, user_email: str, rid: str
) -> dict:
    query = (block.input or {}).get("query", "")
    logger.info("workbook_sql_tool", extra={
        "request_id": rid, "user": user_email, "workbook_id": workbook_id, "query_len": len(query),
    })
    try:
        result = await workbooks_svc.run_sql(session, tenant_key, workbook_id, user_email, query)
    except workbooks_svc.WorkbookNotFound:
        return {"type": "tool_result", "tool_use_id": block.id,
                "content": "Workbook is no longer available.", "is_error": True}
    except Exception as exc:
        return {"type": "tool_result", "tool_use_id": block.id,
                "content": f"Query error: {exc}", "is_error": True}
    return {"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)}


async def _chat_with_dataset(
    client,
    session: AsyncSession,
    tenant: TenantContext,
    rid: str,
    user_email: str,
    model: str,
    body: ChatRequest,
) -> ChatResponse:
    try:
        schema_block = await dataset_svc.schema_summary_for_prompt(session)
    except dataset_svc.DatasetError as exc:
        raise HTTPException(status_code=503, detail=f"Dataset unavailable: {exc}")

    system = (
        f"{DEFAULT_SYSTEM_PROMPT}\n\n---\n{schema_block}"
        f"{artifacts_svc.BUILD_ARTIFACT_PROMPT_HINT}"
    )
    messages: list[dict] = [{"role": m.role, "content": m.content} for m in body.messages]

    last_text = ""
    for iteration in range(settings.DATASET_MAX_TOOL_ITERATIONS):
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=max_tokens(model),
                system=system,
                tools=[
                    dataset_svc.RUN_DATASET_SQL_TOOL,
                    artifacts_svc.BUILD_ARTIFACT_TOOL,
                    artifacts_svc.REVISE_ARTIFACT_TOOL,
                ],
                messages=messages,
            )
        except Exception as exc:
            logger.exception("dataset_chat_failed", extra={"request_id": rid, "user": user_email})
            is_dev = settings.ENVIRONMENT.lower() != "production"
            detail = f"Dataset chat failed: {exc}" if is_dev else "Dataset chat failed."
            raise HTTPException(status_code=500, detail=detail)

        turn_text = extract_text_blocks(response)
        if turn_text and turn_text != "No text content in response.":
            last_text = turn_text

        if response.stop_reason != "tool_use":
            return ChatResponse(reply=last_text or turn_text, model=model)

        messages.append({"role": "assistant", "content": response.content})
        tool_results: list[dict] = []
        for block in response.content:
            if getattr(block, "type", None) != "tool_use":
                continue
            if block.name == "run_dataset_sql":
                tool_results.append(await _run_dataset_sql_tool(session, block, user_email, rid))
                continue
            if block.name == "build_artifact":
                tool_results.append(await _run_build_artifact_tool(block, tenant, user_email, rid))
                continue
            if block.name == "revise_artifact":
                tool_results.append(await _run_revise_artifact_tool(block, tenant, user_email, rid))
                continue
            tool_results.append({
                "type": "tool_result", "tool_use_id": block.id,
                "content": f"Unknown tool: {block.name}", "is_error": True,
            })
        messages.append({"role": "user", "content": tool_results})

    return ChatResponse(
        reply=last_text or "Sorry, I couldn't answer that within the query limit. Try a more specific question.",
        model=model,
    )


# ── Build / revise artifact tool handlers ──────────────────────────────────-

# Tenant branding is small (a JSON dict per tenant). Cache lookups in-process
# for the duration of the chat turn so a deck-revision conversation doesn't
# re-fetch it once per tool call. The cache key is ``tenant.id`` and entries
# expire on a 30s TTL — short enough that a branding update via the admin
# console becomes visible within seconds without the model hitting the DB
# on every turn.
_BRANDING_CACHE: dict[int, tuple[float, dict]] = {}
_BRANDING_CACHE_TTL = 30.0


async def _load_tenant_branding(tenant: TenantContext) -> dict:
    """Return the tenant's branding JSON (or empty dict if unconfigured)."""
    import time as _time
    entry = _BRANDING_CACHE.get(tenant.id)
    if entry and _time.monotonic() - entry[0] < _BRANDING_CACHE_TTL:
        return entry[1]
    try:
        async with control_session() as session:
            stmt = sa_select(Tenant.branding).where(Tenant.id == tenant.id)
            result = await session.execute(stmt)
            row = result.scalar_one_or_none()
            branding = dict(row) if isinstance(row, dict) else {}
    except Exception as exc:  # noqa: BLE001
        logger.warning("tenant_branding_load_failed", extra={"tenant": tenant.key, "error": str(exc)})
        branding = {}
    _BRANDING_CACHE[tenant.id] = (_time.monotonic(), branding)
    return branding


def _render_artifact_blob(
    *, fmt: str, content_markdown: str, title: Optional[str], theme,
) -> tuple[bytes, dict]:
    """Render the requested file and return (bytes, stats).

    ``stats`` shape:
        { "slide_count": int, "chart_count": int, "render_ms": int,
          "template": str, "format": str }

    Counts are computed by parsing the markdown so they don't depend on
    the format's internal slide grammar. ``slide_count`` is the count of
    H1/H2 headings (which become slide titles in pptx) plus the cover.
    """
    import re
    import time as _time

    chart_count = len(re.findall(r"```chart", content_markdown or ""))
    section_count = len(re.findall(r"^#{1,2}\s+", content_markdown or "", flags=re.MULTILINE))
    table_count = len(re.findall(r"^\s*\|.+\|\s*$", content_markdown or "", flags=re.MULTILINE))
    # Tables are detected by counting GFM pipe rows; subtract the header/divider
    # rows by dividing by 3 as a rough heuristic (header, divider, ≥1 body row).
    estimated_tables = max(0, table_count // 3) if table_count else 0
    # pptx emits: 1 cover + 1 per assistant section + 1 per chart + 1 per table.
    slide_count = 1 + max(section_count, 1) + chart_count + estimated_tables

    export_msg = ExportMessage(role="assistant", content=content_markdown)
    start = _time.monotonic()
    if fmt == "pptx":
        blob = export_to_pptx(messages=[export_msg], title=title, theme=theme)
    elif fmt == "docx":
        blob = export_to_docx(messages=[export_msg], title=title, theme=theme)
    else:
        blob = export_to_pdf(messages=[export_msg], title=title, theme=theme)
    render_ms = int((_time.monotonic() - start) * 1000)

    stats = {
        "format": fmt,
        "template": theme.template,
        "slide_count": slide_count if fmt == "pptx" else 1,
        "chart_count": chart_count,
        "table_count": estimated_tables,
        "render_ms": render_ms,
    }
    return blob, stats


async def _run_build_artifact_tool(block: Any, tenant: TenantContext, user_email: str, rid: str) -> dict:
    """Render the model's requested PPTX/DOCX/PDF and persist it.

    Loads tenant branding from the control DB, applies the chosen template,
    renders charts server-side, persists the bytes + a synthetic thumbnail,
    and returns a JSON tool result containing download/thumbnail URLs plus
    build stats (slide_count, chart_count, render_ms). The model relays
    the download_url to the user as a Markdown link; the frontend turns
    that into a download card using the metadata endpoint.
    """
    args = block.input or {}
    fmt = (args.get("format") or "").strip().lower()
    title = args.get("title") or None
    content_md = args.get("content_markdown") or ""
    template = (args.get("template") or "default").strip().lower()

    logger.info(
        "chat_build_artifact_tool",
        extra={
            "request_id": rid, "user": user_email, "tenant": tenant.key,
            "format": fmt, "content_len": len(content_md),
            "template": template, "has_title": bool(title),
        },
    )

    if fmt not in artifacts_svc.ARTIFACT_FORMATS:
        return {
            "type": "tool_result", "tool_use_id": block.id,
            "content": f"Unsupported format: {fmt!r}. Use one of: pptx, docx, pdf.",
            "is_error": True,
        }
    if not content_md.strip():
        return {
            "type": "tool_result", "tool_use_id": block.id,
            "content": "content_markdown is required and cannot be empty.",
            "is_error": True,
        }

    branding = await _load_tenant_branding(tenant)
    theme = theme_from_branding(branding, template=template)

    try:
        blob, stats = _render_artifact_blob(
            fmt=fmt, content_markdown=content_md, title=title, theme=theme,
        )
    except ExportError as exc:
        logger.exception("chat_build_artifact_render_failed", extra={"request_id": rid})
        return {
            "type": "tool_result", "tool_use_id": block.id,
            "content": f"Failed to render {fmt}: {exc}", "is_error": True,
        }

    thumbnail = artifacts_svc.render_thumbnail_png(
        title=title or "Untitled",
        fmt=fmt,
        slide_count=stats.get("slide_count", 1),
        chart_count=stats.get("chart_count", 0),
        primary_color=theme.primary_color,
        eyebrow=theme.eyebrow,
    )

    try:
        result = artifacts_svc.persist_artifact(
            tenant_key=tenant.key, owner_email=user_email,
            fmt=fmt, blob=blob, title=title,
            stats=stats, thumbnail_png=thumbnail,
        )
    except artifacts_svc.ArtifactQuotaExceeded as exc:
        return {
            "type": "tool_result", "tool_use_id": block.id,
            "content": str(exc), "is_error": True,
        }
    except artifacts_svc.ArtifactError as exc:
        logger.exception("chat_build_artifact_persist_failed", extra={"request_id": rid})
        return {
            "type": "tool_result", "tool_use_id": block.id,
            "content": f"Failed to save artifact: {exc}", "is_error": True,
        }

    logger.info("chat_build_artifact_completed", extra={
        "request_id": rid, "user": user_email, "tenant": tenant.key,
        "artifact_id": result["artifact_id"], "render_ms": stats.get("render_ms"),
        "slide_count": stats.get("slide_count"), "chart_count": stats.get("chart_count"),
    })

    return {
        "type": "tool_result", "tool_use_id": block.id,
        "content": json.dumps(result),
    }


async def _run_revise_artifact_tool(block: Any, tenant: TenantContext, user_email: str, rid: str) -> dict:
    """Re-render an existing artifact in place from new markdown.

    The download URL the user already has continues to work (its token is
    bound to the artifact_id, not to a specific blob revision), so the
    next click serves the updated file. This avoids spawning duplicate
    deck links every time the user iterates.
    """
    args = block.input or {}
    artifact_id = (args.get("artifact_id") or "").strip()
    content_md = args.get("content_markdown") or ""
    title_override = args.get("title")
    template_override = args.get("template")

    if not artifact_id:
        return {
            "type": "tool_result", "tool_use_id": block.id,
            "content": "artifact_id is required.", "is_error": True,
        }
    if not content_md.strip():
        return {
            "type": "tool_result", "tool_use_id": block.id,
            "content": "content_markdown cannot be empty.", "is_error": True,
        }

    try:
        existing = artifacts_svc.load_meta(
            tenant_key=tenant.key, owner_email=user_email, artifact_id=artifact_id,
        )
    except artifacts_svc.ArtifactNotFound as exc:
        return {
            "type": "tool_result", "tool_use_id": block.id,
            "content": str(exc), "is_error": True,
        }

    fmt = existing.get("format")
    if fmt not in artifacts_svc.ARTIFACT_FORMATS:
        return {
            "type": "tool_result", "tool_use_id": block.id,
            "content": f"Artifact has unrecognised format: {fmt!r}.", "is_error": True,
        }

    title = title_override or existing.get("title")
    template = (template_override or (existing.get("stats") or {}).get("template") or "default").strip().lower()

    logger.info("chat_revise_artifact_tool", extra={
        "request_id": rid, "user": user_email, "tenant": tenant.key,
        "artifact_id": artifact_id, "format": fmt, "template": template,
        "content_len": len(content_md),
    })

    branding = await _load_tenant_branding(tenant)
    theme = theme_from_branding(branding, template=template)

    try:
        new_blob, stats = _render_artifact_blob(
            fmt=fmt, content_markdown=content_md, title=title, theme=theme,
        )
    except ExportError as exc:
        logger.exception("chat_revise_artifact_render_failed", extra={"request_id": rid})
        return {
            "type": "tool_result", "tool_use_id": block.id,
            "content": f"Failed to render {fmt}: {exc}", "is_error": True,
        }

    thumbnail = artifacts_svc.render_thumbnail_png(
        title=title or "Untitled",
        fmt=fmt,
        slide_count=stats.get("slide_count", 1),
        chart_count=stats.get("chart_count", 0),
        primary_color=theme.primary_color,
        eyebrow=theme.eyebrow,
    )

    try:
        result = artifacts_svc.overwrite_artifact_blob(
            tenant_key=tenant.key, owner_email=user_email, artifact_id=artifact_id,
            new_blob=new_blob, stats_patch=stats, thumbnail_png=thumbnail,
        )
    except artifacts_svc.ArtifactNotFound as exc:
        return {
            "type": "tool_result", "tool_use_id": block.id,
            "content": str(exc), "is_error": True,
        }
    except artifacts_svc.ArtifactQuotaExceeded as exc:
        return {
            "type": "tool_result", "tool_use_id": block.id,
            "content": str(exc), "is_error": True,
        }
    except artifacts_svc.ArtifactError as exc:
        logger.exception("chat_revise_artifact_persist_failed", extra={"request_id": rid})
        return {
            "type": "tool_result", "tool_use_id": block.id,
            "content": f"Failed to save artifact: {exc}", "is_error": True,
        }

    return {
        "type": "tool_result", "tool_use_id": block.id,
        "content": json.dumps(result),
    }


async def _run_dataset_sql_tool(
    session: AsyncSession, block: Any, user_email: str, rid: str
) -> dict:
    query = (block.input or {}).get("query", "")
    logger.info("dataset_sql_tool", extra={
        "request_id": rid, "user": user_email, "query_len": len(query),
    })
    try:
        result = await dataset_svc.run_sql(session, query, user=user_email)
    except dataset_svc.DatasetError as exc:
        return {"type": "tool_result", "tool_use_id": block.id,
                "content": f"Query error: {exc}", "is_error": True}
    except Exception as exc:
        return {"type": "tool_result", "tool_use_id": block.id,
                "content": f"Query error: {exc}", "is_error": True}
    return {"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)}


# ── Chat-with-file ─────────────────────────────────────────────────────────-

@router.post("/with-file", response_model=ChatResponse)
async def chat_with_file(
    request: Request,
    prompt: str = Form(..., min_length=1, max_length=8000),
    file: UploadFile = File(...),
    model: Optional[str] = Form(default=None),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    _check_client()
    rid = _request_id(request)
    client = get_client()

    raw_name = file.filename or "uploaded_file"
    safe_name = os.path.basename(raw_name.strip())[:128]
    ext = get_ext(safe_name)

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {MAX_UPLOAD_BYTES // MB} MB limit.",
        )

    resolved_model = resolve_model(model)
    logger.info("file_chat_request", extra={
        "request_id": rid, "user": current_user.email,
        "model": resolved_model, "ext": ext, "size": len(file_bytes),
    })

    file_id: Optional[str] = None
    try:
        upload_name, upload_mime, upload_bytes, content_block = prepare_upload(
            prompt, safe_name, ext, file_bytes,
        )
        file_id = await upload_to_anthropic(client, upload_name, upload_mime, upload_bytes)
        content_block["source"]["file_id"] = file_id
        content = [
            {"type": "text", "text": f"User prompt:\n{prompt}\n\nFile: {safe_name}"},
            content_block,
        ]
        response = await client.messages.create(
            model=resolved_model,
            max_tokens=max_tokens(resolved_model),
            system=DEFAULT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}],
            extra_headers={"anthropic-beta": "files-api-2025-04-14"},
        )
        return ChatResponse(reply=extract_text_blocks(response), model=resolved_model)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("file_chat_failed", extra={"request_id": rid, "user": current_user.email})
        is_dev = settings.ENVIRONMENT.lower() != "production"
        detail = f"File analysis failed: {exc}" if is_dev else "File analysis failed."
        raise HTTPException(status_code=500, detail=detail)
    finally:
        if file_id:
            await delete_from_anthropic(client, file_id)


# ── Workbooks ──────────────────────────────────────────────────────────────-

def _workbook_summary(record: dict) -> dict:
    return {
        "id": record["id"],
        "filename": record["original_filename"],
        "size_bytes": record["size_bytes"],
        "created_at": record["created_at"],
        "last_accessed_at": record["last_accessed_at"],
        "status": record["status"],
        "error_message": record.get("error_message"),
    }


@router.post("/workbooks", status_code=202)
async def upload_workbook(
    request: Request,
    file: UploadFile = File(...),
    current_user: AuthenticatedUser = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
):
    rid = _request_id(request)
    user_email = current_user.email
    raw_name = file.filename or "workbook.xlsx"
    safe_name = os.path.basename(raw_name.strip())[:128]
    ext = get_ext(safe_name)
    if ext != ".xlsx":
        raise HTTPException(status_code=400, detail="Only .xlsx workbooks are supported.")

    try:
        await workbooks_svc.cleanup_expired(session, tenant.key)
    except Exception:
        logger.warning("workbook_cleanup_failed", extra={"request_id": rid})

    cl_header = request.headers.get("content-length")
    claimed_bytes = int(cl_header) if cl_header and cl_header.isdigit() else None
    try:
        await workbooks_svc.precheck_quota(session, user_email, claimed_bytes)
    except workbooks_svc.QuotaExceeded as exc:
        raise HTTPException(status_code=413, detail=str(exc))

    workbook_id = str(uuid.uuid4())
    staging = workbooks_svc.staging_path_for(tenant.key, user_email, workbook_id)
    staging.parent.mkdir(parents=True, exist_ok=True)

    bytes_written = 0
    chunk_size = 1024 * 1024
    cap = settings.WORKBOOK_MAX_BYTES
    try:
        with staging.open("wb") as out:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                bytes_written += len(chunk)
                if bytes_written > cap:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Workbook exceeds {cap // MB} MB limit.",
                    )
                out.write(chunk)
    except HTTPException:
        staging.unlink(missing_ok=True)
        raise
    except Exception:
        staging.unlink(missing_ok=True)
        logger.exception("workbook_upload_stream_failed",
                         extra={"request_id": rid, "user": user_email})
        raise HTTPException(status_code=500, detail="Workbook upload failed.")

    try:
        record = await workbooks_svc.register_staged(
            session, user_email, workbook_id, safe_name, bytes_written,
        )
    except workbooks_svc.QuotaExceeded as exc:
        staging.unlink(missing_ok=True)
        raise HTTPException(status_code=413, detail=str(exc))

    factory = _tenant_session_factory(tenant)
    asyncio.create_task(
        workbooks_svc.ingest_workbook(factory, tenant.key, tenant.id, workbook_id, user_email)
    )

    return _workbook_summary(record)


@router.get("/workbooks")
async def list_user_workbooks(
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    rows = await workbooks_svc.list_workbooks(session, current_user.email)
    return {"workbooks": [_workbook_summary(r) for r in rows]}


@router.get("/workbooks/{workbook_id}")
async def get_user_workbook(
    workbook_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    try:
        record = await workbooks_svc.get_workbook(session, workbook_id, current_user.email)
    except workbooks_svc.WorkbookNotFound:
        raise HTTPException(status_code=404, detail="Workbook not found.")
    out = _workbook_summary(record)
    if record["status"] == workbooks_svc.STATUS_READY:
        out["schema"] = record["schema"]
    return out


@router.delete("/workbooks/{workbook_id}")
async def delete_user_workbook(
    workbook_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
):
    try:
        await workbooks_svc.delete_workbook(session, tenant.key, workbook_id, current_user.email)
    except workbooks_svc.WorkbookNotFound:
        raise HTTPException(status_code=404, detail="Workbook not found.")
    return {"deleted": workbook_id}


# ── Dataset (read-only) ────────────────────────────────────────────────────-
# The dataset surface is read-only: the chat tool can SELECT from the tenant's
# operational tables, but there is no upload / load / truncate path. The set
# of queryable tables lives in app/services/chat/dataset_registry.py and is
# tenant-data that's already there (Member360 + Coding).


@router.get("/dataset/tables")
async def list_dataset_tables(
    _: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    try:
        return {"tables": await dataset_svc.list_tables(session)}
    except dataset_svc.DatasetError as exc:
        raise HTTPException(status_code=503, detail=f"Dataset unavailable: {exc}")


# ── Conversation history ────────────────────────────────────────────────────
#
# Per-tenant persisted history. All endpoints below scope to the calling
# user — a user can only see / write their own conversations even within
# the same tenant. The history.py service enforces the ownership invariant
# and collapses "not yours" / "not exists" / "soft-deleted" into a single
# 404 so we don't leak the existence of other users' conversations.


def _convo_to_summary(convo) -> ConversationSummary:
    """Map the SQLAlchemy row to the wire shape. We use ``from_attributes``
    in the Pydantic config but call it explicitly here so the field that
    aren't 1:1 (none currently, but defensive) stay obvious."""
    return ConversationSummary.model_validate(convo)


def _convo_to_detail(convo) -> ConversationDetail:
    return ConversationDetail.model_validate(
        {
            "id": convo.id,
            "title": convo.title,
            "model": convo.model,
            "message_count": convo.message_count,
            "created_at": convo.created_at,
            "updated_at": convo.updated_at,
            "messages": [
                ChatHistoryMessageOut.model_validate(m)
                for m in sorted(convo.messages, key=lambda m: m.created_at)
            ],
        }
    )


@router.get("/conversations", response_model=ConversationListResponse)
async def list_my_conversations(
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    page = await history_svc.list_conversations(session, user_id=current_user.id)
    return ConversationListResponse(
        conversations=[_convo_to_summary(c) for c in page.items]
    )


@router.post("/conversations", response_model=ConversationSummary, status_code=201)
async def create_conversation(
    body: CreateConversationRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    convo = await history_svc.create_conversation(
        session,
        user_id=current_user.id,
        user_email=current_user.email,
        title=body.title,
    )
    await session.commit()
    return _convo_to_summary(convo)


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation_detail(
    conversation_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    # Project-aware read: owner OR any project member can open the
    # conversation. Rename/delete (below) remain owner-strict via
    # ``get_conversation`` because the conversation itself is still
    # singly-owned, sharing is just additive.
    try:
        convo = await history_svc.get_readable_conversation(
            session, conversation_id=conversation_id, user_id=current_user.id
        )
    except history_svc.ConversationNotFound:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return _convo_to_detail(convo)


@router.patch("/conversations/{conversation_id}", response_model=ConversationSummary)
async def rename_conversation(
    conversation_id: str,
    body: RenameConversationRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    try:
        convo = await history_svc.rename_conversation(
            session,
            conversation_id=conversation_id,
            user_id=current_user.id,
            title=body.title,
        )
    except history_svc.ConversationNotFound:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    await session.commit()
    return _convo_to_summary(convo)


@router.delete("/conversations", status_code=204)
async def delete_all_conversations(
    current_user: AuthenticatedUser = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control_session: AsyncSession = Depends(get_control_session),
):
    """Clear the caller's chat history — soft-deletes all their conversations.

    Backs the Settings "Clear chat history" action. Audited on the control
    plane with the number of conversations cleared.
    """
    count = await history_svc.archive_all_conversations(session, user_id=current_user.id)
    await session.commit()
    await record_audit_event(
        control_session,
        tenant_id=tenant.id,
        actor=current_user.email,
        event_type="chat.history.cleared",
        payload={"tenant": tenant.key, "conversations_cleared": count},
    )
    await control_session.commit()


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    try:
        await history_svc.archive_conversation(
            session, conversation_id=conversation_id, user_id=current_user.id
        )
    except history_svc.ConversationNotFound:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    await session.commit()


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=SendMessageResponse,
)
async def send_message_to_conversation(
    conversation_id: str,
    body: SendMessageRequest,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
) -> SendMessageResponse:
    """Combined endpoint: persist user message, call Claude with full
    conversation context, persist assistant reply, return both rows.

    All three operations land in the same transaction — if the LLM call
    fails, the user message is rolled back too. This is the behaviour the
    sidebar UX wants: a turn either fully lands or doesn't, no half-saved
    state to clean up.
    """
    _check_client()
    rid = _request_id(request)
    client = get_client()
    model = resolve_model(body.model)

    if body.workbook_id and body.dataset:
        raise HTTPException(
            status_code=400,
            detail="workbook_id and dataset cannot be combined on the same request.",
        )

    # 1) Persist the user turn (also bumps title + counters).
    try:
        user_msg = await history_svc.append_message(
            session,
            conversation_id=conversation_id,
            user_id=current_user.id,
            role="user",
            content=body.content,
            workbook_id=body.workbook_id,
        )
    except history_svc.ConversationNotFound:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    # 2) Build the message list the LLM expects, including the just-appended
    #    user turn.
    messages_for_llm = await history_svc.list_messages_for_llm(
        session, conversation_id=conversation_id, user_id=current_user.id
    )

    logger.info(
        "chat_conversation_request",
        extra={
            "request_id": rid,
            "user": current_user.email,
            "model": model,
            "conversation_id": conversation_id,
            "message_count": len(messages_for_llm),
        },
    )

    # 3) Call Claude with the artifact tools available, plus the workbook
    #    SQL tool when workbook_id is attached or the dataset tool when
    #    dataset=true. Routing through this endpoint (instead of /api/chat)
    #    is what gets workbook/dataset turns into the chat history.
    try:
        system, tools, dispatch = await _build_conversation_tool_context(
            session=session, tenant=tenant, user_email=current_user.email, rid=rid,
            workbook_id=body.workbook_id, use_dataset=body.dataset,
        )
        reply, usage_totals = await _run_chat_loop_with_tools(
            client=client, model=model, system=system,
            messages=messages_for_llm, tools=tools, dispatch=dispatch,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "chat_conversation_failed",
            extra={"request_id": rid, "conversation_id": conversation_id},
        )
        # Roll back the user-message insert so the sidebar count doesn't
        # advance on a failed turn.
        await session.rollback()
        is_dev = settings.ENVIRONMENT.lower() != "production"
        detail = f"Chat request failed: {exc}" if is_dev else "Chat request failed."
        raise HTTPException(status_code=500, detail=detail)

    # 4) Persist the assistant reply with model + token counts when available.
    tokens_in = usage_totals.get("tokens_in") or None
    tokens_out = usage_totals.get("tokens_out") or None
    assistant_msg = await history_svc.append_message(
        session,
        conversation_id=conversation_id,
        user_id=current_user.id,
        role="assistant",
        content=reply,
        model=model,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
    )

    # Reload the conversation summary so the response includes the bumped
    # message_count + updated_at. ``get_writable_conversation`` so an
    # editor in a shared project can send messages without being the chat
    # owner.
    convo = await history_svc.get_writable_conversation(
        session,
        conversation_id=conversation_id,
        user_id=current_user.id,
        include_messages=False,
    )
    await session.commit()

    return SendMessageResponse(
        conversation=_convo_to_summary(convo),
        user_message=ChatHistoryMessageOut.model_validate(user_msg),
        assistant_message=ChatHistoryMessageOut.model_validate(assistant_msg),
    )


@router.post("/conversations/{conversation_id}/messages/stream")
async def stream_message_to_conversation(
    conversation_id: str,
    body: SendMessageRequest,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
) -> StreamingResponse:
    """Streaming variant. The SSE generator opens its own DB session
    because the Depends-injected one is closed before SSE begins
    yielding.

    Sequence:
      1. Open session inside the generator.
      2. Persist user message + commit.
      3. Stream Claude response, accumulating text.
      4. Persist assistant message + commit when stream completes.
      5. Yield ``[DONE]``.

    If the stream is cancelled mid-way (client navigates away), the user
    message stays persisted; the partial assistant text is discarded. The
    user can re-ask without seeing duplicates.
    """
    _check_client()
    rid = _request_id(request)
    client = get_client()
    model = resolve_model(body.model)

    async def _generate() -> AsyncIterator[str]:
        full_text = ""
        usage_block: dict = {}
        try:
            # We hold a single tenant DB session for the whole turn so the
            # workbook/dataset SQL dispatchers can run their queries on the
            # same connection that persists the user/assistant messages.
            # The earlier implementation closed the session before streaming
            # and reopened it for assistant persistence — fine for text-only
            # plain chat, but workbook/dataset tools have nowhere to query
            # from without a live session.
            async with tenant_connection_manager.get_session(tenant) as session:
                # Step 1: persist user message.
                try:
                    await history_svc.append_message(
                        session,
                        conversation_id=conversation_id,
                        user_id=current_user.id,
                        role="user",
                        content=body.content,
                        workbook_id=body.workbook_id,
                    )
                except history_svc.ConversationNotFound:
                    yield f"data: {json.dumps({'error': 'Conversation not found.'})}\n\n"
                    return

                # Step 2: build tool context (may raise 404/409 for missing/
                # not-ready workbook).
                try:
                    system, tools, dispatch = await _build_conversation_tool_context(
                        session=session, tenant=tenant, user_email=current_user.email, rid=rid,
                        workbook_id=body.workbook_id, use_dataset=body.dataset,
                    )
                except HTTPException as exc:
                    yield f"data: {json.dumps({'error': exc.detail})}\n\n"
                    return

                messages_for_llm = await history_svc.list_messages_for_llm(
                    session,
                    conversation_id=conversation_id,
                    user_id=current_user.id,
                )
                # Commit the user-message insert before we start streaming so
                # the row is visible to other reads even if the stream is
                # cancelled mid-way.
                await session.commit()

                # Step 3: stream from Claude. delta + tool_start + tool_done
                # are forwarded to the wire; the terminal 'final' event
                # carries the accumulated text + token totals.
                async for event in _stream_chat_with_tools(
                    client=client, model=model, system=system,
                    messages=messages_for_llm, tools=tools, dispatch=dispatch,
                ):
                    if "error" in event:
                        yield f"data: {json.dumps({'error': event['error']})}\n\n"
                        return
                    if event.get("event") == "final":
                        full_text = event.get("text", "")
                        usage_block = event.get("usage", {}) or {}
                        break
                    yield f"data: {json.dumps(event)}\n\n"

                # Step 4: persist the assistant message. Reuse the same
                # session so this is one transactional unit with the prior
                # commits — anything left uncommitted at the end is lost.
                if full_text.strip():
                    await history_svc.append_message(
                        session,
                        conversation_id=conversation_id,
                        user_id=current_user.id,
                        role="assistant",
                        content=full_text,
                        model=model,
                        tokens_in=usage_block.get("tokens_in"),
                        tokens_out=usage_block.get("tokens_out"),
                    )
                    await session.commit()

            yield "data: [DONE]\n\n"
        except Exception:
            logger.exception(
                "chat_conversation_stream_failed",
                extra={"request_id": rid, "conversation_id": conversation_id},
            )
            yield f"data: {json.dumps({'error': 'Stream interrupted. Please retry.'})}\n\n"

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Projects ────────────────────────────────────────────────────────────────
# Group chats together and share them with other tenant users. A project is
# created by one user (the "owner"), and additional tenant users can be
# invited as editor (can attach chats + send messages in member chats) or
# viewer (read-only). The chat conversation itself remains singly-owned —
# project membership is additive read/write access on top of ownership. See
# ``services/chat/projects.py`` for the full role matrix.


def _project_to_summary(
    project, my_role: str, conversation_count: int, member_count: int
) -> ProjectSummary:
    return ProjectSummary.model_validate(
        {
            "id": project.id,
            "title": project.title,
            "description": project.description,
            "owner_id": project.owner_id,
            "owner_email": project.owner_email,
            "conversation_count": conversation_count,
            "member_count": member_count,
            "my_role": my_role,
            "created_at": project.created_at,
            "updated_at": project.updated_at,
        }
    )


def _project_exc_to_http(exc: Exception) -> HTTPException:
    """Map service exceptions to HTTP responses. Centralised so every
    route returns consistent status codes + detail strings."""
    if isinstance(exc, projects_svc.ProjectNotFound):
        return HTTPException(status_code=404, detail="Project not found.")
    if isinstance(exc, projects_svc.ProjectPermissionDenied):
        return HTTPException(
            status_code=403, detail="You don't have permission for this action."
        )
    if isinstance(exc, projects_svc.ProjectConflict):
        return HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    raise exc


@router.get("/projects", response_model=ProjectListResponse)
async def list_my_projects(
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    rows = await projects_svc.list_projects_for_user(session, user_id=current_user.id)
    return ProjectListResponse(
        projects=[
            _project_to_summary(project, membership.role, conv_count, member_count)
            for (project, membership, conv_count, member_count) in rows
        ]
    )


@router.post("/projects", response_model=ProjectSummary, status_code=201)
async def create_project(
    body: CreateProjectRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    project = await projects_svc.create_project(
        session,
        owner_id=current_user.id,
        owner_email=current_user.email,
        title=body.title,
        description=body.description,
    )
    await session.commit()
    return _project_to_summary(project, my_role="owner", conversation_count=0, member_count=1)


@router.get("/projects/{project_id}", response_model=ProjectDetail)
async def get_project_detail(
    project_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    try:
        project, member = await projects_svc.get_project(
            session, project_id=project_id, user_id=current_user.id
        )
        members = await projects_svc.list_members(
            session, project_id=project_id, user_id=current_user.id
        )
        convos = await projects_svc.list_project_conversations(
            session, project_id=project_id, user_id=current_user.id
        )
    except Exception as exc:
        raise _project_exc_to_http(exc)

    return ProjectDetail.model_validate(
        {
            "id": project.id,
            "title": project.title,
            "description": project.description,
            "owner_id": project.owner_id,
            "owner_email": project.owner_email,
            "my_role": member.role,
            "created_at": project.created_at,
            "updated_at": project.updated_at,
            "members": [ProjectMemberOut.model_validate(m) for m in members],
            "conversations": [
                ConversationSummary.model_validate(c) for c in convos
            ],
        }
    )


@router.patch("/projects/{project_id}", response_model=ProjectSummary)
async def update_project(
    project_id: str,
    body: UpdateProjectRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    if body.title is None and body.description is None:
        raise HTTPException(status_code=400, detail="Nothing to update.")
    try:
        project = await projects_svc.update_project(
            session,
            project_id=project_id,
            user_id=current_user.id,
            title=body.title,
            description=body.description,
        )
        _, member = await projects_svc.get_project(
            session, project_id=project_id, user_id=current_user.id
        )
        conv_count = await projects_svc._count_conversations(session, project.id)
        member_count = await projects_svc._count_members(session, project.id)
    except Exception as exc:
        raise _project_exc_to_http(exc)
    await session.commit()
    return _project_to_summary(project, member.role, conv_count, member_count)


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    try:
        await projects_svc.delete_project(
            session, project_id=project_id, user_id=current_user.id
        )
    except Exception as exc:
        raise _project_exc_to_http(exc)
    await session.commit()


# ── Project members ────────────────────────────────────────────────────────


@router.get("/projects/{project_id}/members", response_model=list[ProjectMemberOut])
async def list_project_members(
    project_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    try:
        members = await projects_svc.list_members(
            session, project_id=project_id, user_id=current_user.id
        )
    except Exception as exc:
        raise _project_exc_to_http(exc)
    return [ProjectMemberOut.model_validate(m) for m in members]


@router.post(
    "/projects/{project_id}/members",
    response_model=ProjectMemberOut,
    status_code=201,
)
async def add_project_member(
    project_id: str,
    body: AddMemberRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
    control: AsyncSession = Depends(get_control_session),
):
    # Verify the caller is the project owner BEFORE doing the user lookup —
    # otherwise a non-owner could probe for valid user_ids in the tenant by
    # watching for 404 vs 403 responses.
    try:
        _, actor_membership = await projects_svc.get_project(
            session, project_id=project_id, user_id=current_user.id
        )
    except Exception as exc:
        raise _project_exc_to_http(exc)
    if actor_membership.role != "owner":
        raise HTTPException(
            status_code=403, detail="You don't have permission for this action."
        )

    # Look up the new member in the control plane to:
    #   1) confirm they exist + are in the same tenant (no cross-tenant invites),
    #   2) capture their email so the project member row stays renderable
    #      even if the User record is later deleted.
    user = await control.scalar(
        sa_select(User).where(
            User.id == body.user_id,
            User.tenant_id == tenant.id,
            User.is_active.is_(True),
        )
    )
    if user is None:
        # Don't leak whether the id exists in another tenant.
        raise HTTPException(status_code=404, detail="User not found in this tenant.")
    if user.id == current_user.id:
        raise HTTPException(
            status_code=400, detail="You're already a member of the project."
        )

    try:
        member = await projects_svc.add_member(
            session,
            project_id=project_id,
            actor_user_id=current_user.id,
            new_user_id=user.id,
            new_user_email=user.email,
            role=body.role,
        )
    except Exception as exc:
        raise _project_exc_to_http(exc)
    await session.commit()
    return ProjectMemberOut.model_validate(member)


@router.patch(
    "/projects/{project_id}/members/{user_id}",
    response_model=ProjectMemberOut,
)
async def update_project_member_role(
    project_id: str,
    user_id: int,
    body: UpdateMemberRoleRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    try:
        member = await projects_svc.update_member_role(
            session,
            project_id=project_id,
            actor_user_id=current_user.id,
            target_user_id=user_id,
            role=body.role,
        )
    except Exception as exc:
        raise _project_exc_to_http(exc)
    await session.commit()
    return ProjectMemberOut.model_validate(member)


@router.delete(
    "/projects/{project_id}/members/{user_id}",
    status_code=204,
)
async def remove_project_member(
    project_id: str,
    user_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    try:
        await projects_svc.remove_member(
            session,
            project_id=project_id,
            actor_user_id=current_user.id,
            target_user_id=user_id,
        )
    except Exception as exc:
        raise _project_exc_to_http(exc)
    await session.commit()


# ── Project conversations ──────────────────────────────────────────────────


@router.get(
    "/projects/{project_id}/conversations",
    response_model=ConversationListResponse,
)
async def list_project_conversations(
    project_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    try:
        convos = await projects_svc.list_project_conversations(
            session, project_id=project_id, user_id=current_user.id
        )
    except Exception as exc:
        raise _project_exc_to_http(exc)
    return ConversationListResponse(
        conversations=[ConversationSummary.model_validate(c) for c in convos]
    )


@router.post(
    "/projects/{project_id}/conversations",
    response_model=ConversationSummary,
    status_code=201,
)
async def attach_or_create_project_conversation(
    project_id: str,
    body: AttachConversationRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    """Either attach an existing conversation (``conversation_id`` set) or
    create a new one within the project (``title`` set or both unset).

    Exactly one mode per request — passing both fields is rejected as 400."""
    if body.conversation_id and body.title:
        raise HTTPException(
            status_code=400,
            detail="Pass either conversation_id or title, not both.",
        )
    try:
        if body.conversation_id:
            link = await projects_svc.attach_conversation(
                session,
                project_id=project_id,
                user_id=current_user.id,
                user_email=current_user.email,
                conversation_id=body.conversation_id,
            )
            convo = await history_svc.get_readable_conversation(
                session,
                conversation_id=link.conversation_id,
                user_id=current_user.id,
                include_messages=False,
            )
        else:
            convo = await projects_svc.create_conversation_in_project(
                session,
                project_id=project_id,
                user_id=current_user.id,
                user_email=current_user.email,
                title=body.title,
            )
    except history_svc.ConversationNotFound:
        # Re-shaping a history miss inside the project flow: most often
        # this means the caller doesn't own the conversation they tried
        # to attach.
        raise HTTPException(
            status_code=404, detail="Conversation not found or not yours to share."
        )
    except Exception as exc:
        raise _project_exc_to_http(exc)

    await session.commit()
    return ConversationSummary.model_validate(convo)


@router.delete(
    "/projects/{project_id}/conversations/{conversation_id}",
    status_code=204,
)
async def detach_project_conversation(
    project_id: str,
    conversation_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    try:
        await projects_svc.detach_conversation(
            session,
            project_id=project_id,
            user_id=current_user.id,
            conversation_id=conversation_id,
        )
    except Exception as exc:
        raise _project_exc_to_http(exc)
    await session.commit()


# ── Tenant user picker (used by the project share dialog) ──────────────────
# We deliberately do NOT reuse /api/admin/users — that endpoint is admin-only
# and returns more PII than the share dialog needs. This minimal endpoint
# returns just (id, email) for active users in the caller's tenant.


@router.get("/tenant-users", response_model=TenantUserListResponse)
async def list_tenant_users(
    current_user: AuthenticatedUser = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
    control: AsyncSession = Depends(get_control_session),
):
    stmt = (
        sa_select(User.id, User.email)
        .where(User.tenant_id == tenant.id, User.is_active.is_(True))
        .order_by(User.email.asc())
    )
    rows = (await control.execute(stmt)).all()
    return TenantUserListResponse(
        users=[
            TenantUserOut(id=row.id, email=row.email)
            for row in rows
            if row.id != current_user.id
        ]
    )
