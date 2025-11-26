import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../../index.css";
import "../coding/member/memberWorkspace.css";
import "./settings.css";
import DarkModeToggle from "../../../components/DarkModeToggle";
import ToggleSwitch from "../../../components/ToggleSwitch";
import PortalUtilityBar from "../../../components/PortalUtilityBar";
import { AuthContext } from "../../../context/AuthContext";
import { useUserPreferences } from "../../../context/UserPreferencesContext";
import { ROUTES } from "../../../constants/routes";

const NAV_ITEMS = [
  { key: "home", label: "Home & Landing" },
  { key: "analytics", label: "Analytics Dashboard" },
  { key: "coding", label: "Coding Workbench" },
  { key: "care", label: "Care Operations menu" },
  { key: "rideBooking", label: "Ride coordination" },
  { key: "jobCenter", label: "Operations Center" },
  { key: "importData", label: "Data imports" },
  { key: "resources", label: "Docs library" },
  { key: "admin", label: "Administration menu" },
  { key: "adminConsole", label: "Master admin console" },
  { key: "assignments", label: "Work distribution" },
  { key: "settings", label: "Settings access" },
  { key: "pricing", label: "Pricing" },
  { key: "contact", label: "Contact" },
  { key: "login", label: "Login link" },
];

const Settings = ({ themePreference, setThemePreference }) => {
  const navigate = useNavigate();
  const { isAuthenticated, role } = useContext(AuthContext) || {};
  const { roleMenus, setNavVisibility } = useUserPreferences();
  const [active, setActive] = useState("general");
  const [menuRole, setMenuRole] = useState(() => role || "admin");

  useEffect(() => {
    if (role) {
      setMenuRole(role);
    }
  }, [role]);

  const [prefs, setPrefs] = useState(() => {
    const saved = localStorage.getItem("liSettings");
    const basePrefs = {
      theme: themePreference || "system",
      language: "English",
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
    if (!saved) {
      return basePrefs;
    }
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

  const updatePref = (key, value) => setPrefs((p) => ({ ...p, [key]: value }));

  useEffect(() => {
    if (themePreference && themePreference !== prefs.theme) {
      setPrefs((p) => ({ ...p, theme: themePreference }));
    }
  }, [themePreference]);

  const [memories, setMemories] = useState(() => {
    const saved = localStorage.getItem("liMemories");
    return JSON.parse(saved || "[]");
  });
  useEffect(() => {
    localStorage.setItem("liMemories", JSON.stringify(memories));
  }, [memories]);

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
    a.download = `nexora-settings-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearHistory = () => {
    localStorage.removeItem("chatHistory");
    alert("Chat history cleared.");
  };

  const deleteAccount = () => {
    if (!window.confirm("This will delete your local account data. Continue?")) return;
    localStorage.removeItem("liSettings");
    localStorage.removeItem("liMemories");
    localStorage.removeItem("themePreference");
    localStorage.removeItem("token");
    alert("Local account data deleted.");
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
      { id: "general", label: "General" },
      { id: "data", label: "Data controls" },
      { id: "personalization", label: "Personalization" },
      { id: "memory", label: "Memory" },
      { id: "notifications", label: "Notifications" },
      { id: "beta", label: "Beta features" },
      { id: "about", label: "About" },
      ...(role === "admin" ? [{ id: "navigation", label: "Navigation" }] : []),
    ],
    [role]
  );

  return (
    <div className="coding-member-workspace portal-theme min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {isAuthenticated && <PortalUtilityBar />}
      <header className="border-b border-slate-200 bg-white/80 px-4 py-5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Settings</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">Manage your Nexora account preferences.</p>
          </div>
          <button
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700"
            onClick={() => navigate(ROUTES.PORTAL.LANDING)}
            type="button"
          >
            Portal home
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
          <nav className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label="Settings sections">
            <ul className="space-y-2 text-sm">
              {navSections.map((s) => (
                <li key={s.id}>
                  <button
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition ${
                      active === s.id
                        ? "bg-sky-50 font-semibold text-sky-700 ring-1 ring-sky-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700"
                        : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    }`}
                    onClick={() => setActive(s.id)}
                    type="button"
                  >
                    <span>{s.label}</span>
                    <span aria-hidden>›</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <section className="space-y-4">
            {active === "general" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">General</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">Theme and language preferences.</div>
                <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Theme</div>
                    <div className="text-xs text-slate-500 dark:text-slate-300">Choose system, light, or dark</div>
                  </div>
                  <DarkModeToggle
                    themePreference={themePreference}
                    setThemePreference={(v) => {
                      setThemePreference(v);
                      updatePref("theme", v);
                    }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Language</div>
                    <div className="text-xs text-slate-500 dark:text-slate-300">UI language for the app</div>
                  </div>
                  <select
                    value={prefs.language}
                    onChange={(e) => updatePref("language", e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
                  >
                    <option>English</option>
                    <option>Spanish</option>
                    <option>French</option>
                  </select>
                </div>
              </div>
            )}

            {active === "data" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Data controls</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">Manage how your chats and data are handled.</div>
                <div className="mt-3 space-y-3">
                  <ToggleSwitch
                    id="chat-history"
                    label="Chat history"
                    hint="Save chats to your history"
                    checked={prefs.chatHistory}
                    onChange={(v) => updatePref("chatHistory", v)}
                  />
                  <ToggleSwitch
                    id="training"
                    label="Improve the model"
                    hint="Allow content to be used to improve models"
                    checked={prefs.training}
                    onChange={(v) => updatePref("training", v)}
                  />
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Export data</div>
                      <div className="text-xs text-slate-500 dark:text-slate-300">Download a copy of your data</div>
                    </div>
                    <button
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                      onClick={exportData}
                    >
                      Export
                    </button>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Clear chat history</div>
                      <div className="text-xs text-slate-500 dark:text-slate-300">Remove your stored conversations</div>
                    </div>
                    <button
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                      onClick={clearHistory}
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Delete account</div>
                      <div className="text-xs text-slate-500 dark:text-slate-300">Permanently delete your local account data</div>
                    </div>
                    <button
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-100"
                      onClick={deleteAccount}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}

            {active === "personalization" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Personalization</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">Control personalized experiences.</div>
                <div className="mt-3">
                  <ToggleSwitch
                    id="personalization"
                    label="Personalized responses"
                    hint="Use your data to tailor responses"
                    checked={prefs.personalization}
                    onChange={(v) => updatePref("personalization", v)}
                  />
                </div>
              </div>
            )}

            {active === "memory" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Memory</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">Enable and manage remembered details.</div>
                <div className="mt-3">
                  <ToggleSwitch
                    id="memory-enabled"
                    label="Memory"
                    hint="Allow the assistant to remember details"
                    checked={prefs.memoryEnabled}
                    onChange={(v) => updatePref("memoryEnabled", v)}
                  />
                </div>
                <div className="mt-3">
                  <div className="text-xs text-slate-500 dark:text-slate-300 mb-2">Saved memories</div>
                  {memories.length === 0 ? (
                    <div className="text-xs text-slate-500 dark:text-slate-300">No memories yet.</div>
                  ) : (
                    memories.map((m, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between border-b border-slate-200 py-2 text-sm text-slate-800 dark:border-slate-700 dark:text-slate-100"
                      >
                        <div>{m}</div>
                        <button
                          className="text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                          onClick={() => setMemories((arr) => arr.filter((_, idx) => idx !== i))}
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                  {memories.length > 0 && (
                    <div className="mt-2">
                      <button
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                        onClick={() => setMemories([])}
                      >
                        Delete all memories
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {active === "notifications" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notifications</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  Choose how you receive notifications and updates.
                </div>
                <div className="mt-3 space-y-3">
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
              </div>
            )}

            {active === "navigation" && role === "admin" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Navigation by role</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  Choose which menus appear for each role to keep teams focused.
                </div>
                <div className="mt-3 flex items-center gap-3">
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
                <div className="mt-3 text-xs text-slate-500 dark:text-slate-300">
                  Changes apply immediately for users the next time they navigate.
                </div>
                <div className="mt-4 space-y-2">
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
            )}

            {active === "beta" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Beta features</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">Early features you can try.</div>
                <div className="mt-3 space-y-3">
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
              </div>
            )}

            {active === "about" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">About</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">App info and plan details.</div>
                <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 shadow-inner dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                  <div>
                    <div className="font-semibold">Nexora Portal</div>
                    <div className="text-xs text-slate-500 dark:text-slate-300">Version 1.0.0</div>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-300">All rights reserved</div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default Settings;
