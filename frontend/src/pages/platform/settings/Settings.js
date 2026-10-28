import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PortalPageLayout from "../../../components/PortalPageLayout";
import PortalCard from "../../../components/PortalCard";
import KpiTile from "../../../components/ui/KpiTile";
import "../../../index.css";
import "../../../styles/memberWorkspace.css";
import DarkModeToggle from "../../../components/DarkModeToggle";
import ToggleSwitch from "../../../components/ToggleSwitch";
import { AuthContext } from "../../../context/AuthContext";
import { useUserPreferences } from "../../../context/UserPreferencesContext";
import { usePermissions } from "../../../hooks/usePermissions";
import {
  fetchUserPreferences,
  updateUserPreferences,
  clearChatHistory,
  deactivateAccount,
} from "../../../services/settingsService";
import RolePrivilegesManager from "../../../components/RolePrivilegesManager";

const NAV_ITEMS = [
  { key: "home", label: "Home & Landing" },
  { key: "analytics", label: "Analytics Dashboard" },
  { key: "providers", label: "Provider Directory" },
  { key: "care", label: "Care Operations menu" },
  { key: "jobCenter", label: "Operations Center" },
  { key: "importData", label: "Data imports" },
  { key: "resources", label: "Docs library" },
  { key: "admin", label: "Administration menu" },
  { key: "adminConsole", label: "Master admin console" },
  { key: "settings", label: "Settings access" },
  { key: "pricing", label: "Pricing" },
  { key: "contact", label: "Contact" },
  { key: "login", label: "Login link" },
];

