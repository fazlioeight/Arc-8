import React, { useState, useMemo } from "react";
import {
  ROLE_DEFINITIONS,
  PERMISSION_CATEGORIES,
  DEFAULT_ROLE_PERMISSIONS,
} from "../constants/permissions";
import { usePermissions } from "../hooks/usePermissions";

const RolePrivilegesManager = () => {
  const {
    currentRole,
    matrix,
    updateRolePermissions,
    resetPermissions,
    switchRole,
    isAdmin,
  } = usePermissions();

  const [selectedRoleKey, setSelectedRoleKey] = useState(currentRole || "admin");
  const [searchQuery, setSearchQuery] = useState("");
  const [saveToast, setSaveToast] = useState(false);

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
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  };

  const selectAllCategory = (catPerms) => {
    const nextSet = new Set(activePermsForRole);
    catPerms.forEach((p) => nextSet.add(p.key));
    updateRolePermissions(selectedRoleKey, Array.from(nextSet));
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  };

  const clearAllCategory = (catPerms) => {
    const nextSet = new Set(activePermsForRole);
    catPerms.forEach((p) => nextSet.delete(p.key));
    updateRolePermissions(selectedRoleKey, Array.from(nextSet));
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  };

  const handleReset = () => {
    if (window.confirm("Reset all role privileges to the default US Healthcare security baseline?")) {
      resetPermissions();
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2500);
    }
  };

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return PERMISSION_CATEGORIES;
    const q = searchQuery.toLowerCase();
    return PERMISSION_CATEGORIES.map((cat) => ({
      ...cat,
      permissions: cat.permissions.filter(
        (p) =>
          p.label.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.key.toLowerCase().includes(q)
      ),
    })).filter((cat) => cat.permissions.length > 0);
  }, [searchQuery]);

  const getToneClasses = (tone, isSelected) => {
    if (isSelected) {
      return "border-sky-500 bg-sky-50/70 text-sky-950 shadow-sm dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-100 ring-2 ring-sky-500/20";
    }
    return "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 text-slate-800 dark:text-slate-200";
  };

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
            Configure granular capability matrices, clinical PHI boundaries, and workflow access across organizational roles.
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
          <span>Privilege policies updated and synchronized successfully.</span>
        </div>
      )}

      {/* Role Selection Grid */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Select Clinical or Operational Role
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
              Toggle specific capabilities on or off for this role profile. Changes apply dynamically across workspace sessions.
            </p>
          </div>

          <div className="w-full sm:w-64">
            <div className="relative">
              <input
                type="text"
                placeholder="Search privileges..."
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

        {/* Categories Accordions / Blocks */}
        <div className="mt-6 space-y-6">
          {filteredCategories.map((category) => {
            const catPermKeys = category.permissions.map((p) => p.key);
            const activeInCat = catPermKeys.filter((k) => activePermsForRole.has(k)).length;
            const isAllActive = activeInCat === catPermKeys.length;

            return (
              <div
                key={category.id}
                className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 transition dark:border-slate-800/80 dark:bg-slate-900/40"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/60 pb-3 dark:border-slate-800/60">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {category.title}
                      </h4>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {activeInCat} / {catPermKeys.length} enabled
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {category.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => selectAllCategory(category.permissions)}
                      className="text-[11px] font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
                    >
                      Enable All
                    </button>
                    <span className="text-slate-300 dark:text-slate-700">|</span>
                    <button
                      type="button"
                      onClick={() => clearAllCategory(category.permissions)}
                      className="text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      Disable All
                    </button>
                  </div>
                </div>

                {/* Permissions Grid */}
                <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {category.permissions.map((perm) => {
                    const isGranted = activePermsForRole.has(perm.key);

                    return (
                      <div
                        key={perm.key}
                        onClick={() => togglePermission(perm.key)}
                        className={[
                          "flex cursor-pointer items-start justify-between rounded-lg border p-3 transition",
                          isGranted
                            ? "border-sky-200 bg-white shadow-xs dark:border-sky-900/60 dark:bg-slate-800/80"
                            : "border-slate-200/70 bg-white/60 opacity-75 hover:opacity-100 dark:border-slate-800 dark:bg-slate-900/50",
                        ].join(" ")}
                      >
                        <div className="pr-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                              {perm.label}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                              ({perm.key})
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                            {perm.description}
                          </p>
                        </div>

                        <div className="pt-0.5 shrink-0">
                          <span
                            className={[
                              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                              isGranted ? "bg-sky-600" : "bg-slate-300 dark:bg-slate-700",
                            ].join(" ")}
                          >
                            <span
                              className={[
                                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                                isGranted ? "translate-x-4" : "translate-x-0",
                              ].join(" ")}
                            />
                          </span>
                        </div>
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
  );
};

export default RolePrivilegesManager;
