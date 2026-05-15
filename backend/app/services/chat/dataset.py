"""
Shared-analytics dataset, per-tenant edition.

Each tenant DB hosts its own copy of the analytics tables (registry in
dataset_registry.py). The chat tool runs SELECT queries against the
tenant DB through the same connection as the rest of the platform —
write protection comes from the route layer's admin allow-list plus
this module rejecting non-SELECT statements explicitly.

A future hardening pass should give each tenant a separate read-only
DB role so DDL/DML can't run even if the SELECT-only check is bypassed.
"""

from __future__ import annotations

import asyncio
import csv
import datetime as dt
import io
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Optional

import sqlalchemy as sa
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from ...models.chat import ChatDatasetLoad
from .dataset_registry import DATASET_TABLES


logger = logging.getLogger("nexora.chat.dataset")


STATUS_PENDING   = "pending"
STATUS_INGESTING = "ingesting"
STATUS_READY     = "ready"
STATUS_FAILED    = "failed"

MODE_REPLACE = "replace"
MODE_APPEND  = "append"
VALID_MODES = {MODE_REPLACE, MODE_APPEND}


class DatasetError(Exception):
    """Base class for dataset-layer failures."""


class UnknownTable(DatasetError):
    """The table is not in DATASET_TABLES."""


class SchemaMismatch(DatasetError):
    """Incoming data has columns that don't match the target table."""


class IngestionFailed(DatasetError):
    """A loader hit a row it couldn't insert; the transaction was rolled back."""


def is_dataset_admin(user_email: str, role: str) -> bool:
    """
    Platform admins and explicitly-listed dataset admins can load.
    DATASET_ADMIN_EMAILS is a global allow-list; per-tenant admin gating
    happens upstream via the role check.
    """
    if role in {"admin", "platform_admin"}:
        return True
    return user_email.lower() in {e.lower() for e in settings.DATASET_ADMIN_EMAILS}


# ── Schema introspection ────────────────────────────────────────────────────

async def _table_columns(session: AsyncSession, table_name: str) -> list[dict]:
    if table_name not in DATASET_TABLES:
        raise UnknownTable(table_name)
    rows = (
        await session.execute(
            sa.text(
                "SELECT column_name, data_type "
                "FROM information_schema.columns "
                "WHERE table_name = :table "
                "ORDER BY ordinal_position"
            ),
            {"table": table_name},
        )
    ).all()
    if not rows:
        raise UnknownTable(
            f"Table {table_name} is in the registry but doesn't exist in this "
            "tenant's database. Run the analytics migration first."
        )
    return [{"name": r[0], "type": r[1]} for r in rows]


async def list_tables(session: AsyncSession) -> list[dict]:
    out: list[dict] = []
    for table, meta in DATASET_TABLES.items():
        try:
            cols = await _table_columns(session, table)
            count = (
                await session.execute(sa.text(f'SELECT COUNT(*) FROM "{table}"'))
            ).scalar_one()
        except (UnknownTable, sa.exc.SQLAlchemyError):
            cols = []
            count = None
        last = (
            await session.execute(
                select(func.max(ChatDatasetLoad.finished_at))
                .where(ChatDatasetLoad.table_name == table)
                .where(ChatDatasetLoad.status == STATUS_READY)
            )
        ).scalar_one_or_none()
        out.append({
            "table_name": table,
            "friendly_name": meta["friendly_name"],
            "sheet_name": meta["sheet_name"],
            "columns": cols,
            "row_count": count,
            "last_loaded_at": last.isoformat() if last else None,
        })
    return out


# ── Load tracking ───────────────────────────────────────────────────────────

async def register_load(
    session: AsyncSession,
    table_name: str,
    mode: str,
    source: str,
    user_email: str,
) -> str:
    _check_known_table(table_name)
    _check_mode(mode)
    load_id = str(uuid.uuid4())
    record = ChatDatasetLoad(
        id=load_id,
        table_name=table_name,
        mode=mode,
        source=source,
        status=STATUS_PENDING,
        row_count=0,
        started_by=user_email,
        started_at=datetime.now(timezone.utc),
    )
    session.add(record)
    await session.commit()
    return load_id


async def get_load(session: AsyncSession, load_id: str) -> Optional[dict]:
    record = (
        await session.execute(select(ChatDatasetLoad).where(ChatDatasetLoad.id == load_id))
    ).scalar_one_or_none()
    return _load_to_dict(record) if record else None


