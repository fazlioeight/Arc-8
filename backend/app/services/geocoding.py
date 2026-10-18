"""Geocoding for provider search (Feature 6).

PRIVACY (hard requirement): the only data this module ever sends to Google is a
plain address/location string — a provider address, or the location the member
typed into the search box. It has NO access to and never transmits member
identity, member id, or any other PHI. Functions take a bare string by design so
there is no channel for identifiers to leak.

Results are CACHED (``m360_geocode_cache`` + the provider location row) so a
given address is sent to Google at most once; searches never re-geocode.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from math import asin, cos, radians, sin, sqrt
from typing import Optional, Tuple

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..models.member360 import Member360GeocodeCache, Member360ProviderLocation

logger = logging.getLogger(__name__)

_GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"

LatLng = Tuple[float, float]


def _normalize(query: str) -> str:
    return " ".join((query or "").split()).strip().lower()


def haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in miles between two lat/lng points."""
    r = 3958.7613  # Earth radius, miles
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 2 * r * asin(sqrt(a))


async def _call_google_geocode(address: str) -> Optional[LatLng]:
    """Call Google's Geocoding API for one address string. Returns (lat, lng)
    or None. The request body carries ONLY the address + API key.

    Isolated so tests can monkeypatch it without real network calls.
    """
    key = settings.GOOGLE_GEOCODING_API_KEY
    if not key:
        return None
    params = {"address": address, "key": key, "components": "country:US"}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(_GOOGLE_GEOCODE_URL, params=params)
        data = resp.json()
    except Exception:  # noqa: BLE001 — geocoding is best-effort
        logger.exception("google geocode request failed")
        return None
    if data.get("status") != "OK" or not data.get("results"):
        return None
    loc = data["results"][0]["geometry"]["location"]
    return float(loc["lat"]), float(loc["lng"])


async def geocode_query(session: AsyncSession, query: str) -> Optional[LatLng]:
    """Resolve a free-text address/ZIP to coordinates, using the cache.

    Used for the member-entered search location. Never receives member identity.
    Returns None when unresolved or no API key is configured (search then simply
    runs without a distance origin).
    """
    norm = _normalize(query)
    if not norm:
        return None

    cached = await session.scalar(
        select(Member360GeocodeCache).where(Member360GeocodeCache.query_text == norm).limit(1)
    )
    if cached is not None:
        if cached.status == "ok" and cached.latitude is not None and cached.longitude is not None:
            return cached.latitude, cached.longitude
        return None  # cached failure — don't hammer Google again

    coords = await _call_google_geocode(norm)
    session.add(
        Member360GeocodeCache(
            query_text=norm,
            latitude=coords[0] if coords else None,
            longitude=coords[1] if coords else None,
            status="ok" if coords else "failed",
        )
    )
    await session.commit()
    return coords


def _location_address_string(loc: Member360ProviderLocation) -> str:
    parts = [loc.address_line1, loc.city, loc.state, loc.postal_code]
    return ", ".join(p for p in parts if p)


async def geocode_pending_provider_locations(session: AsyncSession, *, limit: int = 100) -> int:
    """Batch-geocode provider locations still marked ``pending``.

    Run as a maintenance/cron step after a provider import — NOT on the request
    path, so member searches never trigger a Google round-trip. Returns the
    number of locations updated. Provider addresses only; no PHI involved.
    """
    pending = (
        await session.scalars(
            select(Member360ProviderLocation)
            .where(Member360ProviderLocation.geocode_status == "pending")
            .limit(limit)
        )
    ).all()
    updated = 0
    for loc in pending:
        address = _location_address_string(loc)
        if not address:
            loc.geocode_status = "failed"
            continue
        coords = await geocode_query(session, address)
        if coords:
            loc.latitude, loc.longitude = coords
            loc.geocode_status = "ok"
        else:
            loc.geocode_status = "failed"
        loc.geocoded_at = datetime.now(timezone.utc)
        updated += 1
    await session.commit()
    return updated
