import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { ROUTES } from "../../constants/routes";
import { DEMO_PERSONAS } from "../../constants/permissions";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000";
const DEFAULT_TENANT = process.env.REACT_APP_DEFAULT_TENANT || "prominencehealth";
const AZURE_AUTH_STORAGE_KEY = "nexoraAzureLoginRequest";

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-sky-400";

const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300";

const Field = ({ id, label, type = "text", value, onChange, placeholder, required }) => (
  <div>
    <label htmlFor={id} className={labelCls}>{label}</label>
    <input
      id={id}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      className={inputCls}
    />
  </div>
);

const base64UrlEncode = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const randomToken = (length = 48) => {
  const bytes = new Uint8Array(length);
  window.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
};

const createCodeChallenge = async (codeVerifier) => {
  const digest = await window.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier)
  );
  return base64UrlEncode(digest);
};

const getRedirectUri = () =>
  process.env.REACT_APP_AZURE_REDIRECT_URI || `${window.location.origin}/login`;

const envAzureConfig = {
  enabled: Boolean(process.env.REACT_APP_AZURE_CLIENT_ID && process.env.REACT_APP_AZURE_TENANT_ID),
  client_id: process.env.REACT_APP_AZURE_CLIENT_ID,
  tenant_id: process.env.REACT_APP_AZURE_TENANT_ID,
  authority_host: process.env.REACT_APP_AZURE_AUTHORITY_HOST || "https://login.microsoftonline.com",
  scopes: process.env.REACT_APP_AZURE_AUTH_SCOPES || "openid profile email",
};

