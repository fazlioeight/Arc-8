import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../index.css";
import "../portal_page/portalPage.sfdc.css";
import "./settings.css";
import DarkModeToggle from "../../components/DarkModeToggle";
import ToggleSwitch from "../../components/ToggleSwitch";
import PortalUtilityBar from "../../components/PortalUtilityBar";
import PortalHero from '../../components/PortalHero';
import { AuthContext } from "../../context/AuthContext";

const Settings = ({ themePreference, setThemePreference }) => {
  const navigate = useNavigate();
  const { isAuthenticated } = useContext(AuthContext) || {};
  const [active, setActive] = useState("general");

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
    } catch (error) {
      console.warn("Failed to parse stored settings", error);
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

  // Derived memory list (placeholder, managed in localStorage)
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
    // Placeholder: clear any known history keys if present
    localStorage.removeItem("chatHistory");
    alert("Chat history cleared.");
  };

  const deleteAccount = () => {
    if (!window.confirm("This will delete your local account data. Continue?")) return;
    // Clear local-only data; server deletion would require API.
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

  return (
    <div className="li-settings">
      {isAuthenticated && <PortalUtilityBar />}
      <PortalHero
        align="left"
        title="Settings"
        subtitle="Manage your Nexora account preferences."
        actions={(
          <button
            className="sfdc-button_brand"
            onClick={() => navigate('/portal_page/portalPage')}
            aria-label="Go to Portal Home"
            type="button"
          >
            Portal home
          </button>
        )}
        wave={false}
      />

      <div className="li-settings__container">
        <nav className="li-settings__nav" aria-label="Settings sections">
          {[
            { id: "general", label: "General" },
            { id: "data", label: "Data controls" },
            { id: "personalization", label: "Personalization" },
            { id: "memory", label: "Memory" },
            { id: "notifications", label: "Notifications" },
            { id: "beta", label: "Beta features" },
            { id: "about", label: "About" },
          ].map((s) => (
            <div
              key={s.id}
              className={`li-settings__navitem ${active === s.id ? "is-active" : ""}`}
              onClick={() => setActive(s.id)}
              role="button"
              tabIndex={0}
            >
              <span>{s.label}</span>
              <span aria-hidden>›</span>
            </div>
          ))}
        </nav>

        <section className="li-settings__content" aria-live="polite">
          {active === "general" && (
            <div className="li-card">
              <div className="li-card__title">General</div>
              <div className="li-card__desc">Theme and language preferences.</div>
              <div className="li-card__row">
                <div>
                  <div className="li-toggle__title">Theme</div>
                  <div className="li-toggle__hint">Choose system, light, or dark</div>
                </div>
                <DarkModeToggle themePreference={themePreference} setThemePreference={(v)=>{ setThemePreference(v); updatePref("theme", v); }} />
              </div>
              <div className="li-card__row">
                <div className="li-toggle">
                  <div className="li-toggle__label">
                    <div className="li-toggle__title">Language</div>
                    <div className="li-toggle__hint">UI language for the app</div>
                  </div>
                </div>
                <select
                  value={prefs.language}
                  onChange={(e) => updatePref("language", e.target.value)}
                  className="li-btn"
                >
                  <option>English</option>
                  <option>Spanish</option>
                  <option>French</option>
                </select>
              </div>
            </div>
          )}

          {active === "data" && (
            <div className="li-card">
              <div className="li-card__title">Data controls</div>
              <div className="li-card__desc">Manage how your chats and data are handled.</div>
              <div className="li-card__row">
                <ToggleSwitch
                  id="chat-history"
                  label="Chat history"
                  hint="Save chats to your history"
                  checked={prefs.chatHistory}
                  onChange={(v) => updatePref("chatHistory", v)}
                />
              </div>
              <div className="li-card__row">
                <ToggleSwitch
                  id="training"
                  label="Improve the model"
                  hint="Allow content to be used to improve models"
                  checked={prefs.training}
                  onChange={(v) => updatePref("training", v)}
                />
              </div>
              <div className="li-card__row">
                <div>
                  <div className="li-toggle__title">Export data</div>
                  <div className="li-toggle__hint">Download a copy of your data</div>
                </div>
                <div className="li-actions">
                  <button className="li-btn li-btn--brand" onClick={exportData}>Export</button>
                </div>
              </div>
              <div className="li-card__row">
                <div>
                  <div className="li-toggle__title">Clear chat history</div>
                  <div className="li-toggle__hint">Remove your stored conversations</div>
                </div>
                <button className="li-btn" onClick={clearHistory}>Clear</button>
              </div>
              <div className="li-card__row">
                <div>
                  <div className="li-toggle__title">Delete account</div>
                  <div className="li-toggle__hint">Permanently delete your local account data</div>
                </div>
                <button className="li-btn li-btn--danger" onClick={deleteAccount}>Delete</button>
              </div>
            </div>
          )}

          {active === "personalization" && (
            <div className="li-card">
              <div className="li-card__title">Personalization</div>
              <div className="li-card__desc">Control personalized experiences.</div>
              <div className="li-card__row">
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
            <div className="li-card">
              <div className="li-card__title">Memory</div>
              <div className="li-card__desc">Enable and manage remembered details.</div>
              <div className="li-card__row">
                <ToggleSwitch
                  id="memory-enabled"
                  label="Memory"
                  hint="Allow the assistant to remember details"
                  checked={prefs.memoryEnabled}
                  onChange={(v) => updatePref("memoryEnabled", v)}
                />
              </div>
              <div className="li-card__row" style={{display:'block'}}>
                <div className="li-toggle__hint" style={{marginBottom:8}}>Saved memories</div>
                {memories.length === 0 ? (
                  <div className="li-toggle__hint">No memories yet.</div>
                ) : (
                  memories.map((m, i) => (
                    <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderTop:'1px solid var(--sfdc-border)'}}>
                      <div style={{color:'var(--sfdc-text)'}}>{m}</div>
                      <button className="li-btn" onClick={() => setMemories((arr) => arr.filter((_, idx) => idx !== i))}>Delete</button>
                    </div>
                  ))
                )}
                {memories.length > 0 && (
                  <div style={{marginTop:8}}>
                    <button className="li-btn" onClick={() => setMemories([])}>Delete all memories</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {active === "notifications" && (
            <div className="li-card">
              <div className="li-card__title">Notifications</div>
              <div className="li-card__desc">Choose how you receive notifications and updates.</div>
              <div className="li-card__row">
                <ToggleSwitch
                  id="desktop-notifications"
                  label="Desktop notifications"
                  hint="Enable browser notifications"
                  checked={prefs.desktopNotifications}
                  onChange={(v) => { updatePref("desktopNotifications", v); requestDesktopNotifications(v); }}
                />
              </div>
              <div className="li-card__row">
                <ToggleSwitch
                  id="email-product"
                  label="Product emails"
                  hint="Feature announcements and surveys"
                  checked={prefs.emailProduct}
                  onChange={(v) => updatePref("emailProduct", v)}
                />
              </div>
              <div className="li-card__row">
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

          {active === "beta" && (
            <div className="li-card">
              <div className="li-card__title">Beta features</div>
              <div className="li-card__desc">Early features you can try.</div>
              <div className="li-card__row">
                <ToggleSwitch
                  id="beta-ada"
                  label="Advanced Data Analysis"
                  hint="Run code for data analysis"
                  checked={prefs.betaAdvancedDataAnalysis}
                  onChange={(v) => updatePref("betaAdvancedDataAnalysis", v)}
                />
              </div>
              <div className="li-card__row">
                <ToggleSwitch
                  id="beta-browsing"
                  label="Web browsing"
                  hint="Let the assistant browse supported sites"
                  checked={prefs.betaWebBrowsing}
                  onChange={(v) => updatePref("betaWebBrowsing", v)}
                />
              </div>
              <div className="li-card__row">
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
            <div className="li-card">
              <div className="li-card__title">About</div>
              <div className="li-card__desc">App info and plan details.</div>
              <div className="li-card__row">
                <div>
                  <div className="li-toggle__title">Nexora Portal</div>
                  <div className="li-toggle__hint">Version 1.0.0</div>
                </div>
                <div className="li-toggle__hint">All rights reserved</div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Settings;