const Settings = ({ themePreference, setThemePreference }) => {
  const navigate = useNavigate();
  const { isAuthenticated, role, token, tenant, logout } = useContext(AuthContext) || {};
  const { roleMenus, setNavVisibility, language, setLanguage, t } = useUserPreferences();
  const { currentRole, can, isAdmin } = usePermissions();
  const canViewPrivileges = isAdmin || can("menu:role_privileges");

  const [active, setActive] = useState(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      const h = window.location.hash.replace("#", "");
      if (["privileges", "general", "data", "personalization", "memory", "notifications", "beta", "about", "navigation"].includes(h)) {
        if (h === "privileges" && !canViewPrivileges) {
          return "general";
        }
        return h;
      }
    }
    return canViewPrivileges ? "privileges" : "general";
  });
  const [menuRole, setMenuRole] = useState(() => currentRole || role || "admin");

  useEffect(() => {
    if (currentRole || role) {
      setMenuRole(currentRole || role);
    }
  }, [currentRole, role]);

  useEffect(() => {
    if (!canViewPrivileges && active === "privileges") {
      setActive("general");
    }
  }, [canViewPrivileges, active]);

  const [prefs, setPrefs] = useState(() => {
    const saved = localStorage.getItem("liSettings");
    const basePrefs = {
      theme: themePreference || "system",
      language: language || "English",
      chatHistory: true,
      training: true,
      personalization: true,
      memoryEnabled: false,
      desktopNotifications: false,
      emailProduct: true,
      emailResearch: false,
      betaAdvancedDataAnalysis: false,
      betaWebBrowsing: false,
      betaPlugins: false,
    };
    if (!saved) return basePrefs;
    try {
      const parsed = JSON.parse(saved);
      return { ...basePrefs, ...parsed, theme: parsed?.theme || basePrefs.theme };
    } catch {
      return basePrefs;
    }
  });

  useEffect(() => {
    localStorage.setItem("liSettings", JSON.stringify(prefs));
  }, [prefs]);

  const updatePref = (key, value) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    if (key === "language" && typeof setLanguage === "function") {
      setLanguage(value);
    }
    if (key === "theme" && typeof setThemePreference === "function") {
      setThemePreference(value);
    }
  };

  useEffect(() => {
    if (themePreference && themePreference !== prefs.theme) {
      setPrefs((p) => ({ ...p, theme: themePreference }));
    }
  }, [themePreference, prefs.theme]);

  const [memories, setMemories] = useState(() => {
    const saved = localStorage.getItem("liMemories");
    return JSON.parse(saved || "[]");
  });
  useEffect(() => {
    localStorage.setItem("liMemories", JSON.stringify(memories));
  }, [memories]);

  useEffect(() => {
    let active = true;
    fetchUserPreferences({ token, tenant })
      .then((payload) => {
        if (!active || !payload) return;
        if (payload.settings && Object.keys(payload.settings).length) {
          setPrefs((current) => ({ ...current, ...payload.settings }));
        }
        if (Array.isArray(payload.memories)) {
          setMemories(payload.memories);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [tenant, token]);

  useEffect(() => {
    if (!token) return undefined;
    const timer = window.setTimeout(() => {
      updateUserPreferences({ token, tenant, settings: prefs, memories }).catch(() => {});
    }, 500);
    return () => window.clearTimeout(timer);
  }, [memories, prefs, tenant, token]);

  const exportData = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      settings: prefs,
      themePreference,
      memories,
      tenant: localStorage.getItem("companyName") || null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `arc8-settings-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearHistory = async () => {
    if (!window.confirm("Clear all of your chat history? This cannot be undone.")) return;
    try {
      await clearChatHistory({ token, tenant });
      localStorage.removeItem("chatHistory");
      alert("Chat history cleared.");
    } catch (err) {
      alert(err.message || "Could not clear chat history. Please try again.");
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm(
      "This will deactivate your account and sign you out. An administrator can reactivate it. Continue?"
    )) return;
    try {
      await deactivateAccount({ token, tenant });
    } catch (err) {
      alert(err.message || "Could not deactivate your account. Please try again.");
      return;
    }
    // End the session (also best-effort revokes server-side) and clear local data.
    if (typeof logout === "function") {
      logout();
    }
    localStorage.removeItem("liSettings");
    localStorage.removeItem("liMemories");
    localStorage.removeItem("themePreference");
    navigate("/login");
  };

  const requestDesktopNotifications = async (on) => {
    if (!("Notification" in window)) {
      alert("Notifications are not supported in this browser.");
      return;
    }
    if (on && Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") updatePref("desktopNotifications", false);
    }
  };

  const navSections = useMemo(
    () => [
      ...(canViewPrivileges ? [{ id: "privileges", label: t("Roles & Privileges") }] : []),
      { id: "general", label: t("General") },
      { id: "data", label: t("Data controls") },
      { id: "personalization", label: t("Personalization") },
      { id: "memory", label: t("Memory") },
      { id: "notifications", label: t("Notifications") },
      { id: "beta", label: t("Beta features") },
      { id: "about", label: t("About") },
      ...(isAdmin ? [{ id: "navigation", label: t("Navigation") }] : []),
    ],
    [canViewPrivileges, isAdmin, t]
  );

  const layoutProps = useMemo(
    () => ({
      backgroundClassName:
        "",
      maxWidthClassName: "max-w-6xl",
      paddingClassName: "px-4",
    }),
    []
  );

  const headerContent = (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] coding-text-muted">{t("Settings")}</p>
      <h1 className="text-3xl font-semibold coding-text-strong">{t("Manage your Arc-8 preferences")}</h1>
      <p className="text-sm coding-text-soft">{t("Personalize your workspace, navigation, and notifications.")}</p>
    </div>
  );

  return (
    <PortalPageLayout
      {...layoutProps}
      headerContent={headerContent}
      mainClassName="space-y-6"
      utilityBar={isAuthenticated}
    >
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiTile label={t("Role")} value={(currentRole || menuRole || 'User').replace(/_/g, ' ')} hint="Access level" small />
        <KpiTile label={t("Sections")} value={navSections.length} hint="Available" />
        <KpiTile label={t("Memories")} value={memories.length} hint="Saved" />
        <KpiTile label={t("Theme")} value={prefs.theme || 'system'} hint="Current" small />
      </section>

      <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
        <nav className="coding-surface rounded-2xl shadow-sm overflow-hidden sm:sticky sm:top-4 sm:self-start">
          <header className="px-4 py-2.5 border-b coding-border">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] coding-text-muted">{t("Sections")}</h3>
          </header>
          <ul>
            {navSections.map((s) => {
              const isActive = active === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setActive(s.id)}
                    className={`w-full text-left border-b coding-border-subtle px-4 py-2.5 text-sm transition border-l-4 ${
                      isActive
                        ? 'border-l-[var(--brand-primary)] bg-brand-50 dark:bg-brand-900/20 text-[var(--brand-primary)] font-medium'
                        : 'border-l-transparent coding-text-strong hover:bg-[var(--coding-hover)]'
                    }`}
                  >
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <section className="space-y-4">
          {active === "privileges" && canViewPrivileges && (
            <div className="coding-surface rounded-2xl p-6 shadow-sm">
              <RolePrivilegesManager />
            </div>
          )}

          {active === "general" && (
            <PortalCard title={t("General")} subtitle={t("Theme and language preferences.")}>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("Theme")}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-300">{t("Choose system, light, or dark")}</div>
                  </div>
                  <DarkModeToggle
                    themePreference={prefs.theme}
                    setThemePreference={(value) => {
                      updatePref("theme", value);
                    }}
                  />
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-300">{t("Language")}</div>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                    value={prefs.language}
                    onChange={(event) => updatePref("language", event.target.value)}
                  >
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                  </select>
                </div>
              </div>
            </PortalCard>
          )}

          {active === "data" && (
            <PortalCard title="Data controls" subtitle="Export, clear, or delete your data.">
              <div className="space-y-2">
                <button
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                  onClick={exportData}
                  type="button"
                >
                  Export data
                </button>
                <button
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                  onClick={clearHistory}
                  type="button"
                >
                  Clear chat history
                </button>
                <button
                  className="w-full rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 shadow-sm transition hover:border-rose-400 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-rose-500/60 dark:bg-rose-500/10 dark:text-rose-100 dark:hover:border-rose-400 dark:hover:bg-rose-500/20"
                  onClick={deleteAccount}
                  type="button"
                >
                  Delete account
                </button>
              </div>
            </PortalCard>
          )}

          {active === "personalization" && (
            <PortalCard title="Personalization" subtitle="Control how we personalize experiences.">
              <div className="space-y-3">
                <ToggleSwitch
                  id="chat-history"
                  label="Chat history & training"
                  hint="Allow your chats to improve product quality"
                  checked={prefs.chatHistory}
                  onChange={(v) => updatePref("chatHistory", v)}
                />
                <ToggleSwitch
                  id="training"
                  label="Model training"
                  hint="Allow your data for model training (anonymized)"
                  checked={prefs.training}
                  onChange={(v) => updatePref("training", v)}
                />
                <ToggleSwitch
                  id="personalization"
                  label="Personalization"
                  hint="Use your activity to personalize results"
                  checked={prefs.personalization}
                  onChange={(v) => updatePref("personalization", v)}
                />
              </div>
            </PortalCard>
          )}

          {active === "memory" && (
            <PortalCard title="Memory" subtitle="Store facts about you for faster responses.">
              <div className="space-y-3">
                <ToggleSwitch
                  id="memory-enabled"
                  label="Enable memory"
                  hint="Remember details across conversations"
                  checked={prefs.memoryEnabled}
                  onChange={(v) => updatePref("memoryEnabled", v)}
                />
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 shadow-inner dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                  <div className="font-semibold">Saved memories</div>
                  {!memories.length && <div className="text-xs text-slate-500 dark:text-slate-300">No memories saved.</div>}
                  {memories.length > 0 && (
                    <ul className="space-y-2 text-sm">
                      {memories.map((memory, idx) => (
                        <li
                          key={idx}
                          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        >
                          <span>{memory}</span>
                          <button
                            className="text-slate-500 transition hover:text-slate-900 dark:hover:text-slate-100"
                            onClick={() => setMemories((prev) => prev.filter((_, i) => i !== idx))}
                            type="button"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form
                    className="flex flex-col gap-2 pt-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.target);
                      const value = formData.get("memoryInput");
                      if (value) {
                        setMemories((prev) => [...prev, value]);
                        event.target.reset();
                      }
                    }}
                  >
                    <input
                      name="memoryInput"
                      type="text"
                      placeholder="Add a memory (e.g., Team name: Blue)"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                    />
                    <button
                      className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                      type="submit"
                    >
                      Save memory
                    </button>
                  </form>
                </div>
              </div>
            </PortalCard>
          )}

          {active === "notifications" && (
            <PortalCard title="Notifications" subtitle="Control how we notify you.">
              <div className="space-y-3">
                <ToggleSwitch
                  id="desktop-notifications"
                  label="Desktop notifications"
                  hint="Enable browser notifications"
                  checked={prefs.desktopNotifications}
                  onChange={(v) => {
                    updatePref("desktopNotifications", v);
                    requestDesktopNotifications(v);
                  }}
                />
                <ToggleSwitch
                  id="email-product"
                  label="Product emails"
                  hint="Feature announcements and surveys"
                  checked={prefs.emailProduct}
                  onChange={(v) => updatePref("emailProduct", v)}
                />
                <ToggleSwitch
                  id="email-research"
                  label="Research updates"
                  hint="Participate in product research emails"
                  checked={prefs.emailResearch}
                  onChange={(v) => updatePref("emailResearch", v)}
                />
              </div>
            </PortalCard>
          )}

          {active === "navigation" && role === "admin" && (
            <PortalCard title="Navigation by role" subtitle="Choose which menus appear for each role to keep teams focused.">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-semibold text-slate-900 dark:text-slate-100" htmlFor="nav-role-picker">
                    Role
                  </label>
                  <select
                    id="nav-role-picker"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                    value={menuRole}
                    onChange={(event) => setMenuRole(event.target.value)}
                  >
                    {Object.keys(roleMenus || {}).map((roleKey) => (
                      <option key={roleKey} value={roleKey}>
                        {roleKey.charAt(0).toUpperCase() + roleKey.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-300">
                  Changes apply immediately for users the next time they navigate.
                </div>
                <div className="space-y-2">
                  {NAV_ITEMS.map((item) => {
                    const menuConfig = roleMenus?.[menuRole] || {};
                    const checked = menuConfig[item.key] !== undefined ? menuConfig[item.key] : true;
                    return (
                      <ToggleSwitch
                        key={item.key}
                        id={`nav-${menuRole}-${item.key}`}
                        label={item.label}
                        checked={checked}
                        onChange={(value) => setNavVisibility(menuRole, item.key, value)}
                      />
                    );
                  })}
                </div>
              </div>
            </PortalCard>
          )}

          {active === "beta" && (
            <PortalCard title="Beta features" subtitle="Early features you can try.">
              <div className="space-y-3">
                <ToggleSwitch
                  id="beta-ada"
                  label="Advanced Data Analysis"
                  hint="Run code for data analysis"
                  checked={prefs.betaAdvancedDataAnalysis}
                  onChange={(v) => updatePref("betaAdvancedDataAnalysis", v)}
                />
                <ToggleSwitch
                  id="beta-browsing"
                  label="Web browsing"
                  hint="Let the assistant browse supported sites"
                  checked={prefs.betaWebBrowsing}
                  onChange={(v) => updatePref("betaWebBrowsing", v)}
                />
                <ToggleSwitch
                  id="beta-plugins"
                  label="Plugins"
                  hint="Enable third-party plugins"
                  checked={prefs.betaPlugins}
                  onChange={(v) => updatePref("betaPlugins", v)}
                />
              </div>
            </PortalCard>
          )}

          {active === "about" && (
            <PortalCard title="About" subtitle="App info and plan details.">
              <div className="mt-1 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 shadow-inner dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                <div>
                  <div className="font-semibold">Arc-8</div>
                  <div className="text-xs text-slate-500 dark:text-slate-300">Version 1.0.0</div>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-300">All rights reserved</div>
              </div>
            </PortalCard>
          )}
        </section>
      </div>
    </PortalPageLayout>
  );
};

export default Settings;
