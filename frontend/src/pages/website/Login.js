import React, { useState, useContext } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { SAMPLE_SESSION } from "../../utils/sampleData";
import { ROUTES } from "../../constants/routes";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000";

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

const Login = () => {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    tenant: "prominencehealth",
  });
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) =>
    setFormData((prev) => ({ ...prev, [e.target.id]: e.target.value }));

  const handleSsoLogin = () => {
    setError("");
    setSubmitting(true);
    setTimeout(() => {
      login({ ...SAMPLE_SESSION, tenant: formData.tenant || SAMPLE_SESSION.tenant });
      navigate(ROUTES.PORTAL.LANDING);
      setSubmitting(false);
    }, 350);
  };

  const handleSampleLogin = () => {
    setError("");
    login({ ...SAMPLE_SESSION, tenant: formData.tenant || SAMPLE_SESSION.tenant });
    navigate(ROUTES.PORTAL.LANDING);
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

      {/* ── Top bar ─────────────────────────────────────────── */}
      <header className="flex h-14 items-center border-b border-slate-200/80 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
        <NavLink to="/" className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-[12px] font-black text-white">N</span>
          Nexora Analytics
        </NavLink>
      </header>

      {/* ── Card ────────────────────────────────────────────── */}
      <main className="flex flex-1 items-start justify-center px-4 pt-14 pb-12">
        <div className="fade-in w-full max-w-[420px]" style={{ animationDelay: "40ms" }}>

          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-black text-white shadow-md">
              N
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Welcome back
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Sign in to your Nexora workspace
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-card dark:border-slate-800 dark:bg-slate-900">

            {/* SSO */}
            <button
              type="button"
              onClick={handleSsoLogin}
              disabled={submitting}
              className="mb-5 flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brand-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-brand-500"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              Continue with SSO
            </button>

            {/* Divider */}
            <div className="relative mb-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-700" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-slate-400 dark:bg-slate-900 dark:text-slate-500">
                  or sign in with email
                </span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field
                id="tenant"
                label="Tenant"
                value={formData.tenant}
                onChange={handleChange}
                placeholder="e.g. prominencehealth"
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
                className="mt-1 flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>

            {/* Sample data shortcut */}
            <button
              type="button"
              onClick={handleSampleLogin}
              className="mt-3 w-full rounded-lg px-4 py-2.5 text-sm font-medium text-brand-600 transition hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/30"
            >
              Explore with sample sandbox data
            </button>

            {/* Footer links */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <a href="#" className="hover:text-brand-600 hover:underline dark:hover:text-brand-400">
                Forgot password?
              </a>
              <span>
                No account?{" "}
                <NavLink to="/pricing" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
                  See pricing
                </NavLink>
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="pb-6 text-center text-xs text-slate-400 dark:text-slate-600">
        &copy; {new Date().getFullYear()} Nexora Analytics. All rights reserved.
      </footer>
    </div>
  );
};

export default Login;
