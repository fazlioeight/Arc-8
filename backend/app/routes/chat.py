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
from typing import Any, AsyncIterator, List, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..db.tenant_manager import TenantContext, tenant_connection_manager
from ..dependencies.tenant import get_tenant_context, get_tenant_session
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
)
from ..schemas.chat_export import ChatExportRequest
from ..utils.audit_logger import record_audit_event
from ..db.session import control_session
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
        return await _chat_with_dataset(client, session, rid, current_user.email, model, body)

    try:
        response = await client.messages.create(
            model=model,
            max_tokens=max_tokens(model, streaming=False),
            system=DEFAULT_SYSTEM_PROMPT,
            messages=[{"role": m.role, "content": m.content} for m in body.messages],
        )
        reply = extract_text_blocks(response)
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
):
    _check_client()
    rid = _request_id(request)
    client = get_client()
    model = resolve_model(body.model)
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    logger.info("chat_stream_request", extra={
        "request_id": rid, "user": current_user.email, "model": model,
    })

    async def _generate() -> AsyncIterator[str]:
        try:
            async with client.messages.stream(
                model=model,
                max_tokens=max_tokens(model, streaming=True),
                system=DEFAULT_SYSTEM_PROMPT,
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    yield f"data: {json.dumps({'delta': text})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception:
            logger.exception("chat_stream_failed", extra={"request_id": rid, "user": current_user.email})
            yield f"data: {json.dumps({'error': 'Stream interrupted. Please retry.'})}\n\n"

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
    system = f"{DEFAULT_SYSTEM_PROMPT}\n\n---\n{schema_block}"
    messages: list[dict] = [{"role": m.role, "content": m.content} for m in body.messages]

    last_text = ""
    for iteration in range(settings.WORKBOOK_MAX_TOOL_ITERATIONS):
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=max_tokens(model, streaming=False),
                system=system,
                tools=[workbooks_svc.RUN_SQL_TOOL],
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
            if block.name != "run_sql":
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": f"Unknown tool: {block.name}",
                    "is_error": True,
                })
                continue
            tool_results.append(await _run_sql_tool(session, tenant.key, block, body.workbook_id, user_email, rid))
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
    rid: str,
    user_email: str,
    model: str,
    body: ChatRequest,
) -> ChatResponse:
    try:
        schema_block = await dataset_svc.schema_summary_for_prompt(session)
    except dataset_svc.DatasetError as exc:
        raise HTTPException(status_code=503, detail=f"Dataset unavailable: {exc}")

    system = f"{DEFAULT_SYSTEM_PROMPT}\n\n---\n{schema_block}"
    messages: list[dict] = [{"role": m.role, "content": m.content} for m in body.messages]

    last_text = ""
    for iteration in range(settings.DATASET_MAX_TOOL_ITERATIONS):
        try:
            response = await client.messages.create(
                model=model,
                max_tokens=max_tokens(model, streaming=False),
                system=system,
                tools=[dataset_svc.RUN_DATASET_SQL_TOOL],
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
            if block.name != "run_dataset_sql":
                tool_results.append({
                    "type": "tool_result", "tool_use_id": block.id,
                    "content": f"Unknown tool: {block.name}", "is_error": True,
                })
                continue
            tool_results.append(await _run_dataset_sql_tool(session, block, user_email, rid))
        messages.append({"role": "user", "content": tool_results})

    return ChatResponse(
        reply=last_text or "Sorry, I couldn't answer that within the query limit. Try a more specific question.",
        model=model,
    )


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
            max_tokens=max_tokens(resolved_model, streaming=False),
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


# ── Dataset ────────────────────────────────────────────────────────────────-

def _require_dataset_admin(user: AuthenticatedUser) -> None:
    if not dataset_svc.is_dataset_admin(user.email, user.role):
        raise HTTPException(status_code=403, detail="Access denied.")


@router.get("/dataset/tables")
async def list_dataset_tables(
    _: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    try:
        return {"tables": await dataset_svc.list_tables(session)}
    except dataset_svc.DatasetError as exc:
        raise HTTPException(status_code=503, detail=f"Dataset unavailable: {exc}")


@router.post("/dataset/{table_name}/load", status_code=202)
async def load_dataset_table(
    request: Request,
    table_name: str,
    mode: str = Form(default=dataset_svc.MODE_REPLACE),
    file: Optional[UploadFile] = File(default=None),
    current_user: AuthenticatedUser = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
):
    _require_dataset_admin(current_user)
    rid = _request_id(request)
    user_email = current_user.email

    if table_name not in dataset_svc.DATASET_TABLES:
        raise HTTPException(status_code=404, detail=f"Unknown table: {table_name}")
    if mode not in dataset_svc.VALID_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mode. Allowed: {sorted(dataset_svc.VALID_MODES)}",
        )

    content_type = (request.headers.get("content-type") or "").lower()
    factory = _tenant_session_factory(tenant)

    if content_type.startswith("application/json"):
        try:
            body_json = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Body is not valid JSON.")
        json_mode = body_json.get("mode", mode)
        rows = body_json.get("rows")
        if not isinstance(rows, list):
            raise HTTPException(status_code=400, detail="JSON body must include 'rows' (array).")
        if json_mode not in dataset_svc.VALID_MODES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid mode. Allowed: {sorted(dataset_svc.VALID_MODES)}",
            )
        load_id = await dataset_svc.register_load(session, table_name, json_mode, "json", user_email)
        try:
            keys: list[str] = []
            seen: set[str] = set()
            for row in rows:
                if not isinstance(row, dict):
                    raise dataset_svc.SchemaMismatch("Each row must be a JSON object.")
                for k in row.keys():
                    if k not in seen:
                        seen.add(k)
                        keys.append(k)
            if keys:
                await dataset_svc._validate_columns(session, table_name, keys)
        except dataset_svc.SchemaMismatch as exc:
            await dataset_svc.mark_load_failed(session, load_id, str(exc))
            raise HTTPException(status_code=400, detail=str(exc))

        asyncio.create_task(
            dataset_svc.run_ingestion(
                factory, load_id, table_name, json_mode, "json",
                dataset_svc.ingest_json, rows,
            )
        )
        return {"load_id": load_id, "status": dataset_svc.STATUS_PENDING}

    if file is None:
        raise HTTPException(
            status_code=400,
            detail="Provide either an uploaded CSV/XLSX file or a JSON body with 'rows'.",
        )
    raw_name = file.filename or "upload"
    safe_name = os.path.basename(raw_name.strip())[:128]
    ext = get_ext(safe_name)
    if ext not in (".csv", ".xlsx"):
        raise HTTPException(status_code=400, detail="Only .csv and .xlsx are accepted.")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {MAX_UPLOAD_BYTES // MB} MB limit.",
        )

    load_id = await dataset_svc.register_load(session, table_name, mode, ext.lstrip("."), user_email)
    if ext == ".csv":
        asyncio.create_task(
            dataset_svc.run_ingestion(
                factory, load_id, table_name, mode, "csv",
                dataset_svc.ingest_csv, file_bytes,
            )
        )
    else:
        asyncio.create_task(
            dataset_svc.run_ingestion(
                factory, load_id, table_name, mode, "xlsx",
                dataset_svc.ingest_xlsx, file_bytes, None,
            )
        )
    return {"load_id": load_id, "status": dataset_svc.STATUS_PENDING}


@router.delete("/dataset/{table_name}/rows")
async def truncate_dataset_table(
    table_name: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    _require_dataset_admin(current_user)
    if table_name not in dataset_svc.DATASET_TABLES:
        raise HTTPException(status_code=404, detail=f"Unknown table: {table_name}")
    try:
        await dataset_svc.truncate_table(session, table_name)
    except dataset_svc.DatasetError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return {"truncated": table_name}


@router.get("/dataset/loads/{load_id}")
async def get_dataset_load(
    load_id: str,
    _: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    record = await dataset_svc.get_load(session, load_id)
    if not record:
        raise HTTPException(status_code=404, detail="Load not found.")
    return record


@router.get("/dataset/loads")
async def list_dataset_loads(
    table: Optional[str] = None,
    _: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_tenant_session),
):
    return {"loads": await dataset_svc.recent_loads(session, table_name=table, limit=25)}
