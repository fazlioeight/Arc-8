import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { ROUTES } from "../../constants/routes";
import { DEMO_PERSONAS } from "../../constants/permissions";
import { API_BASE } from "../../utils/apiBase";
import ThemeToggleButton from "../../components/ThemeToggleButton";

const DEFAULT_TENANT = process.env.REACT_APP_DEFAULT_TENANT || "prominencehealth";

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

const getPostLoginRedirect = (data) => {
  const role = data?.role;
  const email = (data?.email || '').toLowerCase();
  if (role === 'payer_executive' || email.includes('jessica')) {
    return ROUTES.MEMBER360_LAB.PLAN_PERFORMANCE;
  }
  return ROUTES.PORTAL.LANDING;
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
  const [activePersonaEmail, setActivePersonaEmail] = useState("");
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [oidcConfig, setOidcConfig] = useState(null);
  const [selectedIdpGroup, setSelectedIdpGroup] = useState("Prominence_Care_Coordinators");

  const handleChange = (e) =>
    setFormData((prev) => ({ ...prev, [e.target.id]: e.target.value }));

  useEffect(() => {
    let mounted = true;
    fetch(`${API_BASE}/api/auth/oidc/config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => {
        if (mounted && cfg) setOidcConfig(cfg);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoadingConfig(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const completeOidcLogin = useCallback(async (code, state) => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/oidc/exchange`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Key": formData.tenant.trim() || DEFAULT_TENANT,
        },
        body: JSON.stringify({
          code,
          state,
          redirect_uri: `${window.location.origin}/login`,
          tenant: formData.tenant.trim() || DEFAULT_TENANT,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "OIDC sign-in failed.");

      window.history.replaceState({}, document.title, "/login");
      login(data);
      navigate(getPostLoginRedirect(data));
    } catch (err) {
      setError(err.message || "OIDC authentication failed.");
    } finally {
      setSubmitting(false);
    }
  }, [formData.tenant, login, navigate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const authError = params.get("error_description") || params.get("error");

    if (authError) {
      setError(authError);
      window.history.replaceState({}, document.title, "/login");
      return;
    }
    if (code) {
      completeOidcLogin(code, state);
    }
  }, [completeOidcLogin]);

  const handleOidcLogin = async (groupToTest) => {
    setError("");
    setSubmitting(true);
    const targetGroup = groupToTest || selectedIdpGroup;

    try {
      // Map group to simulated test code for development/local environment
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
          "X-Tenant-Key": formData.tenant.trim() || DEFAULT_TENANT,
        },
        body: JSON.stringify({
          code,
          redirect_uri: window.location.origin + "/login",
          tenant: formData.tenant.trim() || DEFAULT_TENANT,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "OIDC sign-in failed.");
      }

      login(data);
      navigate(getPostLoginRedirect(data));
    } catch (err) {
      setError(err.message || "OIDC authentication failed.");
    } finally {
      setSubmitting(false);
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
      navigate(getPostLoginRedirect(data));
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
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      {/* Top enterprise navigation header */}
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-950/80 px-6 backdrop-blur-md">
        <NavLink to="/" className="group flex items-center gap-3">
          <img
            src="/images/arc8-logo.png"
            alt="Arc-8 logo"
            className="h-9 w-auto rounded-lg object-contain shadow-sm dark:shadow-md dark:shadow-sky-500/20 transition-transform duration-200 group-hover:scale-105"
          />
          <div className="flex items-center">
            <span
              className="flex items-baseline text-[21px] font-extrabold leading-none"
              style={{ fontFamily: "'Outfit', 'Space Grotesk', 'Plus Jakarta Sans', sans-serif", letterSpacing: "-0.03em" }}
            >
              <span className="text-slate-900 dark:bg-gradient-to-r dark:from-white dark:via-slate-100 dark:to-sky-100 dark:bg-clip-text dark:text-transparent">Arc</span>
              <span className="mx-0.5 font-bold text-sky-600 dark:text-sky-400">-</span>
              <span className="bg-gradient-to-br from-sky-600 via-blue-600 to-indigo-600 dark:from-sky-400 dark:via-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">8</span>
            </span>
            <span className="ml-2.5 rounded-md bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-950 px-2 py-0.5 text-[10px] font-semibold dark:text-sky-400 border dark:border-sky-800/60">
              Enterprise Health
            </span>
          </div>
        </NavLink>

        <div className="flex items-center gap-3 text-xs">
          <span className="hidden items-center gap-1.5 text-slate-500 dark:text-slate-400 md:inline-flex">
            <svg className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            HIPAA & SOC-2 Type II Certified
          </span>
          <ThemeToggleButton />
          <NavLink
            to="/"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-xs transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
          >
            ← Back to Overview
          </NavLink>
        </div>
      </header>

      {/* Main split-screen container */}
      <main className="flex flex-1 items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-5xl rounded-3xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950/90 dark:shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          
          {/* Left clinical banner panel */}
          <div className="lg:col-span-5 bg-gradient-to-br from-sky-50 via-slate-50 to-indigo-50/60 dark:from-sky-950/80 dark:via-slate-900 dark:to-slate-950 p-8 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/70 bg-sky-100/70 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 px-3 py-1 text-xs font-semibold dark:text-sky-400">
                <span className="h-2 w-2 rounded-full bg-sky-500 dark:bg-sky-400 animate-pulse" />
                Live Clinical Gateway
              </div>

              <h2 className="mt-5 text-2xl font-black text-slate-900 dark:text-white leading-snug">
                Intelligent Care Delivery & Risk Adjustment
              </h2>
              <p className="mt-2.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Log in to coordinate member health journeys, validate suspect HCC codes, and optimize value-based capitation contracts.
              </p>

              <div className="mt-8 space-y-3.5">
                <div className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white/80 dark:border-slate-800/80 dark:bg-slate-900/60 p-3 shadow-xs dark:shadow-none">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">Full HIPAA & PHI Isolation</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Tenant-isolated schemas with field encryption and automated access telemetry.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white/80 dark:border-slate-800/80 dark:bg-slate-900/60 p-3 shadow-xs dark:shadow-none">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">Role-Based Clinical Governance</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Granular permissions protecting diagnoses, care orders, and financial analytics.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-200/80 dark:border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Tenant: <strong className="text-slate-700 dark:text-slate-300">Prominence Health Plan</strong></span>
              <span className="text-sky-600 dark:text-sky-400 font-semibold">v28 Clinical Engine</span>
            </div>
          </div>

          {/* Right login & persona selection form */}
          <div className="lg:col-span-7 p-8 sm:p-10 bg-white dark:bg-slate-900/70 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Enterprise Sign In</h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Enter your organizational credentials or choose a clinical role below.</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 border border-sky-200 dark:bg-slate-800 dark:text-sky-400 dark:border-slate-700">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 px-4 py-3 text-xs dark:text-rose-300 flex items-start gap-2.5"
                >
                  <svg className="h-4 w-4 shrink-0 text-rose-500 dark:text-rose-400 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <span className="font-bold">Authentication & Authorization Alert:</span>
                    <p className="mt-0.5">{error}</p>
                  </div>
                </div>
              )}

              {/* Secure Local Sign-In Form */}
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
