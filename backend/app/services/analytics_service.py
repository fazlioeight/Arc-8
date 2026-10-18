from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.tables import Claim


async def tenant_totals(session: AsyncSession) -> dict:
    total_claims = await session.scalar(select(func.count(Claim.id)))
    total_cost_raw = await session.scalar(select(func.coalesce(func.sum(Claim.cost), 0)))
    total_cost = float(total_cost_raw) if isinstance(total_cost_raw, (Decimal, float, int)) else 0.0
    return {
        "total_claims": int(total_claims or 0),
        "total_cost": total_cost,
    }
