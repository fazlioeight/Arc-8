import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PortalUtilityBar from "../../../components/PortalUtilityBar";
import KpiTile from "../../../components/ui/KpiTile";
import { AuthContext } from "../../../context/AuthContext";
import {
  createAdminUser,
  fetchAdminUsers,
  updateAdminUser,
  ApplicationAccessService,
} from "../../../services/adminService";
import { ROUTES } from "../../../constants/routes";
import "../../../styles/memberWorkspace.css";

const API_ERROR_FALLBACK = "Unable to load admin data. Please try again.";

const buildApplicationState = (apps, userApps = {}) => {
  const base = {};
  apps.forEach((app) => {
    if (app.key === "portal") {
      base[app.key] = userApps[app.key] || "user";
    } else if (app.key === "admin_console") {
      base[app.key] = userApps[app.key] || "none";
    } else if (app.core) {
      base[app.key] = userApps[app.key] || "user";
    } else {
      base[app.key] = userApps[app.key] || "none";
    }
  });
  return base;
};

const toPayloadApplications = (appState) => {
  const payload = {};
  Object.entries(appState).forEach(([key, level]) => {
    if (level && level !== "none") {
      payload[key] = level;
    }
  });
  return payload;
};

const summarizeApplications = (appDefinitions, appPermissions) => {
  if (!appDefinitions.length || !appPermissions) return "No access";
  const summary = [];
  appDefinitions.forEach((app) => {
    const level = appPermissions[app.key];
    if (level) {
      const friendly = level === 'admin' ? 'Admin' : level === 'manager' ? 'Manager' : 'User';
      summary.push(`${app.label}: ${friendly}`);
    }
  });
  return summary.length ? summary.join(", ") : "No access";
};

const formatGlobalRole = (value) => {
  if (value === 'platform_admin') return 'Platform admin';
  if (value === 'admin') return 'Admin';
  return 'User';
};

const roleTone = (value) => {
  if (value === "platform_admin") {
    return "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-100 dark:ring-indigo-500/40";
  }
  if (value === "admin") {
    return "bg-sky-100 text-sky-800 ring-1 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-100 dark:ring-sky-500/40";
  }
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-700/50 dark:text-slate-100 dark:ring-slate-600/50";
};

const statusTone = (active) =>
  active
    ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-50 dark:ring-emerald-500/30"
    : "bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-600/20 dark:text-amber-50 dark:ring-amber-500/40";

// Bespoke class constants kept for backwards compat with the existing 800-line
// body. Each maps to the HubSpot pattern used elsewhere in the platform so
// updates here cascade through every cell, button, and input.
const CARD = "coding-surface rounded-2xl shadow-sm p-4";
const CARD_EMPH = "coding-surface rounded-2xl shadow-sm p-5";
const INPUT = "coding-input w-full rounded-md px-3 py-2 text-sm";
const PRIMARY_BTN = "inline-flex items-center rounded-md bg-[var(--brand-primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
const GHOST_BTN = "inline-flex items-center rounded-md ring-1 coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)] px-3 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] disabled:cursor-not-allowed disabled:opacity-60";
const RADIO_CLASS = (active) =>
  `flex items-center gap-2 rounded-md ring-1 px-3 py-2 text-sm transition ${active ? "ring-[var(--brand-primary)] bg-brand-50 text-[var(--brand-primary)] dark:bg-brand-900/20" : "coding-border coding-text-strong hover:bg-[var(--coding-hover)]"}`;

