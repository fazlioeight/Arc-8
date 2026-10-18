from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.config import settings  # noqa: E402
from app.models import load_all_models  # noqa: E402
from app.models.tables import Tenant, TenantDataBase, User  # noqa: E402


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


def env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    return value if value not in (None, "") else default


async def main() -> None:
    load_all_models()

    tenant_key = env("INITIAL_TENANT_KEY", "prominencehealth")
    tenant_slug = env("INITIAL_TENANT_SLUG", tenant_key)
    tenant_name = env("INITIAL_TENANT_NAME", "ProminenceHealth")
    admin_email = env("INITIAL_ADMIN_EMAIL")
    admin_password = env("INITIAL_ADMIN_PASSWORD")
    tenant_uri = env("INITIAL_TENANT_DATABASE_URL", settings.DEFAULT_TENANT_DATABASE_URL)

    if not tenant_key or not tenant_slug or not tenant_name:
        raise RuntimeError("INITIAL_TENANT_KEY, INITIAL_TENANT_SLUG, and INITIAL_TENANT_NAME are required")
    if not tenant_uri:
        raise RuntimeError("INITIAL_TENANT_DATABASE_URL or DEFAULT_TENANT_DATABASE_URL is required")

    engine = create_async_engine(settings.CONTROL_DATABASE_URL, future=True, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    residency = (env("INITIAL_DATA_RESIDENCY", settings.DEFAULT_DATA_RESIDENCY) or "").strip().lower()
    allowed_residencies = [v.lower() for v in (settings.ALLOWED_DATA_RESIDENCIES or [])]
    if residency not in allowed_residencies:
        raise RuntimeError(
            f"INITIAL_DATA_RESIDENCY '{residency}' is not in ALLOWED_DATA_RESIDENCIES {allowed_residencies}"
        )

    async with session_factory() as session:
        tenant = await session.scalar(select(Tenant).where(Tenant.key == tenant_key))
        if tenant is None:
            tenant = Tenant(
                key=tenant_key,
                slug=tenant_slug,
                name=tenant_name,
                billing_plan=env("INITIAL_TENANT_BILLING_PLAN", "enterprise") or "enterprise",
                db_connection_uri=tenant_uri,
                db_schema=env("INITIAL_TENANT_DB_SCHEMA"),
                purchased_applications=DEFAULT_PURCHASED_APPLICATIONS,
                phi_data_classification="restricted",
                data_residency=residency,
                created_by="provision_initial_tenant",
            )
            session.add(tenant)
            await session.flush()
        else:
            tenant.slug = tenant_slug
            tenant.name = tenant_name
            tenant.db_connection_uri = tenant_uri
            tenant.db_schema = env("INITIAL_TENANT_DB_SCHEMA")
            tenant.purchased_applications = tenant.purchased_applications or DEFAULT_PURCHASED_APPLICATIONS

        if admin_email and admin_password:
            admin = await session.scalar(
                select(User).where(User.email == admin_email, User.tenant_id == tenant.id)
            )
            if admin is None:
                password_hash = bcrypt.hashpw(admin_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
                admin = User(
                    tenant_id=tenant.id,
                    email=admin_email,
                    password_hash=password_hash,
                    role="admin",
                    app_permissions=DEFAULT_APPLICATION_PERMISSIONS,
                    must_change_password=True,
                    created_at=datetime.now(timezone.utc),
                )
                session.add(admin)

        await session.commit()

    await engine.dispose()

    tenant_engine = create_async_engine(tenant_uri, future=True, echo=False)
    async with tenant_engine.begin() as conn:
        await conn.run_sync(TenantDataBase.metadata.create_all)
    await tenant_engine.dispose()

    print(f"Provisioned tenant '{tenant_key}'.")


if __name__ == "__main__":
    asyncio.run(main())
