import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { ROUTES } from "../../constants/routes";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-brand-400";

const labelCls = "mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300";

const ChangePassword = () => {
  const { token, tenant, mustChangePassword, clearMustChangePassword, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Page is reachable both when forced (must_change_password=true) and as a
  // self-serve action from settings later; treat unauthenticated users as
  // needing to log in first.
  if (!token) {
    navigate("/login", { replace: true });
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 12) {
      setError("New password must be at least 12 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (newPassword === oldPassword) {
      setError("New password must differ from the current password.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(tenant ? { "X-Tenant-Key": tenant } : {}),
        },
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
        }),
      });

      if (res.status === 204) {
        clearMustChangePassword();
        navigate(ROUTES.PORTAL.LANDING, { replace: true });
        return;
      }

      let detail = "Password change failed.";
      try {
        const body = await res.json();
        if (body?.detail) detail = body.detail;
      } catch (_) {
        // body wasn't JSON; keep default
      }
      setError(detail);
    } catch (err) {
      setError(err?.message || "Password change failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <main className="flex flex-1 items-start justify-center px-4 pt-14 pb-12">
        <div className="w-full max-w-[460px]">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {mustChangePassword ? "Set a new password" : "Change password"}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {mustChangePassword
                ? "This account is using a temporary password. Choose a new one before continuing."
                : "Update your account password."}
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-7 shadow-card dark:border-slate-800 dark:bg-slate-900"
          >
            <div>
              <label htmlFor="old-password" className={labelCls}>Current password</label>
              <input
                id="old-password"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="new-password" className={labelCls}>New password (min 12 chars)</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={12}
                autoComplete="new-password"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className={labelCls}>Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={12}
                autoComplete="new-password"
                className={inputCls}
              />
            </div>

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
              {submitting ? "Updating..." : "Update password"}
            </button>

            {mustChangePassword && (
              <button
                type="button"
                onClick={logout}
                className="block w-full text-center text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Sign out
              </button>
            )}
          </form>
        </div>
      </main>
    </div>
  );
};

export default ChangePassword;
