from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from typing import Dict, Optional

from sqlalchemy import select
from sqlalchemy.exc import NoResultFound
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..db.tenant_manager import TenantContext
from ..models.tables import Tenant

_CACHE_TTL_SECONDS = 120


class TenantRegistry:
    def __init__(self) -> None:
        self._cache: Dict[str, tuple[TenantContext, datetime]] = {}
        self._lock = asyncio.Lock()
        self._ttl = timedelta(seconds=_CACHE_TTL_SECONDS)

    async def resolve(self, *, tenant_key: Optional[str], host: Optional[str], session: AsyncSession) -> TenantContext:
        key = tenant_key or self._tenant_key_from_host(host)
        if not key:
            raise NoResultFound("Unable to resolve tenant context")

        cached = self._cache.get(key)
        now = datetime.utcnow()
        if cached and now - cached[1] < self._ttl:
            return cached[0]

        async with self._lock:
            cached = self._cache.get(key)
            if cached and now - cached[1] < self._ttl:
                return cached[0]

            tenant_row = await session.scalar(select(Tenant).where(Tenant.key == key, Tenant.status == "active"))
            if not tenant_row:
                raise NoResultFound(f"Tenant {key} not found or inactive")

            context = self._hydrate_context(tenant_row, host)
            self._cache[key] = (context, now)
            return context

    def invalidate(self, tenant_key: str) -> None:
        self._cache.pop(tenant_key, None)

    def _tenant_key_from_host(self, host: Optional[str]) -> Optional[str]:
        if not host:
            return None
        bare_host = host.split(":")[0].lower()
        if bare_host in settings.ALLOWED_TENANT_HOSTS:
            return settings.ALLOWED_TENANT_HOSTS[bare_host]
        if settings.CANONICAL_HOST_DOMAIN and bare_host.endswith(settings.CANONICAL_HOST_DOMAIN):
            subdomain = bare_host[: -len(settings.CANONICAL_HOST_DOMAIN)]
            subdomain = subdomain.rstrip(".")
            if subdomain:
                return subdomain
        parts = bare_host.split(".")
        if len(parts) > 2:
            return parts[0]
        return None

    def _hydrate_context(self, tenant: Tenant, host: Optional[str]) -> TenantContext:
        db_uri = tenant.db_connection_uri or self._build_uri_from_template(tenant)
        schema = tenant.db_schema or self._build_schema_from_template(tenant)
        defaults = settings.FEATURE_FLAG_DEFAULTS or {}
        feature_flags = {**defaults, **(tenant.feature_flags or {})}
        return TenantContext(
            id=tenant.id,
            key=tenant.key,
            slug=tenant.slug,
            db_connection_uri=db_uri,
            db_schema=schema,
            billing_plan=tenant.billing_plan,
            feature_flags=feature_flags,
            request_host=host,
        )

    def _build_uri_from_template(self, tenant: Tenant) -> str:
        template = settings.TENANT_DATABASE_URL_TEMPLATE or settings.DEFAULT_TENANT_DATABASE_URL
        if not template:
            raise RuntimeError("Tenant database URI not configured")
        return template.format(
            tenant_key=tenant.key,
            tenant_slug=tenant.slug,
            region=tenant.region or "default",
        )

    def _build_schema_from_template(self, tenant: Tenant) -> Optional[str]:
        template = settings.TENANT_DATABASE_SCHEMA_TEMPLATE
        if not template:
            return None
        return template.format(
            tenant_key=tenant.key,
            tenant_slug=tenant.slug,
            region=tenant.region or "default",
        )


tenant_registry = TenantRegistry()
