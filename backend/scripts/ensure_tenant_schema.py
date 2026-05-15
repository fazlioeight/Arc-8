"""Ensure the per-tenant database has every TenantDataBase table.

Runs ``TenantDataBase.metadata.create_all`` against the connection URI
provided via ``DEFAULT_TENANT_DATABASE_URL`` (or its all-caps env variant).
Idempotent: existing tables are not modified, missing tables are created.

This complements the alembic chain, which currently targets the control
plane database only. Use this script when new ``TenantDataBase`` models
are added (e.g. the ``m360_*`` Member360 Lab tables) and the tenant DB
needs to catch up without re-provisioning the tenant from scratch.

Run as a Container App Job:

    az containerapp job create \\
        --resource-group <rg> --name nexora-tenant-schema-sync \\
        --environment <env> --image <api-image> \\
        --trigger-type Manual --replica-timeout 600 --replica-retry-limit 1 \\
        --system-assigned --registry-server <acr>.azurecr.io --registry-identity system \\
        --secrets "tenant-db-url=<keyvault-ref-or-value>" \\
        --env-vars "DEFAULT_TENANT_DATABASE_URL=secretref:tenant-db-url" \\
        --command "python" --args "scripts/ensure_tenant_schema.py"

    az containerapp job start --resource-group <rg> --name nexora-tenant-schema-sync
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine

from app.models import load_all_models
from app.models.tables import TenantDataBase


def _resolve_uri() -> str:
    for key in (
        "DEFAULT_TENANT_DATABASE_URL",
        "TENANT_DATABASE_URL",
        "NEXORA_TENANT_DATABASE_URL",
    ):
        value = os.environ.get(key)
        if value:
            return value
    raise RuntimeError(
        "DEFAULT_TENANT_DATABASE_URL must be set to the tenant database connection URI."
    )


async def run() -> None:
    load_all_models()
    uri = _resolve_uri()
    safe_uri = uri.split("@")[-1] if "@" in uri else uri
    print(f"Ensuring TenantDataBase tables on {safe_uri}", flush=True)
    engine = create_async_engine(uri, future=True, echo=False)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(TenantDataBase.metadata.create_all)
        print(
            f"Schema ensured. Total per-tenant tables tracked: {len(TenantDataBase.metadata.tables)}",
            flush=True,
        )
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
