from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Dict, Optional

from sqlalchemy import Boolean, JSON, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.sql import func
import uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from ..utils.encryption import EncryptedString


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
    branding: Mapped[Dict[str, str]] = mapped_column(JSON, default=dict, nullable=False, server_default="{}")
    sso_metadata: Mapped[str | None] = mapped_column(Text, nullable=True)
    phi_data_classification: Mapped[str] = mapped_column(String(64), default="restricted", nullable=False)
    data_residency: Mapped[str | None] = mapped_column(String(64), nullable=True)
    encryption_key_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    users: Mapped[list["User"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    audit_events: Mapped[list["TenantAuditEvent"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    portal_saved_items: Mapped[list["PortalSavedItem"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    portal_todos: Mapped[list["PortalTodo"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    user_preferences: Mapped[list["UserPreference"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    docs_articles: Mapped[list["DocsArticle"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")


class TenantAuditEvent(ControlBase):
    __tablename__ = "tenant_audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    actor: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[str] = mapped_column(String(128), nullable=False)
    payload: Mapped[Dict[str, str]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)

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
    must_change_password: Mapped[bool] = mapped_column(default=False)
    mfa_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    mfa_enrolled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    tenant: Mapped[Tenant] = relationship(back_populates="users")
    portal_saved_items: Mapped[list["PortalSavedItem"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    preferences: Mapped[list["UserPreference"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class StaffUser(ControlBase):
    """Nexora platform employees. Live on the control plane, outside any tenant."""

    __tablename__ = "staff_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mfa_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    mfa_enrolled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class PasswordResetToken(ControlBase):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    requested_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class RefreshToken(ControlBase):
    """Rotating refresh tokens for the bearer-token auth flow.

    Only the SHA-256 hash of the opaque token is stored. Each refresh consumes
    one row (``used_at``) and issues a child sharing the same ``session_id`` so
    a stolen-then-reused token can be detected (reuse of a consumed token
    revokes the whole chain). ``expires_at`` is the sliding idle window;
    ``max_expires_at`` is the absolute session cap.
    """

    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    max_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class FhirConnector(ControlBase):
    __tablename__ = "fhir_connectors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    base_url: Mapped[str] = mapped_column(String(512), nullable=False)
    token_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    client_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Encrypted at rest; ciphertext is longer than plaintext (Fernet base64).
    client_secret: Mapped[str | None] = mapped_column(EncryptedString(1024), nullable=True)
    scopes: Mapped[str | None] = mapped_column(String(512), nullable=True)
    since: Mapped[str | None] = mapped_column(String(64), nullable=True)
    config_metadata: Mapped[Dict[str, str]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

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
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_log: Mapped[list[str]] = mapped_column(JSON, default=list)

    tenant: Mapped[Tenant] = relationship()


class DataImportJob(ControlBase):
    """Unified import job tracking for file uploads, FHIR pulls, and other sources.

    Backs the Job Status Center and Import Data pages. File uploads land here
    with source_type='upload'; FHIR pulls remain in fhir_import_jobs but are
    mirrored to this table so the Job Status Center can show a unified feed.
    """

    __tablename__ = "data_import_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, default="upload", index=True)
    entity: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    file_name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="queued", nullable=False, index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_processed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_failed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    initiated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    job_metadata: Mapped[Dict[str, str]] = mapped_column("metadata", JSON, default=dict)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    tenant: Mapped[Tenant] = relationship()
    logs: Mapped[list["DataImportJobLog"]] = relationship(
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="DataImportJobLog.created_at",
    )


class DataImportJobLog(ControlBase):
    __tablename__ = "data_import_job_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[str] = mapped_column(
        ForeignKey("data_import_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    level: Mapped[str] = mapped_column(String(16), default="info", nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True
    )

    job: Mapped[DataImportJob] = relationship(back_populates="logs")


class PortalSavedItem(ControlBase):
    __tablename__ = "portal_saved_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    app_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    saved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    item_metadata: Mapped[Dict[str, str]] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, onupdate=lambda: datetime.now(timezone.utc)
    )

    tenant: Mapped[Tenant] = relationship(back_populates="portal_saved_items")
    user: Mapped["User | None"] = relationship(back_populates="portal_saved_items")


class PortalTodo(ControlBase):
    __tablename__ = "portal_todos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    app_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    assigned_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    assigned_to: Mapped[str | None] = mapped_column(String(255), nullable=True)
    priority: Mapped[str] = mapped_column(String(32), default="low", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="open", nullable=False)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    item_metadata: Mapped[Dict[str, str]] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, onupdate=lambda: datetime.now(timezone.utc)
    )

    tenant: Mapped[Tenant] = relationship(back_populates="portal_todos")


class UserPreference(ControlBase):
    __tablename__ = "user_preferences"
    __table_args__ = (
        UniqueConstraint("tenant_id", "user_id", "preference_key", name="uq_user_preference_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    preference_key: Mapped[str] = mapped_column(String(128), nullable=False)
    value: Mapped[Dict[str, str]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, onupdate=lambda: datetime.now(timezone.utc)
    )

    tenant: Mapped[Tenant] = relationship(back_populates="user_preferences")
    user: Mapped[User] = relationship(back_populates="preferences")


class DocsArticle(ControlBase):
    __tablename__ = "docs_articles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    app_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(32), default="published", nullable=False, index=True)
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, onupdate=lambda: datetime.now(timezone.utc)
    )

    tenant: Mapped[Tenant] = relationship(back_populates="docs_articles")


class IcdCode(ControlBase):
    """Reference table mapping ICD-10 codes to HCC model categories."""

    __tablename__ = "icd_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(12), unique=True, nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    hcc_code: Mapped[Optional[str]] = mapped_column(String(12), nullable=True, index=True)
    hcc_label: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    alternatives: Mapped[list] = mapped_column(JSON, default=list)
    notes: Mapped[list] = mapped_column(JSON, default=list)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


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

