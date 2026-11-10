import { useContext, useState, useEffect, useCallback, useMemo } from "react";
import { AuthContext } from "../context/AuthContext";
import {
  ROLES,
  ROLE_DEFINITIONS,
  DEMO_PERSONAS,
  getPersistedRolePermissions,
  savePersistedRolePermissions,
  DEFAULT_ROLE_PERMISSIONS,
  getPersistedUserOverrides,
  savePersistedUserOverride,
  resetPersistedUserOverride,
} from "../constants/permissions";
import { resolveApiBase } from "../utils/apiBase";

export const usePermissions = () => {
  const auth = useContext(AuthContext) || {};
  const { user, role: authRole, isImpersonating, startImpersonation } = auth;

  const [matrix, setMatrix] = useState(() => getPersistedRolePermissions());
  const [userOverrides, setUserOverrides] = useState(() => getPersistedUserOverrides());

  useEffect(() => {
    const handleUpdate = () => {
      setMatrix(getPersistedRolePermissions());
      setUserOverrides(getPersistedUserOverrides());
    };
    window.addEventListener("permissions:updated", handleUpdate);
    return () => window.removeEventListener("permissions:updated", handleUpdate);
  }, []);

  const currentRole = useMemo(() => {
    const emailLower = (user?.email || "").toLowerCase();
    if (!isImpersonating && emailLower) {
      const matchedPersona = DEMO_PERSONAS.find(
        (p) => p.email.toLowerCase() === emailLower
      );
      if (matchedPersona?.role) {
        return matchedPersona.role;
      }
    }
    const r = (user?.role || authRole || "user").toLowerCase();
    // Normalize aliases without conflating distinct roles
    if (r === "platform_admin") return ROLES.PLATFORM_ADMIN;
    if (r === "admin") return ROLES.ADMIN;
    if (r === "business_admin") return ROLES.BUSINESS_ADMIN;
    if (r === "payer_executive" || r === "commercial_payer") return ROLES.PAYER_EXECUTIVE;
    if (r === "supervisor") return ROLES.SUPERVISOR;
    if (r === "coordinator") return ROLES.COORDINATOR;
    if (r === "compliance_auditor" || r === "auditor") return ROLES.COMPLIANCE_AUDITOR;
    if (r === "clinician" || r === "doctor" || r === "physician") return ROLES.CLINICIAN;
    if (r === "nurse") return ROLES.NURSE;
    if (r === "coder" || r === "analyst") return ROLES.CODER;
    if (r === "billing" || r === "finance") return ROLES.BILLING;
    if (r === "patient" || r === "member" || r === "user") return ROLES.PATIENT;
    return r;
  }, [user?.email, user?.role, authRole, isImpersonating]);

  const activeRoleConfig = useMemo(() => {
    return (
      ROLE_DEFINITIONS.find((r) => r.key === currentRole) || {
        key: currentRole,
        name: (currentRole || "User").replace(/_/g, " "),
        label: (currentRole || "User").replace(/_/g, " "),
      }
    );
  }, [currentRole]);

  const activePermissions = useMemo(() => {
    const emailLower = (user?.email || "").toLowerCase();
    if (emailLower && Array.isArray(userOverrides[emailLower])) {
      return new Set(userOverrides[emailLower]);
    }
    const rolePerms = matrix[currentRole] || DEFAULT_ROLE_PERMISSIONS[currentRole] || [];
    return new Set(rolePerms);
  }, [matrix, userOverrides, currentRole, user?.email]);

  const isPlatformAdmin = currentRole === ROLES.PLATFORM_ADMIN;
  const isAdmin = isPlatformAdmin || currentRole === ROLES.ADMIN;

  const can = useCallback(
    (permissionKey) => {
      return activePermissions.has(permissionKey);
    },
    [activePermissions]
  );

  const hasAny = useCallback(
    (...permissionKeys) => {
      return permissionKeys.some((p) => activePermissions.has(p));
    },
    [activePermissions]
  );

  const hasAll = useCallback(
    (...permissionKeys) => {
      return permissionKeys.every((p) => activePermissions.has(p));
    },
    [activePermissions]
  );

  const hasRole = useCallback(
    (...roles) => {
      return roles.includes(currentRole);
    },
    [currentRole]
  );

  const updateRolePermissions = useCallback((roleKey, newPermissionsList) => {
    setMatrix((prev) => {
      const next = {
        ...prev,
        [roleKey]: newPermissionsList,
      };
      savePersistedRolePermissions(next);
      return next;
    });
  }, []);

  const resetPermissions = useCallback(() => {
    setMatrix(DEFAULT_ROLE_PERMISSIONS);
    savePersistedRolePermissions(DEFAULT_ROLE_PERMISSIONS);
  }, []);

  const updateUserPermissions = useCallback((email, permissionsList) => {
    savePersistedUserOverride(email, permissionsList);
    setUserOverrides(getPersistedUserOverrides());
  }, []);

  const resetUserPermissions = useCallback((email) => {
    resetPersistedUserOverride(email);
    setUserOverrides(getPersistedUserOverrides());
  }, []);

  const getUserEffectivePermissions = useCallback(
    (email, userRole) => {
      const emailLower = (email || "").toLowerCase();
      const overrides = getPersistedUserOverrides();
      if (emailLower && Array.isArray(overrides[emailLower])) {
        return {
          permissions: overrides[emailLower],
          isCustom: true,
        };
      }
      const roleKey = userRole || currentRole;
      const rolePerms = matrix[roleKey] || DEFAULT_ROLE_PERMISSIONS[roleKey] || [];
      return {
        permissions: rolePerms,
        isCustom: false,
      };
    },
    [matrix, currentRole]
  );

  const switchRole = useCallback(
    async (newRole) => {
      const personaEmailMap = {
        [ROLES.PLATFORM_ADMIN]: "admin@admin.com",
        [ROLES.ADMIN]: "admin@admin.com",
        [ROLES.BUSINESS_ADMIN]: "business.admin@prominencehealth.com",
        [ROLES.SUPERVISOR]: "supervisor@prominencehealth.com",
        [ROLES.COORDINATOR]: "coordinator@prominencehealth.com",
        [ROLES.COMPLIANCE_AUDITOR]: "compliance.auditor@prominencehealth.com",
        [ROLES.CLINICIAN]: "dr.chen@prominencehealth.com",
        [ROLES.NURSE]: "elena.nurse@prominencehealth.com",
        [ROLES.CODER]: "marcus.coder@prominencehealth.com",
        [ROLES.BILLING]: "rachel.billing@prominencehealth.com",
        [ROLES.PATIENT]: "james.member@prominencehealth.com",
      };
      const email = personaEmailMap[newRole] || "admin@admin.com";
      const apiBase = resolveApiBase();
      const tenantKey = auth?.tenant || "prominencehealth";

      try {
        const res = await fetch(`${apiBase}/api/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-Key": tenantKey,
          },
          body: JSON.stringify({
            email,
            password: "admin",
            tenant: tenantKey,
          }),
        });
        const data = await res.json();
        if (res.ok && data?.token && typeof auth?.login === "function") {
          auth.login(data);
          return;
        }
      } catch (e) {
        console.warn("Real login switch failed, falling back to impersonation", e);
      }

      if (typeof startImpersonation === "function") {
        startImpersonation({
          email,
          name: `${newRole.toUpperCase()} User`,
          role: newRole,
          tenant: tenantKey,
          reason: "Role switcher preview",
        });
      }
    },
    [auth, startImpersonation]
  );

  return {
    currentRole,
    activeRoleConfig,
    isAdmin,
    isPlatformAdmin,
    permissions: activePermissions,
    can,
    hasAny,
    hasAll,
    hasRole,
    matrix,
    userOverrides,
    updateRolePermissions,
    resetPermissions,
    updateUserPermissions,
    resetUserPermissions,
    getUserEffectivePermissions,
    switchRole,
  };
};

export default usePermissions;
