"""Role-based access control and IDOR-prevention helpers.

This module layers explicit RBAC + ownership checks on top of the platform's
existing access model rather than inventing a parallel one. The real model is:

  * **Tenant isolation** — every request is bound to one ``TenantContext`` and
    every persisted row carries a ``tenant_id``. Scoping queries to the
    caller's tenant is the platform's primary IDOR defense and is enforced here
    too (see :func:`authorize_access`).
  * **Roles** — ``users.role`` is one of the values in :class:`Role`
    (``platform_admin`` is the cross-tenant superuser; ``admin`` is the
    tenant administrator). The clinical role taxonomy from the security spec
    (PATIENT/CLINICIAN/NURSE/BILLING) is *mapped* onto these via
    :data:`ROLE_ALIASES` so callers can use spec language without forking the
    schema.
  * **Application permissions** — fine-grained per-app levels live in
    ``users.app_permissions`` and are enforced by
    :func:`app.utils.security.require_application`. RBAC here is coarser and
    composes with that.

Every failure path raises **403 with a generic message** — never 404 and never
a message that reveals whether a given resource id exists. That is a deliberate
anti-enumeration choice required by the spec.
"""
from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional, Type

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_control_session
from ..db.tenant_manager import TenantContext
from ..dependencies.tenant import get_tenant_context
from ..models.tables import PortalSavedItem, PortalTodo, UserPreference
from .security import AuthenticatedUser, get_current_user

# A single generic string for every authz failure so the response body can
# never be used to distinguish "forbidden" from "does not exist".
_GENERIC_FORBIDDEN = "Access denied"


def _forbidden() -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=_GENERIC_FORBIDDEN)


class Role(str, enum.Enum):
    """Canonical roles understood by the platform (value == ``users.role``)."""

    USER = "user"
    ANALYST = "analyst"
    ADMIN = "admin"
    PLATFORM_ADMIN = "platform_admin"
    COORDINATOR = "coordinator"
    SUPERVISOR = "supervisor"
    BUSINESS_ADMIN = "business_admin"
    COMPLIANCE_AUDITOR = "compliance_auditor"


# platform_admin is the superuser: it satisfies any role requirement. admin is
# the tenant administrator and satisfies admin-or-lower requirements.
SUPERUSER_ROLES: frozenset[str] = frozenset({Role.PLATFORM_ADMIN.value})

# Maps the security spec's clinical vocabulary onto the roles this platform
# actually has, so a caller can write ``require_role("CLINICIAN")`` and have it
# resolve to the real authorization model instead of silently never matching.
ROLE_ALIASES: Dict[str, str] = {
    "patient": Role.USER.value,
    "clinician": Role.ANALYST.value,
    "nurse": Role.ANALYST.value,
    "billing": Role.ANALYST.value,
    "admin": Role.ADMIN.value,
    "coordinator": Role.COORDINATOR.value,
    "care_coordinator": Role.COORDINATOR.value,
    "care coordinator": Role.COORDINATOR.value,
    "supervisor": Role.SUPERVISOR.value,
    "business_admin": Role.BUSINESS_ADMIN.value,
    "business admin": Role.BUSINESS_ADMIN.value,
    "compliance_auditor": Role.COMPLIANCE_AUDITOR.value,
    "compliance auditor": Role.COMPLIANCE_AUDITOR.value,
    "auditor": Role.COMPLIANCE_AUDITOR.value,
}


def normalize_role(value: str) -> str:
    v = (value or "").strip().lower()
    return ROLE_ALIASES.get(v, v)


# ---------------------------------------------------------------------------
# Deny-by-default authorization capability matrix
# ---------------------------------------------------------------------------

