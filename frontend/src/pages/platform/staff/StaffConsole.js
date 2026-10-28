import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../../context/AuthContext';
import { ROUTES } from '../../../constants/routes';
import {
  fetchStaffTenants,
  impersonateTenant,
  staffLogout,
} from '../../../services/staffService';

const StatusBadge = ({ status }) => {
  const tone = status === 'active'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
    : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {status}
    </span>
  );
};

const StaffConsole = () => {
  const { staffSession, staffSignOut, enterTenantAsStaff, isStaffAuthenticated } = useContext(AuthContext);
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [entering, setEntering] = useState(null);

  useEffect(() => {
    if (!isStaffAuthenticated) {
      navigate(ROUTES.STAFF.LOGIN, { replace: true });
    }
  }, [isStaffAuthenticated, navigate]);

  useEffect(() => {
    if (!staffSession?.token) return undefined;
    let cancelled = false;
    setLoading(true);
    fetchStaffTenants({ token: staffSession.token })
      .then((data) => {
        if (cancelled) return;
        setTenants(data.tenants || []);
        setError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load tenants.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [staffSession?.token]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((t) =>
      [t.name, t.key, t.slug].some((value) => (value || '').toLowerCase().includes(q))
    );
  }, [tenants, filter]);

  const handleEnter = async (tenant) => {
    setEntering(tenant.key);
    setError('');
    try {
      const result = await impersonateTenant({ token: staffSession.token, tenantKey: tenant.key });
      enterTenantAsStaff(result);
      navigate(ROUTES.ADMIN.MASTER);
    } catch (err) {
      setError(err.message || `Failed to enter ${tenant.key}`);
    } finally {
      setEntering(null);
    }
  };

  const handleSignOut = async () => {
    if (staffSession?.token) {
      await staffLogout({ token: staffSession.token });
    }
    staffSignOut();
    navigate(ROUTES.STAFF.LOGIN, { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Arc-8 staff console
            </div>
            <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              Tenants
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-sm">
              <div className="font-medium text-slate-900 dark:text-slate-100">
                {staffSession?.name || staffSession?.email}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-500">
                {staffSession?.email}
              </div>
            </div>
            <Link
              to={ROUTES.STAFF.USERS}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Manage staff
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Select a tenant to enter as <span className="font-medium">platform_admin</span>.
            Every action you take inside the tenant is audited under your Arc-8 staff email.
          </p>
          <input
            type="search"
            placeholder="Filter by name or key…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-900/60">
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Users</th>
                <th className="px-4 py-3">Apps</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && (
                <tr><td colSpan="7" className="px-4 py-6 text-center text-sm text-slate-500">Loading tenants…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan="7" className="px-4 py-6 text-center text-sm text-slate-500">
                  {tenants.length === 0 ? 'No tenants exist yet.' : 'No tenants match that filter.'}
                </td></tr>
              )}
              {!loading && filtered.map((tenant) => (
                <tr key={tenant.id} className="text-sm text-slate-900 dark:text-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-medium">{tenant.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-500">{tenant.region || '—'}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{tenant.key}</td>
                  <td className="px-4 py-3"><StatusBadge status={tenant.status} /></td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{tenant.billing_plan}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{tenant.user_count}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                    {tenant.purchased_applications?.length || 0}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={entering === tenant.key}
                      onClick={() => handleEnter(tenant)}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                    >
                      {entering === tenant.key ? 'Entering…' : 'Enter tenant →'}
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

export default StaffConsole;
