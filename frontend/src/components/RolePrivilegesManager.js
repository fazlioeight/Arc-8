import React, { useState, useMemo, useEffect, useContext } from "react";
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

const RolePrivilegesManager = () => {
  const {
    currentRole,
    matrix,
    updateRolePermissions,
    resetPermissions,
    switchRole,
    isAdmin,
    can,
  } = usePermissions();

  const canManagePrivileges = isAdmin || can("menu:role_privileges");

  const { token, tenant } = useContext(AuthContext) || {};

  const [viewTab, setViewTab] = useState("privileges_matrix"); // "privileges_matrix" | "user_allotment"
  const [selectedRoleKey, setSelectedRoleKey] = useState(currentRole || "admin");
  const [searchQuery, setSearchQuery] = useState("");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [saveToast, setSaveToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

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

  const togglePermission = (permKey) => {
    const nextSet = new Set(activePermsForRole);
    if (nextSet.has(permKey)) {
      nextSet.delete(permKey);
    } else {
      nextSet.add(permKey);
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
    if (!userSearchQuery.trim()) return users;
    const q = userSearchQuery.toLowerCase();
    return users.filter(
      (u) =>
        (u.email || "").toLowerCase().includes(q) ||
        (u.name || "").toLowerCase().includes(q) ||
        (u.role || "").toLowerCase().includes(q) ||
        (u.department || "").toLowerCase().includes(q)
    );
  }, [users, userSearchQuery]);

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
    <div className="space-y-6">
      {/* Header & Quick stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
              <svg className="h-3 w-3 fill-current" viewBox="0 0 24 24">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
              </svg>
              US Healthcare Security & HIPAA Compliance
            </span>
          </div>
          <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Role & Privileges Management Center
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Administratively assign roles to organization staff and fine-tune module and sub-menu authority.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <svg className="h-3.5 w-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1015.3-6.36L21 8M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Reset Defaults
          </button>

          <button
            type="button"
            onClick={() => switchRole(selectedRoleKey)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Preview Platform As {selectedRole.name.split(" ")[0]}
          </button>
        </div>
      </div>

      {saveToast && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300 animate-fadeIn">
          <svg className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span>{toastMessage || "Changes updated and synchronized successfully."}</span>
        </div>
      )}

      {/* Dual-Mode View Switcher */}
      <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setViewTab("privileges_matrix")}
          className={[
            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
            viewTab === "privileges_matrix"
              ? "bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-xs"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60",
          ].join(" ")}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Role Capability & Privileges Matrix
        </button>

        <button
          type="button"
          onClick={() => setViewTab("user_allotment")}
          className={[
            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all relative",
            viewTab === "user_allotment"
              ? "bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-xs"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60",
          ].join(" ")}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          User Directory & Role Allotment
          <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-400 border border-sky-400/20">
            {users.length} Users
          </span>
        </button>
      </div>

      {/* ──────────────────────────────────────────────────────────
          VIEW 1: USER DIRECTORY & ROLE ALLOTMENT
          ────────────────────────────────────────────────────────── */}
      {viewTab === "user_allotment" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Organization User Directory & Role Allotment</span>
                <span className="text-xs font-normal text-slate-400">
                  (Assign roles to staff & members)
                </span>
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Admins have full authority to allot, change, or revoke user roles. Role changes immediately grant or restrict corresponding menu modules and chart tabs.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <input
                  type="text"
                  placeholder="Filter users..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 pl-8 text-xs text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <svg className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </div>

              <button
                type="button"
                onClick={() => setShowAddUserModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 shrink-0"
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
                  <th className="px-4 py-3.5 text-left">Granted Privileges</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredUsers.map((u) => {
                  const currentRoleDef = ROLE_DEFINITIONS.find((r) => r.key === u.role) || ROLE_DEFINITIONS[2];
                  const grantedCount = (matrix[u.role] || DEFAULT_ROLE_PERMISSIONS[u.role] || []).length;
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

                      {/* Granted Capabilities Summary */}
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-sky-400">{grantedCount}</span> capabilities active
                      </td>

                      {/* Quick Actions */}
                      <td className="px-4 py-3 whitespace-nowrap text-right text-xs">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRoleKey(u.role);
                              setViewTab("privileges_matrix");
                            }}
                            className="text-sky-500 hover:text-sky-400 font-semibold"
                            title="Inspect or customize permissions for this user's role"
                          >
                            Inspect Matrix
                          </button>
                          <span className="text-slate-300 dark:text-slate-700">|</span>
                          <button
                            type="button"
                            onClick={() => switchRole(u.role)}
                            className="text-slate-400 hover:text-slate-200"
                            title="Preview platform interface with this user's role authority"
                          >
                            Preview Role
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Provision User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Provision Organization User & Allot Role</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddUserModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Full Name / Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Robert Vance, MD"
                  value={newUserForm.name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="user@prominencehealth.com"
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Initial Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Allotted Healthcare Role *
                </label>
                <select
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
                >
                  {ROLE_DEFINITIONS.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-400">
                  User will automatically inherit the module & chart tab privileges configured for this role.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
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
                                className="flex-1 cursor-pointer pr-3"
                                onClick={() => toggleModuleWithSubs(mod)}
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
                                        onClick={() => togglePermission(sub.key)}
                                        className={[
                                          "flex items-start justify-between p-2.5 rounded-lg border cursor-pointer transition",
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
                                      <span
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
                                      </span>
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
</div>
);
};

export default RolePrivilegesManager;
