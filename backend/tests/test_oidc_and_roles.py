"""Tests for SSO/OIDC sign-in, IdP group-to-role mapping, and deny-by-default authorization.

Validates:
  * Canonical personas: Coordinator, Supervisor, Business Admin, Compliance Auditor.
  * IdP group mapping to internal roles with priority resolution.
  * Strict deny-by-default authorization when groups are unknown or unmapped.
  * Capability and route authorization rules for all 4 roles.
  * Read-only enforcement for Compliance Auditor.
  * Non-clinical authoring enforcement for Business Admin.
"""
import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.oidc_auth import (
    extract_claims_info,
    resolve_role_from_groups,
    validate_oidc_token,
)
from app.utils.rbac import (
    Role,
    normalize_role,
    require_clinical_authoring_allowed,
    require_mutation_allowed,
    require_permission,
    require_role,
)
from app.utils.security import AuthenticatedUser

pytestmark = pytest.mark.anyio("asyncio")


def _user(role: str, email: str = "test@prominencehealth.com") -> AuthenticatedUser:
    return AuthenticatedUser(
        id=1,
        email=email,
        tenant_id=1,
        tenant_key="prominencehealth",
        role=role,
        scopes=["member360", "portal"],
        app_permissions={"member360": "user", "portal": "user"},
    )


# ── 1. Role Taxonomy & Aliases ──────────────────────────────────────────────


def test_target_roles_exist_in_enum():
    assert Role.COORDINATOR.value == "coordinator"
    assert Role.SUPERVISOR.value == "supervisor"
    assert Role.BUSINESS_ADMIN.value == "business_admin"
    assert Role.COMPLIANCE_AUDITOR.value == "compliance_auditor"


def test_role_aliases_normalize_target_personas():
    assert normalize_role("coordinator") == "coordinator"
    assert normalize_role("Care Coordinator") == "coordinator"
    assert normalize_role("supervisor") == "supervisor"
    assert normalize_role("business_admin") == "business_admin"
    assert normalize_role("Business Admin") == "business_admin"
    assert normalize_role("compliance_auditor") == "compliance_auditor"
    assert normalize_role("Compliance Auditor") == "compliance_auditor"
    assert normalize_role("auditor") == "compliance_auditor"


# ── 2. IdP Group-to-Role Mapping & Deny-by-Default ──────────────────────────


def test_idp_group_to_role_mapping_success():
    assert resolve_role_from_groups(["Prominence_Care_Coordinators"]) == "coordinator"
    assert resolve_role_from_groups(["Prominence_Clinical_Supervisors"]) == "supervisor"
    assert resolve_role_from_groups(["Prominence_Business_Admins"]) == "business_admin"
    assert resolve_role_from_groups(["Prominence_Compliance_Auditors"]) == "compliance_auditor"
    assert resolve_role_from_groups(["Prominence_Administrators"]) == "admin"


def test_idp_group_mapping_deny_by_default_on_unknown_groups():
    # If the user has groups from IdP that do not match our authorized mapping,
    # the mapping must return None (fails closed / deny-by-default).
    assert resolve_role_from_groups(["Some_Random_Marketing_Group"]) is None
    assert resolve_role_from_groups(["External_Contractors"]) is None
    assert resolve_role_from_groups([]) is None


def test_idp_group_mapping_priority_when_multiple_groups():
    # A user in both Supervisor and Business Admin gets the higher privilege role (Business Admin)
    assert (
        resolve_role_from_groups(["Prominence_Clinical_Supervisors", "Prominence_Business_Admins"])
        == "business_admin"
    )
    # A user in Coordinator and Supervisor gets Supervisor
    assert (
        resolve_role_from_groups(["Prominence_Care_Coordinators", "Prominence_Clinical_Supervisors"])
        == "supervisor"
    )


def test_claims_extraction():
    claims = {
        "sub": "oidc-12345",
        "email": "sarah.coordinator@prominencehealth.com",
        "name": "Sarah Coordinator",
        "cognito:groups": ["Prominence_Care_Coordinators"],
    }
    extracted = extract_claims_info(claims)
    assert extracted["email"] == "sarah.coordinator@prominencehealth.com"
    assert extracted["name"] == "Sarah Coordinator"
    assert extracted["groups"] == ["Prominence_Care_Coordinators"]


