import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { ROUTES } from "../../constants/routes";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000";
const DEFAULT_TENANT = process.env.REACT_APP_DEFAULT_TENANT || "demo";
const AZURE_AUTH_STORAGE_KEY = "nexoraAzureLoginRequest";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-brand-400";

const labelCls = "mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300";

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
    email: "",
    password: "",
    tenant: DEFAULT_TENANT,
  });
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
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
          "X-Tenant-Key": pending.tenant,
        },
        body: JSON.stringify({
          code,
          code_verifier: pending.codeVerifier,
          redirect_uri: pending.redirectUri,
          nonce: pending.nonce,
          tenant: pending.tenant,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Azure login failed.");

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Key": formData.tenant.trim(),
        },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Login failed. Please try again.");
      login(data);
      navigate(ROUTES.PORTAL.LANDING);
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <header className="flex h-14 items-center border-b border-slate-200/80 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
        <NavLink to="/" className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-[12px] font-black text-white">N</span>
          Nexora Lab
        </NavLink>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pt-14 pb-12">
        <div className="fade-in w-full max-w-[420px]" style={{ animationDelay: "40ms" }}>
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-black text-white shadow-md">
              N
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Sign in
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Sign in with your Nexora Lab credentials.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-card dark:border-slate-800 dark:bg-slate-900">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field
                id="tenant"
                label="Workspace"
                value={formData.tenant}
                onChange={handleChange}
                placeholder="e.g. demo"
                required
              />
              <Field
                id="email"
                label="Email address"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@example.com"
                required
              />
              <Field
                id="password"
                label="Password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                required
              />

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-400"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <div className="mt-5 text-center text-sm">
              <button
                type="button"
                onClick={handleAzureLogin}
                disabled={submitting || loadingConfig || !azureReady}
                className="inline-flex items-center gap-1.5 text-slate-600 underline-offset-4 hover:text-brand-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:text-brand-400"
                title={!azureReady ? "Microsoft sign-in is not configured" : ""}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 23 23" aria-hidden="true">
                  <path fill="#f35325" d="M1 1h10v10H1z" />
                  <path fill="#81bc06" d="M12 1h10v10H12z" />
                  <path fill="#05a6f0" d="M1 12h10v10H1z" />
                  <path fill="#ffba08" d="M12 12h10v10H12z" />
                </svg>
                Sign in with Microsoft instead
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer className="pb-6 text-center text-xs text-slate-400 dark:text-slate-600">
        &copy; {new Date().getFullYear()} Nexora Lab. All rights reserved.
      </footer>
    </div>
  );
};

export default Login;
