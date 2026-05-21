"""Tenant-data dataset, read-only.

The chat dataset tool runs SELECT-only queries against the tenant's
operational tables (Member360 + Coding — see ``dataset_registry.py``).
Tables are introspected live from ``information_schema`` so the registry
only carries the friendly name + a description that ships in the system
prompt; column types are always current.

This module is intentionally read-only. There is no ingestion path,
no truncate, no admin upload. The only way data enters the tables
listed here is via the application's normal mutation paths (Member360
APIs, coding worklists, etc.). The route layer therefore does NOT expose
a load endpoint; the SELECT-only guard below is a defence-in-depth
safety net on top of that.

A future hardening pass should give each tenant a separate read-only DB
role for chat queries so DDL/DML can't run even if the SELECT-only check
is bypassed.
"""

from __future__ import annotations

import logging
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import settings
from .dataset_registry import DATASET_TABLES


logger = logging.getLogger("nexora.chat.dataset")


class DatasetError(Exception):
    """Base class for dataset-layer failures (introspection or query)."""


class UnknownTable(DatasetError):
    """The table is not in DATASET_TABLES, or the registry table doesn't
    exist in this tenant's database yet (i.e. the migration hasn't run)."""


# ── Schema introspection ────────────────────────────────────────────────────


async def _table_columns(session: AsyncSession, table_name: str) -> list[dict]:
    """Return ``[{name, type}, ...]`` for the given table.

    Raises ``UnknownTable`` if the table is not in the registry (defensive)
    or if it isn't present in this tenant's DB (migration drift).
    """
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
            "tenant's database. Run the latest tenant migration."
        )
    return [{"name": r[0], "type": r[1]} for r in rows]


async def list_tables(session: AsyncSession) -> list[dict]:
    """Sidebar / modal data: which tables can chat query, with row counts.

    Tables that exist in the registry but not in this tenant's DB are
    returned with ``columns=[]`` and ``row_count=None`` so the UI can flag
    them as "not provisioned" without breaking the list.
    """
    out: list[dict] = []
    for table_name, meta in DATASET_TABLES.items():
        try:
            cols = await _table_columns(session, table_name)
            count = (
                await session.execute(sa.text(f'SELECT COUNT(*) FROM "{table_name}"'))
            ).scalar_one()
        except (UnknownTable, sa.exc.SQLAlchemyError):
            cols = []
            count = None
        out.append(
            {
                "table_name": table_name,
                "friendly_name": meta["friendly_name"],
                "description": meta.get("description") or "",
                "columns": cols,
                "row_count": count,
            }
        )
    return out


# ── Read-only query execution ───────────────────────────────────────────────


# Keywords that, if found as the first non-whitespace token, disqualify a
# query. This is the application-layer first line of defence; the real
# safety belongs to a read-only DB role, which is on the Week-2 hardening
# backlog. Until then, the explicit-keyword block plus the ``ROLLBACK``
# in run_sql means even a creative bypass can't persist writes.
_FORBIDDEN_LEADING = (
    "insert", "update", "delete", "drop", "truncate", "alter", "create",
    "grant", "revoke", "copy", "vacuum", "analyze", "comment",
)


def _is_select_only(query: str) -> bool:
    stripped = query.lstrip().lower()
    if not stripped:
        return False
    for kw in _FORBIDDEN_LEADING:
        if stripped.startswith(kw):
            return False
    return True


async def run_sql(session: AsyncSession, query: str, user: str) -> dict:
    """Execute a SELECT-only query and return ``{columns, rows, truncated,
    row_count}``.

    The session is rolled back unconditionally at the end so any side
    effects (which shouldn't be possible given the prefix check above, but
    defence-in-depth) are reverted even on the happy path.
    """
    if not _is_select_only(query):
        raise DatasetError("Only SELECT queries are allowed against the dataset.")
    logger.info(
        "dataset_sql",
        extra={"user": user, "query_len": len(query)},
    )
    try:
        # Best-effort statement timeout. SQLite (tests) doesn't support it;
        # that's fine — the tests don't run large queries.
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
        rows = rows[: settings.DATASET_QUERY_MAX_ROWS]
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
    """Block that gets concatenated to the chat system prompt when the user
    has dataset mode enabled.

    Includes each table's friendly name, a short description, and the live
    column list so Claude can write SELECTs without column-name guessing.
    """
    lines = [
        "The tenant's operational data is available for read-only SQL queries. "
        "Use the `run_dataset_sql` tool. Available tables:"
    ]
    for table_name, meta in DATASET_TABLES.items():
        description = meta.get("description") or ""
        try:
            cols = await _table_columns(session, table_name)
        except UnknownTable:
            lines.append(
                f'- `{table_name}` ("{meta["friendly_name"]}"): table not yet '
                "present in this tenant's database."
            )
            continue
        col_list = ", ".join(f"{c['name']} ({c['type']})" for c in cols)
        lines.append(
            f'- `{table_name}` ("{meta["friendly_name"]}"): {description} '
            f"Columns: {col_list}"
        )
    lines.append(
        "\nDialect: PostgreSQL. Only SELECT statements are accepted. "
        f"Results are capped at {settings.DATASET_QUERY_MAX_ROWS} rows — use "
        "LIMIT or aggregation for large queries. The data is multi-tenant "
        "isolated by connection; you do not need a tenant_id filter."
    )
    return "\n".join(lines)


RUN_DATASET_SQL_TOOL = {
    "name": "run_dataset_sql",
    "description": (
        "Execute a read-only SQL query against the tenant's operational data "
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
