import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../../context/AuthContext';
import { ROUTES } from '../../../constants/routes';
import { staffLogin } from '../../../services/staffService';

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500';

const labelCls = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300';

const StaffLogin = () => {
  const { loginAsStaff, isStaffAuthenticated } = useContext(AuthContext);
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', mfa_code: '' });
  const [needsMfa, setNeedsMfa] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isStaffAuthenticated) {
      navigate(ROUTES.STAFF.CONSOLE, { replace: true });
    }
  }, [isStaffAuthenticated, navigate]);

  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.id]: e.target.value }));

  const onSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const result = await staffLogin({
        email: form.email,
        password: form.password,
        mfa_code: form.mfa_code || null,
      });
      loginAsStaff(result);
      navigate(ROUTES.STAFF.CONSOLE, { replace: true });
    } catch (err) {
      if (err.status === 401 && err.message === 'mfa_required') {
        setNeedsMfa(true);
        setError('Enter the 6-digit code from your authenticator app.');
      } else if (err.status === 429) {
        setError('Too many failed attempts. Try again later.');
      } else {
        setError(err.message || 'Sign-in failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 inline-flex items-center justify-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
            Arc-8 Staff
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Sign in to the Arc-8 platform
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Internal-only console for administering tenants.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className={labelCls}>Work email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={form.email}
              onChange={onChange}
              className={inputCls}
              placeholder="you@arc8.io"
            />
          </div>
          <div>
            <label htmlFor="password" className={labelCls}>Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={onChange}
              className={inputCls}
            />
          </div>
          {needsMfa && (
            <div>
              <label htmlFor="mfa_code" className={labelCls}>Authenticator code</label>
              <input
                id="mfa_code"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                value={form.mfa_code}
                onChange={onChange}
                className={inputCls}
                placeholder="123456"
              />
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-500">
          Not an Arc-8 employee?{' '}
          <Link to="/login" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Use the tenant login
          </Link>
        </p>
      </div>
    </div>
  );
};

export default StaffLogin;