# ── 3. Deny-by-Default Authorization Checks ────────────────────────────────


async def test_coordinator_authorization_boundaries():
    dep_m360 = require_permission("m360:read")
    dep_audit = require_permission("audit:read")
    dep_admin_templates = require_permission("admin:templates")

    coordinator = _user("coordinator")
    # Coordinator CAN read clinical M360
    assert await dep_m360(current_user=coordinator) is coordinator

    # Coordinator is DENIED audit reading
    with pytest.raises(HTTPException) as exc:
        await dep_audit(current_user=coordinator)
    assert exc.value.status_code == 403

    # Coordinator is DENIED admin templates
    with pytest.raises(HTTPException) as exc:
        await dep_admin_templates(current_user=coordinator)
    assert exc.value.status_code == 403


async def test_supervisor_authorization_boundaries():
    dep_m360 = require_permission("m360:read")
    dep_audit = require_permission("audit:read")
    dep_escalations = require_permission("tasks:escalations")
    dep_admin_templates = require_permission("admin:templates")

    supervisor = _user("supervisor")
    # Supervisor CAN read M360, view audit, and handle escalations
    assert await dep_m360(current_user=supervisor) is supervisor
    assert await dep_audit(current_user=supervisor) is supervisor
    assert await dep_escalations(current_user=supervisor) is supervisor

    # Supervisor is DENIED admin template configurations (managed by Business Admin)
    with pytest.raises(HTTPException) as exc:
        await dep_admin_templates(current_user=supervisor)
    assert exc.value.status_code == 403


async def test_compliance_auditor_read_only_enforcement():
    dep_audit = require_permission("audit:read")
    dep_mutate = require_mutation_allowed()

    auditor = _user("compliance_auditor")
    # Compliance Auditor CAN view audit
    assert await dep_audit(current_user=auditor) is auditor

    # Compliance Auditor is DENIED mutations
    with pytest.raises(HTTPException) as exc:
        await dep_mutate(current_user=auditor)
    assert exc.value.status_code == 403
    assert "read-only" in exc.value.detail.lower()


async def test_business_admin_clinical_authoring_prohibition():
    dep_templates = require_permission("admin:templates")
    dep_clinical_authoring = require_clinical_authoring_allowed()

    biz_admin = _user("business_admin")
    # Business Admin CAN manage templates
    assert await dep_templates(current_user=biz_admin) is biz_admin

    # Business Admin is DENIED direct clinical authoring (HIPAA separation of duties)
    with pytest.raises(HTTPException) as exc:
        await dep_clinical_authoring(current_user=biz_admin)
    assert exc.value.status_code == 403
    assert "clinical" in exc.value.detail.lower()


# ── 4. End-to-End OIDC API Endpoints ────────────────────────────────────────


async def test_oidc_config_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/auth/oidc/config", headers={"X-Tenant-Key": "prominencehealth"})
        assert resp.status_code == 200
        data = resp.json()
        assert "enabled" in data
        assert "group_mappings" in data
        assert data["group_mappings"]["Prominence_Care_Coordinators"] == "coordinator"


async def test_oidc_exchange_success_with_mapped_role():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/auth/oidc/exchange",
            headers={"X-Tenant-Key": "prominencehealth"},
            json={
                "code": "mock_supervisor",
                "redirect_uri": "http://localhost:3000/callback",
                "tenant": "prominencehealth",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["role"] == "supervisor"
        assert "token" in data
        assert "refresh_token" in data
        assert "Prominence_Clinical_Supervisors" in data["groups"]


async def test_oidc_exchange_denies_unmapped_group():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # mock_unauthorized yields groups ["Unknown_Guest_Group"] which has no mapping
        resp = await client.post(
            "/api/auth/oidc/exchange",
            headers={"X-Tenant-Key": "prominencehealth"},
            json={
                "code": "mock_unauthorized",
                "redirect_uri": "http://localhost:3000/callback",
                "tenant": "prominencehealth",
            },
        )
        assert resp.status_code == 403
        assert "Access denied" in resp.json()["detail"]
