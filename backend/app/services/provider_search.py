"""In-network provider / PCP search (Feature 6).

Filters the tenant's provider directory (specialty, PCP-eligible, plan/LOB
network, name) in SQL, then ranks by distance from a search origin computed
locally from cached geocodes — no per-request Google calls. Tenant isolation is
structural (the session is bound to the caller's tenant DB).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Tuple

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.config import settings
from ..models.member360 import Member360Provider, Member360ProviderNetwork
from .geocoding import haversine_miles

LatLng = Tuple[float, float]


@dataclass(slots=True)
class ProviderResult:
    provider: Member360Provider
    nearest_distance_miles: Optional[float]


async def search_providers(
    session: AsyncSession,
    *,
    specialty: Optional[str] = None,
    name: Optional[str] = None,
    plan_name: Optional[str] = None,
    line_of_business: Optional[str] = None,
    is_pcp: Optional[bool] = None,
    origin: Optional[LatLng] = None,
    radius_miles: Optional[float] = None,
    limit: int = 25,
    offset: int = 0,
) -> Tuple[List[ProviderResult], int]:
    """Return (page, total) of matching providers.

    Distance is computed only when ``origin`` is provided; results are then
    sorted nearest-first (and optionally filtered to ``radius_miles``).
    Without an origin, results are name-sorted.
    """
    stmt = (
        select(Member360Provider)
        .where(Member360Provider.status == "active")
        .options(
            selectinload(Member360Provider.locations),
            selectinload(Member360Provider.networks),
        )
    )
    if specialty:
        stmt = stmt.where(func.lower(Member360Provider.specialty) == specialty.strip().lower())
    if is_pcp is not None:
        stmt = stmt.where(Member360Provider.is_pcp.is_(is_pcp))
    if name:
        stmt = stmt.where(Member360Provider.name.ilike(f"%{name.strip()}%"))
    if plan_name or line_of_business:
        net = select(Member360ProviderNetwork.provider_id).where(
            Member360ProviderNetwork.network_status == "in_network"
        )
        if plan_name:
            net = net.where(Member360ProviderNetwork.plan_name == plan_name)
        if line_of_business:
            net = net.where(Member360ProviderNetwork.line_of_business == line_of_business)
        stmt = stmt.where(Member360Provider.id.in_(net))

    # Bounded candidate fetch; distance sort/pagination happen in Python because
    # ranking needs per-location haversine. Cap guards pathological directories.
    candidates = (
        await session.scalars(stmt.limit(settings.PROVIDER_SEARCH_MAX_CANDIDATES))
    ).all()

    results: List[ProviderResult] = []
    for provider in candidates:
        nearest = _nearest_distance(provider, origin)
        if origin is not None and radius_miles is not None:
            if nearest is None or nearest > radius_miles:
                continue
        results.append(ProviderResult(provider=provider, nearest_distance_miles=nearest))

    if origin is not None:
        # Providers without any geocoded location sort last.
        results.sort(key=lambda r: (r.nearest_distance_miles is None, r.nearest_distance_miles or 0.0))
    else:
        results.sort(key=lambda r: (r.provider.name or "").lower())

    total = len(results)
    return results[offset : offset + limit], total


def _nearest_distance(provider: Member360Provider, origin: Optional[LatLng]) -> Optional[float]:
    if origin is None:
        return None
    best: Optional[float] = None
    for loc in provider.locations:
        if loc.latitude is None or loc.longitude is None:
            continue
        d = haversine_miles(origin[0], origin[1], loc.latitude, loc.longitude)
        if best is None or d < best:
            best = d
    return best


def location_distance(
    latitude: Optional[float], longitude: Optional[float], origin: Optional[LatLng]
) -> Optional[float]:
    if origin is None or latitude is None or longitude is None:
        return None
    return haversine_miles(origin[0], origin[1], latitude, longitude)
