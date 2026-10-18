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
    (newRole) => {
      if (!auth.isAuthenticated) return;
      if (typeof startImpersonation === "function") {
        startImpersonation({
          email: `${newRole}@prominencehealth.com`,
          name: `${newRole.toUpperCase()} Demo User`,
          role: newRole,
          tenant: auth.tenant || "prominencehealth",
          reason: "Role switcher preview",
        });
      }
    },
    [auth.isAuthenticated, auth.tenant, startImpersonation]
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
