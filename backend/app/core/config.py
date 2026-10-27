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
    # Legacy/default JWT lifetime, still used by identity-only staff tokens.
    JWT_EXPIRES_MINUTES: int = 60
    # User-facing access tokens are short-lived (HIPAA-aligned 15 min) and
    # paired with rotating refresh tokens (see app.utils.security). The refresh
    # token has a sliding idle window (session dies after this many minutes of
    # inactivity) bounded by an absolute max session lifetime.
    ACCESS_TOKEN_EXPIRES_MINUTES: int = 15
    REFRESH_TOKEN_IDLE_MINUTES: int = 30
    REFRESH_TOKEN_MAX_LIFETIME_MINUTES: int = 12 * 60
    # When True, every PHI route requires the caller to have completed MFA
    # (require_mfa dependency hard-fails otherwise). Defaults False so existing
    # non-enrolled users aren't locked out; flip to True once enrollment is
    # complete. See SECURITY.md.
    REQUIRE_PHI_MFA: bool = False

    CORS_ORIGINS: Annotated[List[AnyHttpUrl], NoDecode] = ["http://localhost:3000"]

    CONTROL_DATABASE_URL: str = "postgresql+asyncpg://nexora_control:nexora_control@localhost:5432/nexora_control"
    TENANT_DATABASE_URL_TEMPLATE: Optional[str] = None
    DEFAULT_TENANT_DATABASE_URL: Optional[str] = "postgresql+asyncpg://nexora_control:nexora_control@localhost:5432/prominence_tenant"
    TENANT_DATABASE_SCHEMA_TEMPLATE: Optional[str] = None
    TENANT_CONNECTION_CACHE_SIZE: int = 32

    REDIS_URL: Optional[str] = None

    USAGE_DAILY_LIMIT: int = 10000

    LOGIN_LOCKOUT_MAX_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_WINDOW_SECONDS: int = 15 * 60

    # ── HTTP rate limiting ────────────────────────────────────────────────
    # Enforced by app.middleware.rate_limit (global, per-IP) and the
    # auth_rate_limit / phi_rate_limit dependencies. Redis-backed when
    # REDIS_URL is set; otherwise a per-process in-memory fallback (sufficient
    # for dev/test, fails open if the backing store errors).
    RATE_LIMIT_ENABLED: bool = True
    GLOBAL_RATE_LIMIT_PER_MINUTE: int = 100  # per client IP, all routes
    AUTH_RATE_LIMIT_PER_MINUTE: int = 5      # per client IP, login/reset
    PHI_RATE_LIMIT_PER_MINUTE: int = 30      # per authenticated user, PHI routes

    REQUIRE_ADMIN_MFA: bool = True
    MFA_ISSUER: str = "Nexora Lab"

    # ── Member-facing portal (Feature 1+) ─────────────────────────────────
    # Public base URL of the white-labeled member portal SPA, used to build
    # email-verification / password-reset links. Optional in dev.
    MEMBER_PORTAL_BASE_URL: Optional[str] = None
    MEMBER_EMAIL_VERIFICATION_TTL_MINUTES: int = 24 * 60
    MEMBER_PASSWORD_RESET_TTL_MINUTES: int = 60

    # Dedicated signing key for the member-portal JWT realm. When unset it falls
    # back to SECRET_KEY (backward compatible); set it (per deployment, from Key
    # Vault) so a compromise of member-token signing can never mint staff tokens.
    MEMBER_JWT_SECRET_KEY: Optional[str] = None

    # Shared secret the member edge (BFF) presents on every proxied request as
    # the ``X-Edge-Auth`` header. When set, the backend rejects any /api/member/*
    # request that lacks it — so member routes are reachable ONLY via the edge,
    # not the backend's public FQDN. Dormant (no enforcement) when unset, so the
    # backend can be deployed before the edge starts sending it.
    MEMBER_EDGE_SHARED_SECRET: Optional[str] = None
    # Lifetime of a signed document-download grant (capability token in the URL).
    # Deliberately short: it is minted on demand right before the download.
    MEMBER_DOC_GRANT_TTL_SECONDS: int = 120

    # Provider search (Feature 6). Server-side Geocoding key NEVER leaves the
    # backend; the browser Maps/Places key is public but must be HTTP-referrer
    # restricted in the Google console. PRIVACY: only provider addresses and the
    # member-entered search location are ever sent to Google — never member PHI.
    GOOGLE_GEOCODING_API_KEY: Optional[str] = None
    GOOGLE_MAPS_BROWSER_KEY: Optional[str] = None
    PROVIDER_SEARCH_DEFAULT_RADIUS_MILES: float = 25.0
    PROVIDER_SEARCH_MAX_CANDIDATES: int = 2000

    FIELD_ENCRYPTION_KEY: Optional[str] = None

    ALLOWED_TENANT_HOSTS: Dict[str, str] = {}
    CANONICAL_HOST_DOMAIN: Optional[str] = None

    AUDIT_LOG_PATH: str = "logs/audit.log"
    # Append-only PHI access/mutation trail. Kept on a SEPARATE path from the
    # general audit log and never written to an editable DB table — see
    # app.utils.phi_audit. In production this path should sit on a WORM /
    # immutable-blob mount and be shipped to Azure Monitor.
    PHI_AUDIT_LOG_PATH: str = "logs/phi_audit.log"
    # HIPAA §164.316(b)(2): documentation must be retained 6 years from the
    # date of creation or last effective use. We treat audit events the same.
    AUDIT_LOG_RETENTION_DAYS: int = 365 * 6
    LOG_LEVEL: str = "INFO"
    METRICS_NAMESPACE: str = "nexora"

    S3_BUCKET_PREFIX: Optional[str] = None
    BACKGROUND_QUEUE_URL: Optional[str] = None

    # Member360 document upload. Each tenant gets its own subtree of the
    # storage root (``local``) or its own container (``azure``) so two
    # tenants can never see one another's files. ``s3`` / ``gcs`` are
    # reserved but unimplemented.
    MEMBER360_STORAGE_BACKEND: str = "local"
    MEMBER360_STORAGE_ROOT: str = "data/member360"
    MEMBER360_STORAGE_MAX_UPLOAD_MB: int = 25

    # AWS S3 Document Storage (Target AWS Architecture)
    AWS_REGION: str = "us-east-1"
    AWS_S3_BUCKET: Optional[str] = None
    AWS_S3_PREFIX: str = "m360/"
    AWS_S3_KMS_KEY_ID: Optional[str] = None
    AWS_S3_ENDPOINT_URL: Optional[str] = None  # For LocalStack or custom endpoints

    # Azure Blob backend (legacy/optional). Auth is via DefaultAzureCredential.
    AZURE_STORAGE_ACCOUNT_NAME: Optional[str] = None
    AZURE_STORAGE_CONTAINER_PREFIX: str = "m360-"

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

    # Chat artifacts (PPTX/DOCX/PDF produced by the `build_artifact` tool).
    # Lives next to the workbook data so the deployment only mounts one
    # writable volume for the chat module. Tokens piggyback on JWT_ALGORITHM
    # and SECRET_KEY — no separate signing key to rotate.
    CHAT_ARTIFACT_DIR: str = "data/chat_artifacts"
    CHAT_ARTIFACT_MAX_BYTES: int = 50 * 1024 * 1024
    CHAT_ARTIFACT_MAX_PER_USER: int = 50
    CHAT_ARTIFACT_TTL_SECONDS: int = 24 * 60 * 60
    CHAT_ARTIFACT_DOWNLOAD_TTL_SECONDS: int = 60 * 60

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


    # ── Transactional email ──────────────────────────────────────────────────
    # Outbound mail for non-PHI notifications such as the marketing contact
    # form. Provider precedence: SendGrid (when SENDGRID_API_KEY is set) → SMTP
    # (when SMTP_HOST is set) → no-op. With no provider configured the sender
    # degrades to logging the message in non-production and raising in
    # production — mirroring the deliberately stubbed password-reset email path.
    #
    # SendGrid v3 Web API (preferred). EMAIL_FROM must be a SendGrid-verified
    # sender identity. The API key only needs the "Mail Send" scope.
    SENDGRID_API_KEY: Optional[str] = None
    # SMTP relay (fallback / alternative — also works with SendGrid's relay).
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_USE_TLS: bool = True
    # From address for outbound mail. Falls back to SMTP_USERNAME when unset.
    EMAIL_FROM: Optional[str] = None
    # Destination inbox for marketing contact-form submissions.
    CONTACT_INBOX_EMAIL: str = "contact@nexoralab.co"

    HIPAA_MODE: bool = True
    ALLOW_DUMMY_LOGIN: bool = False

    AZURE_AUTH_ENABLED: bool = False
    AZURE_TENANT_ID: Optional[str] = None
    AZURE_CLIENT_ID: Optional[str] = None
    AZURE_CLIENT_SECRET: Optional[str] = None
    AZURE_AUTHORITY_HOST: str = "https://login.microsoftonline.com"
    AZURE_AUTH_SCOPES: str = "openid profile email"

    # ── OIDC / SSO Configuration (AWS Cognito / Standard OIDC) ──────────────
    OIDC_AUTH_ENABLED: bool = True
    OIDC_ISSUER_URL: Optional[str] = None  # e.g. "https://cognito-idp.us-east-1.amazonaws.com/{user_pool_id}"
    OIDC_CLIENT_ID: Optional[str] = None
    OIDC_CLIENT_SECRET: Optional[str] = None
    OIDC_JWKS_URL: Optional[str] = None
    OIDC_ALGORITHMS: List[str] = ["RS256"]
    OIDC_AUDIENCE: Optional[str] = None
    OIDC_GROUPS_CLAIM: str = "cognito:groups"
    OIDC_SCOPES: str = "openid profile email"

    # Canonical IdP group to role mapping for deny-by-default access control
    IDP_GROUP_ROLE_MAPPING: Dict[str, str] = {
        "Prominence_Care_Coordinators": "coordinator",
        "Prominence_Clinical_Supervisors": "supervisor",
        "Prominence_Business_Admins": "business_admin",
        "Prominence_Compliance_Auditors": "compliance_auditor",
        "Prominence_Administrators": "admin",
        "Care_Coordinators": "coordinator",
        "Clinical_Supervisors": "supervisor",
        "Business_Admins": "business_admin",
        "Compliance_Auditors": "compliance_auditor",
        "Administrators": "admin",
        "coordinators": "coordinator",
        "supervisors": "supervisor",
        "business_admins": "business_admin",
        "compliance_auditors": "compliance_auditor",
        "administrators": "admin",
        "admin": "admin",
    }

    # Allowed values for Tenant.data_residency. HIPAA BAAs and EU sovereignty
    # requirements forbid moving PHI across geographies, so this is the
    # canonical allowlist tenant provisioning checks against. Override with
    # ALLOWED_DATA_RESIDENCIES env var (comma-separated) when expanding.
    ALLOWED_DATA_RESIDENCIES: List[str] = ["us", "us-east-1", "us-west-2", "eu", "eu-west-1"]
    DEFAULT_DATA_RESIDENCY: str = "us"

    # ── AI semantic layer (Azure-native) ─────────────────────────────────────
    # All endpoints below resolve to private-endpoint FQDNs in production. Auth
    # is via DefaultAzureCredential — never an account key or connection
    # string — so secrets here are limited to non-credential identifiers.
    #
    # Azure OpenAI: used for embeddings (and optionally chat). The chat path
    # continues to use Anthropic by default (per architecture decision
    # 2026-05-19) but the embeddings path is non-negotiable Azure OpenAI
    # because AI Search vectorization integrations expect it.
    AZURE_OPENAI_ENDPOINT: Optional[str] = None  # e.g. "https://nexora-oai.openai.azure.com"
    AZURE_OPENAI_API_VERSION: str = "2024-10-21"
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT: str = "text-embedding-3-large"
    AZURE_OPENAI_EMBEDDING_DIMENSIONS: int = 3072
    # Tokens per minute we'll send to the embedding endpoint. Embedding-3-large
    # is rate-limited at 350k TPM on default deployments; stay well under so
    # bulk backfills don't starve live ingestion.
    AZURE_OPENAI_EMBEDDING_TPM_BUDGET: int = 250_000

    # Azure AI Search: hybrid (BM25 + vector) retrieval.
    AZURE_SEARCH_ENDPOINT: Optional[str] = None  # e.g. "https://nexora-search.search.windows.net"
    AZURE_SEARCH_MEMBERS_INDEX: str = "idx-members-v1"
    AZURE_SEARCH_DOCUMENTS_INDEX: str = "idx-documents-v1"
    AZURE_SEARCH_DEFAULT_TOP_K: int = 8

    # Cosmos DB: event snapshots, computed features, semantic objects.
    AZURE_COSMOS_ENDPOINT: Optional[str] = None  # e.g. "https://nexora-cosmos.documents.azure.com:443/"
    AZURE_COSMOS_DATABASE: str = "nexora"
    AZURE_COSMOS_SNAPSHOTS_CONTAINER: str = "event_snapshots"
    AZURE_COSMOS_SEMANTIC_MEMBER_CONTAINER: str = "semantic_member"
    AZURE_COSMOS_RAG_CHUNKS_CONTAINER: str = "rag_chunks"

    # Event Hub: CDC + domain events fan-out.
    AZURE_EVENT_HUB_NAMESPACE: Optional[str] = None  # FQDN, e.g. "nexora-eh.servicebus.windows.net"
    AZURE_EVENT_HUB_MEMBERS_TOPIC: str = "nexora.member.changed.v1"
    AZURE_EVENT_HUB_CONSUMER_GROUP_RAG: str = "rag-processor"
    # Outbox publisher polling cadence + batch size. A 1s poll keeps p99 lag
    # under 2s for low-traffic tenants; high-traffic tenants typically have
    # multiple rows ready each tick, so batches are bounded to avoid Event
    # Hub message-size limits (1 MB per batch on Standard tier).
    EVENT_OUTBOX_POLL_INTERVAL_SECONDS: float = 1.0
    EVENT_OUTBOX_BATCH_SIZE: int = 100

    # AI assistant rate-limits — separate from chat (which has its own).
    # Healthcare context: lower default than chat because each RAG call hits
    # a third-party LLM with PHI, which we want to limit aggressively.
    AI_ASK_RATE_LIMIT_PER_MINUTE: int = 10
    AI_ASK_MAX_QUESTION_CHARS: int = 1_000
    AI_ASK_MAX_CONTEXT_CHUNKS: int = 8

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


