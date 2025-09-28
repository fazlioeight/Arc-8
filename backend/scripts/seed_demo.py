import asyncio
import csv
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.tables import (
    Claim,
    Member,
    Tenant,
    TenantDataBase,
    ControlBase,
    User,
)
from app.services.coding_members import ensure_seed_data


TENANT_KEY = "demo"
TENANT_SLUG = "demo"
TENANT_NAME = "Demo Tenant"
TENANT_BILLING_PLAN = "standard"
DEFAULT_PASSWORD = "admin"


async def seed_control_plane() -> Tenant:
    engine = create_async_engine(settings.CONTROL_DATABASE_URL, future=True, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(ControlBase.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        tenant = await session.scalar(select(Tenant).where(Tenant.key == TENANT_KEY))
        if not tenant:
            connection_uri = _tenant_db_uri()
            tenant = Tenant(
                key=TENANT_KEY,
                slug=TENANT_SLUG,
                name=TENANT_NAME,
                billing_plan=TENANT_BILLING_PLAN,
                db_connection_uri=connection_uri,
                db_schema=None,
                phi_data_classification="restricted",
                data_residency="us-east-1",
                created_by="seed_demo",
            )
            session.add(tenant)
            await session.flush()
        admin_user = await session.scalar(
            select(User).where(User.email == "admin@admin.com", User.tenant_id == tenant.id)
        )
        if not admin_user:
            pw_hash = bcrypt.hashpw(DEFAULT_PASSWORD.encode(), bcrypt.gensalt()).decode()
            admin_user = User(
                tenant_id=tenant.id,
                email="admin@admin.com",
                password_hash=pw_hash,
                role="admin",
                created_at=datetime.now(timezone.utc),
            )
            session.add(admin_user)
        await session.commit()
        return tenant


def _tenant_db_uri() -> str:
    template = settings.TENANT_DATABASE_URL_TEMPLATE or settings.DEFAULT_TENANT_DATABASE_URL
    if not template:
        raise RuntimeError("DEFAULT_TENANT_DATABASE_URL is not configured")
    return template.format(tenant_key=TENANT_KEY, tenant_slug=TENANT_SLUG, region="default")


def _parse_service_date(raw: str | None):
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(raw).date()
    except ValueError:
        return None


async def seed_tenant_data(tenant: Tenant) -> None:
    uri = tenant.db_connection_uri or _tenant_db_uri()
    if uri.startswith("sqlite"):
        db_path = uri.split("///")[-1]
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    engine = create_async_engine(uri, future=True, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(TenantDataBase.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    csv_path = Path(__file__).resolve().parents[1] / "claims_data.csv"

    async with session_factory() as session:
        if csv_path.exists():
            with csv_path.open(newline="", encoding="utf-8") as handle:
                reader = csv.DictReader(handle)
                for row in reader:
                    member_key = row.get("MemberID") or row.get("member_id")
                    if not member_key:
                        continue
                    member = await session.scalar(select(Member).where(Member.member_key == member_key))
                    if not member:
                        member = Member(member_key=member_key, name=row.get("MemberName"))
                        session.add(member)
                        await session.flush()
                    raw_cost = row.get("Cost") or row.get("cost") or 0
                    try:
                        cost = Decimal(str(raw_cost))
                    except Exception:
                        cost = Decimal("0")
                    service_date = _parse_service_date(row.get("ServiceDate") or row.get("service_date"))
                    claim = Claim(
                        member_key=member_key,
                        service_date=service_date,
                        cost=cost,
                    )
                    session.add(claim)
        await ensure_seed_data(session)
        await session.commit()


async def main():
    tenant = await seed_control_plane()
    await seed_tenant_data(tenant)
    print("Seeded demo tenant, user, and claims.")


if __name__ == "__main__":
    asyncio.run(main())
