import asyncio
import os
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

import bcrypt
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

CURRENT_DIR = os.path.dirname(__file__)
BACKEND_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))

if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from app.core import config as config_module
from app.core.config import get_settings
from app.models import load_all_models
from app.models.tables import (
    Claim,
    ControlBase,
    Member,
    Tenant,
    TenantDataBase,
    User,
)
from app.models.coding import (
    CodingMember,
    CodingMemberChase,
    CodingMemberNote,
    CodingProvider,
    CodingProviderLocation,
)
from app.models.ride_booking import RidePartner, RidePartnerSchedule

from cryptography.fernet import Fernet as _Fernet

TEST_CONTROL_DB = "sqlite+aiosqlite:///./tests/test_control.db"
TEST_TENANT_DB_TEMPLATE = "sqlite+aiosqlite:///./tests/tenants/{tenant_key}.db"
TEST_SECRET = "super-secret-for-tests"
TEST_TENANT_KEY = "prominencehealth"
TEST_FIELD_KEY = _Fernet.generate_key().decode("utf-8")


os.environ["ENVIRONMENT"] = "test"
os.environ["SECRET_KEY"] = TEST_SECRET
os.environ["CONTROL_DATABASE_URL"] = TEST_CONTROL_DB
os.environ["DEFAULT_TENANT_DATABASE_URL"] = TEST_TENANT_DB_TEMPLATE
os.environ["ALLOW_DUMMY_LOGIN"] = "false"
os.environ["FIELD_ENCRYPTION_KEY"] = TEST_FIELD_KEY


config_module.settings.CONTROL_DATABASE_URL = TEST_CONTROL_DB
config_module.settings.DEFAULT_TENANT_DATABASE_URL = TEST_TENANT_DB_TEMPLATE
config_module.settings.SECRET_KEY = TEST_SECRET
config_module.settings.ALLOW_DUMMY_LOGIN = False
config_module.settings.FIELD_ENCRYPTION_KEY = TEST_FIELD_KEY

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
    os.environ["FIELD_ENCRYPTION_KEY"] = TEST_FIELD_KEY

    config_module.settings.CONTROL_DATABASE_URL = TEST_CONTROL_DB
    config_module.settings.DEFAULT_TENANT_DATABASE_URL = TEST_TENANT_DB_TEMPLATE
    config_module.settings.SECRET_KEY = TEST_SECRET
    config_module.settings.ALLOW_DUMMY_LOGIN = False
    config_module.settings.FIELD_ENCRYPTION_KEY = TEST_FIELD_KEY

    Path("tests").mkdir(parents=True, exist_ok=True)
    Path("tests/tenants").mkdir(parents=True, exist_ok=True)

    _tests_dir().mkdir(parents=True, exist_ok=True)
    _tenant_dir().mkdir(parents=True, exist_ok=True)

    get_settings.cache_clear()
    settings = get_settings()

    from app.core import config as config_reload
    config_reload.settings = settings

    load_all_models()
    control_engine = create_async_engine(settings.CONTROL_DATABASE_URL, future=True, echo=False)

    async with control_engine.begin() as conn:
        await conn.run_sync(ControlBase.metadata.drop_all)
        await conn.run_sync(ControlBase.metadata.create_all)

    session_factory = async_sessionmaker(control_engine, expire_on_commit=False)
    async with session_factory() as session:
        tenant = Tenant(
            key=TEST_TENANT_KEY,
            slug=TEST_TENANT_KEY,
            name="ProminenceHealth",
            db_connection_uri=TEST_TENANT_DB_TEMPLATE.format(tenant_key=TEST_TENANT_KEY),
            billing_plan="standard",
            phi_data_classification="restricted",
            purchased_applications={
                "coding": True,
                "dashboard": True,
                "docs": True,
                "member360": True,
                "ride_booking": True,
                "job_center": True,
            },
        )
        session.add(tenant)
        await session.flush()
        user = User(
            tenant_id=tenant.id,
            email="user@example.com",
            password_hash=bcrypt.hashpw(b"password", bcrypt.gensalt()).decode(),
            role="analyst",
            app_permissions={
                "portal": "user",
                "coding": "user",
                "dashboard": "user",
                "docs": "user",
                "member360": "user",
                "ride_booking": "user",
                "job_center": "user",
                "settings": "user",
            },
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

        coding_member = CodingMember(
            member_key="COD001",
            first_name="Case",
            last_name="Manager",
            status="active",
            line_of_business="Commercial",
        )
        session.add(coding_member)
        await session.flush()
        session.add(
            CodingMemberChase(
                member_id=coding_member.id,
                chase_code="CHASE-1",
                status="open",
                priority="high",
            )
        )
        session.add(
            CodingMemberNote(
                member_id=coding_member.id,
                author_email="user@example.com",
                body="Seed note",
            )
        )
        provider = CodingProvider(name="Provider One", npi="9999999999", tax_id="12-3456789")
        session.add(provider)
        await session.flush()
        session.add(
            CodingProviderLocation(
                provider_id=provider.id,
                address_line1="100 Main St",
                city="Austin",
                state="TX",
                postal_code="73301",
            )
        )
        ride_partner = RidePartner(
            company_name="TransitEase Test",
            contact_name="Transit Ops",
            contact_email="ops@example.com",
        )
        session.add(ride_partner)
        await session.flush()
        session.add(
            RidePartnerSchedule(
                partner_id=ride_partner.id,
                frequency="daily",
                start_date=date(2025, 1, 1),
                end_date=date(2027, 12, 31),
                open_slots=4,
            )
        )
        await session.commit()


@pytest.fixture(scope="session", autouse=True)
def bootstrap_test_environment():
    asyncio.run(_bootstrap_async())



@pytest.fixture
def fastapi_app(bootstrap_test_environment):
    from app import main as app_module

    assert app_module.settings.CONTROL_DATABASE_URL == TEST_CONTROL_DB
    return app_module.app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def disable_audit(monkeypatch):
    async def _noop(*args, **kwargs):
        return None

    monkeypatch.setattr('app.utils.audit_logger.record_audit_event', _noop)
    monkeypatch.setattr('app.routes.coding.record_audit_event', _noop)
    monkeypatch.setattr('app.routes.member360.record_audit_event', _noop)
    monkeypatch.setattr('app.main.record_audit_event', _noop)
