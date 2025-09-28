from __future__ import annotations

import json
import secrets
from functools import lru_cache
from typing import Dict, List, Optional

from pydantic import AnyHttpUrl, field_validator, ValidationInfo
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration with sensible defaults for local development."""

    ENVIRONMENT: str = "development"
    SECRET_KEY: Optional[str] = None
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRES_MINUTES: int = 60

    CORS_ORIGINS: List[AnyHttpUrl] = ["http://localhost:3000"]

    CONTROL_DATABASE_URL: str = "sqlite+aiosqlite:///./nexora_control.db"
    TENANT_DATABASE_URL_TEMPLATE: Optional[str] = None
    DEFAULT_TENANT_DATABASE_URL: Optional[str] = "sqlite+aiosqlite:///./tenants/{tenant_key}.db"
    TENANT_DATABASE_SCHEMA_TEMPLATE: Optional[str] = None

    REDIS_URL: Optional[str] = None
    RATE_LIMIT_MAX_PER_MINUTE: int = 600
    RATE_LIMIT_BURST: int = 120
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    RATE_LIMIT_STORAGE_KEY_PREFIX: str = "nexora:tenant:rate:"

    USAGE_DAILY_LIMIT: int = 10000

    ALLOWED_TENANT_HOSTS: Dict[str, str] = {}
    CANONICAL_HOST_DOMAIN: Optional[str] = None

    AUDIT_LOG_PATH: str = "logs/audit.log"
    LOG_LEVEL: str = "INFO"
    METRICS_NAMESPACE: str = "nexora"

    S3_BUCKET_PREFIX: Optional[str] = None
    BACKGROUND_QUEUE_URL: Optional[str] = None

    FEATURE_FLAG_DEFAULTS: Dict[str, bool] = {"analytics": True}

    PORTAL_APPLICATIONS: Dict[str, Dict[str, str]] = {
        "portal": {"label": "Nexora Portal", "description": "Metrics & insights"},
        "coding": {"label": "Coding Worklists", "description": "Member reviews"},
        "ride_booking": {"label": "Ride Booking", "description": "Transportation"},
        "dashboard": {"label": "Dashboard", "description": "Analytics view"},
        "docs": {"label": "Docs Library", "description": "Knowledge base"},
        "settings": {"label": "Settings", "description": "Preferences"},
        "admin_console": {"label": "Master Admin", "description": "Roles & access"},
    }


    HIPAA_MODE: bool = True
    ALLOW_DUMMY_LOGIN: bool = False

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
        if env == "production" and v.startswith("CHANGE_ME"):
            raise ValueError("SECRET_KEY must be rotated for production")
        return v

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
