import { useContext, useState, useEffect, useCallback, useMemo } from "react";
import { AuthContext } from "../context/AuthContext";
import {
  ROLES,
  ROLE_DEFINITIONS,
  DEMO_PERSONAS,
  getPersistedRolePermissions,
  savePersistedRolePermissions,
  DEFAULT_ROLE_PERMISSIONS,
} from "../constants/permissions";

export const usePermissions = () => {
  const auth = useContext(AuthContext) || {};
  const { user, role: authRole, isImpersonating, startImpersonation } = auth;

  const [matrix, setMatrix] = useState(() => getPersistedRolePermissions());

  useEffect(() => {
    const handleUpdate = (e) => {
      if (e?.detail) setMatrix(e.detail);
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
    const rolePerms = matrix[currentRole] || DEFAULT_ROLE_PERMISSIONS[currentRole] || [];
    return new Set(rolePerms);
  }, [matrix, currentRole]);

  const isPlatformAdmin = currentRole === ROLES.PLATFORM_ADMIN;
  const isAdmin = isPlatformAdmin || currentRole === ROLES.ADMIN;

  const can = useCallback(
    (permissionKey) => {
      if (isPlatformAdmin) return true;
      return activePermissions.has(permissionKey);
    },
    [isPlatformAdmin, activePermissions]
  );

  const hasAny = useCallback(
    (...permissionKeys) => {
      if (isPlatformAdmin) return true;
      return permissionKeys.some((p) => activePermissions.has(p));
    },
    [isPlatformAdmin, activePermissions]
  );

  const hasAll = useCallback(
    (...permissionKeys) => {
      if (isPlatformAdmin) return true;
      return permissionKeys.every((p) => activePermissions.has(p));
    },
    [isPlatformAdmin, activePermissions]
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
      const apiBase = (() => {
        if (typeof window !== "undefined" && window.location) {
          if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
            return `${window.location.protocol}//${window.location.hostname}:8989`;
          }
        }
        return (process.env.REACT_APP_API_BASE || "http://localhost:8989").replace(/\/$/, "");
      })();
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
    updateRolePermissions,
    resetPermissions,
    switchRole,
  };
};

export default usePermissions;
