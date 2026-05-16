from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from sqlalchemy import select
from sqlalchemy.exc import NoResultFound
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.redis import get_redis_client
from ..db.tenant_manager import TenantContext
from ..models.tables import Tenant

_CACHE_TTL_SECONDS = 120
_REDIS_CACHE_PREFIX = 'nexora:tenant:context:'


class TenantRegistry:
    def __init__(self) -> None:
        self._cache: Dict[str, tuple[Dict[str, Any], datetime]] = {}
        self._locks: Dict[str, asyncio.Lock] = {}
        self._ttl = timedelta(seconds=_CACHE_TTL_SECONDS)

    def _get_lock(self, key: str) -> asyncio.Lock:
        lock = self._locks.get(key)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[key] = lock
        return lock

    def _cache_key(self, tenant_key: str) -> str:
        return f"{_REDIS_CACHE_PREFIX}{tenant_key}"

    def _serialize(self, context: TenantContext) -> Dict[str, Any]:
        return {
            "id": context.id,
            "key": context.key,
            "slug": context.slug,
            "db_connection_uri": context.db_connection_uri,
            "db_schema": context.db_schema,
            "billing_plan": context.billing_plan,
            "feature_flags": context.feature_flags,
            "purchased_applications": context.purchased_applications,
            "data_residency": context.data_residency,
        }

    def _deserialize(self, payload: Dict[str, Any], host: Optional[str]) -> TenantContext:
        return TenantContext(
            id=payload["id"],
            key=payload["key"],
            slug=payload["slug"],
            db_connection_uri=payload["db_connection_uri"],
            db_schema=payload.get("db_schema"),
            billing_plan=payload.get("billing_plan"),
            feature_flags=payload.get("feature_flags") or {},
            purchased_applications=payload.get("purchased_applications") or {},
            data_residency=payload.get("data_residency"),
            request_host=host,
        )

    def _hydrate_context(self, tenant: Tenant) -> Dict[str, Any]:
        db_uri = tenant.db_connection_uri or self._build_uri_from_template(tenant)
        schema = tenant.db_schema or self._build_schema_from_template(tenant)
        defaults = settings.FEATURE_FLAG_DEFAULTS or {}
        feature_flags = {**defaults, **(tenant.feature_flags or {})}
        return {
            "id": tenant.id,
            "key": tenant.key,
            "slug": tenant.slug,
            "db_connection_uri": db_uri,
            "db_schema": schema,
            "billing_plan": tenant.billing_plan,
            "feature_flags": feature_flags,
            "purchased_applications": tenant.purchased_applications or {},
            "data_residency": tenant.data_residency,
        }

    def _get_local(self, key: str, now: datetime) -> Optional[Dict[str, Any]]:
        cached = self._cache.get(key)
        if not cached:
            return None
        payload, timestamp = cached
        if now - timestamp > self._ttl:
            self._cache.pop(key, None)
            return None
        return payload

    async def _get_redis(self, key: str) -> Optional[Dict[str, Any]]:
        client = get_redis_client()
        if not client:
            return None
        try:
            data = await client.get(self._cache_key(key))
        except Exception:
            return None
        if not data:
            return None
        try:
            payload = json.loads(data)
        except (TypeError, json.JSONDecodeError):
            return None
        return payload if isinstance(payload, dict) else None

    async def _set_redis(self, key: str, payload: Dict[str, Any]) -> None:
        client = get_redis_client()
        if not client:
            return
        try:
            await client.set(self._cache_key(key), json.dumps(payload), ex=int(self._ttl.total_seconds()))
        except Exception:
            return

    def _set_local(self, key: str, payload: Dict[str, Any], now: datetime) -> None:
        self._cache[key] = (payload, now)

    async def resolve(self, *, tenant_key: Optional[str], host: Optional[str], session: AsyncSession) -> TenantContext:
        key = tenant_key or self._tenant_key_from_host(host)
        if not key:
            raise NoResultFound("Unable to resolve tenant context")

        now = datetime.utcnow()
        cached = self._get_local(key, now)
        if cached:
            return self._deserialize(cached, host)

        lock = self._get_lock(key)
        async with lock:
            now = datetime.utcnow()
            cached = self._get_local(key, now)
            if cached:
                return self._deserialize(cached, host)

            cached = await self._get_redis(key)
            if cached:
                self._set_local(key, cached, datetime.utcnow())
                return self._deserialize(cached, host)

            tenant_row = await session.scalar(select(Tenant).where(Tenant.key == key, Tenant.status == "active"))
            if not tenant_row:
                raise NoResultFound(f"Tenant {key} not found or inactive")

            payload = self._hydrate_context(tenant_row)
            now = datetime.utcnow()
            self._set_local(key, payload, now)
            await self._set_redis(key, payload)
            return self._deserialize(payload, host)

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
        parts = bare_host.split('.')
        if len(parts) > 2:
            return parts[0]
        return None

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
