from __future__ import annotations

from contextlib import asynccontextmanager
from functools import lru_cache
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from ..core.config import settings


@lru_cache(maxsize=1)
def _create_control_engine() -> AsyncEngine:
    url = settings.CONTROL_DATABASE_URL
    kwargs: dict = {"echo": False, "future": True, "pool_pre_ping": True}
    # SQLite (used in tests + dev) doesn't support pool sizing.
    if not url.startswith("sqlite"):
        kwargs.update(pool_size=20, max_overflow=40, pool_recycle=3600)
    return create_async_engine(url, **kwargs)


@lru_cache(maxsize=1)
def _control_session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        _create_control_engine(),
        expire_on_commit=False,
        autoflush=False,
    )


@asynccontextmanager
async def control_session() -> AsyncGenerator[AsyncSession, None]:
    factory = _control_session_factory()
    async with factory() as session:
        yield session


async def get_control_session() -> AsyncGenerator[AsyncSession, None]:
    async with control_session() as session:
        yield session