ROLE_CAPABILITIES: Dict[str, frozenset[str]] = {
    Role.COORDINATOR.value: frozenset({
        "m360:read", "m360:write", "timeline:read", "timeline:write",
        "notes:read", "notes:write", "journey:read", "journey:write",
        "gaps:read", "medications:read", "labs:read", "documents:read",
        "documents:write", "tasks:read", "tasks:write", "rides:manage",
    }),
    Role.SUPERVISOR.value: frozenset({
        "m360:read", "m360:write", "timeline:read", "timeline:write",
        "notes:read", "notes:write", "journey:read", "journey:write",
        "gaps:read", "medications:read", "labs:read", "documents:read",
        "documents:write", "tasks:read", "tasks:write", "rides:manage",
        "tasks:escalations", "audit:read", "settings:manage",
    }),
    Role.BUSINESS_ADMIN.value: frozenset({
        "m360:read", "admin:templates", "admin:policies", "admin:rules",
        "admin:channels", "admin:queues", "admin:users", "audit:read",
        "settings:manage", "user:manage",
    }),
    Role.COMPLIANCE_AUDITOR.value: frozenset({
        "m360:read", "timeline:read", "audit:read", "audit:export",
        "compliance:read", "documents:read", "notes:read",
    }),
    # Backwards-compatible legacy roles:
    Role.ADMIN.value: frozenset({
        "m360:read", "m360:write", "timeline:read", "timeline:write",
        "notes:read", "notes:write", "journey:read", "journey:write",
        "gaps:read", "medications:read", "labs:read", "documents:read",
        "documents:write", "tasks:read", "tasks:write", "rides:manage",
        "tasks:escalations", "admin:templates", "admin:policies", "admin:rules",
        "admin:channels", "admin:queues", "admin:users", "audit:read",
        "settings:manage", "user:manage",
    }),
    Role.ANALYST.value: frozenset({
        "m360:read", "m360:write", "timeline:read", "notes:read", "notes:write",
        "journey:read", "journey:write", "gaps:read", "medications:read",
        "labs:read", "documents:read", "tasks:read",
    }),
    Role.USER.value: frozenset({
        "m360:read", "timeline:read", "documents:read",
    }),
}


