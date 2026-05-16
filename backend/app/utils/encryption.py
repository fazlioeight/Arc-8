"""Field-level encryption for at-rest secrets (FhirConnector.client_secret, etc).

The key comes from settings.FIELD_ENCRYPTION_KEY (a Fernet key — 32 url-safe
base64 bytes). In production the deploy script supplies it via Key Vault. In
development / tests, a key is generated and persisted via env var.

A SQLAlchemy TypeDecorator (`EncryptedString`) is exposed so the column can be
swapped in transparently without touching call sites.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from sqlalchemy.types import String, TypeDecorator

from ..core.config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _fernet() -> Optional[MultiFernet]:
    raw = settings.FIELD_ENCRYPTION_KEY
    if not raw:
        return None
    # Comma-separated key list supports rotation: writers use the first key,
    # readers try every key. Add new key first, deploy, re-encrypt, then remove
    # the old key from the tail.
    keys = [k.strip() for k in raw.split(",") if k.strip()]
    if not keys:
        return None
    try:
        return MultiFernet([Fernet(k.encode("utf-8") if isinstance(k, str) else k) for k in keys])
    except Exception:
        logger.exception("Failed to initialize Fernet; FIELD_ENCRYPTION_KEY may be malformed")
        return None


def encrypt_text(plain: Optional[str]) -> Optional[str]:
    if plain is None:
        return None
    f = _fernet()
    if not f:
        if settings.is_production:
            raise RuntimeError("FIELD_ENCRYPTION_KEY is not configured; cannot encrypt sensitive field in production")
        return plain
    return f.encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_text(blob: Optional[str]) -> Optional[str]:
    if blob is None:
        return None
    f = _fernet()
    if not f:
        return blob
    try:
        return f.decrypt(blob.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        # Pre-encryption rows: return as-is so reads don't blow up during
        # migration. New writes always go through encrypt_text.
        return blob


class EncryptedString(TypeDecorator):
    """Transparent column-level Fernet encryption."""

    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):  # type: ignore[override]
        return encrypt_text(value)

    def process_result_value(self, value, dialect):  # type: ignore[override]
        return decrypt_text(value)
