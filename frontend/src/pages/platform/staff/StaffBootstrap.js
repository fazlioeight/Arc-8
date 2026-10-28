import React, { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../../context/AuthContext';
import { ROUTES } from '../../../constants/routes';
import { bootstrapStaff, staffLogin } from '../../../services/staffService';

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500';

const labelCls = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300';

const StaffBootstrap = () => {
  const { loginAsStaff } = useContext(AuthContext);
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', name: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.id]: e.target.value }));

  const onSubmit = async (event) => {
    event.preventDefault();
    if (form.password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await bootstrapStaff({ email: form.email, name: form.name, password: form.password });
      const loginResp = await staffLogin({ email: form.email, password: form.password });
      loginAsStaff(loginResp);
      navigate(ROUTES.STAFF.CONSOLE, { replace: true });
    } catch (err) {
      if (err.status === 409) {
        setError('Staff already provisioned. Use the sign-in page.');
      } else {
        setError(err.message || 'Bootstrap failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6">
          <div className="mb-3 inline-flex items-center justify-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
            One-time setup
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Create the first Arc-8 staff account
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            This page works only while no staff exist. Subsequent accounts must be created from{' '}
            <span className="font-mono text-xs">/staff/users</span>.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className={labelCls}>Work email</label>
            <input id="email" type="email" required value={form.email} onChange={onChange} className={inputCls} />
          </div>
          <div>
            <label htmlFor="name" className={labelCls}>Display name</label>
            <input id="name" type="text" value={form.name} onChange={onChange} className={inputCls} />
          </div>
          <div>
            <label htmlFor="password" className={labelCls}>Password (min 12 chars)</label>
            <input id="password" type="password" required value={form.password} onChange={onChange} className={inputCls} />
          </div>
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
            {submitting ? 'Creating…' : 'Create staff account'}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-500">
          Already set up?{' '}
          <Link to={ROUTES.STAFF.LOGIN} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default StaffBootstrap;