async def recent_loads(
    session: AsyncSession, table_name: Optional[str] = None, limit: int = 25
) -> list[dict]:
    stmt = (
        select(ChatDatasetLoad)
        .order_by(ChatDatasetLoad.started_at.desc())
        .limit(limit)
    )
    if table_name:
        stmt = stmt.where(ChatDatasetLoad.table_name == table_name)
    rows = (await session.execute(stmt)).scalars().all()
    return [_load_to_dict(r) for r in rows]


async def reset_zombie_loads(session: AsyncSession) -> int:
    stmt = (
        update(ChatDatasetLoad)
        .where(ChatDatasetLoad.status.in_([STATUS_PENDING, STATUS_INGESTING]))
        .values(
            status=STATUS_FAILED,
            error_message="Server restarted while loading.",
            finished_at=datetime.now(timezone.utc),
        )
    )
    result = await session.execute(stmt)
    await session.commit()
    return result.rowcount or 0


async def mark_load_failed(
    session: AsyncSession, load_id: str, error_message: str
) -> None:
    await session.execute(
        update(ChatDatasetLoad)
        .where(ChatDatasetLoad.id == load_id)
        .values(
            status=STATUS_FAILED,
            error_message=error_message[:1000],
            finished_at=datetime.now(timezone.utc),
        )
    )
    await session.commit()


def _load_to_dict(record: ChatDatasetLoad) -> dict:
    return {
        "id": record.id,
        "table_name": record.table_name,
        "mode": record.mode,
        "source": record.source,
        "status": record.status,
        "row_count": record.row_count,
        "started_by": record.started_by,
        "started_at": record.started_at.isoformat() if record.started_at else None,
        "finished_at": record.finished_at.isoformat() if record.finished_at else None,
        "error_message": record.error_message,
    }


# ── Ingestion ───────────────────────────────────────────────────────────────

def _check_known_table(table_name: str) -> None:
    if table_name not in DATASET_TABLES:
        raise UnknownTable(
            f"Unknown dataset table: {table_name}. "
            f"Known tables: {', '.join(sorted(DATASET_TABLES))}"
        )


def _check_mode(mode: str) -> None:
    if mode not in VALID_MODES:
        raise DatasetError(f"Invalid mode: {mode!r}. Must be one of: {sorted(VALID_MODES)}")


