import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncio
from datetime import datetime, timezone

import bcrypt
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models import load_all_models
from app.models.tables import ControlBase, Tenant, TenantDataBase, User


TENANT_KEY = "prominencehealth"
TENANT_SLUG = "prominencehealth"
TENANT_NAME = "ProminenceHealth"
TENANT_BILLING_PLAN = "enterprise"
DEFAULT_ADMIN_EMAIL = "admin@prominencehealth.com"
DEFAULT_ADMIN_PASSWORD = "admin"
DEFAULT_APPLICATION_PERMISSIONS = {
    "portal": "admin",
    "coding": "admin",
    "dashboard": "admin",
    "member360": "admin",
    "ride_booking": "admin",
    "job_center": "admin",
    "docs": "admin",
    "settings": "admin",
    "admin_console": "admin",
}
DEFAULT_PURCHASED_APPLICATIONS = {
    "coding": True,
    "dashboard": True,
    "member360": True,
    "ride_booking": True,
    "job_center": True,
    "docs": True,
}


async def ensure_control_plane() -> str:
    load_all_models()
    engine = create_async_engine(settings.CONTROL_DATABASE_URL, future=True, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(ControlBase.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        connection_uri = settings.DEFAULT_TENANT_DATABASE_URL
        if not connection_uri:
            raise RuntimeError("DEFAULT_TENANT_DATABASE_URL must be configured")

        await session.execute(delete(Tenant).where(Tenant.key != TENANT_KEY))

        tenant = await session.scalar(select(Tenant).where(Tenant.key == TENANT_KEY))
        if not tenant:
            tenant = Tenant(
                key=TENANT_KEY,
                slug=TENANT_SLUG,
                name=TENANT_NAME,
                billing_plan=TENANT_BILLING_PLAN,
                db_connection_uri=connection_uri,
                db_schema=None,
                purchased_applications=DEFAULT_PURCHASED_APPLICATIONS,
                phi_data_classification="restricted",
                data_residency="us-east-1",
                created_by="seed_prominence",
            )
            session.add(tenant)
            await session.flush()
        else:
            tenant.slug = TENANT_SLUG
            tenant.name = TENANT_NAME
            tenant.billing_plan = TENANT_BILLING_PLAN
            tenant.db_connection_uri = connection_uri
            tenant.db_schema = None
            tenant.purchased_applications = DEFAULT_PURCHASED_APPLICATIONS

        admin = await session.scalar(
            select(User).where(User.email == DEFAULT_ADMIN_EMAIL, User.tenant_id == tenant.id)
        )
        password_hash = bcrypt.hashpw(DEFAULT_ADMIN_PASSWORD.encode(), bcrypt.gensalt()).decode()
        if not admin:
            admin = User(
                tenant_id=tenant.id,
                email=DEFAULT_ADMIN_EMAIL,
                password_hash=password_hash,
                role="admin",
                app_permissions=DEFAULT_APPLICATION_PERMISSIONS,
                created_at=datetime.now(timezone.utc),
            )
            session.add(admin)

        demo_users = [
            ("admin@admin.com", "admin", {"portal": "admin", "coding": "admin", "dashboard": "admin", "member360": "admin", "ride_booking": "admin", "job_center": "admin", "docs": "admin", "settings": "admin", "admin_console": "admin", "providers": "admin", "chat": "admin"}),
            ("dr.chen@prominencehealth.com", "clinician", {"member360": "user", "providers": "user", "portal": "user", "chat": "user", "docs": "user", "dashboard": "user", "coding": "user"}),
            ("elena.nurse@prominencehealth.com", "nurse", {"member360": "user", "ride_booking": "user", "portal": "user", "chat": "user", "docs": "user", "dashboard": "user", "providers": "user"}),
            ("marcus.coder@prominencehealth.com", "coder", {"coding": "user", "member360": "user", "portal": "user", "dashboard": "user", "docs": "user"}),
            ("rachel.billing@prominencehealth.com", "billing", {"dashboard": "user", "portal": "user", "docs": "user", "member360": "user"}),
            ("james.member@prominencehealth.com", "patient", {"portal": "user", "ride_booking": "user"}),
            ("coordinator@prominencehealth.com", "coordinator", {"member360": "user", "portal": "user", "ride_booking": "user", "docs": "user", "chat": "user"}),
            ("supervisor@prominencehealth.com", "supervisor", {"member360": "user", "portal": "user", "ride_booking": "user", "docs": "user", "chat": "user", "dashboard": "user", "settings": "user", "providers": "user"}),
            ("business.admin@prominencehealth.com", "business_admin", {"member360": "user", "admin_console": "admin", "portal": "user", "docs": "user", "settings": "admin", "job_center": "admin"}),
            ("compliance.auditor@prominencehealth.com", "compliance_auditor", {"member360": "user", "portal": "user", "docs": "user"}),
            ("auditor@prominencehealth.com", "compliance_auditor", {"member360": "user", "portal": "user", "docs": "user"}),
        ]
        for email, role_key, perms in demo_users:
            existing_user = await session.scalar(
                select(User).where(User.email == email, User.tenant_id == tenant.id)
            )
            if not existing_user:
                session.add(
                    User(
                        tenant_id=tenant.id,
                        email=email,
                        password_hash=password_hash,
                        role=role_key,
                        app_permissions=perms,
                        is_active=True,
                        must_change_password=False,
                        created_at=datetime.now(timezone.utc),
                    )
                )
            else:
                existing_user.role = role_key
                existing_user.app_permissions = perms
                existing_user.is_active = True
                existing_user.must_change_password = False

        await session.commit()

    await engine.dispose()
    return connection_uri


async def ensure_tenant_database(uri: str) -> None:
    load_all_models()
    engine = create_async_engine(uri, future=True, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(TenantDataBase.metadata.create_all)
    await engine.dispose()


async def main() -> None:
    tenant_uri = await ensure_control_plane()
    await ensure_tenant_database(tenant_uri)
    print("Provisioned ProminenceHealth tenant and ensured schema is ready.")


if __name__ == "__main__":
    asyncio.run(main())
