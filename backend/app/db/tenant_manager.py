from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Dict, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine


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
        self._engines: Dict[str, AsyncEngine] = {}
        self._sessionmakers: Dict[str, async_sessionmaker[AsyncSession]] = {}
        self._lock = asyncio.Lock()

    async def _ensure_sessionmaker(self, tenant: TenantContext) -> async_sessionmaker[AsyncSession]:
        if tenant.key in self._sessionmakers:
            return self._sessionmakers[tenant.key]
        async with self._lock:
            if tenant.key not in self._sessionmakers:
                engine = create_async_engine(
                    tenant.db_connection_uri,
                    future=True,
                    echo=False,
                    pool_pre_ping=True,
                )
                session_factory = async_sessionmaker(
                    engine,
                    expire_on_commit=False,
                    autoflush=False,
                )
                self._engines[tenant.key] = engine
                self._sessionmakers[tenant.key] = session_factory
        return self._sessionmakers[tenant.key]

    @asynccontextmanager
    async def get_session(self, tenant: TenantContext):
        session_factory = await self._ensure_sessionmaker(tenant)
        async with session_factory() as session:
            if tenant.db_schema:
                await session.execute(text(f'SET search_path TO "{tenant.db_schema}"'))
            yield session


tenant_connection_manager = TenantConnectionManager()
