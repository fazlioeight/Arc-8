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
}


def normalize_role(value: str) -> str:
    v = (value or "").strip().lower()
    return ROLE_ALIASES.get(v, v)


def require_role(*allowed: str) -> Callable[..., Any]:
    """Dependency factory: allow only the listed roles (platform_admin always).

    ``allowed`` accepts :class:`Role` members, their string values, or the
    spec's clinical aliases (case-insensitive). Returns the authenticated user
    so routes can ``Depends`` on it directly.
    """
    allowed_values = {
        normalize_role(r.value if isinstance(r, Role) else str(r)) for r in allowed
    }

    async def _dependency(
        current_user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        role = (current_user.role or "").strip().lower()
        if role in SUPERUSER_ROLES:
            return current_user
        if role not in allowed_values:
            raise _forbidden()
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
    privileged_roles: frozenset[str] = frozenset({Role.ADMIN.value, Role.PLATFORM_ADMIN.value})


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
