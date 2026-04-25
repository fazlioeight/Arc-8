from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from ..core.config import settings
from ..models import load_all_models
from ..models.tables import Tenant, TenantDataBase


@dataclass(slots=True)
class ProvisioningResult:
    tenant: Tenant
    created: bool


async def provision_tenant(
    session: AsyncSession,
    *,
    key: str,
    slug: str,
    name: str,
    created_by: str,
    billing_plan: str = "standard",
    feature_flags: Optional[Dict[str, bool]] = None,
    db_connection_uri: Optional[str] = None,
    db_schema: Optional[str] = None,
) -> ProvisioningResult:
    tenant = await session.scalar(select(Tenant).where(Tenant.key == key))
    if tenant:
        return ProvisioningResult(tenant=tenant, created=False)

    connection_uri = db_connection_uri or _resolve_connection_uri(key=key, slug=slug)
    schema = db_schema or _resolve_schema(slug=slug)
    merged_flags = {**(settings.FEATURE_FLAG_DEFAULTS or {}), **(feature_flags or {})}

    tenant = Tenant(
        key=key,
        slug=slug,
        name=name,
        billing_plan=billing_plan,
        feature_flags=merged_flags,
        db_connection_uri=connection_uri,
        db_schema=schema,
        created_by=created_by,
        phi_data_classification="restricted",
    )
    session.add(tenant)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise ValueError(f"Tenant {key} already exists") from exc

    await _ensure_tenant_datastore(connection_uri, schema)
    return ProvisioningResult(tenant=tenant, created=True)


def _resolve_connection_uri(*, key: str, slug: str) -> str:
    template = settings.TENANT_DATABASE_URL_TEMPLATE or settings.DEFAULT_TENANT_DATABASE_URL
    if not template:
        raise RuntimeError("DEFAULT_TENANT_DATABASE_URL is not configured")
    return template.format(tenant_key=key, tenant_slug=slug, region="default")


def _resolve_schema(*, slug: str) -> Optional[str]:
    template = settings.TENANT_DATABASE_SCHEMA_TEMPLATE
    if not template:
        return None
    return template.format(tenant_slug=slug)


async def _ensure_tenant_datastore(connection_uri: str, schema: Optional[str]) -> None:
    load_all_models()
    engine = create_async_engine(connection_uri, future=True, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(TenantDataBase.metadata.create_all)
        if schema:
            await conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
