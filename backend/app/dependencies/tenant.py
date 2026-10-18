from __future__ import annotations

from typing import AsyncGenerator

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.tenant_manager import TenantContext, tenant_connection_manager


async def get_tenant_context(request: Request) -> TenantContext:
    tenant = getattr(request.state, "tenant", None)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant context unavailable")
    return tenant


async def get_tenant_session(
    tenant: TenantContext = Depends(get_tenant_context),
) -> AsyncGenerator[AsyncSession, None]:
    async with tenant_connection_manager.get_session(tenant) as session:
        yield session
