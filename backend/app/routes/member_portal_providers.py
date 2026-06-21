"""Member-facing provider / PCP search (Feature 6).

Mounted at ``/api/member/providers``. Members find in-network providers and PCPs
from the tenant's provider directory, ranked by distance from a search origin
(browser coordinates, or a member-entered address/ZIP, or the plan service-area
default). Results carry coordinates so the frontend can render a synced list+map.

PRIVACY (hard requirement): no PHI, member id, or member identity is ever sent to
Google. The only thing geocoded is the member-entered location string; provider
addresses are geocoded out-of-band and cached. The server-side Geocoding key
stays server-side; the browser Maps key (referrer-restricted) is exposed only via
``/map-config``.

This is directory data (not the member's PHI), so reads are gated on a member
session but are NOT written to the PHI audit trail; the member-entered location
is deliberately never logged.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context, get_tenant_session
from ..middleware.rate_limit import member_phi_rate_limit
from ..schemas.member_portal import (
    MapConfigResponse,
    ProviderLocationOut,
    ProviderNetworkOut,
    ProviderOut,
    ProviderSearchOrigin,
    ProviderSearchResponse,
)
from ..services import geocoding, provider_search
from ..utils.member_auth import AuthenticatedMember, get_current_member

router = APIRouter(
    prefix="/api/member/providers",
    tags=["member-portal"],
    dependencies=[Depends(get_current_member), Depends(member_phi_rate_limit())],
)
logger = logging.getLogger(__name__)


@router.get("/map-config", response_model=MapConfigResponse)
async def map_config() -> MapConfigResponse:
    """Public browser Maps key for the frontend map (referrer-restricted in the
    Google console). Never returns the server-side Geocoding key."""
    key = settings.GOOGLE_MAPS_BROWSER_KEY or ""
    return MapConfigResponse(maps_api_key=key, has_key=bool(key))


@router.get("", response_model=ProviderSearchResponse)
async def search(
    request: Request,
    specialty: Optional[str] = Query(default=None, max_length=120),
    name: Optional[str] = Query(default=None, max_length=160),
    plan: Optional[str] = Query(default=None, max_length=128),
    lob: Optional[str] = Query(default=None, max_length=64),
    pcp: Optional[bool] = Query(default=None),
    zip_code: Optional[str] = Query(default=None, alias="zip", max_length=10),
    address: Optional[str] = Query(default=None, max_length=200),
    lat: Optional[float] = Query(default=None, ge=-90, le=90),
    lng: Optional[float] = Query(default=None, ge=-180, le=180),
    radius_miles: Optional[float] = Query(default=None, ge=0, le=500),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    tenant: TenantContext = Depends(get_tenant_context),
    session: AsyncSession = Depends(get_tenant_session),
) -> ProviderSearchResponse:
    origin: Optional[tuple] = None
    origin_out: Optional[ProviderSearchOrigin] = None

    # 1) Explicit browser coordinates win (e.g. device geolocation).
    if lat is not None and lng is not None:
        origin = (lat, lng)
        origin_out = ProviderSearchOrigin(latitude=lat, longitude=lng, source="coords")
    else:
        # 2) Member-entered address/ZIP — geocoded (cached). ONLY the location
        #    string is sent to Google; no member identity.
        query = address or zip_code
        if query:
            coords = await geocoding.geocode_query(session, query)
            if coords:
                origin = coords
                origin_out = ProviderSearchOrigin(latitude=coords[0], longitude=coords[1], source="geocoded")

    effective_radius = radius_miles
    if origin is not None and effective_radius is None and (zip_code or address):
        effective_radius = settings.PROVIDER_SEARCH_DEFAULT_RADIUS_MILES

    results, total = await provider_search.search_providers(
        session,
        specialty=specialty,
        name=name,
        plan_name=plan,
        line_of_business=lob,
        is_pcp=pcp,
        origin=origin,
        radius_miles=effective_radius,
        limit=limit,
        offset=offset,
    )

    items = []
    for r in results:
        p = r.provider
        items.append(
            ProviderOut(
                id=p.id,
                npi=p.npi,
                name=p.name,
                specialty=p.specialty,
                is_pcp=p.is_pcp,
                accepting_new_patients=p.accepting_new_patients,
                phone=p.phone,
                languages=list(p.languages or []),
                nearest_distance_miles=r.nearest_distance_miles,
                locations=[
                    ProviderLocationOut(
                        address_line1=loc.address_line1,
                        address_line2=loc.address_line2,
                        city=loc.city,
                        state=loc.state,
                        postal_code=loc.postal_code,
                        latitude=loc.latitude,
                        longitude=loc.longitude,
                        phone=loc.phone,
                        distance_miles=provider_search.location_distance(loc.latitude, loc.longitude, origin),
                    )
                    for loc in p.locations
                ],
                networks=[ProviderNetworkOut.model_validate(n) for n in p.networks],
            )
        )

    return ProviderSearchResponse(
        items=items, total=total, limit=limit, offset=offset, origin=origin_out
    )


@router.post("/{provider_id}/request-pcp", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def request_pcp_change(
    provider_id: int,
    tenant: TenantContext = Depends(get_tenant_context),
    current_member: AuthenticatedMember = Depends(get_current_member),
):
    """STUB — request a provider as the member's PCP.

    Intentionally not implemented: there is no confirmed internal PCP-change
    workflow to route this into (the A&G module is deferred, and no service-
    request pathway exists). Returns 501 so the surface is discoverable without
    pretending to act. Wire to the real pathway once one is confirmed.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="PCP change requests are not enabled yet.",
    )
