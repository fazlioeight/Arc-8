from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Dict

from sqlalchemy import (
    JSON,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
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

