from __future__ import annotations

import asyncio
from collections import OrderedDict
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Dict, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from ..core.config import settings


@dataclass(slots=True)
class TenantContext:
    id: int
    key: str
    slug: str
    db_connection_uri: str
    db_schema: Optional[str] = None
    billing_plan: Optional[str] = None
    feature_flags: Dict[str, bool] = field(default_factory=dict)
    request_host: Optional[str] = None

    def feature_enabled(self, flag: str) -> bool:
        return self.feature_flags.get(flag, False)


class TenantConnectionManager:
    def __init__(self) -> None:
        self._engines: OrderedDict[str, AsyncEngine] = OrderedDict()
        self._sessionmakers: OrderedDict[str, async_sessionmaker[AsyncSession]] = OrderedDict()
        self._tenant_locks: Dict[str, asyncio.Lock] = {}
        self._cache_lock = asyncio.Lock()
        self._max_size = max(int(settings.TENANT_CONNECTION_CACHE_SIZE or 1), 1)

    def _get_tenant_lock(self, tenant_key: str) -> asyncio.Lock:
        lock = self._tenant_locks.get(tenant_key)
        if lock is None:
            lock = asyncio.Lock()
            self._tenant_locks[tenant_key] = lock
        return lock

    async def _get_cached_sessionmaker(self, tenant_key: str) -> Optional[async_sessionmaker[AsyncSession]]:
        async with self._cache_lock:
            factory = self._sessionmakers.get(tenant_key)
            if factory:
                self._sessionmakers.move_to_end(tenant_key)
                if tenant_key in self._engines:
                    self._engines.move_to_end(tenant_key)
            return factory

    async def _store_sessionmaker(
        self,
        tenant_key: str,
        engine: AsyncEngine,
        factory: async_sessionmaker[AsyncSession],
    ) -> list[AsyncEngine]:
        evicted_engines: list[AsyncEngine] = []
        async with self._cache_lock:
            self._engines[tenant_key] = engine
            self._sessionmakers[tenant_key] = factory
            self._engines.move_to_end(tenant_key)
            self._sessionmakers.move_to_end(tenant_key)

            while len(self._sessionmakers) > self._max_size:
                stale_key, _ = self._sessionmakers.popitem(last=False)
                stale_engine = self._engines.pop(stale_key, None)
                self._tenant_locks.pop(stale_key, None)
                if stale_engine is not None:
                    evicted_engines.append(stale_engine)
        return evicted_engines

    async def _ensure_sessionmaker(self, tenant: TenantContext) -> async_sessionmaker[AsyncSession]:
        cached = await self._get_cached_sessionmaker(tenant.key)
        if cached:
            return cached

        tenant_lock = self._get_tenant_lock(tenant.key)
        async with tenant_lock:
            cached = await self._get_cached_sessionmaker(tenant.key)
            if cached:
                return cached

            engine = create_async_engine(
                tenant.db_connection_uri,
                future=True,
                echo=False,
                pool_pre_ping=True,
            )
            factory = async_sessionmaker(
                engine,
                expire_on_commit=False,
                autoflush=False,
            )
            evicted = await self._store_sessionmaker(tenant.key, engine, factory)

        for engine in evicted:
            await engine.dispose()

        return factory

    @asynccontextmanager
    async def get_session(self, tenant: TenantContext):
        session_factory = await self._ensure_sessionmaker(tenant)
        async with session_factory() as session:
            if tenant.db_schema:
                safe_schema = tenant.db_schema.replace('"', '""')
                await session.execute(text(f'SET search_path TO "{safe_schema}"'))
            yield session

    async def close_all(self) -> None:
        async with self._cache_lock:
            engines = list(self._engines.values())
            self._engines.clear()
            self._sessionmakers.clear()
            self._tenant_locks.clear()
        for engine in engines:
            await engine.dispose()


tenant_connection_manager = TenantConnectionManager()
