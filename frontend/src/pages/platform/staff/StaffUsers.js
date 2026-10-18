import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../../context/AuthContext';
import { ROUTES } from '../../../constants/routes';
import {
  createStaffUser,
  deleteStaffUser,
  fetchStaffUsers,
  updateStaffUser,
} from '../../../services/staffService';

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
const labelCls = 'mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400';

const emptyForm = { email: '', name: '', password: '', is_active: true, is_superuser: true };

const StaffUsers = () => {
  const { staffSession, isStaffAuthenticated } = useContext(AuthContext);
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isStaffAuthenticated) {
      navigate(ROUTES.STAFF.LOGIN, { replace: true });
    }
  }, [isStaffAuthenticated, navigate]);

  const reload = useCallback(() => {
    if (!staffSession?.token) return;
    setLoading(true);
    fetchStaffUsers({ token: staffSession.token })
      .then((data) => {
        setUsers(data.users || []);
        setError('');
      })
      .catch((err) => setError(err.message || 'Failed to load staff.'))
      .finally(() => setLoading(false));
  }, [staffSession?.token]);

  useEffect(() => {
    reload();
  }, [reload]);

  const onCreate = async (event) => {
    event.preventDefault();
    if (form.password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      await createStaffUser({ token: staffSession.token, payload: form });
      setForm(emptyForm);
      reload();
    } catch (err) {
      setError(err.message || 'Create failed.');
    } finally {
      setCreating(false);
    }
  };

  const onToggleActive = async (user) => {
    try {
      await updateStaffUser({
        token: staffSession.token,
        staffId: user.id,
        payload: { is_active: !user.is_active },
      });
      reload();
    } catch (err) {
      setError(err.message || 'Update failed.');
    }
  };

  const onResetPassword = async (user) => {
    const next = window.prompt(`New password for ${user.email} (min 12 chars):`);
    if (!next) return;
    if (next.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }
    try {
      await updateStaffUser({
        token: staffSession.token,
        staffId: user.id,
        payload: { password: next },
      });
      window.alert(`Password updated for ${user.email}. They will be required to change it on next login.`);
    } catch (err) {
      setError(err.message || 'Update failed.');
    }
  };

  const onDelete = async (user) => {
    if (!window.confirm(`Delete staff user ${user.email}? This cannot be undone.`)) return;
    try {
      await deleteStaffUser({ token: staffSession.token, staffId: user.id });
      reload();
    } catch (err) {
      setError(err.message || 'Delete failed.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Nexora staff console
            </div>
            <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              Manage staff
            </h1>
          </div>
          <Link
            to={ROUTES.STAFF.CONSOLE}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            ← Tenants
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Add staff member
          </h2>
          <form onSubmit={onCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelCls} htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                className={inputCls}
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="name">Display name</label>
              <input
                id="name"
                type="text"
                className={inputCls}
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="password">Temporary password</label>
              <input
                id="password"
                type="text"
                required
                className={inputCls}
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="≥12 chars"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </section>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-900/60">
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">MFA</th>
                <th className="px-4 py-3">Last login</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && (
                <tr><td colSpan="6" className="px-4 py-6 text-center text-sm text-slate-500">Loading…</td></tr>
              )}
              {!loading && users.length === 0 && (
                <tr><td colSpan="6" className="px-4 py-6 text-center text-sm text-slate-500">No staff yet.</td></tr>
              )}
              {!loading && users.map((user) => (
                <tr key={user.id} className="text-sm text-slate-900 dark:text-slate-100">
                  <td className="px-4 py-3 font-medium">{user.email}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{user.name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      user.is_active
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                        : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                    }`}>
                      {user.is_active ? 'active' : 'disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                    {user.mfa_enrolled ? 'enrolled' : 'not enrolled'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                    {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    <button
                      type="button"
                      onClick={() => onResetPassword(user)}
                      className="mr-2 rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      Reset password
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleActive(user)}
                      className="mr-2 rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      {user.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(user)}
                      className="rounded-md border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

export default StaffUsers;
