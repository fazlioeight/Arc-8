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
    data_residency: Optional[str] = None,
) -> ProvisioningResult:
    tenant = await session.scalar(select(Tenant).where(Tenant.key == key))
    if tenant:
        return ProvisioningResult(tenant=tenant, created=False)

    connection_uri = db_connection_uri or _resolve_connection_uri(key=key, slug=slug)
    schema = db_schema or _resolve_schema(slug=slug)
    merged_flags = {**(settings.FEATURE_FLAG_DEFAULTS or {}), **(feature_flags or {})}
    residency = _validate_data_residency(data_residency)

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
        data_residency=residency,
    )
    session.add(tenant)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise ValueError(f"Tenant {key} already exists") from exc

    await _ensure_tenant_datastore(connection_uri, schema)
    return ProvisioningResult(tenant=tenant, created=True)


def _validate_data_residency(value: Optional[str]) -> str:
    allowed = [v.lower() for v in (settings.ALLOWED_DATA_RESIDENCIES or [])]
    if not allowed:
        # Empty allowlist would mean every residency is rejected; treat as a
        # config error rather than silently letting any value through.
        raise RuntimeError("ALLOWED_DATA_RESIDENCIES is empty; refusing to provision tenants")
    candidate = (value or settings.DEFAULT_DATA_RESIDENCY or "").strip().lower()
    if not candidate:
        raise ValueError("data_residency is required when provisioning a tenant")
    if candidate not in allowed:
        raise ValueError(
            f"data_residency '{candidate}' is not permitted. Allowed values: {sorted(allowed)}"
        )
    return candidate


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
