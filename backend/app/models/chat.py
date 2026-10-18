from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy import BigInteger, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .tables import TenantDataBase


class ChatWorkbook(TenantDataBase):
    """
    Per-tenant chat workbook metadata. Ownership is scoped to (tenant_db, owner_email):
    the tenant DB is the tenant boundary, and `owner_email` is the user boundary inside it.
    A workbook's DuckDB file is keyed by both, so two users in the same tenant cannot
    collide and two tenants cannot share files even if user emails match.
    """

    __tablename__ = "chat_workbooks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    original_filename: Mapped[str] = mapped_column(String(256), nullable=False)
    sheet_schema_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    last_accessed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )


class ChatDatasetLoad(TenantDataBase):
    """
    Per-tenant dataset ingestion history. Records who loaded what, when, and the outcome.
    The actual dataset tables (e.g. analytics.php_claim_details) are managed separately —
    this table is only the audit/progress trail for the loader endpoints.
    """

    __tablename__ = "chat_dataset_loads"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    table_name: Mapped[str] = mapped_column(String(63), nullable=False, index=True)
    mode: Mapped[str] = mapped_column(String(16), nullable=False)
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    row_count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    started_by: Mapped[str] = mapped_column(String(320), nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
