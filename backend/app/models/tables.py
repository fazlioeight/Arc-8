from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Dict

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.sql import func
import uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class ControlBase(DeclarativeBase):
    """Metadata schema for control-plane tables (tenants, users, audits)."""

    pass


class TenantDataBase(DeclarativeBase):
    """Base class for per-tenant data tables, deployed into tenant databases/schemas."""

    pass


class Tenant(ControlBase):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    region: Mapped[str | None] = mapped_column(String(64), nullable=True)
    db_connection_uri: Mapped[str] = mapped_column(String(512), nullable=False)
    db_schema: Mapped[str | None] = mapped_column(String(128), nullable=True)
    billing_plan: Mapped[str] = mapped_column(String(64), default="standard", nullable=False)
    feature_flags: Mapped[Dict[str, bool]] = mapped_column(JSON, default=dict)
    purchased_applications: Mapped[Dict[str, bool]] = mapped_column(JSON, default=dict)
    sso_metadata: Mapped[str | None] = mapped_column(Text, nullable=True)
    phi_data_classification: Mapped[str] = mapped_column(String(64), default="restricted", nullable=False)
    data_residency: Mapped[str | None] = mapped_column(String(64), nullable=True)
    encryption_key_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    users: Mapped[list["User"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    audit_events: Mapped[list["TenantAuditEvent"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")


class TenantAuditEvent(ControlBase):
    __tablename__ = "tenant_audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    actor: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[str] = mapped_column(String(128), nullable=False)
    payload: Mapped[Dict[str, str]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    tenant: Mapped[Tenant] = relationship(back_populates="audit_events")


class User(ControlBase):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(64), default="user")
    app_permissions: Mapped[Dict[str, str]] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    tenant: Mapped[Tenant] = relationship(back_populates="users")


class FhirConnector(ControlBase):
    __tablename__ = "fhir_connectors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    base_url: Mapped[str] = mapped_column(String(512), nullable=False)
    token_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    client_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    client_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)
    scopes: Mapped[str | None] = mapped_column(String(512), nullable=True)
    since: Mapped[str | None] = mapped_column(String(64), nullable=True)
    config_metadata: Mapped[Dict[str, str]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    tenant: Mapped[Tenant] = relationship()


class FhirImportJob(ControlBase):
    __tablename__ = "fhir_import_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    connector_id: Mapped[int | None] = mapped_column(ForeignKey("fhir_connectors.id", ondelete="SET NULL"), nullable=True)
    base_url: Mapped[str] = mapped_column(String(512), nullable=False)
    token_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    scopes: Mapped[str | None] = mapped_column(String(512), nullable=True)
    since: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resources: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(32), default="queued", nullable=False)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_log: Mapped[list[str]] = mapped_column(JSON, default=list)

    tenant: Mapped[Tenant] = relationship()


class Member(TenantDataBase):
    __tablename__ = "members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    member_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Claim(TenantDataBase):
    __tablename__ = "claims"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    member_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    service_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

