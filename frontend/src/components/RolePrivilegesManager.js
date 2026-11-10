import React, { useState, useMemo, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import {
  ROLE_DEFINITIONS,
  PERMISSION_CATEGORIES,
  DEFAULT_ROLE_PERMISSIONS,
  DEMO_PERSONAS,
  ROLES,
} from "../constants/permissions";
import { usePermissions } from "../hooks/usePermissions";
import { AuthContext } from "../context/AuthContext";
import { fetchAdminUsers, updateAdminUser, createAdminUser } from "../services/adminService";
import { ROUTES } from "../constants/routes";
import { API_BASE } from "../utils/apiBase";

const RolePrivilegesManager = ({ initialTab = "user_allotment" }) => {
  const navigate = useNavigate();
  const {
    currentRole,
    matrix,
    userOverrides,
    updateRolePermissions,
    resetPermissions,
    updateUserPermissions,
    resetUserPermissions,
    getUserEffectivePermissions,
    switchRole,
    isAdmin,
    can,
  } = usePermissions();

  const canManagePrivileges = isAdmin || can("menu:role_privileges");

  const { token, tenant, login } = useContext(AuthContext) || {};

  const [viewTab, setViewTab] = useState(initialTab || "user_allotment"); // "user_allotment" | "privileges_matrix" | "sso_demo_testing"

  useEffect(() => {
    if (initialTab) {
      setViewTab(initialTab);
    }
  }, [initialTab]);

  const [selectedRoleKey, setSelectedRoleKey] = useState(currentRole || "admin");
  const [searchQuery, setSearchQuery] = useState("");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userOverrideFilter, setUserOverrideFilter] = useState("all"); // "all" | "custom" | "default"
  const [saveToast, setSaveToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Individual User Privileges Customization State
  const [inspectingUser, setInspectingUser] = useState(null);
  const [userCustomPerms, setUserCustomPerms] = useState(new Set());
  const [userPrivilegeSearch, setUserPrivilegeSearch] = useState("");

  // Edit User State
  const [editingUser, setEditingUser] = useState(null);
  const [editUserForm, setEditUserForm] = useState({
    name: "",
    email: "",
    title: "",
    department: "",
    role: "clinician",
    is_active: true,
    newPassword: "",
  });
  const [savingEditUser, setSavingEditUser] = useState(false);

  // OIDC & Persona Testing State (Admin Sandbox)
  const [selectedIdpGroup, setSelectedIdpGroup] = useState("Prominence_Care_Coordinators");
  const [testingOidc, setTestingOidc] = useState(false);
  const [oidcResult, setOidcResult] = useState(null);
  const [oidcError, setOidcError] = useState("");
  const [switchingPersonaEmail, setSwitchingPersonaEmail] = useState("");

  // User management state
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "clinician",
  });
  const [addingUser, setAddingUser] = useState(false);

  // Load real users from backend or fallback to demo personas
  useEffect(() => {
    let isActive = true;
    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        if (token && tenant) {
          const resp = await fetchAdminUsers({ token, tenant });
          if (isActive && resp?.users && resp.users.length > 0) {
            setUsers(resp.users);
            return;
          }
        }
      } catch (err) {
        console.warn("Using local persona users", err);
      }
      if (isActive) {
        // Map DEMO_PERSONAS to user records
        setUsers(
          DEMO_PERSONAS.map((p, idx) => ({
            id: idx + 1,
            email: p.email,
            name: p.name,
            role: p.role,
            title: p.title,
            department: p.department,
            is_active: true,
          }))
        );
      }
      setLoadingUsers(false);
    };

    loadUsers();
    return () => {
      isActive = false;
    };
  }, [token, tenant]);

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setSaveToast(true);
    setTimeout(() => {
      setSaveToast(false);
      setToastMessage("");
    }, 2800);
  };

  const selectedRole = useMemo(() => {
    return (
      ROLE_DEFINITIONS.find((r) => r.key === selectedRoleKey) ||
      ROLE_DEFINITIONS[0]
    );
  }, [selectedRoleKey]);

  const activePermsForRole = useMemo(() => {
    const list = matrix[selectedRoleKey] || DEFAULT_ROLE_PERMISSIONS[selectedRoleKey] || [];
    return new Set(list);
  }, [matrix, selectedRoleKey]);

  const togglePermission = (permKey, parentModKey = null) => {
    const nextSet = new Set(activePermsForRole);
    if (nextSet.has(permKey)) {
      nextSet.delete(permKey);
    } else {
      nextSet.add(permKey);
      if (parentModKey) {
        nextSet.add(parentModKey);
      }
      if (permKey.startsWith("tab:pp_")) {
        nextSet.add("menu:executive_dashboards");
        nextSet.add("sub:exec_financial");
      }
    }
    updateRolePermissions(selectedRoleKey, Array.from(nextSet));
    triggerToast("Privilege policy updated and synchronized successfully.");
  };

  const toggleModuleWithSubs = (mod) => {
    const nextSet = new Set(activePermsForRole);
    const isModuleActive = nextSet.has(mod.key);
    if (isModuleActive) {
      nextSet.delete(mod.key);
    } else {
      nextSet.add(mod.key);
      if (mod.subPermissions) {
        const hasAnySub = mod.subPermissions.some((s) => nextSet.has(s.key));
        if (!hasAnySub) {
          mod.subPermissions.forEach((s) => {
            if (!s.supervisorOnly || selectedRoleKey === "platform_admin" || selectedRoleKey === "admin") {
              nextSet.add(s.key);
            }
          });
        }
      }
    }
    updateRolePermissions(selectedRoleKey, Array.from(nextSet));
    triggerToast("Module privileges updated successfully.");
  };

  const selectAllSubPermissions = (mod) => {
    const nextSet = new Set(activePermsForRole);
    nextSet.add(mod.key);
    (mod.subPermissions || []).forEach((s) => nextSet.add(s.key));
    updateRolePermissions(selectedRoleKey, Array.from(nextSet));
    triggerToast(`All sub-menus enabled for ${mod.label}.`);
  };

  const clearAllSubPermissions = (mod) => {
    const nextSet = new Set(activePermsForRole);
    (mod.subPermissions || []).forEach((s) => nextSet.delete(s.key));
    updateRolePermissions(selectedRoleKey, Array.from(nextSet));
    triggerToast(`Sub-menus disabled for ${mod.label}.`);
  };

  const selectAllCategory = (cat) => {
    const nextSet = new Set(activePermsForRole);
    cat.modules.forEach((m) => {
      nextSet.add(m.key);
      (m.subPermissions || []).forEach((s) => nextSet.add(s.key));
    });
    updateRolePermissions(selectedRoleKey, Array.from(nextSet));
    triggerToast(`All capabilities granted for ${cat.title}.`);
  };

  const clearAllCategory = (cat) => {
    const nextSet = new Set(activePermsForRole);
    cat.modules.forEach((m) => {
      nextSet.delete(m.key);
      (m.subPermissions || []).forEach((s) => nextSet.delete(s.key));
    });
    updateRolePermissions(selectedRoleKey, Array.from(nextSet));
    triggerToast(`All capabilities revoked for ${cat.title}.`);
  };

  const handleReset = () => {
    if (window.confirm("Reset all role privileges to the default US Healthcare security baseline?")) {
      resetPermissions();
      triggerToast("All roles reset to security baseline defaults.");
    }
  };

  // Handle Admin re-assigning a role to a specific user
  const handleAssignRoleToUser = async (userId, newRoleKey) => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;

    try {
      if (token && tenant) {
        await updateAdminUser({
          token,
          tenant,
          userId,
          payload: { role: newRoleKey },
        });
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRoleKey } : u))
      );
      const roleDef = ROLE_DEFINITIONS.find((r) => r.key === newRoleKey);
      triggerToast(`Allotted role "${roleDef?.name || newRoleKey}" to ${targetUser.email}`);
    } catch (err) {
      console.error("Failed to allot role:", err);
      // Still update locally for interactive preview
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRoleKey } : u))
      );
      triggerToast(`Role updated locally for ${targetUser.email}`);
    }
  };

  // Handle Admin creating a new user with an allotted role
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUserForm.email || !newUserForm.password) return;
    setAddingUser(true);
    try {
      let createdUser = null;
      if (token && tenant) {
        createdUser = await createAdminUser({
          token,
          tenant,
          payload: {
            email: newUserForm.email,
            password: newUserForm.password,
            role: newUserForm.role,
            is_active: true,
          },
        });
      }
      const newUserRecord = createdUser || {
        id: Date.now(),
        email: newUserForm.email,
        name: newUserForm.name || newUserForm.email.split("@")[0],
        role: newUserForm.role,
        is_active: true,
      };
      setUsers((prev) => [...prev, newUserRecord]);
      setShowAddUserModal(false);
      setNewUserForm({ email: "", password: "", name: "", role: "clinician" });
      const roleDef = ROLE_DEFINITIONS.find((r) => r.key === newUserRecord.role);
      triggerToast(`Provisioned new user ${newUserRecord.email} as "${roleDef?.name}".`);
    } catch (err) {
      console.error("Failed to provision user:", err);
      triggerToast(err.message || "Failed to provision user");
    } finally {
      setAddingUser(false);
    }
  };

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return PERMISSION_CATEGORIES;
    const q = searchQuery.toLowerCase();
    return PERMISSION_CATEGORIES.map((cat) => {
      const matchingModules = cat.modules
        .map((m) => {
          const moduleMatches =
            m.label.toLowerCase().includes(q) ||
            m.description.toLowerCase().includes(q) ||
            m.key.toLowerCase().includes(q);
          const matchingSubs = (m.subPermissions || []).filter(
            (s) =>
              s.label.toLowerCase().includes(q) ||
              s.description.toLowerCase().includes(q) ||
              s.key.toLowerCase().includes(q)
          );
          if (moduleMatches) {
            return m;
          }
          if (matchingSubs.length > 0) {
            return {
              ...m,
              subPermissions: matchingSubs,
            };
          }
          return null;
        })
        .filter(Boolean);

      return {
        ...cat,
        modules: matchingModules,
      };
    }).filter((cat) => cat.modules.length > 0);
  }, [searchQuery]);

  const filteredUsers = useMemo(() => {
    let list = users;
    if (userRoleFilter !== "all") {
      list = list.filter((u) => u.role === userRoleFilter);
    }
    if (userOverrideFilter === "custom") {
      list = list.filter((u) => Array.isArray(userOverrides[u.email?.toLowerCase()]));
    } else if (userOverrideFilter === "default") {
      list = list.filter((u) => !Array.isArray(userOverrides[u.email?.toLowerCase()]));
    }
    if (userSearchQuery.trim()) {
      const q = userSearchQuery.toLowerCase();
      list = list.filter(
        (u) =>
          (u.email || "").toLowerCase().includes(q) ||
          (u.name || "").toLowerCase().includes(q) ||
          (u.role || "").toLowerCase().includes(q) ||
          (u.department || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [users, userRoleFilter, userOverrideFilter, userSearchQuery, userOverrides]);

  const openUserPrivilegesModal = (u) => {
    const effective = getUserEffectivePermissions(u.email, u.role);
    setInspectingUser(u);
    setUserCustomPerms(new Set(effective.permissions));
    setUserPrivilegeSearch("");
  };

  const closeUserPrivilegesModal = () => {
    setInspectingUser(null);
    setUserCustomPerms(new Set());
    setUserPrivilegeSearch("");
  };

  const toggleUserCustomPrivilege = (permKey, parentMod = null) => {
    setUserCustomPerms((prev) => {
      const next = new Set(prev);
      if (next.has(permKey)) {
        next.delete(permKey);
      } else {
        next.add(permKey);
        if (parentMod && parentMod.key) {
          next.add(parentMod.key);
        }
        if (permKey.startsWith("tab:pp_")) {
          next.add("menu:executive_dashboards");
          next.add("sub:exec_financial");
        }
        // If enabling a parent module and none of its sub-permissions are enabled yet, enable its sub-permissions
        const matchedMod = PERMISSION_CATEGORIES.flatMap((c) => c.modules).find((m) => m.key === permKey);
        if (matchedMod && matchedMod.subPermissions && matchedMod.subPermissions.length > 0) {
          const hasAnySub = matchedMod.subPermissions.some((s) => next.has(s.key));
          if (!hasAnySub) {
            matchedMod.subPermissions.forEach((s) => next.add(s.key));
          }
        }
      }
      return next;
    });
  };

  const handleSaveUserPrivileges = async () => {
    if (!inspectingUser) return;
    const permsList = Array.from(userCustomPerms);
    updateUserPermissions(inspectingUser.email, permsList);
    triggerToast(`Privileges customized and updated for ${inspectingUser.name || inspectingUser.email}`);
    closeUserPrivilegesModal();
  };

  const handleResetUserToRoleDefault = () => {
    if (!inspectingUser) return;
    resetUserPermissions(inspectingUser.email);
    const rolePerms = matrix[inspectingUser.role] || DEFAULT_ROLE_PERMISSIONS[inspectingUser.role] || [];
    setUserCustomPerms(new Set(rolePerms));
    triggerToast(`Reset ${inspectingUser.name || inspectingUser.email} to ${inspectingUser.role} role defaults`);
  };

  const openEditUserModal = (u) => {
    setEditingUser(u);
    setEditUserForm({
      name: u.name || "",
      email: u.email || "",
      title: u.title || "",
      department: u.department || "",
      role: u.role || "clinician",
      is_active: u.is_active !== false,
      newPassword: "",
    });
  };

  const handleSaveEditUser = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!editingUser) return;
    setSavingEditUser(true);
    try {
      const oldEmail = (editingUser.email || "").toLowerCase();
      const newEmail = (editUserForm.email || "").trim().toLowerCase();

      if (token && tenant && typeof editingUser.id === "number") {
        const patchPayload = {
          role: editUserForm.role,
          is_active: editUserForm.is_active,
        };
        if (editUserForm.newPassword) {
          patchPayload.password = editUserForm.newPassword;
        }
        await updateAdminUser({
          token,
          tenant,
          userId: editingUser.id,
          payload: patchPayload,
        }).catch((err) => console.warn("Backend update error:", err));
      }

      setUsers((prev) =>
        prev.map((u) => {
          if (u.id === editingUser.id || (u.email && u.email.toLowerCase() === oldEmail)) {
            return {
              ...u,
              name: editUserForm.name.trim() || editUserForm.email.split("@")[0],
              email: editUserForm.email.trim(),
              title: editUserForm.title.trim(),
              department: editUserForm.department.trim(),
              role: editUserForm.role,
              is_active: editUserForm.is_active,
            };
          }
          return u;
        })
      );

      if (oldEmail && newEmail && oldEmail !== newEmail && userOverrides[oldEmail]) {
        updateUserPermissions(newEmail, userOverrides[oldEmail]);
        resetUserPermissions(oldEmail);
      }

      triggerToast(`Account details updated for ${editUserForm.name || editUserForm.email}`);
      setEditingUser(null);
    } catch (err) {
      console.error("Failed to update user:", err);
      triggerToast(err.message || "Failed to update user");
    } finally {
      setSavingEditUser(false);
    }
  };

  const handleGrantAllPrivileges = () => {
    const allKeys = [];
    PERMISSION_CATEGORIES.forEach((c) => {
      c.modules.forEach((m) => {
        allKeys.push(m.key);
        (m.subPermissions || []).forEach((s) => allKeys.push(s.key));
      });
    });
    setUserCustomPerms(new Set(allKeys));
    triggerToast("Granted all system privileges to user");
  };

  const handleRevokeAllPrivileges = () => {
    setUserCustomPerms(new Set());
    triggerToast("Revoked all privileges (Deny-All) for user");
  };

  const handleGrantExecutiveSuite = () => {
    setUserCustomPerms((prev) => {
      const next = new Set(prev);
      const execKeys = [
        "menu:executive_dashboards",
        "sub:exec_financial",
        "tab:pp_overview",
        "tab:pp_financials",
        "tab:pp_medical_cost",
        "tab:pp_mlr",
        "tab:pp_utilization",
        "tab:pp_quality",
        "tab:pp_risk",
        "tab:pp_defs",
        "sub:exec_hedis",
      ];
      execKeys.forEach((k) => next.add(k));
      return next;
    });
    triggerToast("Granted Executive & Plan Performance (MA) suite");
  };

  const handleGrantClinicalSuite = () => {
    setUserCustomPerms((prev) => {
      const next = new Set(prev);
      const clinicalCat = PERMISSION_CATEGORIES.find((c) => c.id === "clinical_operations");
      if (clinicalCat) {
        clinicalCat.modules.forEach((m) => {
          next.add(m.key);
          (m.subPermissions || []).forEach((s) => next.add(s.key));
        });
      }
      return next;
    });
    triggerToast("Granted Care Management & Clinical workflows");
  };

  const handleDeleteUser = async (userId, userEmail) => {
    if (!window.confirm(`Are you sure you want to remove user account ${userEmail}? This will permanently remove their access and privileges.`)) return;
    try {
      if (token && tenant && typeof userId === "number") {
        await deleteAdminUser({ token, tenant, userId }).catch(() => {});
      }
    } catch (err) {}
    setUsers((prev) => prev.filter((u) => u.id !== userId && u.email !== userEmail));
    resetUserPermissions(userEmail);
    if (editingUser?.email === userEmail) {
      setEditingUser(null);
    }
    if (inspectingUser?.email === userEmail) {
      setInspectingUser(null);
    }
    triggerToast(`User account ${userEmail} removed.`);
  };

  const handleTestOidc = async (groupToTest) => {
    setOidcError("");
    setOidcResult(null);
    setTestingOidc(true);
    const targetGroup = groupToTest || selectedIdpGroup;
    try {
      const groupCodeMap = {
        "Prominence_Care_Coordinators": "mock_coordinator",
        "Prominence_Clinical_Supervisors": "mock_supervisor",
        "Prominence_Business_Admins": "mock_business_admin",
        "Prominence_Compliance_Auditors": "mock_compliance_auditor",
        "External_Contractors_Unmapped": "mock_unauthorized",
      };
      const code = groupCodeMap[targetGroup] || "mock_unauthorized";
      const res = await fetch(`${API_BASE}/api/auth/oidc/exchange`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Key": tenant || "prominencehealth",
        },
        body: JSON.stringify({
          code,
          redirect_uri: window.location.origin + "/login",
          tenant: tenant || "prominencehealth",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "OIDC simulation denied or failed.");
      setOidcResult(data);
    } catch (err) {
      setOidcError(err.message || "OIDC simulation error.");
    } finally {
      setTestingOidc(false);
    }
  };

  const handleLaunchPersona = async (persona) => {
    setSwitchingPersonaEmail(persona.email);
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Key": tenant || "prominencehealth",
        },
        body: JSON.stringify({
          email: persona.email,
          password: "admin",
          tenant: tenant || "prominencehealth",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Authentication failed");
      if (typeof login === "function") {
        login(data);
      }
      setTimeout(() => {
        if (persona.role === "payer_executive" || (persona.email || "").toLowerCase().includes("jessica")) {
          navigate(ROUTES.MEMBER360_LAB.PLAN_PERFORMANCE);
        } else if (persona.role === "patient") {
          navigate(ROUTES.PORTAL.LANDING);
        } else {
          navigate(ROUTES.MEMBER360_LAB.DASHBOARD);
        }
      }, 50);
    } catch (err) {
      setToastMessage(`Failed to switch to ${persona.name}: ${err.message}`);
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 4000);
    } finally {
      setSwitchingPersonaEmail("");
    }
  };

  const getToneClasses = (tone, isSelected) => {
    if (isSelected) {
      return "border-sky-500 bg-sky-50/70 text-sky-950 shadow-sm dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-100 ring-2 ring-sky-500/20";
    }
    return "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 text-slate-800 dark:text-slate-200";
  };

  const getRoleBadgeClasses = (roleKey) => {
    switch (roleKey) {
      case ROLES.PLATFORM_ADMIN:
        return "bg-purple-500/10 text-purple-400 border border-purple-500/30";
      case ROLES.ADMIN:
        return "bg-indigo-500/10 text-indigo-400 border border-indigo-500/30";
      case ROLES.CLINICIAN:
        return "bg-sky-500/10 text-sky-400 border border-sky-500/30";
      case ROLES.NURSE:
        return "bg-teal-500/10 text-teal-400 border border-teal-500/30";
      case ROLES.CODER:
        return "bg-amber-500/10 text-amber-400 border border-amber-500/30";
      case ROLES.BILLING:
        return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30";
      case ROLES.PATIENT:
        return "bg-slate-500/10 text-slate-400 border border-slate-500/30";
      default:
        return "bg-slate-700 text-slate-300";
    }
  };

  if (!canManagePrivileges) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center space-y-2">
        <h3 className="text-base font-bold text-rose-600 dark:text-rose-300">
          Access Restricted — Administrative Authority Required
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Your active role ({(currentRole || "user").replace(/_/g, " ").toUpperCase()}) is not authorized to view or modify organization-wide Role &amp; Privileges configurations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      {/* Sleek Sub-Header & Actions */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
              <svg className="h-3 w-3 fill-current" viewBox="0 0 24 24">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
              </svg>
              HIPAA &amp; RBAC Control
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              {viewTab === "user_allotment" ? "User Directory & Privileges Control" : viewTab === "privileges_matrix" ? "Role Capability Matrix" : "Enterprise SSO & Demo Personas"}
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {viewTab === "user_allotment"
              ? "Allot roles to organization users and fine-tune capabilities on a per-user basis."
              : viewTab === "privileges_matrix"
              ? "Baseline privileges assigned to system roles by default."
              : "Administrative testing sandbox for external IdP OIDC and single-click demo personas."}
          </p>
        </div>

        {viewTab === "privileges_matrix" && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Reset Defaults
            </button>
            <button
              type="button"
              onClick={() => switchRole(selectedRoleKey)}
              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700"
            >
              Preview As {selectedRole.name.split(" ")[0]}
            </button>
          </div>
        )}
      </div>

      {saveToast && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300 animate-fadeIn">
          <svg className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span>{toastMessage || "Changes updated and synchronized successfully."}</span>
        </div>
      )}

      {/* Dual-Mode View Switcher */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
        <button
          type="button"
          onClick={() => setViewTab("user_allotment")}
          className={[
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all relative",
            viewTab === "user_allotment"
              ? "bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-xs"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60",
          ].join(" ")}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          Users &amp; Individual Privileges
          <span className="rounded-full bg-sky-500/10 px-1.5 py-0.2 text-[10px] font-bold text-sky-400 border border-sky-400/20">
            {users.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setViewTab("privileges_matrix")}
          className={[
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
            viewTab === "privileges_matrix"
              ? "bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-xs"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60",
          ].join(" ")}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Role Capability Matrix
        </button>

        <button
          type="button"
          onClick={() => setViewTab("sso_demo_testing")}
          className={[
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all relative",
            viewTab === "sso_demo_testing"
              ? "bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-xs"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60",
          ].join(" ")}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          Enterprise SSO &amp; Demo Personas
          <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.2 text-[10px] font-bold text-emerald-400 border border-emerald-400/20">
            Sandbox
          </span>
        </button>
      </div>

      {/* ──────────────────────────────────────────────────────────
          VIEW 1: USER DIRECTORY & ROLE ALLOTMENT
          ────────────────────────────────────────────────────────── */}
      {viewTab === "user_allotment" && (
        <div className="space-y-3.5 animate-fadeIn min-w-0">
          {/* Streamlined Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 bg-slate-50/70 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Organization Roster</span>
              <span className="text-[11px] text-slate-400">({filteredUsers.length} of {users.length})</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1 sm:flex-initial">
                <input
                  type="text"
                  placeholder="Filter name, email, title..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 pl-8 text-xs text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <svg className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </div>

              {/* Role Filter */}
              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                title="Filter by assigned role"
              >
                <option value="all">All Roles</option>
                {ROLE_DEFINITIONS.map((r) => (
                  <option key={r.key} value={r.key}>{r.name.split(" / ")[0]}</option>
                ))}
              </select>

              {/* Privilege Override Filter */}
              <select
                value={userOverrideFilter}
                onChange={(e) => setUserOverrideFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                title="Filter by privilege configuration"
              >
                <option value="all">All Statuses</option>
                <option value="custom">✦ Custom Overrides</option>
                <option value="default">Role Defaults</option>
              </select>

              <button
                type="button"
                onClick={() => setShowAddUserModal(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 shrink-0"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Provision User
              </button>
            </div>
          </div>

          {/* User Roster Table */}
          <div className="overflow-x-auto overflow-y-auto max-h-[65vh] rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/95 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider backdrop-blur-xs">
                <tr>
                  <th className="px-4 py-3.5 text-left">Staff / Member Name</th>
                  <th className="px-4 py-3.5 text-left">Email Address</th>
                  <th className="px-4 py-3.5 text-left">Current Role Badge</th>
                  <th className="px-4 py-3.5 text-left">Allot / Change Role</th>
                  <th className="px-4 py-3.5 text-left">Privilege Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredUsers.map((u) => {
                  const currentRoleDef = ROLE_DEFINITIONS.find((r) => r.key === u.role) || ROLE_DEFINITIONS[2];
                  const emailLower = (u.email || "").toLowerCase();
                  const userOverrideList = userOverrides[emailLower];
                  const hasCustomOverrides = Array.isArray(userOverrideList);
                  const grantedCount = hasCustomOverrides
                    ? userOverrideList.length
                    : (matrix[u.role] || DEFAULT_ROLE_PERMISSIONS[u.role] || []).length;
                  const initials = u.name
                    ? u.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
                    : u.email.slice(0, 2).toUpperCase();

                  return (
                    <tr key={u.id || u.email} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                      {/* Name & Avatar */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-xs">
                            {initials}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {u.name || u.email.split("@")[0]}
                            </span>
                            {u.title && (
                              <p className="text-[11px] text-slate-400">{u.title}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-slate-600 dark:text-slate-300">
                        {u.email}
                      </td>

                      {/* Role Badge */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${getRoleBadgeClasses(u.role)}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {currentRoleDef.name.split(" / ")[0]}
                        </span>
                      </td>

                      {/* Allot Role Dropdown (Interactive Role Assignment by Admin) */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <select
                          value={u.role || "clinician"}
                          onChange={(e) => handleAssignRoleToUser(u.id, e.target.value)}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 shadow-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                          {ROLE_DEFINITIONS.map((r) => (
                            <option key={r.key} value={r.key}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Privilege Status (Role Default vs Individual Custom Overrides) */}
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {hasCustomOverrides ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 px-2.5 py-1 text-xs font-semibold text-purple-600 dark:text-purple-400 border border-purple-500/30">
                            <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" />
                            ✦ Custom Overrides ({grantedCount})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            Role Default ({grantedCount})
                          </span>
                        )}
                      </td>

                      {/* Quick Actions */}
                      <td className="px-4 py-3 whitespace-nowrap text-right text-xs">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditUserModal(u)}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                            title="Edit user details, name, department, credentials"
                          >
                            <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => openUserPrivilegesModal(u)}
                            className="inline-flex items-center gap-1 rounded-md bg-sky-50 dark:bg-sky-950/50 px-2 py-1 text-xs font-bold text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/60 transition"
                            title="Inspect, grant or revoke individual privileges specifically for this user"
                          >
                            <svg className="w-3 h-3 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                            Privileges
                          </button>

                          <button
                            type="button"
                            onClick={() => switchRole(u.role)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition"
                            title="Preview platform interface with this user's role authority"
                          >
                            Preview
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u.id, u.email)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                            title="Remove user account and revoke all access"
                          >
                            <svg className="w-3 h-3 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ──────────────────────────────────────────────────────────
              MODAL: INDIVIDUAL USER PRIVILEGES CUSTOMIZER
              ────────────────────────────────────────────────────────── */}
          {inspectingUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs p-4 animate-fadeIn">
              <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0f172a] shadow-2xl overflow-hidden">
                {/* Modal Header */}
                <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/50">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-sm font-bold text-white shadow-xs">
                      {(inspectingUser.name || inspectingUser.email).slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          {inspectingUser.name || inspectingUser.email.split("@")[0]}
                        </h3>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${getRoleBadgeClasses(inspectingUser.role)}`}>
                          {inspectingUser.role.toUpperCase()}
                        </span>
                        {Array.isArray(userOverrides[(inspectingUser.email || "").toLowerCase()]) ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-400 border border-purple-500/30">
                            ✦ Custom User Overrides Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-400">
                            Role Baseline Defaults
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        {inspectingUser.email} • {userCustomPerms.size} total capabilities active
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={closeUserPrivilegesModal}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    ✕
                  </button>
                </div>

                {/* Sub-header with search, quick presets & instructions */}
                <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5 bg-white dark:bg-slate-900">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="relative w-full sm:w-72">
                      <input
                        type="text"
                        placeholder="Search capabilities by name or key..."
                        value={userPrivilegeSearch}
                        onChange={(e) => setUserPrivilegeSearch(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 pl-8 text-xs text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                      <svg className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                      </svg>
                    </div>

                    <p className="text-[11px] text-slate-400 italic">
                      Grant or revoke capabilities specifically for this user.
                    </p>
                  </div>

                  {/* Quick Preset Action Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                      Quick Presets:
                    </span>
                    <button
                      type="button"
                      onClick={handleGrantAllPrivileges}
                      className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 transition"
                      title="Grant every capability in the entire system to this user"
                    >
                      + Grant All
                    </button>
                    <button
                      type="button"
                      onClick={handleGrantExecutiveSuite}
                      className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800 transition"
                      title="Grant Executive Dashboards and all 8 Plan Performance tabs"
                    >
                      + Grant MA Suite
                    </button>
                    <button
                      type="button"
                      onClick={handleGrantClinicalSuite}
                      className="px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800 transition"
                      title="Grant Care Management and Clinical Workflows"
                    >
                      + Grant Care Ops
                    </button>
                    <button
                      type="button"
                      onClick={handleRevokeAllPrivileges}
                      className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 transition"
                      title="Revoke all capabilities for this user (Deny-All)"
                    >
                      - Revoke All (Deny)
                    </button>
                    <button
                      type="button"
                      onClick={handleResetUserToRoleDefault}
                      className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 transition"
                      title="Reset permissions to base role defaults"
                    >
                      Reset Role Defaults
                    </button>
                  </div>
                </div>

                {/* Privileges List grouped by Category */}
                <div className="overflow-y-auto p-5 space-y-6 flex-1 max-h-[60vh]">
                  {PERMISSION_CATEGORIES.map((cat) => {
                    const filteredModules = cat.modules.filter((m) => {
                      if (!userPrivilegeSearch.trim()) return true;
                      const q = userPrivilegeSearch.toLowerCase();
                      const modMatch =
                        m.label.toLowerCase().includes(q) ||
                        m.key.toLowerCase().includes(q) ||
                        (m.description || "").toLowerCase().includes(q);
                      const subMatch = (m.subPermissions || []).some(
                        (s) =>
                          s.label.toLowerCase().includes(q) ||
                          s.key.toLowerCase().includes(q) ||
                          (s.description || "").toLowerCase().includes(q)
                      );
                      return modMatch || subMatch;
                    });

                    if (filteredModules.length === 0) return null;

                    const allCatKeys = filteredModules.flatMap((m) => [m.key, ...(m.subPermissions || []).map((s) => s.key)]);
                    const activeInCat = allCatKeys.filter((k) => userCustomPerms.has(k)).length;

                    return (
                      <div key={cat.id} className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50/50 dark:bg-slate-900/40">
                        {/* Category Header */}
                        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/60 flex items-center justify-between">
                          <div>
                            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                              {cat.title}
                            </h4>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {cat.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span className="text-xs font-bold text-sky-500 dark:text-sky-400">
                              {activeInCat} / {allCatKeys.length} enabled
                            </span>
                            <span className="text-slate-300 dark:text-slate-700">|</span>
                            <button
                              type="button"
                              onClick={() => {
                                setUserCustomPerms((prev) => {
                                  const next = new Set(prev);
                                  allCatKeys.forEach((k) => next.add(k));
                                  return next;
                                });
                              }}
                              className="text-[10px] font-semibold text-sky-600 hover:text-sky-500 dark:text-sky-400 hover:underline"
                            >
                              Select All
                            </button>
                            <span className="text-slate-300 dark:text-slate-700">·</span>
                            <button
                              type="button"
                              onClick={() => {
                                setUserCustomPerms((prev) => {
                                  const next = new Set(prev);
                                  allCatKeys.forEach((k) => next.delete(k));
                                  return next;
                                });
                              }}
                              className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:underline"
                            >
                              Deselect All
                            </button>
                          </div>
                        </div>

                        {/* Modules Grid */}
                        <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                          {filteredModules.map((m) => {
                            const isGranted = userCustomPerms.has(m.key);
                            const roleDefaultList = matrix[inspectingUser.role] || DEFAULT_ROLE_PERMISSIONS[inspectingUser.role] || [];
                            const isRoleDefault = roleDefaultList.includes(m.key);
                            const isOverride = isGranted !== isRoleDefault;
                            const subPerms = m.subPermissions || [];
                            const activeSubs = subPerms.filter((s) => userCustomPerms.has(s.key)).length;

                            return (
                              <div key={m.key} className="transition-all">
                                {/* Module Header Bar */}
                                <div
                                  className={`px-4 py-3 flex items-center justify-between transition hover:bg-white dark:hover:bg-slate-800/50 ${
                                    isGranted ? "bg-sky-50/30 dark:bg-sky-950/20" : ""
                                  }`}
                                >
                                  <div className="space-y-0.5 pr-4 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                        {m.label}
                                      </span>
                                      <span className="font-mono text-[10px] text-slate-400">
                                        {m.key}
                                      </span>
                                      {subPerms.length > 0 && (
                                        <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-400 border border-sky-400/20">
                                          {activeSubs}/{subPerms.length} Sub-Menus Active
                                        </span>
                                      )}
                                      {isOverride && (
                                        <span className="rounded-full bg-purple-500/10 px-1.5 py-0.2 text-[9px] font-bold text-purple-400 border border-purple-500/30">
                                          {isGranted ? "+ Granted Override" : "- Revoked Override"}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                      {m.description}
                                    </p>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => toggleUserCustomPrivilege(m.key)}
                                    className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                      isGranted ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
                                    }`}
                                    role="switch"
                                    aria-checked={isGranted}
                                  >
                                    <span
                                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                        isGranted ? "translate-x-5" : "translate-x-0"
                                      }`}
                                    />
                                  </button>
                                </div>

                                {/* Sub-menu Privileges (Nested Under Module) */}
                                {subPerms.length > 0 && (
                                  <div className="border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/40 p-3 pl-6 space-y-2">
                                    <div className="flex items-center justify-between pb-1 border-b border-slate-200/50 dark:border-slate-800/50">
                                      <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                        <svg className="h-3 w-3 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                        </svg>
                                        <span>Sub-Menus & Dashboard Tabs ({subPerms.length})</span>
                                        {!isGranted && (
                                          <span className="text-[10px] text-amber-500 dark:text-amber-400 font-normal italic">
                                            (Parent module disabled)
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setUserCustomPerms((prev) => {
                                              const next = new Set(prev);
                                              subPerms.forEach((s) => next.add(s.key));
                                              return next;
                                            });
                                          }}
                                          className="text-[10px] font-semibold text-sky-600 hover:text-sky-500 dark:text-sky-400"
                                        >
                                          Enable All Subs
                                        </button>
                                        <span className="text-slate-300 dark:text-slate-700">|</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setUserCustomPerms((prev) => {
                                              const next = new Set(prev);
                                              subPerms.forEach((s) => next.delete(s.key));
                                              return next;
                                            });
                                          }}
                                          className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                        >
                                          Disable All Subs
                                        </button>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                      {subPerms.map((sub) => {
                                        const isSubGranted = userCustomPerms.has(sub.key);
                                        const roleDefaultList = matrix[inspectingUser.role] || DEFAULT_ROLE_PERMISSIONS[inspectingUser.role] || [];
                                        const isSubRoleDefault = roleDefaultList.includes(sub.key);
                                        const isSubOverride = isSubGranted !== isSubRoleDefault;

                                        return (
                                          <div
                                            key={sub.key}
                                            className={`flex items-start justify-between p-2 rounded-lg border text-xs transition ${
                                              isSubGranted
                                                ? "border-sky-500/40 bg-white dark:bg-slate-900/80 shadow-xs"
                                                : "border-slate-200 dark:border-slate-800/80 bg-white/40 dark:bg-slate-900/20 opacity-70"
                                            }`}
                                          >
                                            <div className="pr-2 flex-1">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                                  {sub.label}
                                                </span>
                                                {isSubOverride && (
                                                  <span className="rounded-full bg-purple-500/10 px-1.5 py-0.2 text-[8px] font-bold text-purple-400 border border-purple-500/30">
                                                    {isSubGranted ? "+ Grant" : "- Revoke"}
                                                  </span>
                                                )}
                                              </div>
                                              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                                                {sub.description}
                                              </p>
                                              <span className="font-mono text-[9px] text-slate-400">
                                                {sub.key}
                                              </span>
                                            </div>

                                            <button
                                              type="button"
                                              onClick={() => toggleUserCustomPrivilege(sub.key, m)}
                                              className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                                isSubGranted ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
                                              }`}
                                              role="switch"
                                              aria-checked={isSubGranted}
                                            >
                                              <span
                                                className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                                  isSubGranted ? "translate-x-4" : "translate-x-0"
                                                }`}
                                              />
                                            </button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Modal Footer */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/80">
                  <button
                    type="button"
                    onClick={handleResetUserToRoleDefault}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
                  >
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Reset to Role Defaults
                  </button>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={closeUserPrivilegesModal}
                      className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveUserPrivileges}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-sm transition"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      Save User Privileges
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────
              MODAL: EDIT USER ACCOUNT & ROLE ALLOTMENT
              ────────────────────────────────────────────────────────── */}
          {editingUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs p-4 animate-fadeIn">
              <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0f172a] p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-xs">
                      {(editingUser.name || editingUser.email).slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        Edit User Account
                      </h3>
                      <p className="text-xs text-slate-400 font-mono">
                        {editingUser.email}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveEditUser} className="space-y-3.5">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={editUserForm.name}
                      onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:border-sky-500 focus:outline-none"
                      placeholder="e.g. Jessica Funiestas, MHA"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Job Title / Designation
                      </label>
                      <input
                        type="text"
                        value={editUserForm.title}
                        onChange={(e) => setEditUserForm({ ...editUserForm, title: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:border-sky-500 focus:outline-none"
                        placeholder="e.g. VP Payer Relations"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Department
                      </label>
                      <input
                        type="text"
                        value={editUserForm.department}
                        onChange={(e) => setEditUserForm({ ...editUserForm, department: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:border-sky-500 focus:outline-none"
                        placeholder="e.g. Healthcare Economics"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Assigned System Role
                      </label>
                      <select
                        value={editUserForm.role}
                        onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:border-sky-500 focus:outline-none"
                      >
                        {ROLE_DEFINITIONS.map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Account Status
                      </label>
                      <select
                        value={editUserForm.is_active ? "active" : "inactive"}
                        onChange={(e) => setEditUserForm({ ...editUserForm, is_active: e.target.value === "active" })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:border-sky-500 focus:outline-none"
                      >
                        <option value="active">Active (Access Allowed)</option>
                        <option value="inactive">Suspended / Inactive</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Reset Password (Optional)
                    </label>
                    <input
                      type="password"
                      value={editUserForm.newPassword}
                      onChange={(e) => setEditUserForm({ ...editUserForm, newPassword: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:border-sky-500 focus:outline-none"
                      placeholder="Leave blank to keep existing password"
                    />
                  </div>

                  {/* Direct Link to Privileges for this User */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        const targetUser = editingUser;
                        setEditingUser(null);
                        openUserPrivilegesModal(targetUser);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-600 hover:text-sky-500 dark:text-sky-400"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                      Manage &amp; Customize Privileges for this User →
                    </button>
                  </div>

                  {/* Modal Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleDeleteUser(editingUser.id, editingUser.email)}
                      className="text-xs font-semibold text-rose-500 hover:text-rose-600 transition"
                    >
                      Remove User
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingUser(null)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingEditUser}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-sm transition disabled:opacity-50"
                      >
                        {savingEditUser ? "Saving..." : "Save Changes"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Provision User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0f172a] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Provision Organization User & Allot Role</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddUserModal(false)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Full Name / Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Robert Vance, MD"
                  value={newUserForm.name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="user@prominencehealth.com"
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Initial Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Allotted Healthcare Role *
                </label>
                <select
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white focus:border-sky-500 focus:outline-none"
                >
                  {ROLE_DEFINITIONS.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  User will automatically inherit the module & chart tab privileges configured for this role.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingUser}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white shadow-sm"
                >
                  {addingUser ? "Provisioning..." : "Provision User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────
          VIEW 2: ROLE CAPABILITY & PRIVILEGES MATRIX
          ────────────────────────────────────────────────────────── */}
      {viewTab === "privileges_matrix" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Role Selection Grid */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Select Role Profile to Configure
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {ROLE_DEFINITIONS.map((r) => {
                const isSelected = r.key === selectedRoleKey;
                const isCurrent = r.key === currentRole;
                const count = (matrix[r.key] || DEFAULT_ROLE_PERMISSIONS[r.key] || []).length;

                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setSelectedRoleKey(r.key)}
                    className={[
                      "relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all",
                      getToneClasses(r.badgeTone, isSelected),
                    ].join(" ")}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {r.name}
                        </span>
                        {isCurrent && (
                          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                        {r.description}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
                      <span>Authorized Capabilities:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {count} granted
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Permission Detail Workspace */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Permissions Matrix for: {selectedRole.name}
                  </h3>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {selectedRole.key}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Grant or revoke access to entire menu modules or fine-tune individual sub-menu privileges.
                </p>
              </div>

              <div className="w-full sm:w-64">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search modules or sub-menus..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 pl-8 text-xs text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <svg className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Categories Mirroring Left Sidebar Menu */}
            <div className="mt-6 space-y-8">
              {filteredCategories.map((category) => {
                const allCatKeys = category.modules.flatMap((m) => [m.key, ...(m.subPermissions || []).map((s) => s.key)]);
                const activeInCat = allCatKeys.filter((k) => activePermsForRole.has(k)).length;

                return (
                  <div
                    key={category.id}
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-5 transition dark:border-slate-800/80 dark:bg-slate-900/40"
                  >
                    {/* Category Header */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/60 pb-4 dark:border-slate-800/60">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="h-2 w-2 rounded-full bg-sky-400" />
                          <h4 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                            {category.title}
                          </h4>
                          <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {activeInCat} / {allCatKeys.length} enabled
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 pl-4.5">
                          {category.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => selectAllCategory(category)}
                          className="text-xs font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
                        >
                          Enable Section
                        </button>
                        <span className="text-slate-300 dark:text-slate-700">|</span>
                        <button
                          type="button"
                          onClick={() => clearAllCategory(category)}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        >
                          Disable Section
                        </button>
                      </div>
                    </div>

                    {/* Modules List */}
                    <div className="mt-4 space-y-4">
                      {category.modules.map((mod) => {
                        const isModuleGranted = activePermsForRole.has(mod.key);
                        const subPerms = mod.subPermissions || [];
                        const activeSubs = subPerms.filter((s) => activePermsForRole.has(s.key)).length;

                        return (
                          <div
                            key={mod.key}
                            className={[
                              "rounded-xl border transition-all",
                              isModuleGranted
                                ? "border-sky-500/30 bg-white dark:border-sky-500/20 dark:bg-slate-800/60 shadow-xs"
                                : "border-slate-200/80 bg-white/50 dark:border-slate-800/80 dark:bg-slate-900/30",
                            ].join(" ")}
                          >
                            {/* Module Header Bar */}
                            <div className="flex items-center justify-between p-3.5">
                              <div
                                className="flex-1 pr-3"
                              >
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                                    {mod.label}
                                  </span>
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                    {mod.key}
                                  </span>
                                  {subPerms.length > 0 && (
                                    <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-400 border border-sky-400/20">
                                      {activeSubs}/{subPerms.length} Sub-Menus Active
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                  {mod.description}
                                </p>
                              </div>

                              {/* Master Module Toggle */}
                              <div className="shrink-0 flex items-center gap-3">
                                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                  {isModuleGranted ? "Module Active" : "Module Hidden"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleModuleWithSubs(mod)}
                                  className={[
                                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                    isModuleGranted ? "bg-sky-600" : "bg-slate-300 dark:bg-slate-700",
                                  ].join(" ")}
                                >
                                  <span
                                    className={[
                                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                                      isModuleGranted ? "translate-x-5" : "translate-x-0",
                                    ].join(" ")}
                                  />
                                </button>
                              </div>
                            </div>

                            {/* Nested Sub-Menu Privileges (Hierarchical Tree) */}
                            {subPerms.length > 0 && (
                              <div className="border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40 p-3.5 rounded-b-xl">
                                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/50 dark:border-slate-800/50">
                                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    <svg className="h-3.5 w-3.5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                    </svg>
                                    <span>Sub-Menu & Chart Tab Authority</span>
                                    {!isModuleGranted && (
                                      <span className="text-[10px] text-amber-400 font-normal italic">
                                        (Parent module is disabled — sub-menus cannot be viewed until module is enabled)
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => selectAllSubPermissions(mod)}
                                      className="text-[11px] font-medium text-sky-500 hover:text-sky-400"
                                    >
                                      Enable All Subs
                                    </button>
                                    <span className="text-slate-300 dark:text-slate-700">|</span>
                                    <button
                                      type="button"
                                      onClick={() => clearAllSubPermissions(mod)}
                                      className="text-[11px] font-medium text-slate-400 hover:text-slate-300"
                                    >
                                      Disable All Subs
                                    </button>
                                  </div>
                                </div>

                                {/* Sub-menu Privileges Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                                  {subPerms.map((sub) => {
                                    const isSubGranted = activePermsForRole.has(sub.key);

                                    return (
                                      <div
                                        key={sub.key}
                                        className={[
                                          "flex items-start justify-between p-2.5 rounded-lg border transition",
                                          isSubGranted
                                        ? "border-sky-500/40 bg-white dark:bg-slate-900/80 shadow-xs"
                                        : "border-slate-200 dark:border-slate-800/80 bg-white/40 dark:bg-slate-900/20 opacity-70 hover:opacity-100",
                                      !isModuleGranted ? "opacity-50" : "",
                                    ].join(" ")}
                                  >
                                    <div className="pr-2">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                          {sub.label}
                                        </span>
                                        {sub.supervisorOnly && (
                                          <span className="rounded bg-amber-500/10 px-1 py-0.2 text-[9px] font-bold text-amber-400 border border-amber-400/20">
                                            Supervisor Only
                                          </span>
                                        )}
                                      </div>
                                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                        {sub.description}
                                      </p>
                                    </div>

                                    <div className="pt-0.5 shrink-0">
                                      <button
                                        type="button"
                                        aria-label={`Toggle privilege ${sub.label}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          togglePermission(sub.key, mod.key);
                                        }}
                                        className={[
                                          "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out",
                                          isSubGranted ? "bg-sky-500" : "bg-slate-300 dark:bg-slate-700",
                                        ].join(" ")}
                                      >
                                        <span
                                          className={[
                                            "pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                                            isSubGranted ? "translate-x-3" : "translate-x-0",
                                          ].join(" ")}
                                        />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  )}

      {/* ──────────────────────────────────────────────────────────
          VIEW 3: ENTERPRISE SSO & DEMO ROLE PERSONAS (ADMIN SANDBOX)
          ────────────────────────────────────────────────────────── */}
      {viewTab === "sso_demo_testing" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Header Card */}
          <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-5 shadow-sm dark:border-sky-900/50 dark:bg-sky-950/30">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-900/70 dark:text-sky-300 border border-sky-300 dark:border-sky-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                  Secure Administrative Testing Sandbox
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1.5">
                  Enterprise SSO & Single-Click Persona Previews
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                  Simulate external Identity Provider (IdP) OIDC / Cognito group exchanges, test role-specific application entitlements, and launch single-click preview sessions directly without exposing demo shortcuts on the public sign-in page.
                </p>
              </div>
            </div>
          </div>

          {/* Card 1: Enterprise OIDC / Cognito Simulation */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-600/30 dark:text-sky-400 font-bold text-xs">
                  SSO
                </span>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Enterprise OIDC / Cognito Group-to-Role Simulation</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Test IdP Claims, Group Mapping, and Deny-by-Default policies</p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-2.5 py-0.5 text-xs font-semibold border border-emerald-300 dark:border-emerald-800">
                OIDC Provider Active
              </span>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Simulate IdP User Group (AWS Cognito / Okta / Azure Entra):
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={selectedIdpGroup}
                  onChange={(e) => setSelectedIdpGroup(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 px-3.5 py-2 text-xs dark:text-white outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="Prominence_Care_Coordinators">
                    Prominence_Care_Coordinators → Coordinator
                  </option>
                  <option value="Prominence_Clinical_Supervisors">
                    Prominence_Clinical_Supervisors → Supervisor
                  </option>
                  <option value="Prominence_Business_Admins">
                    Prominence_Business_Admins → Business Admin
                  </option>
                  <option value="Prominence_Compliance_Auditors">
                    Prominence_Compliance_Auditors → Compliance Auditor
                  </option>
                  <option value="External_Contractors_Unmapped">
                    External_Contractors_Unmapped (Deny-by-Default 403 Test)
                  </option>
                </select>

                <button
                  type="button"
                  onClick={() => handleTestOidc(selectedIdpGroup)}
                  disabled={testingOidc}
                  className="rounded-xl bg-sky-600 hover:bg-sky-500 px-5 py-2 text-xs font-bold text-white shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
                >
                  {testingOidc ? (
                    <>
                      <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Testing Exchange...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Test Token Exchange
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* OIDC Test Result */}
            {oidcResult && (
              <div className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 space-y-2 text-xs text-emerald-900 dark:text-emerald-200 animate-fadeIn">
                <div className="font-bold flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  OIDC Exchange Successful — Mapped Role: <code className="bg-emerald-200 dark:bg-emerald-900 px-1.5 py-0.5 rounded">{oidcResult.role}</code>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div><strong>Email:</strong> {oidcResult.email}</div>
                  <div><strong>Tenant:</strong> {oidcResult.tenant}</div>
                  <div><strong>Token Type:</strong> Bearer (JWT)</div>
                </div>
              </div>
            )}

            {oidcError && (
              <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-800 dark:text-rose-200 space-y-1 animate-fadeIn">
                <div className="font-bold flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  Access Denied / Security Policy Triggered
                </div>
                <p className="text-[11px]">{oidcError}</p>
              </div>
            )}
          </div>

          {/* Card 2: Instant Single-Click Demo Persona Launchers */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Instant Single-Click Demo Role Personas</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Launch directly into any clinical, operational, or executive persona to audit and test view permissions in real time.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 min-w-0">
              {DEMO_PERSONAS.map((p) => {
                const isLaunching = switchingPersonaEmail === p.email;
                return (
                  <button
                    key={p.email}
                    type="button"
                    onClick={() => handleLaunchPersona(p)}
                    disabled={Boolean(switchingPersonaEmail)}
                    className="flex flex-col text-left rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-sky-50/60 dark:border-slate-800 dark:bg-slate-950/60 p-3 transition hover:border-sky-500 dark:hover:bg-sky-950/20 group disabled:opacity-60 min-w-0 overflow-hidden"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-slate-800 text-xs font-bold dark:text-sky-400 group-hover:bg-sky-600 group-hover:text-white transition">
                        {p.avatar}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 group-hover:text-sky-600 dark:group-hover:text-sky-400">
                        {p.role}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-300 truncate">
                      {p.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {p.title}
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-1">
                      {p.email}
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                      <span>{isLaunching ? "Switching..." : "Launch Persona →"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Card 3: Complete Local Sign-in Credentials Reference Table */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Verified Local Sign-In Credentials Reference
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Use these verified credentials on the public sign-in page (<code className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">/login</code>) for secure local authentication across all system roles.
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/90 font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  <tr>
                    <th className="px-3.5 py-3 text-left">Persona / Name</th>
                    <th className="px-3.5 py-3 text-left">Role Key</th>
                    <th className="px-3.5 py-3 text-left">Organization (Tenant)</th>
                    <th className="px-3.5 py-3 text-left">Professional Email</th>
                    <th className="px-3.5 py-3 text-left">Password</th>
                    <th className="px-3.5 py-3 text-left">Direct Landing Destination</th>
                    <th className="px-3.5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {DEMO_PERSONAS.map((p) => {
                    const destination =
                      p.role === "payer_executive" || (p.email || "").toLowerCase().includes("jessica")
                        ? "/member360/plan-performance"
                        : p.role === "patient"
                        ? "/portal"
                        : "/member360";

                    return (
                      <tr key={p.email} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <div className="font-bold text-slate-900 dark:text-white">{p.name}</div>
                          <div className="text-[10px] text-slate-500">{p.title}</div>
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
                            {p.role}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-700 dark:text-slate-300">
                          <code>prominencehealth</code>
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-[11px] text-sky-600 dark:text-sky-400">
                          {p.email}
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <code className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-mono text-[11px] font-bold">
                            admin
                          </code>
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-400 font-mono text-[10px]">
                          {destination}
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap text-right">
                          <button
                            type="button"
                            onClick={() => handleLaunchPersona(p)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800 dark:hover:bg-sky-900/60 transition"
                          >
                            Sign In
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RolePrivilegesManager;