def _coerce_value(raw: Any, pg_type: str) -> Any:
    if raw is None:
        return None
    if isinstance(raw, str) and not raw.strip():
        return None

    pg = pg_type.lower()
    if pg in ("bigint", "integer", "smallint"):
        if isinstance(raw, bool):
            return int(raw)
        if isinstance(raw, int):
            return raw
        if isinstance(raw, float):
            return int(raw) if raw.is_integer() else None
        try:
            return int(str(raw).strip())
        except (ValueError, TypeError):
            try:
                f = float(str(raw).strip())
                return int(f) if f.is_integer() else None
            except (ValueError, TypeError):
                return None
    if pg in ("double precision", "real", "numeric"):
        if isinstance(raw, bool):
            return float(raw)
        if isinstance(raw, (int, float)):
            return float(raw)
        try:
            return float(str(raw).strip())
        except (ValueError, TypeError):
            return None
    if pg == "boolean":
        if isinstance(raw, bool):
            return raw
        if isinstance(raw, (int, float)):
            return bool(raw)
        s = str(raw).strip().lower()
        if s in ("true", "t", "yes", "y", "1"):
            return True
        if s in ("false", "f", "no", "n", "0"):
            return False
        return None
    if pg in ("timestamp without time zone", "timestamp with time zone", "timestamp"):
        if isinstance(raw, dt.datetime):
            return raw
        if isinstance(raw, dt.date):
            return dt.datetime(raw.year, raw.month, raw.day)
        try:
            return dt.datetime.fromisoformat(str(raw).strip().replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None
    if pg == "date":
        if isinstance(raw, dt.datetime):
            return raw.date()
        if isinstance(raw, dt.date):
            return raw
        try:
            return dt.date.fromisoformat(str(raw).strip())
        except (ValueError, TypeError):
            return None
    return str(raw)


async def _validate_columns(
    session: AsyncSession, table_name: str, incoming: list[str]
) -> list[dict]:
    cols = await _table_columns(session, table_name)
    known = {c["name"] for c in cols}
    extras = [c for c in incoming if c not in known]
    if extras:
        raise SchemaMismatch(
            f"Incoming columns not present in {table_name}: {extras}. "
            f"Known columns: {sorted(known)}"
        )
    return cols


async def _load_rows(
    session: AsyncSession,
    table_name: str,
    mode: str,
    column_order: list[str],
    rows: list[dict],
) -> int:
    _check_known_table(table_name)
    _check_mode(mode)
    cols = await _table_columns(session, table_name)
    col_types = {c["name"]: c["type"] for c in cols}

    insert_cols = [c for c in column_order if c in col_types]
    placeholders = ", ".join(f":{c}" for c in insert_cols)
    col_list = ", ".join(f'"{c}"' for c in insert_cols)
    insert_sql = sa.text(
        f'INSERT INTO "{table_name}" ({col_list}) VALUES ({placeholders})'
    )

    inserted = 0
    if mode == MODE_REPLACE:
        await session.execute(sa.text(f'TRUNCATE TABLE "{table_name}"'))
    batch: list[dict] = []
    for row in rows:
        coerced = {c: _coerce_value(row.get(c), col_types[c]) for c in insert_cols}
        batch.append(coerced)
        inserted += 1
        if inserted > settings.DATASET_MAX_INGEST_ROWS:
            raise IngestionFailed(
                f"Refusing to load more than {settings.DATASET_MAX_INGEST_ROWS} rows in one call."
            )
        if len(batch) >= settings.DATASET_INGEST_BATCH_SIZE:
            await session.execute(insert_sql, batch)
            batch = []
    if batch:
        await session.execute(insert_sql, batch)
    await session.commit()
    return inserted


async def ingest_csv(
    session: AsyncSession, table_name: str, mode: str, csv_bytes: bytes
) -> dict:
    text = csv_bytes.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise SchemaMismatch("CSV has no header row.")
    await _validate_columns(session, table_name, list(reader.fieldnames))
    rows = list(reader)
    inserted = await _load_rows(session, table_name, mode, list(reader.fieldnames), rows)
    return {"inserted": inserted}


async def ingest_xlsx(
    session: AsyncSession,
    table_name: str,
    mode: str,
    xlsx_bytes: bytes,
    sheet: Optional[str] = None,
) -> dict:
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(xlsx_bytes), read_only=True, data_only=True)
    try:
        if sheet:
            if sheet not in wb.sheetnames:
                raise SchemaMismatch(f"Sheet {sheet!r} not in workbook: {wb.sheetnames}")
            ws = wb[sheet]
        else:
            ws = wb[wb.sheetnames[0]]
        rows_iter = ws.iter_rows(values_only=True)
        try:
            header = next(rows_iter)
        except StopIteration:
            raise SchemaMismatch("Sheet is empty.")
        header = list(header)
        while header and header[-1] is None:
            header.pop()
        column_order = [str(h).strip() for h in header]
        await _validate_columns(session, table_name, column_order)
        rows: list[dict] = []
        for r in rows_iter:
            padded = list(r) + [None] * max(0, len(column_order) - len(r))
            if all(
                v is None or (isinstance(v, str) and not v.strip())
                for v in padded[:len(column_order)]
            ):
                continue
            rows.append({column_order[i]: padded[i] for i in range(len(column_order))})
        inserted = await _load_rows(session, table_name, mode, column_order, rows)
    finally:
        wb.close()
    return {"inserted": inserted}


async def ingest_json(
    session: AsyncSession, table_name: str, mode: str, rows: list[dict]
) -> dict:
    if not isinstance(rows, list):
        raise SchemaMismatch("JSON body must contain a 'rows' array.")
    if not rows:
        return {"inserted": 0}
    keys: list[str] = []
    seen: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            raise SchemaMismatch("Each row must be a JSON object.")
        for k in row.keys():
            if k not in seen:
                seen.add(k)
                keys.append(k)
    await _validate_columns(session, table_name, keys)
    inserted = await _load_rows(session, table_name, mode, keys, rows)
    return {"inserted": inserted}


async def truncate_table(session: AsyncSession, table_name: str) -> None:
    _check_known_table(table_name)
    await session.execute(sa.text(f'TRUNCATE TABLE "{table_name}"'))
    await session.commit()


