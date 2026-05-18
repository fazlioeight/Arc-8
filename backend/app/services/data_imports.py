"""Service layer for unified data imports.

Backs ``/api/imports/jobs`` and ``/api/imports/uploads``. Stores file uploads
in a tenant-scoped staging directory under ``settings.UPLOAD_STAGING_DIR``
(falls back to ``backend/logs/imports`` if unset), and tracks progress via
``data_import_jobs`` + ``data_import_job_logs``.

The progress simulator that runs as a FastAPI BackgroundTask is intentionally
simple — it advances the job through queued → running → completed in a few
ticks with realistic record counts. Real parsers can replace ``_process_job``
without touching the route or frontend layers.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..db.session import control_session
from ..models.tables import DataImportJob, DataImportJobLog

logger = logging.getLogger(__name__)


def _staging_root() -> Path:
    base = getattr(settings, "UPLOAD_STAGING_DIR", None)
    if not base:
        base = Path(__file__).resolve().parent.parent.parent / "logs" / "imports"
    path = Path(base)
    path.mkdir(parents=True, exist_ok=True)
    return path


def tenant_staging_dir(tenant_key: str) -> Path:
    safe = "".join(ch for ch in tenant_key if ch.isalnum() or ch in ("-", "_")) or "default"
    target = _staging_root() / safe
    target.mkdir(parents=True, exist_ok=True)
    return target


async def append_log(
    session: AsyncSession,
    job_id: str,
    message: str,
    level: str = "info",
    *,
    commit: bool = False,
) -> None:
    session.add(DataImportJobLog(job_id=job_id, message=message, level=level))
    if commit:
        await session.commit()


async def create_job(
    session: AsyncSession,
    *,
    tenant_id: int,
    name: str,
    source_type: str,
    entity: Optional[str] = None,
    file_name: Optional[str] = None,
    file_size: Optional[int] = None,
    file_path: Optional[str] = None,
    mime_type: Optional[str] = None,
    initiated_by: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> DataImportJob:
    job = DataImportJob(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        name=name,
        source_type=source_type,
        entity=entity,
        file_name=file_name,
        file_size=file_size,
        file_path=file_path,
        mime_type=mime_type,
        initiated_by=initiated_by,
        job_metadata=metadata or {},
        status="queued",
        progress=0,
    )
    session.add(job)
    await session.flush()
    await append_log(
        session,
        job.id,
        f"Job queued ({source_type}{f' / {entity}' if entity else ''})",
        level="info",
    )
    return job


async def list_jobs(
    session: AsyncSession,
    tenant_id: int,
    *,
    status: Optional[str] = None,
    source_type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[DataImportJob], int]:
    stmt = select(DataImportJob).where(DataImportJob.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(DataImportJob.status == status)
    if source_type:
        stmt = stmt.where(DataImportJob.source_type == source_type)
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(
            (DataImportJob.name.ilike(like))
            | (DataImportJob.file_name.ilike(like))
            | (DataImportJob.initiated_by.ilike(like))
        )
    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(DataImportJob.started_at.desc()).limit(limit).offset(offset)
    rows = (await session.execute(stmt)).scalars().all()
    return list(rows), int(total)


async def get_job(session: AsyncSession, tenant_id: int, job_id: str) -> Optional[DataImportJob]:
    job = await session.get(DataImportJob, job_id)
    if job and job.tenant_id == tenant_id:
        return job
    return None


async def get_logs(session: AsyncSession, job_id: str, limit: int = 200) -> list[DataImportJobLog]:
    rows = await session.execute(
        select(DataImportJobLog)
        .where(DataImportJobLog.job_id == job_id)
        .order_by(DataImportJobLog.created_at.asc(), DataImportJobLog.id.asc())
        .limit(limit)
    )
    return list(rows.scalars().all())


def serialize_job(job: DataImportJob) -> dict:
    return {
        "id": job.id,
        "tenant_id": job.tenant_id,
        "name": job.name,
        "source_type": job.source_type,
        "entity": job.entity,
        "file_name": job.file_name,
        "file_size": job.file_size,
        "file_path": job.file_path,
        "mime_type": job.mime_type,
        "status": job.status,
        "progress": job.progress,
        "records_processed": job.records_processed,
        "records_failed": job.records_failed,
        "error": job.error,
        "initiated_by": job.initiated_by,
        "metadata": job.job_metadata or {},
        "started_at": job.started_at,
        "completed_at": job.completed_at,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }


def serialize_log(log: DataImportJobLog) -> dict:
    return {
        "id": log.id,
        "level": log.level,
        "message": log.message,
        "created_at": log.created_at,
    }


async def retry_job(session: AsyncSession, job: DataImportJob) -> DataImportJob:
    job.status = "queued"
    job.progress = 0
    job.error = None
    job.completed_at = None
    job.records_processed = 0
    job.records_failed = 0
    await session.flush()
    await append_log(session, job.id, "Job re-queued for retry", level="info")
    return job


# ---------------------- Background processing ----------------------------


def _count_csv_rows(file_path: str) -> int:
    """Count data rows in a CSV/TXT file (header excluded, blank lines ignored)."""
    path = Path(file_path)
    if not path.exists():
        return 0
    total = 0
    with path.open("r", encoding="utf-8", errors="ignore") as fh:
        for idx, line in enumerate(fh):
            if idx == 0:
                continue  # header
            if line.strip():
                total += 1
    return total


async def process_job(job_id: str) -> None:
    """Background processor: count records in the uploaded file and finalise the job.

    This is the only place uploads are touched server-side. There is no
    progress simulation: the job moves from queued → running → completed
    after counting rows. CSV/TXT files report an exact row count; binary
    formats (.xlsx) are recorded with records_processed=0 and a log line
    explaining that no parser is wired up yet.
    """
    async with control_session() as session:
        job = await session.get(DataImportJob, job_id)
        if not job:
            logger.warning("process_job: job %s vanished before processing", job_id)
            return
        job.status = "running"
        job.progress = 10
        await append_log(session, job.id, "Reading uploaded file", level="info")
        await session.commit()

        file_path = job.file_path
        suffix = Path(file_path).suffix.lower() if file_path else ""

    records_processed = 0
    error_message: Optional[str] = None
    parsed = False

    try:
        if not file_path:
            error_message = "No file attached to this job"
        elif suffix in (".csv", ".txt"):
            records_processed = _count_csv_rows(file_path)
            parsed = True
        else:
            # No parser wired up for this file type yet — record that explicitly
            # rather than fabricating a count.
            parsed = False
    except Exception as exc:  # noqa: BLE001
        error_message = f"Parser error: {exc}"

    async with control_session() as session:
        row = await session.get(DataImportJob, job_id)
        if not row:
            return
        if error_message:
            row.status = "failed"
            row.error = error_message
            row.progress = 100
            row.completed_at = datetime.now(timezone.utc)
            await append_log(session, row.id, error_message, level="error")
        else:
            row.status = "completed"
            row.records_processed = records_processed
            row.records_failed = 0
            row.progress = 100
            row.completed_at = datetime.now(timezone.utc)
            if parsed:
                await append_log(
                    session,
                    row.id,
                    f"Completed. {records_processed} records counted.",
                    level="info",
                )
            else:
                await append_log(
                    session,
                    row.id,
                    f"File staged for entity '{row.entity}'. Format {suffix or 'unknown'} has no parser wired up — records_processed left at 0.",
                    level="warning",
                )
        await session.commit()


async def fail_job(job_id: str, message: str) -> None:
    async with control_session() as session:
        row = await session.get(DataImportJob, job_id)
        if not row:
            return
        row.status = "failed"
        row.error = message
        row.completed_at = datetime.now(timezone.utc)
        await append_log(session, row.id, f"Job failed: {message}", level="error")
        await session.commit()


# ---------------------- File handling ------------------------------------


ALLOWED_EXTENSIONS = {"txt", "csv", "xlsx"}
ALLOWED_ENTITIES = {"members", "providers", "claims", "mao004", "charts"}


def validate_upload(file_name: str, entity: str) -> tuple[bool, Optional[str]]:
    if entity not in ALLOWED_ENTITIES:
        return False, f"Unsupported entity '{entity}'"
    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"Unsupported file extension '.{ext}'"
    return True, None


async def save_upload(
    *, tenant_key: str, file_name: str, file_bytes: bytes
) -> tuple[str, int]:
    """Persist an uploaded file to the tenant staging directory."""
    target_dir = tenant_staging_dir(tenant_key)
    suffix = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "dat"
    safe_stem = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in file_name)
    final = target_dir / f"{int(datetime.now(timezone.utc).timestamp())}_{safe_stem}"
    final.write_bytes(file_bytes)
    return str(final), len(file_bytes)


def preview_file(file_path: str, max_lines: int = 5) -> list[str]:
    try:
        path = Path(file_path)
        if not path.exists():
            return []
        suffix = path.suffix.lower()
        if suffix in (".csv", ".txt"):
            with path.open("r", encoding="utf-8", errors="ignore") as fh:
                return [line.rstrip("\n") for line in fh.readlines()[:max_lines]]
        return [f"<binary {suffix} file — preview unavailable>"]
    except Exception as exc:  # noqa: BLE001
        return [f"<preview error: {exc}>"]


def build_log_export(job: DataImportJob, logs: Sequence[DataImportJobLog]) -> str:
    """Build a downloadable text log for a job."""
    lines = [
        f"Job: {job.name}",
        f"ID: {job.id}",
        f"Tenant: {job.tenant_id}",
        f"Source: {job.source_type} / entity={job.entity or '-'}",
        f"Status: {job.status}",
        f"Progress: {job.progress}%",
        f"Records processed: {job.records_processed}",
        f"Records failed: {job.records_failed}",
        f"Started: {job.started_at.isoformat() if job.started_at else '-'}",
        f"Completed: {job.completed_at.isoformat() if job.completed_at else '-'}",
        "",
        "--- Log ---",
    ]
    for log in logs:
        ts = log.created_at.isoformat() if log.created_at else ""
        lines.append(f"[{ts}] {log.level.upper():5s} {log.message}")
    if job.error:
        lines.extend(["", "--- Error ---", job.error])
    return "\n".join(lines) + "\n"
