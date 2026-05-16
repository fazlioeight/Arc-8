from __future__ import annotations

import json
import secrets
from functools import lru_cache
from typing import Annotated, Dict, List, Optional

from pydantic import AnyHttpUrl, field_validator, ValidationInfo
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration with sensible defaults for local development."""

    ENVIRONMENT: str = "development"
    SECRET_KEY: Optional[str] = None
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRES_MINUTES: int = 60

    CORS_ORIGINS: Annotated[List[AnyHttpUrl], NoDecode] = ["http://localhost:3000"]

    CONTROL_DATABASE_URL: str = "postgresql+asyncpg://nexora_control:nexora_control@localhost:5432/nexora_control"
    TENANT_DATABASE_URL_TEMPLATE: Optional[str] = None
    DEFAULT_TENANT_DATABASE_URL: Optional[str] = "postgresql+asyncpg://nexora_control:nexora_control@localhost:5432/prominence_tenant"
    TENANT_DATABASE_SCHEMA_TEMPLATE: Optional[str] = None
    TENANT_CONNECTION_CACHE_SIZE: int = 32

    REDIS_URL: Optional[str] = None
    RATE_LIMIT_MAX_PER_MINUTE: int = 600
    RATE_LIMIT_BURST: int = 120
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    RATE_LIMIT_STORAGE_KEY_PREFIX: str = "nexora:tenant:rate:"

    USAGE_DAILY_LIMIT: int = 10000

    LOGIN_LOCKOUT_MAX_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_WINDOW_SECONDS: int = 15 * 60

    REQUIRE_ADMIN_MFA: bool = True
    MFA_ISSUER: str = "Nexora Lab"

    FIELD_ENCRYPTION_KEY: Optional[str] = None

    ALLOWED_TENANT_HOSTS: Dict[str, str] = {}
    CANONICAL_HOST_DOMAIN: Optional[str] = None

    AUDIT_LOG_PATH: str = "logs/audit.log"
    # HIPAA §164.316(b)(2): documentation must be retained 6 years from the
    # date of creation or last effective use. We treat audit events the same.
    AUDIT_LOG_RETENTION_DAYS: int = 365 * 6
    LOG_LEVEL: str = "INFO"
    METRICS_NAMESPACE: str = "nexora"

    S3_BUCKET_PREFIX: Optional[str] = None
    BACKGROUND_QUEUE_URL: Optional[str] = None

    FEATURE_FLAG_DEFAULTS: Dict[str, bool] = {"analytics": True}

    PORTAL_APPLICATIONS: Dict[str, Dict[str, str]] = {
        "portal": {"label": "Nexora Lab", "description": "Metrics & insights"},
        "coding": {"label": "Coding Worklists", "description": "Member reviews"},
        "member360": {"label": "Member 360", "description": "Unified member search"},
        "ride_booking": {"label": "Ride Booking", "description": "Transportation"},
        "dashboard": {"label": "Dashboard", "description": "Analytics view"},
        "job_center": {"label": "Job Center", "description": "Imports and background jobs"},
        "docs": {"label": "Docs Library", "description": "Knowledge base"},
        "settings": {"label": "Settings", "description": "Preferences"},
        "admin_console": {"label": "Master Admin", "description": "Roles & access"},
        "chat": {"label": "Nexora Chat", "description": "Claude-powered assistant"},
    }

    ANTHROPIC_API_KEY: Optional[str] = None
    CLAUDE_MODEL: str = "claude-sonnet-4-6"
    CHAT_MAX_UPLOAD_MB: int = 500
    CHAT_MAX_EXTRACTED_CHARS: int = 500_000
    CHAT_RATE_LIMIT_PER_MINUTE: int = 20
    CHAT_FILE_RATE_LIMIT_PER_MINUTE: int = 10
    CHAT_WORKBOOK_RATE_LIMIT_PER_MINUTE: int = 5

    WORKBOOK_DATA_DIR: str = "data/workbooks"
    WORKBOOK_MAX_BYTES: int = 1024 * 1024 * 1024
    WORKBOOK_MAX_PER_USER: int = 10
    WORKBOOK_USER_QUOTA_BYTES: int = 4 * 1024 * 1024 * 1024
    WORKBOOK_TTL_SECONDS: int = 30 * 24 * 60 * 60
    WORKBOOK_QUERY_TIMEOUT_SECONDS: int = 10
    WORKBOOK_QUERY_MAX_ROWS: int = 1000
    WORKBOOK_QUERY_MEMORY_LIMIT: str = "1GB"
    WORKBOOK_MAX_TOOL_ITERATIONS: int = 8
    WORKBOOK_INGEST_CONCURRENCY: int = 2

    DATASET_SCHEMA: str = "analytics"
    DATASET_QUERY_TIMEOUT_SECONDS: int = 10
    DATASET_QUERY_MAX_ROWS: int = 1000
    DATASET_MAX_TOOL_ITERATIONS: int = 8
    DATASET_MAX_INGEST_ROWS: int = 5_000_000
    DATASET_INGEST_BATCH_SIZE: int = 1_000
    DATASET_ADMIN_EMAILS: List[str] = []


    HIPAA_MODE: bool = True
    ALLOW_DUMMY_LOGIN: bool = False

    AZURE_AUTH_ENABLED: bool = False
    AZURE_TENANT_ID: Optional[str] = None
    AZURE_CLIENT_ID: Optional[str] = None
    AZURE_CLIENT_SECRET: Optional[str] = None
    AZURE_AUTHORITY_HOST: str = "https://login.microsoftonline.com"
    AZURE_AUTH_SCOPES: str = "openid profile email"

    # Allowed values for Tenant.data_residency. HIPAA BAAs and EU sovereignty
    # requirements forbid moving PHI across geographies, so this is the
    # canonical allowlist tenant provisioning checks against. Override with
    # ALLOWED_DATA_RESIDENCIES env var (comma-separated) when expanding.
    ALLOWED_DATA_RESIDENCIES: List[str] = ["us", "us-east-1", "us-west-2", "eu", "eu-west-1"]
    DEFAULT_DATA_RESIDENCY: str = "us"

    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("SECRET_KEY", mode="after")
    @classmethod
    def validate_secret_key(cls, v: Optional[str], info: ValidationInfo) -> str:
        env = (info.data.get("ENVIRONMENT") if info and info.data else "development").lower()
        if not v:
            if env == "production":
                raise ValueError("SECRET_KEY must be provided via environment in production")
            return secrets.token_urlsafe(48)
        if env == "production":
            if v.startswith("CHANGE_ME"):
                raise ValueError("SECRET_KEY must be rotated for production")
            if len(v.encode("utf-8")) < 32:
                raise ValueError("SECRET_KEY must be at least 32 bytes in production (RFC 7518 §3.2)")
        return v

    @field_validator("ALLOW_DUMMY_LOGIN", mode="after")
    @classmethod
    def reject_dummy_login_in_prod(cls, v: bool, info: ValidationInfo) -> bool:
        env = (info.data.get("ENVIRONMENT") if info and info.data else "development").lower()
        if v and env == "production":
            raise ValueError("ALLOW_DUMMY_LOGIN must be False in production")
        return v

    @field_validator("FIELD_ENCRYPTION_KEY", mode="after")
    @classmethod
    def validate_field_encryption_key(cls, v: Optional[str], info: ValidationInfo) -> Optional[str]:
        env = (info.data.get("ENVIRONMENT") if info and info.data else "development").lower()
        if not v:
            if env == "production":
                raise ValueError(
                    "FIELD_ENCRYPTION_KEY must be provided in production (comma-separated Fernet keys; writers use the first)"
                )
            return None
        # Validate each comma-separated entry is a parseable Fernet key.
        from cryptography.fernet import Fernet
        for entry in (k.strip() for k in v.split(",") if k.strip()):
            try:
                Fernet(entry.encode("utf-8"))
            except Exception as exc:
                raise ValueError(f"FIELD_ENCRYPTION_KEY entry is not a valid Fernet key: {exc}") from exc
        return v


    @field_validator("TENANT_CONNECTION_CACHE_SIZE", mode="after")
    @classmethod
    def validate_tenant_connection_cache_size(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("TENANT_CONNECTION_CACHE_SIZE must be greater than zero")
        return value

    @field_validator("CONTROL_DATABASE_URL", "DEFAULT_TENANT_DATABASE_URL", mode="after")
    @classmethod
    def validate_database_urls(cls, value: Optional[str], info: ValidationInfo) -> Optional[str]:
        env = (info.data.get("ENVIRONMENT") if info and info.data else "development").lower()
        if value and value.startswith("sqlite") and env == "production":
            raise ValueError("SQLite storage is not supported for production workloads; configure a managed database")
        return value

    @field_validator("ALLOWED_DATA_RESIDENCIES", mode="before")
    @classmethod
    def parse_allowed_data_residencies(cls, v):
        if v in (None, "", []):
            return ["us"]
        if isinstance(v, list):
            return [str(x).strip().lower() for x in v if str(x).strip()]
        if isinstance(v, str):
            stripped = v.strip()
            if stripped.startswith("[") and stripped.endswith("]"):
                try:
                    parsed = json.loads(stripped)
                    if isinstance(parsed, list):
                        return [str(x).strip().lower() for x in parsed if str(x).strip()]
                except ValueError:
                    pass
            return [item.strip().lower() for item in stripped.split(",") if item.strip()]
        raise ValueError("Unsupported ALLOWED_DATA_RESIDENCIES value")

    @field_validator("DEFAULT_DATA_RESIDENCY", mode="after")
    @classmethod
    def validate_default_data_residency(cls, v: str, info: ValidationInfo) -> str:
        allowed = (info.data or {}).get("ALLOWED_DATA_RESIDENCIES") or []
        value = (v or "").strip().lower()
        if not value:
            raise ValueError("DEFAULT_DATA_RESIDENCY must be set")
        if allowed and value not in allowed:
            raise ValueError(
                f"DEFAULT_DATA_RESIDENCY '{value}' is not in ALLOWED_DATA_RESIDENCIES {allowed}"
            )
        return value

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        # Accept JSON arrays, comma-separated strings, and bare URLs (with or
        # without stray surrounding brackets). PowerShell + az.exe argument
        # splitting eats inner double quotes, so a JSON env-var of the form
        # ["https://..."] can land in the container as [https://...], which
        # is not valid JSON. Be permissive here so deploy quoting quirks
        # don't crash the worker on boot.
        if v in (None, "", []):
            return []
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            stripped = v.strip()
            if stripped.startswith("[") and stripped.endswith("]"):
                try:
                    return json.loads(stripped)
                except ValueError:
                    inner = stripped[1:-1].strip()
                    if not inner:
                        return []
                    return [item.strip().strip('"').strip("'") for item in inner.split(",") if item.strip()]
            return [item.strip() for item in stripped.split(",") if item.strip()]
        raise ValueError("Unsupported CORS_ORIGINS value")

    @field_validator("ALLOWED_TENANT_HOSTS", mode="before")
    @classmethod
    def parse_allowed_hosts(cls, v, info: ValidationInfo):
        if v in (None, "", {}):
            return {}
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if not isinstance(parsed, dict):
                    raise ValueError
                return parsed
            except ValueError as exc:
                raise ValueError("ALLOWED_TENANT_HOSTS must be valid JSON mapping of host -> tenant_key") from exc
        if isinstance(v, dict):
            return v
        raise ValueError("Unsupported ALLOWED_TENANT_HOSTS value")

    @property
    def redis_enabled(self) -> bool:
        return bool(self.REDIS_URL)

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
