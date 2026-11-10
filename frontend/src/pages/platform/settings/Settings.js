import React, { useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  const location = useLocation();
  const { isAuthenticated, role, token, tenant, logout } = useContext(AuthContext) || {};
  const { roleMenus, setNavVisibility, language, setLanguage, t } = useUserPreferences();
  const { currentRole, can, isAdmin } = usePermissions();
  const canViewPrivileges = can("menu:role_privileges");
  const canGeneral = can("sub:settings_general");
  const canSecurity = can("sub:settings_security");
  const canIntegrations = can("sub:settings_integrations");

  const resolveHashSection = (hashStr) => {
    const raw = (hashStr || "").replace("#", "");
    if (raw === "audit") return "data";
    if (raw === "integrations") return "beta";
    return raw;
  };

  const [active, setActive] = useState(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      const h = resolveHashSection(window.location.hash);
      if (["users", "privileges", "general", "data", "personalization", "memory", "notifications", "beta", "about", "navigation"].includes(h)) {
        if ((h === "users" || h === "privileges") && !canViewPrivileges) {
          return "general";
        }
        return h;
      }
    }
    return canViewPrivileges ? "users" : "general";
  });
  const [menuRole, setMenuRole] = useState(() => currentRole || role || "admin");

  useEffect(() => {
    if (location.hash) {
      const h = resolveHashSection(location.hash);
      if (["users", "privileges", "general", "data", "personalization", "memory", "notifications", "beta", "about", "navigation"].includes(h)) {
        if ((h === "users" || h === "privileges") && !canViewPrivileges) {
          setActive("general");
        } else {
          setActive(h);
        }
      }
    }
  }, [location.hash, canViewPrivileges]);

  useEffect(() => {
    if (currentRole || role) {
      setMenuRole(currentRole || role);
    }
  }, [currentRole, role]);

  useEffect(() => {
    if (!canViewPrivileges && (active === "users" || active === "privileges")) {
      setActive("general");
    }
  }, [canViewPrivileges, active]);

  const [prefs, setPrefs] = useState(() => {
    const saved = localStorage.getItem("liSettings");
    const basePrefs = {
      theme: themePreference || "light",
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
      ...(canViewPrivileges ? [
        { id: "users", label: t("Users & Privileges") },
        { id: "privileges", label: t("Roles Matrix") },
      ] : []),
      ...(canGeneral ? [
        { id: "general", label: t("General") },
        { id: "personalization", label: t("Personalization") },
        { id: "notifications", label: t("Notifications") },
      ] : []),
      ...(canSecurity ? [
        { id: "data", label: t("Data & Security") },
        { id: "memory", label: t("Memory") },
      ] : []),
      ...(canIntegrations ? [
        { id: "beta", label: t("FHIR & Beta Integrations") },
      ] : []),
      { id: "about", label: t("About") },
      ...(isAdmin ? [{ id: "navigation", label: t("Navigation") }] : []),
    ],
    [canViewPrivileges, canGeneral, canSecurity, canIntegrations, isAdmin, t]
  );

  const layoutProps = useMemo(
    () => ({
      backgroundClassName: "",
      maxWidthClassName: "max-w-[1500px] w-full",
      paddingClassName: "px-4 sm:px-6",
    }),
    []
  );

  const headerContent = (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] coding-text-muted">{t("Settings")}</p>
      <h1 className="text-2xl sm:text-3xl font-semibold coding-text-strong">{t("Manage your Arc-8 preferences")}</h1>
      <p className="text-xs sm:text-sm coding-text-soft">{t("Personalize your workspace, role privileges, and administration.")}</p>
    </div>
  );

  return (
    <PortalPageLayout
      {...layoutProps}
      headerContent={headerContent}
      mainClassName="space-y-5"
      utilityBar={isAuthenticated}
    >
      {!(active === "users" || active === "privileges") && (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiTile label={t("Role")} value={(currentRole || menuRole || 'User').replace(/_/g, ' ')} hint="Access level" small />
          <KpiTile label={t("Sections")} value={navSections.length} hint="Available" />
          <KpiTile label={t("Memories")} value={memories.length} hint="Saved" />
          <KpiTile label={t("Theme")} value={prefs.theme || 'light'} hint="Current" small />
        </section>
      )}

      {/* Top Horizontal Navigation Tab Bar (Single Clean Row, Compact Font, No Scrollbars) */}
      <div className="rounded-xl p-1 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-xs backdrop-blur-xs overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <nav className="flex items-center gap-1 min-w-max" aria-label="Settings Sections">
          {navSections.map((s) => {
            const isActive = active === s.id;
            const isDividerBefore = s.id === "general" && canViewPrivileges;

            return (
              <React.Fragment key={s.id}>
                {isDividerBefore && (
                  <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5 self-center" />
                )}
                <button
                  type="button"
                  onClick={() => {
                    setActive(s.id);
                    if (typeof window !== "undefined") {
                      window.location.hash = s.id;
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  {s.id === "users" && (
                    <svg className="w-3 h-3 text-current shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  )}
                  {s.id === "privileges" && (
                    <svg className="w-3 h-3 text-current shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  )}
                  {s.id === "general" && (
                    <svg className="w-3 h-3 text-current shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                  {s.id === "data" && (
                    <svg className="w-3 h-3 text-current shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                    </svg>
                  )}
                  {s.id === "personalization" && (
                    <svg className="w-3 h-3 text-current shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21a4 4 0 01-4-4 5 5 0 015-5h4a5 5 0 015 5 4 4 0 01-4 4H7zM15 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  )}
                  {s.id === "memory" && (
                    <svg className="w-3 h-3 text-current shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  )}
                  {s.id === "notifications" && (
                    <svg className="w-3 h-3 text-current shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  )}
                  {s.id === "beta" && (
                    <svg className="w-3 h-3 text-current shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                  )}
                  {s.id === "about" && (
                    <svg className="w-3 h-3 text-current shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  {s.id === "navigation" && (
                    <svg className="w-3 h-3 text-current shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                  )}

                  <span>{s.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      {/* Main Full-Width Content Container */}
      <section className="space-y-4 w-full min-w-0">
        {(active === "users" || active === "privileges") && canViewPrivileges && (
          <div className="coding-surface rounded-2xl p-4 sm:p-6 shadow-sm w-full min-w-0">
            <RolePrivilegesManager key={active} initialTab={active === "privileges" ? "privileges_matrix" : "user_allotment"} />
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
    </PortalPageLayout>
  );
};

export default Settings;
