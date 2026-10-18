from __future__ import annotations

from functools import lru_cache
from typing import Any

import httpx
import jwt
from fastapi import HTTPException, status

from ..core.config import settings


def _authority_url() -> str:
    authority_host = settings.AZURE_AUTHORITY_HOST.rstrip("/")
    return f"{authority_host}/{settings.AZURE_TENANT_ID}/v2.0"


def _ensure_azure_auth_configured() -> None:
    if not settings.AZURE_AUTH_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Azure login is not enabled",
        )
    if not settings.AZURE_TENANT_ID or not settings.AZURE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Azure login is not configured",
        )


@lru_cache(maxsize=4)
def _jwks_client(authority: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{authority}/discovery/v2.0/keys")


async def exchange_code_for_id_token(
    *,
    code: str,
    code_verifier: str,
    redirect_uri: str,
) -> str:
    _ensure_azure_auth_configured()
    token_url = f"{_authority_url()}/oauth2/v2.0/token"
    data = {
        "client_id": settings.AZURE_CLIENT_ID,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "code_verifier": code_verifier,
        "scope": settings.AZURE_AUTH_SCOPES,
    }
    if settings.AZURE_CLIENT_SECRET:
        data["client_secret"] = settings.AZURE_CLIENT_SECRET

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(token_url, data=data)

    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Azure login failed",
        )

    token_payload = response.json()
    id_token = token_payload.get("id_token")
    if not id_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Azure login did not return an identity token",
        )
    return id_token


def validate_id_token(id_token: str, *, nonce: str | None = None) -> dict[str, Any]:
    _ensure_azure_auth_configured()
    authority = _authority_url()
    try:
        signing_key = _jwks_client(authority).get_signing_key_from_jwt(id_token)
        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.AZURE_CLIENT_ID,
            issuer=authority,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Azure identity token",
        ) from exc

    if nonce and claims.get("nonce") != nonce:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Azure login nonce",
        )

    return claims


def resolve_email_from_claims(claims: dict[str, Any]) -> str | None:
    for claim_name in ("preferred_username", "email", "upn"):
        value = claims.get(claim_name)
        if isinstance(value, str) and value.strip():
            return value.strip().lower()
    return None
