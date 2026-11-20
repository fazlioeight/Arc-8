"""Redis client & FR-DAT-02 30-Day Redis Hot Cache layer for Arc-8 (Member 360).

Provides:
- ``get_redis_client()``: Standard async Redis connection when ``REDIS_URL`` is set.
- ``HotCacheManager`` (``hot_cache``): 30-Day (2,592,000s TTL) tenant-isolated hot cache
  for Member 360 search, cockpit detail, dashboard rollups, and the 6 Live Client API
  responses (QNXT, Talkdesk, Enterprise SSO, Abarca PBM, CareAdvance, Labs/Titan/GL).
  Uses Redis when ``REDIS_URL`` is configured and transparently falls back to an
  in-process TTL cache so ``<500ms`` search and ``<2s`` cockpit load (NFR-01) hold in
  all environments.
"""
from __future__ import annotations

import json
import time
from collections import OrderedDict
from datetime import date, datetime
from decimal import Decimal
from functools import lru_cache
from typing import Any, Optional

try:
    from redis.asyncio import Redis
except ImportError:  # pragma: no cover
    Redis = None  # type: ignore

from .config import settings

THIRTY_DAYS_SECONDS: int = 30 * 24 * 60 * 60  # 2,592,000 seconds (FR-DAT-02)


@lru_cache(maxsize=1)
def get_redis_client() -> Optional["Redis"]:
    if not settings.redis_enabled or Redis is None:
        return None
    return Redis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)


def _json_default(obj: Any) -> Any:
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, date):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, set):
        return sorted(obj)
    return str(obj)


class HotCacheManager:
    """FR-DAT-02: 30-Day Redis Hot Cache with tenant-isolated namespaces and
    automatic write-through invalidation."""

    def __init__(self, max_memory_entries: int = 4096) -> None:
        self._max_entries = max_memory_entries
        self._mem_store: OrderedDict[str, tuple[float, str]] = OrderedDict()
        self._hits: int = 0
        self._misses: int = 0
        self._sets: int = 0
        self._invalidations: int = 0

    @property
    def default_ttl(self) -> int:
        return int(getattr(settings, "REDIS_HOT_CACHE_TTL_SECONDS", THIRTY_DAYS_SECONDS) or THIRTY_DAYS_SECONDS)

    @property
    def enabled(self) -> bool:
        return bool(getattr(settings, "REDIS_HOT_CACHE_ENABLED", True))

    @staticmethod
    def build_key(tenant_key: str, namespace: str, identifier: str = "default") -> str:
        safe_tenant = (tenant_key or "default").strip().lower()
        safe_ns = (namespace or "general").strip().lower()
        safe_id = (identifier or "default").strip()
        return f"arc8:hotcache:v1:{safe_tenant}:{safe_ns}:{safe_id}"

    async def get_json(self, tenant_key: str, namespace: str, identifier: str = "default") -> Optional[Any]:
        if not self.enabled:
            return None
        full_key = self.build_key(tenant_key, namespace, identifier)

        # 1. Try Redis backend if configured
        client = get_redis_client()
        if client is not None:
            try:
                raw = await client.get(full_key)
                if raw is not None:
                    self._hits += 1
                    return json.loads(raw)
            except Exception:
                pass

        # 2. Check in-process hot cache store
        entry = self._mem_store.get(full_key)
        if entry is not None:
            expires_at, raw_json = entry
            if time.monotonic() < expires_at:
                self._mem_store.move_to_end(full_key)
                self._hits += 1
                try:
                    return json.loads(raw_json)
                except Exception:
                    self._mem_store.pop(full_key, None)
            else:
                self._mem_store.pop(full_key, None)

        self._misses += 1
        return None

    async def set_json(
        self,
        tenant_key: str,
        namespace: str,
        identifier: str,
        payload: Any,
        *,
        ttl_seconds: Optional[int] = None,
    ) -> str:
        if not self.enabled:
            return ""
        ttl = int(ttl_seconds if ttl_seconds is not None else self.default_ttl)
        full_key = self.build_key(tenant_key, namespace, identifier)
        serialized = json.dumps(payload, default=_json_default)
        self._sets += 1

        # 1. Write to in-process L1 hot cache
        self._mem_store[full_key] = (time.monotonic() + ttl, serialized)
        self._mem_store.move_to_end(full_key)
        while len(self._mem_store) > self._max_entries:
            self._mem_store.popitem(last=False)

        # 2. Write to Redis L2 with 30-day TTL (FR-DAT-02)
        client = get_redis_client()
        if client is not None:
            try:
                await client.set(full_key, serialized, ex=ttl)
            except Exception:
                pass
        return full_key

    async def invalidate_namespace(self, tenant_key: str, namespace: Optional[str] = None) -> int:
        safe_tenant = (tenant_key or "default").strip().lower()
        prefix = (
            f"arc8:hotcache:v1:{safe_tenant}:{namespace.strip().lower()}:"
            if namespace
            else f"arc8:hotcache:v1:{safe_tenant}:"
        )
        removed = 0
        keys_to_delete = [k for k in self._mem_store if k.startswith(prefix)]
        for k in keys_to_delete:
            self._mem_store.pop(k, None)
            removed += 1

        client = get_redis_client()
        if client is not None:
            try:
                cursor = 0
                while True:
                    cursor, keys = await client.scan(cursor=cursor, match=f"{prefix}*", count=200)
                    if keys:
                        await client.delete(*keys)
                        removed += len(keys)
                    if cursor == 0:
                        break
            except Exception:
                pass

        self._invalidations += 1
        return removed

    async def invalidate_member(self, tenant_key: str, member_id: Optional[int] = None) -> int:
        """Invalidate cached member detail, gap analysis, roster lists, and dashboard rollups."""
        removed = 0
        if member_id is not None:
            for ns in ("member_detail", "member_gaps", "live_api"):
                prefix = self.build_key(tenant_key, ns, str(member_id))
                for k in [k for k in self._mem_store if k.startswith(prefix)]:
                    self._mem_store.pop(k, None)
                    removed += 1
                client = get_redis_client()
                if client is not None:
                    try:
                        await client.delete(prefix)
                    except Exception:
                        pass
        for ns in ("members_list", "dashboard", "tasks_list", "care_options_list", "journeys_list", "risk_insights_list"):
            removed += await self.invalidate_namespace(tenant_key, ns)
        return removed

    def clear_all(self) -> None:
        self._mem_store.clear()
        self._hits = 0
        self._misses = 0
        self._sets = 0
        self._invalidations = 0

    def stats(self) -> dict[str, Any]:
        total_lookups = self._hits + self._misses
        return {
            "enabled": self.enabled,
            "redis_configured": bool(settings.redis_enabled and Redis is not None),
            "ttl_seconds": self.default_ttl,
            "ttl_days": round(self.default_ttl / 86400, 1),
            "memory_entries": len(self._mem_store),
            "hits": self._hits,
            "misses": self._misses,
            "sets": self._sets,
            "invalidations": self._invalidations,
            "hit_rate": round(self._hits / total_lookups, 4) if total_lookups > 0 else 0.0,
        }


hot_cache = HotCacheManager()


def get_hot_cache() -> HotCacheManager:
    return hot_cache
