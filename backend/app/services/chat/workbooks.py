"""
Workbook storage and querying for chat-with-workbook, adapted for the
multi-tenant platform.

Ownership model
---------------
- A workbook belongs to (tenant_db, owner_email). The tenant boundary is
  enforced by the tenant DB connection itself — the ChatWorkbook row lives
  in the tenant's database, so two tenants cannot see each other's metadata.
- The on-disk DuckDB file is keyed by tenant_key + sha256(owner_email) +
  workbook_id, so even a misrouted query cannot read another user's file.

Safety
------
- DuckDB query connections are opened read_only; statement_timeout caps runaways.
- Result rows are bounded by WORKBOOK_QUERY_MAX_ROWS.
- Memory per connection is bounded by WORKBOOK_QUERY_MEMORY_LIMIT.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import duckdb
from sqlalchemy import func, select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...models.chat import ChatWorkbook


logger = logging.getLogger("nexora.chat.workbooks")


STATUS_PENDING   = "pending"
STATUS_INGESTING = "ingesting"
STATUS_READY     = "ready"
STATUS_FAILED    = "failed"


class WorkbookError(Exception):
    """Base class for workbook-layer failures."""


class WorkbookNotFound(WorkbookError):
    """Workbook id doesn't exist or doesn't belong to the calling user."""


class QuotaExceeded(WorkbookError):
    """Per-user workbook count or storage quota would be exceeded."""


class IngestionFailed(WorkbookError):
    """The xlsx file could not be parsed into DuckDB."""


_ingest_semaphore: Optional[asyncio.Semaphore] = None


def _get_ingest_semaphore() -> asyncio.Semaphore:
    global _ingest_semaphore
    if _ingest_semaphore is None:
        _ingest_semaphore = asyncio.Semaphore(settings.WORKBOOK_INGEST_CONCURRENCY)
    return _ingest_semaphore


# ── Storage paths ───────────────────────────────────────────────────────────

def _data_root() -> Path:
    return Path(settings.WORKBOOK_DATA_DIR).resolve()


def _duckdb_home() -> Path:
    return _data_root() / ".duckdb-home"


def _ensure_dirs() -> None:
    _data_root().mkdir(parents=True, exist_ok=True)
    _duckdb_home().mkdir(parents=True, exist_ok=True)


def _owner_dir(tenant_key: str, owner_email: str) -> Path:
    digest = hashlib.sha256(owner_email.encode("utf-8")).hexdigest()
    return _data_root() / tenant_key / digest


def _workbook_path(tenant_key: str, owner_email: str, workbook_id: str) -> Path:
    return _owner_dir(tenant_key, owner_email) / f"{workbook_id}.duckdb"


def staging_path_for(tenant_key: str, owner_email: str, workbook_id: str) -> Path:
    return _owner_dir(tenant_key, owner_email) / f"{workbook_id}.staging.xlsx"


def _open_duckdb(path: Path, read_only: bool = False) -> duckdb.DuckDBPyConnection:
    _ensure_dirs()
    home = _duckdb_home().as_posix()
    con = duckdb.connect(str(path), read_only=read_only)
    con.execute(f"SET home_directory='{home}'")
    con.execute(f"SET extension_directory='{home}/.duckdb/extensions'")
    return con


# ── Quota helpers ───────────────────────────────────────────────────────────

async def get_user_workbook_count(session: AsyncSession, owner_email: str) -> int:
    stmt = select(func.count()).select_from(ChatWorkbook).where(
        ChatWorkbook.owner_email == owner_email
    )
    return int((await session.execute(stmt)).scalar_one() or 0)


async def get_user_total_size(session: AsyncSession, owner_email: str) -> int:
    stmt = select(func.coalesce(func.sum(ChatWorkbook.size_bytes), 0)).where(
        ChatWorkbook.owner_email == owner_email
    )
    return int((await session.execute(stmt)).scalar_one() or 0)


async def precheck_quota(
    session: AsyncSession,
    owner_email: str,
    claimed_bytes: Optional[int] = None,
) -> None:
    cap = settings.WORKBOOK_MAX_BYTES
    if claimed_bytes is not None and claimed_bytes > cap:
        raise QuotaExceeded(f"Workbook exceeds {cap // (1024 * 1024)} MB limit.")
    count = await get_user_workbook_count(session, owner_email)
    if count >= settings.WORKBOOK_MAX_PER_USER:
        raise QuotaExceeded(f"Workbook count limit ({settings.WORKBOOK_MAX_PER_USER}) reached.")
    projected = await get_user_total_size(session, owner_email) + (claimed_bytes or 0)
    if projected > settings.WORKBOOK_USER_QUOTA_BYTES:
        raise QuotaExceeded(
            f"User storage quota ({settings.WORKBOOK_USER_QUOTA_BYTES // (1024**3)} GB) would be exceeded."
        )


# ── Lifecycle ───────────────────────────────────────────────────────────────

async def register_staged(
    session: AsyncSession,
    owner_email: str,
    workbook_id: str,
    original_filename: str,
    size_bytes: int,
) -> dict:
    if await get_user_total_size(session, owner_email) + size_bytes > settings.WORKBOOK_USER_QUOTA_BYTES:
        raise QuotaExceeded(
            f"User storage quota ({settings.WORKBOOK_USER_QUOTA_BYTES // (1024**3)} GB) would be exceeded."
        )
    now = datetime.now(timezone.utc)
    workbook = ChatWorkbook(
        id=workbook_id,
        owner_email=owner_email,
        original_filename=original_filename,
        sheet_schema_json="{}",
        size_bytes=size_bytes,
        status=STATUS_PENDING,
        created_at=now,
        last_accessed_at=now,
    )
    session.add(workbook)
    await session.commit()
    return _to_dict(workbook)


async def get_workbook(
    session: AsyncSession, workbook_id: str, owner_email: str
) -> dict:
    stmt = select(ChatWorkbook).where(
        ChatWorkbook.id == workbook_id,
        ChatWorkbook.owner_email == owner_email,
    )
    record = (await session.execute(stmt)).scalar_one_or_none()
    if not record:
        raise WorkbookNotFound(workbook_id)
    out = _to_dict(record)
    out["schema"] = json.loads(record.sheet_schema_json) if record.sheet_schema_json else {}
    return out


async def list_workbooks(session: AsyncSession, owner_email: str) -> list[dict]:
    stmt = (
        select(ChatWorkbook)
        .where(ChatWorkbook.owner_email == owner_email)
        .order_by(ChatWorkbook.last_accessed_at.desc())
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [_to_dict(r) for r in rows]


async def delete_workbook(
    session: AsyncSession,
    tenant_key: str,
    workbook_id: str,
    owner_email: str,
) -> None:
    stmt = delete(ChatWorkbook).where(
        ChatWorkbook.id == workbook_id,
        ChatWorkbook.owner_email == owner_email,
    )
    result = await session.execute(stmt)
    await session.commit()
    if not result.rowcount:
        raise WorkbookNotFound(workbook_id)
    for path in (
        _workbook_path(tenant_key, owner_email, workbook_id),
        staging_path_for(tenant_key, owner_email, workbook_id),
    ):
        if path.exists():
            try:
                path.unlink()
            except OSError:
                pass


async def cleanup_expired(session: AsyncSession, tenant_key: str) -> int:
    cutoff_ts = datetime.fromtimestamp(
        time.time() - settings.WORKBOOK_TTL_SECONDS, tz=timezone.utc
    )
    stmt = select(ChatWorkbook).where(ChatWorkbook.last_accessed_at < cutoff_ts)
    rows = (await session.execute(stmt)).scalars().all()
    count = 0
    for row in rows:
        try:
            await delete_workbook(session, tenant_key, row.id, row.owner_email)
            count += 1
        except WorkbookNotFound:
            pass
    return count


async def reset_zombie_ingestions(session: AsyncSession) -> int:
    """Mark `pending`/`ingesting` rows as failed at startup (their workers died)."""
    stmt = (
        update(ChatWorkbook)
        .where(ChatWorkbook.status.in_([STATUS_PENDING, STATUS_INGESTING]))
        .values(status=STATUS_FAILED, error_message="Server restarted while ingesting.")
    )
    result = await session.execute(stmt)
    await session.commit()
    return result.rowcount or 0


async def _set_status(
    session: AsyncSession, workbook_id: str, status: str
) -> None:
    await session.execute(
        update(ChatWorkbook).where(ChatWorkbook.id == workbook_id).values(status=status)
    )
    await session.commit()


async def _set_ready(
    session: AsyncSession, workbook_id: str, schema: dict, size_bytes: int
) -> None:
    await session.execute(
        update(ChatWorkbook)
        .where(ChatWorkbook.id == workbook_id)
        .values(
            status=STATUS_READY,
            sheet_schema_json=json.dumps(schema),
            size_bytes=size_bytes,
            error_message=None,
        )
    )
    await session.commit()


async def _set_failed(
    session: AsyncSession, workbook_id: str, error_message: str
) -> None:
    await session.execute(
        update(ChatWorkbook)
        .where(ChatWorkbook.id == workbook_id)
        .values(status=STATUS_FAILED, error_message=error_message[:500])
    )
    await session.commit()


async def _touch_last_accessed(session: AsyncSession, workbook_id: str) -> None:
    await session.execute(
        update(ChatWorkbook)
        .where(ChatWorkbook.id == workbook_id)
        .values(last_accessed_at=datetime.now(timezone.utc))
    )
    await session.commit()


def _to_dict(record: ChatWorkbook) -> dict:
    return {
        "id": record.id,
        "owner_email": record.owner_email,
        "original_filename": record.original_filename,
        "sheet_schema_json": record.sheet_schema_json,
        "size_bytes": record.size_bytes,
        "status": record.status,
        "error_message": record.error_message,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "last_accessed_at": (
            record.last_accessed_at.isoformat() if record.last_accessed_at else None
        ),
    }


# ── Ingestion ───────────────────────────────────────────────────────────────

async def ingest_workbook(
    session_factory,
    tenant_key: str,
    tenant_id: int,
    workbook_id: str,
    owner_email: str,
) -> None:
    """
    Background worker: convert the staged .xlsx into DuckDB and update status.
    `session_factory` is a callable returning an async-session context manager
    (passed in by the route so we don't share the request's session across the
    task boundary — that session is closed when the response returns).
    """
    staging = staging_path_for(tenant_key, owner_email, workbook_id)
    duckdb_path = _workbook_path(tenant_key, owner_email, workbook_id)

    async with session_factory() as session:
        try:
            current = await get_workbook(session, workbook_id, owner_email)
        except WorkbookNotFound:
            return
        if current["status"] == STATUS_READY:
            return

        if not staging.exists():
            if current["status"] != STATUS_READY:
                await _set_failed(session, workbook_id, "Staging file disappeared before ingestion.")
            return

        await _set_status(session, workbook_id, STATUS_INGESTING)

    semaphore = _get_ingest_semaphore()
    try:
        async with semaphore:
            schema = await asyncio.to_thread(_ingest_xlsx_sync, staging, duckdb_path)
        size = duckdb_path.stat().st_size
        async with session_factory() as session:
            await _set_ready(session, workbook_id, schema, size)
        logger.info("workbook_ingest_completed", extra={
            "workbook_id": workbook_id, "owner": owner_email, "size": size,
        })
    except Exception as exc:
        logger.exception("workbook_ingest_failed", extra={
            "workbook_id": workbook_id, "owner": owner_email,
        })
        if duckdb_path.exists():
            try:
                duckdb_path.unlink()
            except OSError:
                pass
        async with session_factory() as session:
            await _set_failed(session, workbook_id, str(exc))
    finally:
        if staging.exists():
            try:
                staging.unlink()
            except OSError:
                pass


_TABLE_NAME_SAFE = set(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_"
)

_TYPE_SAMPLE_ROWS = 500


def _safe_table_name(sheet: str, fallback: str) -> str:
    name = "".join(c if c in _TABLE_NAME_SAFE else "_" for c in sheet).strip("_")
    if not name:
        name = fallback
    if name[0].isdigit():
        name = "sheet_" + name
    return name[:63]


def _ingest_xlsx_sync(xlsx_path: Path, duckdb_path: Path) -> dict:
    if duckdb_path.exists():
        duckdb_path.unlink()
    duckdb_path.parent.mkdir(parents=True, exist_ok=True)

    import tempfile
    import shutil

    with tempfile.TemporaryDirectory(prefix="nexora-ingest-") as tmp_dir:
        local_path = Path(tmp_dir) / "workbook.duckdb"
        result = _ingest_to_path(xlsx_path, local_path)
        shutil.move(str(local_path), str(duckdb_path), copy_function=shutil.copyfile)

    return result


def _ingest_to_path(xlsx_path: Path, duckdb_path: Path) -> dict:
    from openpyxl import load_workbook
    wb = load_workbook(str(xlsx_path), read_only=True, keep_links=False, data_only=True)
    try:
        sheet_names = list(wb.sheetnames)
        if not sheet_names:
            raise IngestionFailed("Workbook has no sheets.")

        con = duckdb.connect(str(duckdb_path))
        try:
            con.execute(f"SET memory_limit = '{settings.WORKBOOK_QUERY_MEMORY_LIMIT}'")

            used_names: set[str] = set()
            sheets_meta: list[dict] = []
            skipped: list[dict] = []

            for idx, sheet_name in enumerate(sheet_names):
                table_name = _safe_table_name(sheet_name, fallback=f"sheet_{idx + 1}")
                base = table_name
                n = 1
                while table_name in used_names:
                    n += 1
                    table_name = f"{base}_{n}"[:63]
                used_names.add(table_name)

                try:
                    ws = wb[sheet_name]
                    columns, row_count = _ingest_sheet(con, ws, table_name)
                except Exception as exc:
                    logger.warning(
                        "workbook_sheet_skipped",
                        extra={"sheet": sheet_name, "reason": str(exc)[:200]},
                    )
                    try:
                        con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
                    except Exception:
                        pass
                    skipped.append({"sheet_name": sheet_name, "reason": str(exc)[:200]})
                    continue

                sheets_meta.append({
                    "sheet_name": sheet_name,
                    "table_name": table_name,
                    "columns": columns,
                    "row_count": row_count,
                })
        finally:
            con.close()
    finally:
        wb.close()

    if not sheets_meta:
        first = skipped[0]["reason"] if skipped else "no readable sheets"
        raise IngestionFailed(f"No sheets could be ingested. First error: {first}")

    return {"sheets": sheets_meta, "skipped": skipped}


def _ingest_sheet(con, ws, table_name: str) -> tuple[list[dict], int]:
    rows_iter = ws.iter_rows(values_only=True)

    try:
        header = next(rows_iter)
    except StopIteration:
        raise IngestionFailed("Sheet is empty.")

    header = list(header)
    while header and header[-1] is None:
        header.pop()
    if not header:
        raise IngestionFailed("Sheet has no header row.")

    column_names = _normalize_column_names(header)
    n_cols = len(column_names)

    sample: list[tuple] = []
    for i, row in enumerate(rows_iter):
        if i >= _TYPE_SAMPLE_ROWS:
            break
        sample.append(row)

    column_types = _infer_column_types(sample, n_cols)

    cols_sql = ", ".join(
        f'"{name}" {sql_type}' for name, sql_type in zip(column_names, column_types)
    )
    con.execute(f'CREATE TABLE "{table_name}" ({cols_sql})')

    import csv
    import tempfile

    inserted = 0
    csv_fd, csv_path = tempfile.mkstemp(prefix="nexora-sheet-", suffix=".csv")
    try:
        with os.fdopen(csv_fd, "w", encoding="utf-8", newline="") as csv_f:
            writer = csv.writer(csv_f, quoting=csv.QUOTE_MINIMAL)
            for row in sample:
                writer.writerow(_coerce_row_for_csv(row, column_types, n_cols))
                inserted += 1
            for row in rows_iter:
                writer.writerow(_coerce_row_for_csv(row, column_types, n_cols))
                inserted += 1
        csv_path_escaped = csv_path.replace("'", "''")
        con.execute(
            f'COPY "{table_name}" FROM \'{csv_path_escaped}\' '
            "(FORMAT CSV, HEADER FALSE, NULL '', QUOTE '\"', ESCAPE '\"')"
        )
    finally:
        try:
            os.unlink(csv_path)
        except OSError:
            pass

    columns = [
        {"name": name, "type": sql_type}
        for name, sql_type in zip(column_names, column_types)
    ]
    return columns, inserted


def _normalize_column_names(header: list) -> list[str]:
    seen: dict[str, int] = {}
    out: list[str] = []
    for i, h in enumerate(header):
        raw = "" if h is None else str(h).strip()
        sanitized = (
            "".join(c if c in _TABLE_NAME_SAFE else "_" for c in raw).strip("_")
            if raw else ""
        )
        if not sanitized:
            sanitized = f"col_{i + 1}"
        elif sanitized[0].isdigit():
            sanitized = f"col_{sanitized}"
        sanitized = sanitized[:63]
        n = seen.get(sanitized, 0) + 1
        seen[sanitized] = n
        if n > 1:
            sanitized = f"{sanitized}_{n}"[:63]
            seen[sanitized] = 1
        out.append(sanitized)
    return out


def _is_blank(v) -> bool:
    return isinstance(v, str) and not v.strip()


def _infer_column_types(sample: list[tuple], n_cols: int) -> list[str]:
    import datetime as _dt
    types: list[str] = []
    for col_idx in range(n_cols):
        values = [
            row[col_idx]
            for row in sample
            if col_idx < len(row)
            and row[col_idx] is not None
            and not _is_blank(row[col_idx])
        ]
        if not values:
            types.append("VARCHAR")
            continue
        if all(isinstance(v, bool) for v in values):
            types.append("BOOLEAN")
        elif all(isinstance(v, int) and not isinstance(v, bool) for v in values):
            types.append("BIGINT")
        elif all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in values):
            types.append("DOUBLE")
        elif all(isinstance(v, _dt.datetime) for v in values):
            types.append("TIMESTAMP")
        elif all(
            isinstance(v, _dt.date) and not isinstance(v, _dt.datetime)
            for v in values
        ):
            types.append("DATE")
        else:
            types.append("VARCHAR")
    return types


def _coerce_row_for_csv(row: tuple, column_types: list[str], n_cols: int) -> list[str]:
    coerced = _coerce_row(row, column_types, n_cols)
    out: list[str] = []
    for v in coerced:
        if v is None:
            out.append("")
        elif isinstance(v, bool):
            out.append("true" if v else "false")
        else:
            out.append(str(v))
    return out


def _coerce_row(row: tuple, column_types: list[str], n_cols: int) -> list:
    import datetime as _dt
    out: list = []
    for i in range(n_cols):
        v = row[i] if i < len(row) else None
        if v is None or _is_blank(v):
            out.append(None)
            continue
        col_type = column_types[i]
        if col_type == "VARCHAR":
            out.append(v if isinstance(v, str) else str(v))
        elif col_type == "BIGINT":
            if isinstance(v, bool):
                out.append(int(v))
            elif isinstance(v, int):
                out.append(v)
            elif isinstance(v, float):
                out.append(int(v) if v.is_integer() else None)
            elif isinstance(v, str):
                try:
                    out.append(int(v.strip()))
                except ValueError:
                    try:
                        f = float(v.strip())
                        out.append(int(f) if f.is_integer() else None)
                    except ValueError:
                        out.append(None)
            else:
                out.append(None)
        elif col_type == "DOUBLE":
            if isinstance(v, bool):
                out.append(float(v))
            elif isinstance(v, (int, float)):
                out.append(float(v))
            elif isinstance(v, str):
                try:
                    out.append(float(v.strip()))
                except ValueError:
                    out.append(None)
            else:
                out.append(None)
        elif col_type == "BOOLEAN":
            out.append(v if isinstance(v, bool) else None)
        elif col_type == "TIMESTAMP":
            out.append(v if isinstance(v, _dt.datetime) else None)
        elif col_type == "DATE":
            if isinstance(v, _dt.datetime):
                out.append(v.date())
            elif isinstance(v, _dt.date):
                out.append(v)
            else:
                out.append(None)
        else:
            out.append(v)
    return out


# ── Query execution ─────────────────────────────────────────────────────────

async def run_sql(
    session: AsyncSession,
    tenant_key: str,
    workbook_id: str,
    owner_email: str,
    query: str,
) -> dict:
    workbook = await get_workbook(session, workbook_id, owner_email)
    duckdb_path = _workbook_path(tenant_key, owner_email, workbook_id)

    if not duckdb_path.exists():
        raise WorkbookNotFound(workbook_id)

    result = await asyncio.to_thread(_run_sql_sync, duckdb_path, query)
    await _touch_last_accessed(session, workbook_id)
    _ = workbook
    return result


def _run_sql_sync(duckdb_path: Path, query: str) -> dict:
    con = _open_duckdb(duckdb_path, read_only=True)
    try:
        con.execute(f"SET memory_limit = '{settings.WORKBOOK_QUERY_MEMORY_LIMIT}'")
        try:
            con.execute(f"SET statement_timeout = '{settings.WORKBOOK_QUERY_TIMEOUT_SECONDS}s'")
        except duckdb.Error:
            pass
        cursor = con.execute(query)
        column_names = [d[0] for d in cursor.description] if cursor.description else []
        rows = cursor.fetchmany(settings.WORKBOOK_QUERY_MAX_ROWS + 1)
        truncated = len(rows) > settings.WORKBOOK_QUERY_MAX_ROWS
        rows = rows[:settings.WORKBOOK_QUERY_MAX_ROWS]
        serialised = [[_to_jsonable(v) for v in row] for row in rows]
    finally:
        con.close()
    return {
        "columns": column_names,
        "rows": serialised,
        "truncated": truncated,
        "row_count": len(serialised),
    }


def _to_jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


# ── Prompt helpers / tool definition ────────────────────────────────────────

def schema_summary_for_prompt(schema: dict) -> str:
    lines = ["The user has attached a workbook. Available tables:"]
    for sheet in schema.get("sheets", []):
        cols = ", ".join(f'{c["name"]} ({c["type"]})' for c in sheet["columns"])
        lines.append(
            f'- `{sheet["table_name"]}` (sheet: "{sheet["sheet_name"]}", '
            f'{sheet["row_count"]} rows): {cols}'
        )
    skipped = schema.get("skipped", [])
    if skipped:
        lines.append("\nSheets that could not be ingested (do not try to query these):")
        for s in skipped:
            lines.append(f'- "{s["sheet_name"]}": {s["reason"]}')
    lines.append(
        "\nUse the `run_sql` tool to query these tables (DuckDB SQL dialect). "
        "Quote table and column names with double quotes if they contain spaces "
        "or special characters. Results are capped at "
        f"{settings.WORKBOOK_QUERY_MAX_ROWS} rows."
    )
    return "\n".join(lines)


RUN_SQL_TOOL = {
    "name": "run_sql",
    "description": (
        "Execute a read-only SQL query against the user's attached workbook. "
        "DuckDB SQL dialect. Returns up to 1000 rows; use LIMIT or aggregation "
        "for large tables. Schema is provided in the system prompt."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "SQL query to execute."},
        },
        "required": ["query"],
    },
}
