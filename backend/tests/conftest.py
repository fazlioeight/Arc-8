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
from app.models.member360 import Member360Member
from app.models.ride_booking import RidePartner, RidePartnerSchedule

from cryptography.fernet import Fernet as _Fernet

TEST_CONTROL_DB = "sqlite+aiosqlite:///./tests/test_control.db"
TEST_TENANT_DB_TEMPLATE = "sqlite+aiosqlite:///./tests/tenants/{tenant_key}.db"
TEST_SECRET = "super-secret-for-tests"
TEST_TENANT_KEY = "prominencehealth"
TEST_FIELD_KEY = _Fernet.generate_key().decode("utf-8")

# A second tenant lets isolation tests prove that a member of one health plan
# cannot register against / read another's data even with a matching member id.
SECOND_TENANT_KEY = "northwind"

# Seeded Member360 members used by member-portal (Feature 1+) tests. Each is the
# identity-proofing target for self-registration in its tenant.
PROMINENCE_MEMBER = {
    "member_key": "M360-1001",
    "first_name": "Ada",
    "last_name": "Lovelace",
    "date_of_birth": date(1950, 12, 10),
    "address_zip": "73301",
    "email": "ada@example.com",
}
NORTHWIND_MEMBER = {
    "member_key": "NW-2002",
    "first_name": "Grace",
    "last_name": "Hopper",
    "date_of_birth": date(1956, 12, 9),
    "address_zip": "20001",
    "email": "grace@example.com",
}


os.environ["ENVIRONMENT"] = "test"
os.environ["SECRET_KEY"] = TEST_SECRET
os.environ["CONTROL_DATABASE_URL"] = TEST_CONTROL_DB
os.environ["DEFAULT_TENANT_DATABASE_URL"] = TEST_TENANT_DB_TEMPLATE
os.environ["ALLOW_DUMMY_LOGIN"] = "false"
os.environ["FIELD_ENCRYPTION_KEY"] = TEST_FIELD_KEY
# Rate limiting is an infrastructure control, not the unit under test. Disable
# it globally so the cumulative request volume of the suite doesn't trip the
# per-user PHI limit; tests that exercise the limiter re-enable it explicitly.
os.environ["RATE_LIMIT_ENABLED"] = "false"


config_module.settings.CONTROL_DATABASE_URL = TEST_CONTROL_DB
config_module.settings.DEFAULT_TENANT_DATABASE_URL = TEST_TENANT_DB_TEMPLATE
config_module.settings.SECRET_KEY = TEST_SECRET
config_module.settings.ALLOW_DUMMY_LOGIN = False
config_module.settings.FIELD_ENCRYPTION_KEY = TEST_FIELD_KEY
config_module.settings.RATE_LIMIT_ENABLED = False

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
    os.environ["RATE_LIMIT_ENABLED"] = "false"

    config_module.settings.CONTROL_DATABASE_URL = TEST_CONTROL_DB
    config_module.settings.DEFAULT_TENANT_DATABASE_URL = TEST_TENANT_DB_TEMPLATE
    config_module.settings.SECRET_KEY = TEST_SECRET
    config_module.settings.ALLOW_DUMMY_LOGIN = False
    config_module.settings.FIELD_ENCRYPTION_KEY = TEST_FIELD_KEY
    config_module.settings.RATE_LIMIT_ENABLED = False

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

        session.add(Member360Member(**PROMINENCE_MEMBER))

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
        # Populate the dashboard fact tables so the dashboard endpoints return
        # real rows in tests (reuses the demo seeder's generator).
        import random as _random

        from scripts.seed_prominence_demo import _ensure_dashboard_facts

        await _ensure_dashboard_facts(session, _random.Random(33))
        await session.commit()

    # ---- Second tenant (isolation tests) --------------------------------
    async with session_factory() as session:
        second = Tenant(
            key=SECOND_TENANT_KEY,
            slug=SECOND_TENANT_KEY,
            name="Northwind Health",
            db_connection_uri=TEST_TENANT_DB_TEMPLATE.format(tenant_key=SECOND_TENANT_KEY),
            billing_plan="standard",
            phi_data_classification="restricted",
            purchased_applications={"member360": True},
        )
        session.add(second)
        await session.commit()

    second_engine = create_async_engine(
        TEST_TENANT_DB_TEMPLATE.format(tenant_key=SECOND_TENANT_KEY), future=True, echo=False
    )
    async with second_engine.begin() as conn:
        await conn.run_sync(TenantDataBase.metadata.drop_all)
        await conn.run_sync(TenantDataBase.metadata.create_all)
    second_session_factory = async_sessionmaker(second_engine, expire_on_commit=False)
    async with second_session_factory() as session:
        session.add(Member360Member(**NORTHWIND_MEMBER))
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
    monkeypatch.setattr('app.routes.member_portal.record_audit_event', _noop)
    monkeypatch.setattr('app.routes.member_portal_session.record_audit_event', _noop)
    monkeypatch.setattr('app.main.record_audit_event', _noop)
