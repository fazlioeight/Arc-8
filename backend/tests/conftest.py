import asyncio
import os
import sys
from decimal import Decimal
from pathlib import Path

import bcrypt
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

CURRENT_DIR = os.path.dirname(__file__)
BACKEND_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))

if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from app.core.config import get_settings
from app.models.tables import (
    Claim,
    ControlBase,
    Member,
    Tenant,
    TenantDataBase,
    User,
)

TEST_CONTROL_DB = "sqlite+aiosqlite:///./tests/test_control.db"
TEST_TENANT_DB_TEMPLATE = "sqlite+aiosqlite:///./tests/tenants/{tenant_key}.db"
TEST_SECRET = "super-secret-for-tests"
TEST_TENANT_KEY = "demo"


def _tests_dir() -> Path:
    return Path(BACKEND_ROOT) / "tests"


def _tenant_dir() -> Path:
    return _tests_dir() / "tenants"


async def _bootstrap_async():
    os.environ["ENVIRONMENT"] = "test"
    os.environ["SECRET_KEY"] = TEST_SECRET
    os.environ["CONTROL_DATABASE_URL"] = TEST_CONTROL_DB
    os.environ["DEFAULT_TENANT_DATABASE_URL"] = TEST_TENANT_DB_TEMPLATE
    os.environ["ALLOW_DUMMY_LOGIN"] = "false"

    _tests_dir().mkdir(parents=True, exist_ok=True)
    _tenant_dir().mkdir(parents=True, exist_ok=True)

    get_settings.cache_clear()
    settings = get_settings()

    control_engine = create_async_engine(settings.CONTROL_DATABASE_URL, future=True, echo=False)

    async with control_engine.begin() as conn:
        await conn.run_sync(ControlBase.metadata.drop_all)
        await conn.run_sync(ControlBase.metadata.create_all)

    session_factory = async_sessionmaker(control_engine, expire_on_commit=False)
    async with session_factory() as session:
        tenant = Tenant(
            key=TEST_TENANT_KEY,
            slug=TEST_TENANT_KEY,
            name="Test Tenant",
            db_connection_uri=TEST_TENANT_DB_TEMPLATE.format(tenant_key=TEST_TENANT_KEY),
            billing_plan="standard",
            phi_data_classification="restricted",
        )
        session.add(tenant)
        await session.flush()
        user = User(
            tenant_id=tenant.id,
            email="user@example.com",
            password_hash=bcrypt.hashpw(b"password", bcrypt.gensalt()).decode(),
            role="analyst",
        )
        session.add(user)
        await session.commit()

    tenant_engine = create_async_engine(
        TEST_TENANT_DB_TEMPLATE.format(tenant_key=TEST_TENANT_KEY), future=True, echo=False
    )
    async with tenant_engine.begin() as conn:
        await conn.run_sync(TenantDataBase.metadata.drop_all)
        await conn.run_sync(TenantDataBase.metadata.create_all)

    tenant_session_factory = async_sessionmaker(tenant_engine, expire_on_commit=False)
    async with tenant_session_factory() as session:
        member = Member(member_key="M001", name="Test Member")
        session.add(member)
        await session.flush()
        claim = Claim(member_key="M001", service_date=None, cost=Decimal("100.00"))
        session.add(claim)
        await session.commit()


@pytest.fixture(scope="session", autouse=True)
def bootstrap_test_environment():
    asyncio.run(_bootstrap_async())