const Login = () => {
  const [formData, setFormData] = useState({
    email: "admin@admin.com",
    password: "admin",
    tenant: DEFAULT_TENANT,
  });
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activePersonaEmail, setActivePersonaEmail] = useState("");
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [azureConfig, setAzureConfig] = useState(envAzureConfig);

  const azureReady = useMemo(
    () => Boolean(azureConfig.enabled && azureConfig.client_id && azureConfig.tenant_id),
    [azureConfig]
  );

  const handleChange = (e) =>
    setFormData((prev) => ({ ...prev, [e.target.id]: e.target.value }));

  useEffect(() => {
    let mounted = true;
    fetch(`${API_BASE}/api/auth/azure/config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((config) => {
        if (!mounted || !config) return;
        if (config.enabled && config.client_id && config.tenant_id) {
          setAzureConfig({
            ...envAzureConfig,
            ...config,
          });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoadingConfig(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const completeAzureLogin = useCallback(async (code, state) => {
    setSubmitting(true);
    setError("");
    try {
      const rawPending = window.sessionStorage.getItem(AZURE_AUTH_STORAGE_KEY);
      const pending = rawPending ? JSON.parse(rawPending) : null;
      if (!pending || pending.state !== state) {
        throw new Error("Azure login state could not be verified.");
      }

      const res = await fetch(`${API_BASE}/api/auth/azure/exchange`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Key": pending.tenant || DEFAULT_TENANT,
        },
        body: JSON.stringify({
          code,
          state,
          code_verifier: pending.codeVerifier,
          redirect_uri: pending.redirectUri,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Azure sign-in failed.");

      window.sessionStorage.removeItem(AZURE_AUTH_STORAGE_KEY);
      window.history.replaceState({}, document.title, "/login");
      login(data);
      navigate(ROUTES.PORTAL.LANDING);
    } catch (err) {
      setError(err.message || "Azure login failed.");
    } finally {
      setSubmitting(false);
    }
  }, [login, navigate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const azureError = params.get("error_description") || params.get("error");

    if (azureError) {
      setError(azureError);
      window.history.replaceState({}, document.title, "/login");
      return;
    }
    if (code && state) {
      completeAzureLogin(code, state);
    }
  }, [completeAzureLogin]);

  const handleAzureLogin = async () => {
    setError("");
    if (!azureReady) {
      setError("Azure login is not configured yet.");
      return;
    }
    if (!window.crypto?.subtle || !window.crypto?.getRandomValues) {
      setError("This browser does not support secure Azure login.");
      return;
    }

    setSubmitting(true);
    try {
      const tenant = formData.tenant.trim() || DEFAULT_TENANT;
      const state = randomToken(32);
      const nonce = randomToken(32);
      const codeVerifier = randomToken(64);
      const codeChallenge = await createCodeChallenge(codeVerifier);
      const redirectUri = getRedirectUri();

      window.sessionStorage.setItem(
        AZURE_AUTH_STORAGE_KEY,
        JSON.stringify({ state, nonce, codeVerifier, redirectUri, tenant })
      );

      const authorizeUrl = new URL(
        `${azureConfig.authority_host.replace(/\/$/, "")}/${azureConfig.tenant_id}/oauth2/v2.0/authorize`
      );
      authorizeUrl.search = new URLSearchParams({
        client_id: azureConfig.client_id,
        response_type: "code",
        redirect_uri: redirectUri,
        response_mode: "query",
        scope: azureConfig.scopes || "openid profile email",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        prompt: "select_account",
      }).toString();

      window.location.assign(authorizeUrl.toString());
    } catch (err) {
      setSubmitting(false);
      setError(err.message || "Azure login could not be started.");
    }
  };

  const executeLogin = async (payload) => {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Key": payload.tenant.trim(),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Authentication failed.");
      login(data);
      navigate(ROUTES.PORTAL.LANDING);
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
      setActivePersonaEmail("");
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    executeLogin(formData);
  };

  const handleSelectPersona = (persona) => {
    setActivePersonaEmail(persona.email);
    const updated = {
      email: persona.email,
      password: "admin",
      tenant: DEFAULT_TENANT,
    };
    setFormData(updated);
    executeLogin(updated);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-slate-100">
      {/* Top enterprise navigation header */}
      <header className="flex h-16 items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 backdrop-blur-md">
        <NavLink to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-base font-black text-white shadow-md">
            N
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-white">Nexora Lab</span>
            <span className="ml-2 rounded-md bg-sky-950 px-2 py-0.5 text-[10px] font-semibold text-sky-400 border border-sky-800/60">
              Enterprise Health
            </span>
          </div>
        </NavLink>

        <div className="flex items-center gap-4 text-xs">
          <span className="hidden items-center gap-1.5 text-slate-400 md:inline-flex">
            <svg className="h-3.5 w-3.5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            HIPAA & SOC-2 Type II Certified
          </span>
          <NavLink
            to="/"
            className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 font-medium text-slate-300 transition hover:bg-slate-700 hover:text-white"
          >
            ← Back to Overview
          </NavLink>
        </div>
      </header>

      {/* Main split-screen container */}
      <main className="flex flex-1 items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-5xl rounded-3xl border border-slate-800 bg-slate-950/90 shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          
          {/* Left clinical banner panel */}
          <div className="lg:col-span-5 bg-gradient-to-br from-sky-950/80 via-slate-900 to-slate-950 p-8 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-400">
                <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
                Live Clinical Gateway
              </div>

              <h2 className="mt-5 text-2xl font-black text-white leading-snug">
                Intelligent Care Delivery & Risk Adjustment
              </h2>
              <p className="mt-2.5 text-sm text-slate-400 leading-relaxed">
                Log in to coordinate member health journeys, validate suspect HCC codes, and optimize value-based capitation contracts.
              </p>

              <div className="mt-8 space-y-3.5">
                <div className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-900/60 p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Full HIPAA & PHI Isolation</h4>
                    <p className="text-[11px] text-slate-400">Tenant-isolated schemas with field encryption and automated access telemetry.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-900/60 p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Role-Based Clinical Governance</h4>
                    <p className="text-[11px] text-slate-400">Granular permissions protecting diagnoses, care orders, and financial analytics.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Tenant: <strong>Prominence Health Plan</strong></span>
              <span className="text-sky-400">v28 Clinical Engine</span>
            </div>
          </div>

          {/* Right login & persona selection form */}
          <div className="lg:col-span-7 p-8 sm:p-10 bg-slate-900/70 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">Enterprise Sign In</h3>
                  <p className="mt-0.5 text-xs text-slate-400">Enter your organizational credentials or choose a clinical role below.</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-sky-400 border border-slate-700">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-300 flex items-center gap-2"
                >
                  <svg className="h-4 w-4 shrink-0 text-rose-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field
                    id="tenant"
                    label="Healthcare Organization"
                    value={formData.tenant}
                    onChange={handleChange}
                    placeholder="e.g. prominencehealth"
                    required
                  />
                  <Field
                    id="email"
                    label="Professional Email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="name@organization.com"
                    required
                  />
                </div>

                <Field
                  id="password"
                  label="Password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                />

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-sky-600/20 transition hover:bg-sky-500 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Authenticating session...
                    </>
                  ) : (
                    <>
                      Sign In to Platform
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </>
                  )}
                </button>
              </form>

              {/* Instant One-Click Role Testing Personas */}
              <div className="mt-6 border-t border-slate-800 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Instant Demo Role Logins (Single-Click)
                  </span>
                  <span className="text-[10px] text-sky-400">Click any role to test</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DEMO_PERSONAS.map((p) => {
                    const isSigningInThis = submitting && activePersonaEmail === p.email;

                    return (
                      <button
                        key={p.role}
                        type="button"
                        onClick={() => handleSelectPersona(p)}
                        disabled={submitting}
                        className="flex flex-col text-left rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 transition hover:border-sky-500 hover:bg-sky-950/20 group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-800 text-[10px] font-bold text-sky-400 group-hover:bg-sky-600 group-hover:text-white transition">
                            {p.avatar}
                          </span>
                          <span className="text-[10px] font-semibold uppercase text-slate-500 group-hover:text-sky-400">
                            {p.role}
                          </span>
                        </div>
                        <div className="mt-1.5">
                          <div className="text-xs font-bold text-white group-hover:text-sky-300 truncate">
                            {p.name}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {p.title}
                          </div>
                        </div>
                        {isSigningInThis && (
                          <div className="mt-1 text-[10px] font-semibold text-sky-400 animate-pulse">
                            Signing in...
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 text-center text-[11px] text-slate-500">
              Authorized clinical use only. All activity is logged per HIPAA Security Rule § 164.312(b).
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default Login;