const MasterAdminPage = () => {
  const navigate = useNavigate();
  const { token, tenant, role, user } = useContext(AuthContext) || {};
  const applicationService = useMemo(() => new ApplicationAccessService({ token, tenant }), [tenant, token]);
  const [loading, setLoading] = useState(true);
  const isPlatformAdmin = role === 'platform_admin';
  const isTenantAdmin = role === 'admin';
  const isAdmin = isPlatformAdmin || isTenantAdmin;
  const [saving, setSaving] = useState(false);
  const [apps, setApps] = useState([]);
  const [purchaseSelections, setPurchaseSelections] = useState(() => new Set());
  const [purchaseDirty, setPurchaseDirty] = useState(false);
  const [savingPurchases, setSavingPurchases] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [form, setForm] = useState({ email: "", password: "", role: "user", is_active: true, applications: {} });
  const [mode, setMode] = useState("view"); // "view" | "create" | "edit"
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [sampleMode, setSampleMode] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    if (token && role && !isAdmin) {
      navigate(ROUTES.PORTAL.LANDING);
    }
  }, [token, role, isAdmin, navigate]);

  useEffect(() => {
    let isActive = true;
    const load = async () => {
      if (!token || !tenant || !isAdmin) return;
      setLoading(true);
      setError("");
      try {
        const [appsResponse, usersResponse] = await Promise.all([
          applicationService.fetchApplications(),
          fetchAdminUsers({ token, tenant }),
        ]);
        if (!isActive) return;
        const sortedApps = [...(appsResponse.items || [])].sort((a, b) => a.label.localeCompare(b.label));
        const sortedUsers = [...(usersResponse.users || [])].sort((a, b) => a.email.localeCompare(b.email));
        setApps(sortedApps);
        setPurchaseSelections(new Set(sortedApps.filter((app) => app.core || app.purchased).map((app) => app.key)));
        setPurchaseDirty(false);
        setUsers(sortedUsers);
        setSampleMode(false);
        if (sortedUsers.length) {
          const first = sortedUsers[0];
          setSelectedUserId(first.id);
          setMode("edit");
          setForm({
            email: first.email,
            password: "",
            role: first.role,
            is_active: first.is_active,
            applications: buildApplicationState(sortedApps, first.applications),
          });
        } else {
          setMode("create");
          setForm({
            email: "",
            password: "",
            role: "user",
            is_active: true,
            applications: buildApplicationState(sortedApps, {}),
          });
        }
      } catch (err) {
        console.error(err);
        if (!isActive) return;
        setSampleMode(false);
        setError(err.message || API_ERROR_FALLBACK);
      } finally {
        if (isActive) setLoading(false);
      }
    };

    load();
    return () => {
      isActive = false;
    };
  }, [token, tenant, isAdmin, applicationService]);

  useEffect(() => {
    if (!statusMessage) return;
    const id = setTimeout(() => setStatusMessage(""), 4000);
    return () => clearTimeout(id);
  }, [statusMessage]);

  const handlePurchaseToggle = useCallback((appKey, enabled) => {
    if (!appKey || !isPlatformAdmin) return;
    setPurchaseSelections((prev) => {
      const next = new Set(prev);
      if (enabled) {
        next.add(appKey);
      } else {
        next.delete(appKey);
      }
      return next;
    });
    if (!enabled) {
      setForm((prev) => ({
        ...prev,
        applications: {
          ...prev.applications,
          [appKey]: 'none',
        },
      }));
    }
    setPurchaseDirty(true);
    setStatusMessage('');
  }, [isPlatformAdmin, setForm]);

  const handleSavePurchases = useCallback(async () => {
    if (!isPlatformAdmin || !token || !tenant) return;
    setSavingPurchases(true);
    setError('');
    try {
      const optionalSelections = apps
        .filter((app) => !app.core && purchaseSelections.has(app.key))
        .map((app) => app.key);

      let updatedApps;
      if (sampleMode) {
        updatedApps = apps
          .map((app) => ({
            ...app,
            purchased: app.core ? true : purchaseSelections.has(app.key),
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
        setStatusMessage('Updated purchased applications (sample)');
      } else {
        const response = await applicationService.updatePurchases(optionalSelections);
        updatedApps = [...(response.items || [])].sort((a, b) => a.label.localeCompare(b.label));
        setStatusMessage(response.isSample ? 'Updated purchased applications (sample)' : 'Application purchases updated');
      }

      setApps(updatedApps);
      const allowedKeys = new Set(updatedApps.filter((app) => app.core || app.purchased).map((app) => app.key));
      setPurchaseSelections(new Set(allowedKeys));
      setPurchaseDirty(false);

      const nextUsers = users.map((record) => ({
        ...record,
        applications: Object.fromEntries(
          Object.entries(record.applications || {}).filter(([key]) => allowedKeys.has(key))
        ),
      }));
      setUsers(nextUsers);

      if (selectedUserId) {
        const targetUser = nextUsers.find((item) => item.id === selectedUserId);
        if (targetUser) {
          setForm((prev) => ({
            ...prev,
            applications: buildApplicationState(updatedApps, targetUser.applications),
          }));
        } else {
          setForm((prev) => ({
            ...prev,
            applications: buildApplicationState(updatedApps, {}),
          }));
        }
      } else {
        setForm((prev) => ({
          ...prev,
          applications: buildApplicationState(updatedApps, {}),
        }));
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to update purchases');
    } finally {
      setSavingPurchases(false);
    }
  }, [apps, purchaseSelections, sampleMode, selectedUserId, token, tenant, users, isPlatformAdmin, applicationService]);

const filteredUsers = useMemo(() => {
    if (!search) return users;
    const term = search.toLowerCase();
    return users.filter((u) => u.email.toLowerCase().includes(term));
  }, [users, search]);

  const selectedUser = useMemo(() => users.find((u) => u.id === selectedUserId) || null, [users, selectedUserId]);

  const resetFormForCreate = () => {
    setMode("create");
    setSelectedUserId(null);
    setError("");
    setStatusMessage("");
    setForm({
      email: "",
      password: "",
      role: "user",
      is_active: true,
      applications: buildApplicationState(apps, {}),
    });
  };

  const handleSelectUser = (userRecord) => {
    setMode("edit");
    setError("");
    setStatusMessage("");
    setSelectedUserId(userRecord.id);
    setForm({
      email: userRecord.email,
      password: "",
      role: userRecord.role,
      is_active: userRecord.is_active,
      applications: buildApplicationState(apps, userRecord.applications),
    });
  };

  const handleFieldChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleApplicationChange = (appKey, level) => {
    setForm((prev) => ({
      ...prev,
      applications: {
        ...prev.applications,
        [appKey]: level,
      },
    }));
  };

  const validateForm = () => {
    if (!form.email.trim()) {
      setError("Email is required");
      return false;
    }
    if (mode === "create" && (!form.password || form.password.length < 8)) {
      setError("Password must be at least 8 characters for new users");
      return false;
    }
    if (mode === "edit" && form.password && form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return false;
    }
    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setStatusMessage("");
    if (!validateForm()) return;

    setSaving(true);
    try {
      const normalizedApplications = buildApplicationState(apps, form.applications);
      if (mode === "create") {
        const email = form.email.trim().toLowerCase();
        if (sampleMode) {
          const created = {
            id: `sample-user-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            email,
            role: form.role,
            is_active: form.is_active,
            applications: normalizedApplications,
          };
          const nextUsers = [...users, created].sort((a, b) => a.email.localeCompare(b.email));
          setUsers(nextUsers);
          handleSelectUser(created);
          setForm({
            email: created.email,
            password: "",
            role: created.role,
            is_active: created.is_active,
            applications: buildApplicationState(apps, created.applications),
          });
          setMode("edit");
          setStatusMessage(`Created user ${created.email} (sample)`);
          return;
        }

        const payload = {
          email,
          password: form.password,
          role: form.role,
          is_active: form.is_active,
          applications: toPayloadApplications(form.applications),
          __fullApplications: normalizedApplications,
        };
        const created = await createAdminUser({ token, tenant, payload });
        const nextUsers = [...users, created].sort((a, b) => a.email.localeCompare(b.email));
        setUsers(nextUsers);
        handleSelectUser(created);
        setForm({
          email: created.email,
          password: "",
          role: created.role,
          is_active: created.is_active,
          applications: buildApplicationState(apps, created.applications),
        });
        setMode("edit");
        setStatusMessage(`Created user ${created.email}`);
      } else if (mode === "edit" && selectedUser) {
        const payload = {
          role: form.role,
          is_active: form.is_active,
          applications: toPayloadApplications(form.applications),
          __fullApplications: normalizedApplications,
        };
        if (form.password) {
          payload.password = form.password;
        }

        if (sampleMode) {
          const updated = {
            ...selectedUser,
            role: form.role,
            is_active: form.is_active,
            applications: normalizedApplications,
          };
          const nextUsers = users
            .map((u) => (u.id === updated.id ? updated : u))
            .sort((a, b) => a.email.localeCompare(b.email));
          setUsers(nextUsers);
          setForm({
            email: updated.email,
            password: "",
            role: updated.role,
            is_active: updated.is_active,
            applications: buildApplicationState(apps, updated.applications),
          });
          setStatusMessage(`Updated user ${updated.email} (sample)`);
          return;
        }

        const updated = await updateAdminUser({ token, tenant, userId: selectedUser.id, payload });
        const nextUsers = users
          .map((u) => (u.id === updated.id ? updated : u))
          .sort((a, b) => a.email.localeCompare(b.email));
        setUsers(nextUsers);
        setForm({
          email: updated.email,
          password: "",
          role: updated.role,
          is_active: updated.is_active,
          applications: buildApplicationState(apps, updated.applications),
        });
        setStatusMessage(`Updated user ${updated.email}`);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  if (!token || !isAdmin) {
    return null;
  }

  return (
    <div className="coding-member-workspace portal-theme min-h-screen">
      <PortalUtilityBar />
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] coding-text-muted">Platform Admin</p>
            <h1 className="text-3xl font-semibold coding-text-strong">Master Admin Console</h1>
            <p className="max-w-3xl text-sm coding-text-soft">
              Manage users, roles, and application access for the {user?.tenant || tenant} tenant.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-3.5 py-2 text-xs font-bold text-sky-700 transition hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
              onClick={() => navigate(`${ROUTES.SETTINGS}#privileges`)}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
              </svg>
              Role Privileges Matrix
            </button>
            <button className={GHOST_BTN} onClick={resetFormForCreate} disabled={saving}>
              + New User
            </button>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiTile label="Users" value={users.length} hint="Total" />
          <KpiTile label="Admins" value={users.filter((u) => u.role === 'admin' || u.role === 'platform_admin').length} tone="info" hint="Elevated" />
          <KpiTile label="Active" value={users.filter((u) => u.is_active).length} tone="success" hint="Enabled" />
          <KpiTile label="Applications" value={apps.length} hint="Available" />
        </section>

        <div className="mt-6 space-y-4" id="admin-shell">
          {statusMessage && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-50">
              <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
              <span>{statusMessage}</span>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 shadow-sm dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-50" role="alert">
              <span className="h-2 w-2 rounded-full bg-rose-400" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="grid gap-6 lg:grid-cols-[360px,1fr]">
              <div className="h-[520px] animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
              <div className="space-y-4">
                <div className="h-44 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
                <div className="h-[520px] animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
              </div>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[360px,1fr]" id="admin-grid">
              <div className={CARD}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Users</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Select a user to edit their access.</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
                    {filteredUsers.length} users
                  </span>
                </div>

                <div className="mt-4 flex gap-2">
                  <input
                    type="search"
                    placeholder="Search by email"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className={INPUT}
                  />
                  <button type="button" onClick={resetFormForCreate} className={GHOST_BTN} disabled={saving}>
                    New
                  </button>
                </div>

                <div className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/80">
                  <div className="grid grid-cols-4 gap-2 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    <span className="col-span-2">Email</span>
                    <span>Role</span>
                    <span>Status</span>
                  </div>
                  {filteredUsers.map((record) => {
                    const isSelected = record.id === selectedUserId;
                    return (
                      <button
                        type="button"
                        key={record.id}
                        onClick={() => handleSelectUser(record)}
                        className={`grid grid-cols-4 items-center gap-2 px-3 py-3 text-left text-sm transition ${isSelected ? "bg-indigo-50 ring-2 ring-indigo-200 dark:bg-slate-800/80 dark:ring-sky-500/40" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"}`}
                      >
                        <div className="col-span-2 min-w-0">
                          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{record.email}</p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {summarizeApplications(apps, record.applications)}
                          </p>
                        </div>
                        <div>
                          <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${roleTone(record.role)}`}>
                            {formatGlobalRole(record.role)}
                          </span>
                        </div>
                        <div>
                          <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${statusTone(record.is_active)}`}>
                            {record.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {!filteredUsers.length && (
                    <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-300">No users match your search.</div>
                  )}
                </div>
              </div>
              <div className="space-y-6">
                {isPlatformAdmin ? (
                  <div className={CARD_EMPH}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Application catalog</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Enable optional apps. Core apps are always included.</p>
                      </div>
                      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${purchaseDirty ? "bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-50 dark:ring-amber-500/40" : "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-50 dark:ring-emerald-500/30"}`}>
                        <span className={`h-2 w-2 rounded-full ${purchaseDirty ? "bg-amber-400" : "bg-emerald-400"}`} />
                        {purchaseDirty ? "Unsaved changes" : "Synced"}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {apps.map((app) => {
                        const isSelected = purchaseSelections.has(app.key);
                        const badgeClass = app.core
                          ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-100 dark:ring-indigo-500/30"
                          : isSelected
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-50 dark:ring-emerald-500/30"
                          : "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800/70 dark:text-slate-100 dark:ring-slate-700";
                        const badgeLabel = app.core ? "Included" : isSelected ? "Purchased" : "Not purchased";
                        return (
                          <div
                            key={app.key}
                            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-sky-500/50"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-slate-900 dark:text-slate-50">{app.label}</p>
                                {app.description && <p className="text-xs text-slate-500 dark:text-slate-400">{app.description}</p>}
                              </div>
                              <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${badgeClass}`}>
                                {badgeLabel}
                              </span>
                            </div>
                            {!app.core && (
                              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-100">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => handlePurchaseToggle(app.key, e.target.checked)}
                                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-sky-400 dark:focus:ring-sky-400"
                                />
                                <span>Purchased</span>
                              </label>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={handleSavePurchases}
                        disabled={savingPurchases || !purchaseDirty}
                        className={PRIMARY_BTN}
                      >
                        {savingPurchases ? "Saving..." : "Save application purchases"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={CARD_EMPH}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Application catalog</p>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{apps.length} apps</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Contact Nexora Lab to adjust your subscription.</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {apps.map((app) => {
                        const isPurchased = purchaseSelections.has(app.key);
                        const badgeClass = app.core
                          ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-100 dark:ring-indigo-500/30"
                          : isPurchased
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-50 dark:ring-emerald-500/30"
                          : "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800/70 dark:text-slate-100 dark:ring-slate-700";
                        const badgeLabel = app.core ? "Included" : isPurchased ? "Purchased" : "Not purchased";
                        return (
                          <div
                            key={app.key}
                            className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-sky-500/50"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-slate-900 dark:text-slate-50">{app.label}</p>
                                {app.description && <p className="text-xs text-slate-500 dark:text-slate-400">{app.description}</p>}
                              </div>
                              <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${badgeClass}`}>
                                {badgeLabel}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className={CARD_EMPH}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {mode === "create" ? "Create new user" : `Edit ${form.email}`}
                      </p>
                      {mode === "edit" && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">Leave password blank to keep the existing password.</p>
                      )}
                    </div>
                    {mode === "edit" && (
                      <button type="button" onClick={resetFormForCreate} className={GHOST_BTN} disabled={saving}>
                        Create another user
                      </button>
                    )}
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="text-slate-700 dark:text-slate-200">Email</span>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => handleFieldChange("email", e.target.value)}
                        disabled={mode === "edit"}
                        required
                        className={INPUT}
                      />
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="text-slate-700 dark:text-slate-200">
                        Password {mode === "edit" && <span className="text-xs text-slate-500">(optional)</span>}
                      </span>
                      <input
                        type="password"
                        value={form.password}
                        onChange={(e) => handleFieldChange("password", e.target.value)}
                        placeholder={mode === "edit" ? "Leave blank to keep current password" : ""}
                        required={mode === "create"}
                        className={INPUT}
                      />
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="text-slate-700 dark:text-slate-200">Global role</span>
                      <select
                        value={form.role}
                        onChange={(e) => handleFieldChange("role", e.target.value)}
                        className={INPUT}
                      >
                        <option value="clinician">Clinician / Physician (MD/DO)</option>
                        <option value="nurse">Care Coordinator / Nurse (RN)</option>
                        <option value="coder">Risk Adjustment Coder (CPC/CRC)</option>
                        <option value="billing">Billing & Capitation Specialist</option>
                        <option value="patient">Member / Patient</option>
                        <option value="admin">Tenant Administrator / Supervisor</option>
                        {isPlatformAdmin && <option value="platform_admin">Platform Administrator</option>}
                        <option value="user">General Staff User</option>
                      </select>
                    </label>

                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-100">
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(e) => handleFieldChange("is_active", e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-sky-400 dark:focus:ring-sky-400"
                      />
                      Active user
                    </label>
                  </div>

                  <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Application access</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Assign Administration or Non admin access. Choose "No access" to hide an app.
                        </p>
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{apps.length} apps</span>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {apps.map((app) => {
                        const value = form.applications?.[app.key] || (app.key === "portal" ? "user" : "none");
                        const isAdminOnly = app.key === "admin_console";
                        const isPurchased = app.core || purchaseSelections.has(app.key);
                        const badgeClass = app.core
                          ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-100 dark:ring-indigo-500/30"
                          : isPurchased
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-50 dark:ring-emerald-500/30"
                          : "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800/70 dark:text-slate-100 dark:ring-slate-700";
                        const badgeLabel = app.core ? "Included" : isPurchased ? "Purchased" : "Not purchased";
                        const radioInputClass = "h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-500 dark:bg-slate-900 dark:text-sky-400 dark:focus:ring-sky-400";
                        return (
                          <div key={app.key} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-slate-900 dark:text-slate-50">{app.label}</p>
                                {app.description && <p className="text-xs text-slate-500 dark:text-slate-400">{app.description}</p>}
                              </div>
                              <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${badgeClass}`}>
                                {badgeLabel}
                              </span>
                            </div>
                            <div className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
                              {app.key === "portal" ? (
                                <>
                                  <label className={RADIO_CLASS(value === "user")}>
                                    <input
                                      type="radio"
                                      name={`app-${app.key}`}
                                      value="user"
                                      checked={value === "user"}
                                      onChange={() => handleApplicationChange(app.key, "user")}
                                      disabled={!isPurchased}
                                      className={radioInputClass}
                                    />
                                    <span>Non admin user</span>
                                  </label>
                                  <label className={RADIO_CLASS(value === "admin")}>
                                    <input
                                      type="radio"
                                      name={`app-${app.key}`}
                                      value="admin"
                                      checked={value === "admin"}
                                      onChange={() => handleApplicationChange(app.key, "admin")}
                                      disabled={!isPurchased}
                                      className={radioInputClass}
                                    />
                                    <span>Administration</span>
                                  </label>
                                  <div className="text-xs text-slate-500 dark:text-slate-400">Portal access is required.</div>
                                </>
                              ) : (
                                <>
                                  <label className={RADIO_CLASS(value === "none")}>
                                    <input
                                      type="radio"
                                      name={`app-${app.key}`}
                                      value="none"
                                      checked={value === "none"}
                                      onChange={() => handleApplicationChange(app.key, "none")}
                                      className={radioInputClass}
                                    />
                                    <span>No access</span>
                                  </label>
                                  {!isAdminOnly && (
                                    <label className={RADIO_CLASS(value === "user")}>
                                      <input
                                        type="radio"
                                        name={`app-${app.key}`}
                                        value="user"
                                        checked={value === "user"}
                                        onChange={() => handleApplicationChange(app.key, "user")}
                                        disabled={!isPurchased}
                                        className={radioInputClass}
                                      />
                                      <span>Non admin user</span>
                                    </label>
                                  )}
                                  <label className={RADIO_CLASS(value === "admin")}>
                                    <input
                                      type="radio"
                                      name={`app-${app.key}`}
                                      value="admin"
                                      checked={value === "admin"}
                                      onChange={() => handleApplicationChange(app.key, "admin")}
                                      disabled={!isPurchased}
                                      className={radioInputClass}
                                    />
                                    <span>Administration</span>
                                  </label>
                                  {!isPurchased && <div className="text-xs text-amber-600 dark:text-amber-200">Purchase this app to assign access.</div>}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Changes apply immediately after saving.</p>
                    <div className="flex items-center gap-2">
                      <button type="submit" disabled={saving} className={PRIMARY_BTN}>
                        {saving ? "Saving..." : mode === "create" ? "Create user" : "Save changes"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MasterAdminPage;