# Variables that MUST be present (non-default, non-placeholder) before the app
# is allowed to serve traffic in production. SECRET_KEY / FIELD_ENCRYPTION_KEY
# are already enforced by field validators at construction time; this check
# covers the rest and fails fast with one clear message instead of surfacing
# as obscure runtime errors later.
_REQUIRED_IN_PRODUCTION = ("CONTROL_DATABASE_URL",)
# Strongly recommended in production; their absence degrades a security control
# (rate limiting, account lockout, and token revocation all fall back to a
# weaker per-process mode without Redis) so we log a loud warning.
_RECOMMENDED_IN_PRODUCTION = ("REDIS_URL", "CORS_ORIGINS")


def assert_required_settings(s: Optional[Settings] = None) -> None:
    """Fail fast on boot if required configuration is missing in production.

    Raises ``RuntimeError`` listing every missing required variable. No-op
    outside production so local/test runs keep working with defaults.
    """
    import logging

    s = s or get_settings()
    if not s.is_production:
        return

    missing = [name for name in _REQUIRED_IN_PRODUCTION if not getattr(s, name, None)]
    if missing:
        raise RuntimeError(
            "Missing required environment variables in production: " + ", ".join(sorted(missing))
        )

    log = logging.getLogger("nexora.config")
    for name in _RECOMMENDED_IN_PRODUCTION:
        if not getattr(s, name, None):
            log.warning(
                "Recommended setting %s is not configured; a security control is running in a degraded fallback mode",
                name,
            )


settings = get_settings()