async def run_ingestion(
    session_factory,
    load_id: str,
    table_name: str,
    mode: str,
    source: str,
    loader: Callable,
    *loader_args,
) -> None:
    """Background-task wrapper: flip status to ingesting, call loader, record outcome."""
    async with session_factory() as session:
        await session.execute(
            update(ChatDatasetLoad)
            .where(ChatDatasetLoad.id == load_id)
            .values(status=STATUS_INGESTING)
        )
        await session.commit()
    try:
        async with session_factory() as session:
            result = await loader(session, table_name, mode, *loader_args)
        async with session_factory() as session:
            await session.execute(
                update(ChatDatasetLoad)
                .where(ChatDatasetLoad.id == load_id)
                .values(
                    status=STATUS_READY,
                    row_count=result["inserted"],
                    finished_at=datetime.now(timezone.utc),
                    error_message=None,
                )
            )
            await session.commit()
        logger.info("dataset_load_completed", extra={
            "table": table_name, "mode": mode, "source": source,
            "rows": result["inserted"], "load_id": load_id,
        })
    except Exception as exc:
        logger.exception("dataset_load_failed", extra={
            "table": table_name, "mode": mode, "source": source, "load_id": load_id,
        })
        async with session_factory() as session:
            await session.execute(
                update(ChatDatasetLoad)
                .where(ChatDatasetLoad.id == load_id)
                .values(
                    status=STATUS_FAILED,
                    error_message=str(exc)[:1000],
                    finished_at=datetime.now(timezone.utc),
                )
            )
            await session.commit()


# ── Read-only query execution ───────────────────────────────────────────────

_FORBIDDEN_LEADING = (
    "insert", "update", "delete", "drop", "truncate", "alter", "create",
    "grant", "revoke", "copy", "vacuum", "analyze", "comment",
)


def _is_select_only(query: str) -> bool:
    """
    First-line defence-in-depth before passing the query to the DB.
    Real safety should come from a read-only DB role; this is a guard against
    obvious misuse when running against the tenant's main connection.
    """
    stripped = query.lstrip().lower()
    if not stripped:
        return False
    for kw in _FORBIDDEN_LEADING:
        if stripped.startswith(kw):
            return False
    return True


async def run_sql(session: AsyncSession, query: str, user: str) -> dict:
    if not _is_select_only(query):
        raise DatasetError("Only SELECT queries are allowed against the dataset.")
    logger.info(
        "dataset_sql",
        extra={"user": user, "query_len": len(query)},
    )
    try:
        try:
            await session.execute(
                sa.text(f"SET LOCAL statement_timeout = '{settings.DATASET_QUERY_TIMEOUT_SECONDS}s'")
            )
        except sa.exc.SQLAlchemyError:
            pass
        try:
            result = await session.execute(sa.text(query))
        except sa.exc.SQLAlchemyError as exc:
            raise DatasetError(str(exc).splitlines()[0][:500])
        column_names = list(result.keys())
        rows = result.fetchmany(settings.DATASET_QUERY_MAX_ROWS + 1)
        truncated = len(rows) > settings.DATASET_QUERY_MAX_ROWS
        rows = rows[:settings.DATASET_QUERY_MAX_ROWS]
    finally:
        await session.rollback()
    serialised = [[_to_jsonable(v) for v in row] for row in rows]
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

async def schema_summary_for_prompt(session: AsyncSession) -> str:
    lines = ["A shared analytics dataset is available. Available tables:"]
    for table_name, meta in DATASET_TABLES.items():
        try:
            cols = await _table_columns(session, table_name)
        except UnknownTable:
            lines.append(
                f'- `{table_name}` ("{meta["friendly_name"]}"): not yet loaded.'
            )
            continue
        col_list = ", ".join(f"{c['name']} ({c['type']})" for c in cols)
        lines.append(
            f'- `{table_name}` ("{meta["friendly_name"]}", '
            f"source sheet: {meta['sheet_name']}): {col_list}"
        )
    lines.append(
        "\nUse the `run_dataset_sql` tool to query these tables (PostgreSQL dialect). "
        f"Results are capped at {settings.DATASET_QUERY_MAX_ROWS} rows — use LIMIT or "
        "aggregation for large queries. Only SELECT statements are accepted."
    )
    return "\n".join(lines)


RUN_DATASET_SQL_TOOL = {
    "name": "run_dataset_sql",
    "description": (
        "Execute a read-only SQL query against the shared analytics dataset "
        "(PostgreSQL). Returns up to 1000 rows; use LIMIT or aggregation for "
        "large tables. The available tables and columns are described in the "
        "system prompt. Only SELECT-shaped queries are permitted."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "SQL query to execute."},
        },
        "required": ["query"],
    },
}
