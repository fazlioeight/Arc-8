import { useContext, useState, useEffect, useCallback, useMemo } from "react";
import { AuthContext } from "../context/AuthContext";
import {
  ROLES,
  getPersistedRolePermissions,
  savePersistedRolePermissions,
  DEFAULT_ROLE_PERMISSIONS,
} from "../constants/permissions";

export const usePermissions = () => {
  const auth = useContext(AuthContext) || {};
  const { user, role: authRole, startImpersonation, endImpersonation } = auth;

  const [matrix, setMatrix] = useState(() => getPersistedRolePermissions());

  useEffect(() => {
    const handleUpdate = (e) => {
      if (e?.detail) setMatrix(e.detail);
    };
    window.addEventListener("permissions:updated", handleUpdate);
    return () => window.removeEventListener("permissions:updated", handleUpdate);
  }, []);

  const currentRole = useMemo(() => {
    const r = (user?.role || authRole || "user").toLowerCase();
    // Normalize aliases
    if (r === "platform_admin") return ROLES.PLATFORM_ADMIN;
    if (r === "admin") return ROLES.ADMIN;
    if (r === "clinician" || r === "doctor" || r === "physician") return ROLES.CLINICIAN;
    if (r === "nurse" || r === "coordinator") return ROLES.NURSE;
    if (r === "coder" || r === "analyst") return ROLES.CODER;
    if (r === "billing" || r === "finance") return ROLES.BILLING;
    if (r === "patient" || r === "member" || r === "user") return ROLES.PATIENT;
    return r;
  }, [user?.role, authRole]);

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
        [ROLES.CLINICIAN]: "dr.chen@prominencehealth.com",
        [ROLES.NURSE]: "elena.nurse@prominencehealth.com",
        [ROLES.CODER]: "marcus.coder@prominencehealth.com",
        [ROLES.BILLING]: "rachel.billing@prominencehealth.com",
        [ROLES.PATIENT]: "james.member@prominencehealth.com",
      };
      const email = personaEmailMap[newRole] || "admin@admin.com";
      const apiBase = process.env.REACT_APP_API_BASE
        ? process.env.REACT_APP_API_BASE.replace(/\/$/, "")
        : (typeof window !== "undefined" && window.location.port === "3000" ? "http://localhost:8989" : "");
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