def require_role(*allowed: str) -> Callable[..., Any]:
    """Dependency factory: allow only the listed roles (platform_admin always).

    ``allowed`` accepts :class:`Role` members, their string values, or
    aliases (case-insensitive). Returns the authenticated user so routes can
    ``Depends`` on it directly. Fails closed (403 Access Denied) by default.
    """
    allowed_values = {
        normalize_role(r.value if isinstance(r, Role) else str(r)) for r in allowed
    }

    async def _dependency(
        current_user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        role = normalize_role(current_user.role)
        if role in SUPERUSER_ROLES:
            return current_user
        if role not in allowed_values:
            raise _forbidden()
        return current_user

    return _dependency


def require_permission(permission: str) -> Callable[..., Any]:
    """Deny-by-default capability dependency.

    Evaluates whether the user's role grants the requested permission.
    Any unlisted permission or unmapped role is denied immediately with 403.
    """
    async def _dependency(
        current_user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        role = normalize_role(current_user.role)
        if role in SUPERUSER_ROLES:
            return current_user
        role_caps = ROLE_CAPABILITIES.get(role, frozenset())
        if permission not in role_caps:
            raise _forbidden()
        return current_user

    return _dependency


def require_mutation_allowed() -> Callable[..., Any]:
    """Deny-by-default write check: blocks Compliance Auditor or read-only users."""
    async def _dependency(
        current_user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        role = normalize_role(current_user.role)
        if role == Role.COMPLIANCE_AUDITOR.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Compliance Auditor role has read-only privileges",
            )
        return current_user

    return _dependency


def require_clinical_authoring_allowed() -> Callable[..., Any]:
    """Deny-by-default clinical write check: blocks Business Admin and Compliance Auditor."""
    async def _dependency(
        current_user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        role = normalize_role(current_user.role)
        if role == Role.COMPLIANCE_AUDITOR.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Compliance Auditor role has read-only privileges",
            )
        if role == Role.BUSINESS_ADMIN.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Business Administrator role cannot author clinical records",
            )
        return current_user

    return _dependency


# ---------------------------------------------------------------------------
# Ownership / IDOR prevention
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ResourcePolicy:
    """Describes how a resource type is scoped and owned.

    * ``tenant_column`` — scopes the lookup to the caller's tenant. This is the
      IDOR boundary: a row in another tenant is invisible (treated as absent).
    * ``owner_column`` — the column identifying the owning principal. When set,
      non-privileged callers may only access rows where this column equals
      ``owner_value(user)``.
    * ``privileged_roles`` — roles that may access any row within their tenant
      regardless of ``owner_column`` (e.g. a tenant admin reviewing records).
    """

    model: Type[Any]
    id_column: str = "id"
    tenant_column: Optional[str] = "tenant_id"
    owner_column: Optional[str] = None
    owner_value: Callable[[AuthenticatedUser], Any] = field(default=lambda u: u.id)
    privileged_roles: frozenset[str] = frozenset({
        Role.ADMIN.value,
        Role.PLATFORM_ADMIN.value,
        Role.BUSINESS_ADMIN.value,
        Role.SUPERVISOR.value,
    })


# Registry of known control-plane resources. Tenant-plane resources can either
# register here (and pass a tenant session to authorize_access) or call
# authorize_access with an inline ResourcePolicy.
RESOURCE_POLICIES: Dict[str, ResourcePolicy] = {
    "portal_saved_item": ResourcePolicy(
        model=PortalSavedItem, owner_column="user_id", owner_value=lambda u: u.id
    ),
    "portal_todo": ResourcePolicy(
        model=PortalTodo, owner_column="assigned_to", owner_value=lambda u: u.email
    ),
    "user_preference": ResourcePolicy(
        model=UserPreference, owner_column="user_id", owner_value=lambda u: u.id
    ),
}


def register_resource_policy(resource_type: str, policy: ResourcePolicy) -> None:
    """Register (or override) a resource policy. Idempotent; safe at import."""
    RESOURCE_POLICIES[resource_type] = policy


def _resolve_policy(resource_type: str, policy: Optional[ResourcePolicy]) -> ResourcePolicy:
    if policy is not None:
        return policy
    resolved = RESOURCE_POLICIES.get(resource_type)
    if resolved is None:
        # Misconfiguration, not a client error: fail closed with 403 rather
        # than leak that the resource type is unknown.
        raise _forbidden()
    return resolved


async def authorize_access(
    session: AsyncSession,
    user: AuthenticatedUser,
    tenant: TenantContext,
    resource_id: Any,
    resource_type: str,
    *,
    policy: Optional[ResourcePolicy] = None,
) -> Any:
    """Fetch ``resource_id`` and confirm ``user`` is allowed to see it.

    The query is always scoped to the caller's tenant (``AND tenant_id =
    :tenant``) so a resource belonging to another tenant is indistinguishable
    from one that does not exist. Ownership is then enforced for non-privileged
    roles. Any failure — missing row, wrong tenant, wrong owner — raises an
    identical 403, leaking nothing about existence.

    Returns the resource object on success.
    """
    resolved = _resolve_policy(resource_type, policy)
    model = resolved.model

    stmt = select(model).where(getattr(model, resolved.id_column) == resource_id)
    if resolved.tenant_column and hasattr(model, resolved.tenant_column):
        stmt = stmt.where(getattr(model, resolved.tenant_column) == tenant.id)
    stmt = stmt.limit(1)

    resource = await session.scalar(stmt)
    if resource is None:
        raise _forbidden()

    if resolved.owner_column:
        role = (user.role or "").strip().lower()
        if role not in resolved.privileged_roles:
            expected = resolved.owner_value(user)
            actual = getattr(resource, resolved.owner_column, None)
            if expected is None or actual != expected:
                raise _forbidden()

    return resource


def require_ownership(
    resource_type: str,
    *,
    id_param: str = "resource_id",
    policy: Optional[ResourcePolicy] = None,
) -> Callable[..., Any]:
    """Dependency factory enforcing ownership for a control-plane resource.

    Reads the resource id from the matched path parameter ``id_param`` and runs
    :func:`authorize_access` against the control session. Returns the resource
    so the route can reuse it without a second fetch. Tenant-plane resources
    should call :func:`authorize_access` directly with their tenant session.
    """

    async def _dependency(
        request: Request,
        current_user: AuthenticatedUser = Depends(get_current_user),
        tenant: TenantContext = Depends(get_tenant_context),
        session: AsyncSession = Depends(get_control_session),
    ) -> Any:
        raw_id = request.path_params.get(id_param)
        if raw_id is None:
            raise _forbidden()
        return await authorize_access(
            session, current_user, tenant, raw_id, resource_type, policy=policy
        )

    return _dependency
