"""OIDC / AWS Cognito Authentication Service with IdP Group-to-Role Mapping.

Provides:
  * Authorization code exchange against standard OIDC / AWS Cognito token endpoint.
  * RS256 token signature validation via JWKS client (cached).
  * Extraction of user claims (email, name, sub).
  * IdP Group-to-Role mapping with strict Deny-by-Default authorization.
  * Local development mock handler when ALLOW_DUMMY_LOGIN or ENVIRONMENT is dev/test.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any, Dict, List, Optional

import httpx
import jwt
from fastapi import HTTPException, status

from ..core.config import settings
from ..utils.rbac import normalize_role, Role

logger = logging.getLogger(__name__)

# Priority order for resolving multiple IdP group memberships to a primary role
ROLE_PRIORITY: List[str] = [
    Role.PLATFORM_ADMIN.value,
    Role.ADMIN.value,
    Role.BUSINESS_ADMIN.value,
    Role.SUPERVISOR.value,
    Role.COORDINATOR.value,
    Role.COMPLIANCE_AUDITOR.value,
    Role.ANALYST.value,
    Role.USER.value,
]


def is_oidc_configured() -> bool:
    """Return True if OIDC issuer or JWKS endpoint is configured."""
    return bool(settings.OIDC_ISSUER_URL or settings.OIDC_JWKS_URL)


def get_jwks_url() -> str:
    """Resolve the JWKS endpoint URL from settings."""
    if settings.OIDC_JWKS_URL:
        return settings.OIDC_JWKS_URL
    if settings.OIDC_ISSUER_URL:
        issuer = settings.OIDC_ISSUER_URL.rstrip("/")
        # AWS Cognito format is {issuer}/.well-known/jwks.json
        return f"{issuer}/.well-known/jwks.json"
    return ""


@lru_cache(maxsize=4)
def _jwks_client(jwks_url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(jwks_url)


def resolve_role_from_groups(groups: List[str]) -> Optional[str]:
    """Map IdP groups to the canonical application role.

    Enforces strict deny-by-default: If no recognized group is provided, returns None.
    If multiple groups match, resolves to the highest-privilege role according to ROLE_PRIORITY.
    """
    if not groups:
        return None

    matched_roles: set[str] = set()
    mapping = settings.IDP_GROUP_ROLE_MAPPING or {}

    for group_raw in groups:
        group = group_raw.strip()
        # Direct lookup
        if group in mapping:
            matched_roles.add(normalize_role(mapping[group]))
            continue
        # Case-insensitive lookup
        for map_key, map_role in mapping.items():
            if map_key.lower() == group.lower():
                matched_roles.add(normalize_role(map_role))
                break

    if not matched_roles:
        return None

    # Pick the highest priority role
    for role_candidate in ROLE_PRIORITY:
        if role_candidate in matched_roles:
            return role_candidate

    return next(iter(matched_roles))


def extract_claims_info(claims: Dict[str, Any]) -> Dict[str, Any]:
    """Extract email, name, sub, and groups from decoded OIDC token claims."""
    # Email resolution
    email = None
    for claim_key in ("email", "preferred_username", "upn", "sub"):
        val = claims.get(claim_key)
        if isinstance(val, str) and "@" in val:
            email = val.strip().lower()
            break
    if not email and claims.get("sub"):
        email = f"{claims['sub']}@idp.internal"

    # Name resolution
    name = claims.get("name") or claims.get("given_name") or (email.split("@")[0] if email else "User")

    # Groups resolution (Cognito uses cognito:groups; standard OIDC uses groups/roles)
    raw_groups = (
        claims.get(settings.OIDC_GROUPS_CLAIM)
        or claims.get("cognito:groups")
        or claims.get("groups")
        or claims.get("roles")
        or []
    )
    if isinstance(raw_groups, str):
        groups = [g.strip() for g in raw_groups.split(",") if g.strip()]
    elif isinstance(raw_groups, list):
        groups = [str(g).strip() for g in raw_groups if g]
    else:
        groups = []

    return {
        "email": email,
        "name": name,
        "sub": claims.get("sub"),
        "groups": groups,
    }


async def exchange_oidc_code(
    *,
    code: str,
    code_verifier: Optional[str] = None,
    redirect_uri: str,
) -> str:
    """Exchange authorization code for an ID token at the IdP token endpoint."""
    # Local dev fallback / mock simulation
    if (settings.ALLOW_DUMMY_LOGIN or settings.ENVIRONMENT in ("development", "test")) and (
        code.startswith("mock_") or code.startswith("demo_") or not is_oidc_configured()
    ):
        return f"mock_oidc_token:{code}"

    if not is_oidc_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OIDC provider is not configured",
        )

    token_url = f"{settings.OIDC_ISSUER_URL.rstrip('/')}/oauth2/token"
    data = {
        "grant_type": "authorization_code",
        "client_id": settings.OIDC_CLIENT_ID,
        "code": code,
        "redirect_uri": redirect_uri,
    }
    if code_verifier:
        data["code_verifier"] = code_verifier
    if settings.OIDC_CLIENT_SECRET:
        data["client_secret"] = settings.OIDC_CLIENT_SECRET

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(token_url, data=data)

    if response.status_code >= 400:
        logger.error("OIDC token exchange failed: %s - %s", response.status_code, response.text)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OIDC token exchange failed",
        )

    payload = response.json()
    id_token = payload.get("id_token") or payload.get("access_token")
    if not id_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OIDC provider did not return an identity token",
        )
    return id_token


def validate_oidc_token(id_token: str, *, nonce: Optional[str] = None) -> Dict[str, Any]:
    """Validate OIDC token signature and decode claims.

    In dev/test environments with mock tokens, decodes the simulated payload safely.
    In real OIDC environments, verifies signatures against the JWKS endpoint using RS256.
    """
    # Development mock handler
    if id_token.startswith("mock_oidc_token:"):
        code_part = id_token.split(":", 1)[1]
        # Allow simulating different groups via the mock code prefix or parameters
        # e.g. mock_coordinator, mock_supervisor, mock_business_admin, mock_auditor, mock_unauthorized
        sub_type = code_part.replace("mock_", "").replace("demo_", "")
        email_map = {
            "coordinator": "coordinator@prominencehealth.com",
            "supervisor": "supervisor@prominencehealth.com",
            "business_admin": "business.admin@prominencehealth.com",
            "compliance_auditor": "auditor@prominencehealth.com",
            "admin": "admin@prominencehealth.com",
        }
        groups_map = {
            "coordinator": ["Prominence_Care_Coordinators"],
            "supervisor": ["Prominence_Clinical_Supervisors"],
            "business_admin": ["Prominence_Business_Admins"],
            "compliance_auditor": ["Prominence_Compliance_Auditors"],
            "admin": ["Prominence_Administrators"],
            "unauthorized": ["Unknown_Guest_Group"],
        }
        matched_key = "coordinator"
        for k in groups_map:
            if k in sub_type.lower():
                matched_key = k
                break

        return {
            "sub": f"mock-oidc-sub-{matched_key}",
            "email": email_map.get(matched_key, f"{matched_key}@prominencehealth.com"),
            "name": f"Mock {matched_key.replace('_', ' ').title()}",
            "cognito:groups": groups_map[matched_key],
            "nonce": nonce,
            "iss": "mock-issuer",
            "aud": "mock-client-id",
        }

    jwks_url = get_jwks_url()
    if not jwks_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OIDC JWKS endpoint is not configured",
        )

    try:
        signing_key = _jwks_client(jwks_url).get_signing_key_from_jwt(id_token)
        decode_kwargs: Dict[str, Any] = {
            "algorithms": settings.OIDC_ALGORITHMS or ["RS256"],
            "options": {"require": ["exp", "iat", "iss", "sub"]},
        }
        if settings.OIDC_CLIENT_ID or settings.OIDC_AUDIENCE:
            decode_kwargs["audience"] = settings.OIDC_AUDIENCE or settings.OIDC_CLIENT_ID
        if settings.OIDC_ISSUER_URL:
            decode_kwargs["issuer"] = settings.OIDC_ISSUER_URL.rstrip("/")

        claims = jwt.decode(id_token, signing_key.key, **decode_kwargs)
    except jwt.PyJWTError as exc:
        logger.warning("OIDC token validation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid OIDC identity token",
        ) from exc

    if nonce and claims.get("nonce") != nonce:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid OIDC login nonce",
        )

    return claims
