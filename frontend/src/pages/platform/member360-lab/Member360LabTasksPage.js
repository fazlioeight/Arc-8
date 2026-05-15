import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import { fetchMember360AllTasks, updateMember360Task } from '../../../services/member360LabService';
import { LabSubNav, PriorityBadge, RiskBadge, SectionCard, TaskStatusBadge } from './components';

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

const STATUS_OPTIONS = ['any', 'open', 'in_progress', 'waiting', 'completed', 'escalated'];
const PRIORITY_OPTIONS = ['any', 'urgent', 'high', 'medium', 'low'];
const DUE_OPTIONS = [
  { key: 'any', label: 'Any due date' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Due today' },
  { key: 'week', label: 'Next 7 days' },
];
const SORT_OPTIONS = [
  { key: 'priority', label: 'Priority (urgent first)' },
  { key: 'due', label: 'Due date (soonest)' },
  { key: 'risk', label: 'Member risk tier' },
  { key: 'recent', label: 'Recently updated' },
];

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

const Member360LabTasksPage = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('open');
  const [priority, setPriority] = useState('any');
  const [due, setDue] = useState('any');
  const [sortKey, setSortKey] = useState('priority');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMember360AllTasks(token, tenant)
      .then((items) => { if (!cancelled) { setRows(items); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, tenant, refreshKey]);

  const filtered = useMemo(() => {
    const today = startOfDay(new Date());
    const weekOut = new Date(today.getTime() + 7 * 86400000);
    return rows
      .filter((t) => {
        if (status !== 'any' && t.status !== status) return false;
        if (priority !== 'any' && t.priority !== priority) return false;
        if (search) {
          const term = search.toLowerCase();
          const hay = [t.title, t.member_name, t.member_key, t.assigned_queue, t.assigned_user, t.recommended_next_action, t.sbar?.recommendation].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(term)) return false;
        }
        if (due !== 'any') {
          if (!t.due_date) return false;
          const d = startOfDay(t.due_date);
          if (due === 'overdue' && !(d < today && ['open', 'in_progress'].includes(t.status))) return false;
          if (due === 'today' && d.getTime() !== today.getTime()) return false;
          if (due === 'week' && (d < today || d > weekOut)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortKey === 'priority') return (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4);
        if (sortKey === 'due') return new Date(a.due_date || 0) - new Date(b.due_date || 0);
        if (sortKey === 'risk') {
          const order = { Critical: 0, High: 1, Moderate: 2, Low: 3 };
          return (order[a.risk_tier] ?? 4) - (order[b.risk_tier] ?? 4);
        }
        if (sortKey === 'recent') return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
        return 0;
      });
  }, [rows, status, priority, due, search, sortKey]);

  const summary = useMemo(() => {
    const today = startOfDay(new Date());
    return {
      total: rows.length,
      open: rows.filter((t) => ['open', 'in_progress', 'waiting'].includes(t.status)).length,
      urgent: rows.filter((t) => t.priority === 'urgent' && t.status !== 'completed').length,
      overdue: rows.filter((t) => t.due_date && startOfDay(t.due_date) < today && ['open', 'in_progress'].includes(t.status)).length,
    };
  }, [rows]);

  const advance = async (task, newStatus) => {
    try {
      await updateMember360Task(token, tenant, task.id, { status: newStatus });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || String(err));
    }
  };

  return (
    <PortalPageLayout
      eyebrow="Nexora Lab Member360"
      title="Tasks queue"
      subtitle="Every member task in one place — prioritized, filterable, actionable."
      navItems={PORTAL_NAV_ITEMS}
      currentNav="member360-lab"
      navProps={{ align: 'center', tone: 'surface' }}
      align="left"
      maxWidthClassName="max-w-7xl"
      mainClassName="space-y-4"
    >
      <LabSubNav />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryTile label="All tasks" value={summary.total} />
        <SummaryTile label="Active" value={summary.open} accent="sky" />
        <SummaryTile label="Urgent" value={summary.urgent} accent="rose" />
        <SummaryTile label="Overdue" value={summary.overdue} accent="amber" />
      </div>

      <section className="coding-surface rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <input
            type="search"
            placeholder="Search by title, member, queue, or assignee"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="coding-input w-full rounded-lg px-3 py-2 text-sm"
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="coding-input rounded-lg px-3 py-2 text-sm lg:w-48">
            {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o === 'any' ? 'Any status' : `Status: ${o.replace('_', ' ')}`}</option>)}
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="coding-input rounded-lg px-3 py-2 text-sm lg:w-44">
            {PRIORITY_OPTIONS.map((o) => <option key={o} value={o}>{o === 'any' ? 'Any priority' : `Priority: ${o}`}</option>)}
          </select>
          <select value={due} onChange={(e) => setDue(e.target.value)} className="coding-input rounded-lg px-3 py-2 text-sm lg:w-44">
            {DUE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="coding-input rounded-lg px-3 py-2 text-sm lg:w-56">
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>Sort: {o.label}</option>)}
          </select>
        </div>
      </section>

      {loading && <LoadingState title="Loading tasks" />}
      {error && <ErrorState title="Tasks unavailable" description={error} />}

      {!loading && !error && (
        <SectionCard title={`${filtered.length} task${filtered.length === 1 ? '' : 's'}`}>
          <div className="overflow-x-auto rounded-lg ring-1 ring-black/5 dark:ring-white/10">
            <table className="min-w-full text-sm">
              <thead className="coding-surface-subtle text-xs uppercase tracking-wide coding-text-muted">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Task</th>
                  <th className="text-left px-3 py-2 font-medium">Member</th>
                  <th className="text-left px-3 py-2 font-medium">Priority</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Due</th>
                  <th className="text-left px-3 py-2 font-medium">Queue</th>
                  <th className="text-right px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y coding-divider">
                {filtered.map((t) => (
                  <tr key={t.id} className="coding-hoverable">
                    <td className="px-3 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${t.member_id}`)}
                        className="text-left coding-text-strong font-semibold hover:underline"
                      >
                        {t.title}
                      </button>
                      {t.recommended_next_action && (
                        <p className="text-[11px] coding-text-soft line-clamp-2">{t.recommended_next_action}</p>
                      )}
                      {t.auto_generated_reason && (
                        <p className="text-[10px] italic coding-text-muted">{t.auto_generated_reason}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <p className="coding-text-strong">{t.member_name || '—'}</p>
                      <p className="text-[11px] coding-text-muted">{t.member_key || ''}</p>
                      {t.risk_tier && <div className="mt-1"><RiskBadge tier={t.risk_tier} /></div>}
                    </td>
                    <td className="px-3 py-2 align-top"><PriorityBadge priority={t.priority} /></td>
                    <td className="px-3 py-2 align-top"><TaskStatusBadge status={t.status} /></td>
                    <td className="px-3 py-2 align-top text-xs coding-text-soft">{t.due_date || '—'}</td>
                    <td className="px-3 py-2 align-top text-xs coding-text-soft">
                      <p className="coding-text-strong">{t.assigned_queue || '—'}</p>
                      <p>{t.assigned_user || ''}</p>
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {t.status === 'open' && (
                          <button type="button" onClick={() => advance(t, 'in_progress')} className="rounded-md coding-surface coding-text-strong ring-1 ring-black/5 dark:ring-white/10 px-2 py-1 text-xs hover:opacity-80">Start</button>
                        )}
                        {t.status !== 'completed' && (
                          <button type="button" onClick={() => advance(t, 'completed')} className="rounded-md bg-emerald-600 text-white px-2 py-1 text-xs hover:opacity-90">Complete</button>
                        )}
                        <button type="button" onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${t.member_id}`)} className="rounded-md bg-[var(--brand-primary)] text-white px-2 py-1 text-xs hover:opacity-90">Open</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-sm coding-text-soft">No tasks match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </PortalPageLayout>
  );
};

function SummaryTile({ label, value, accent }) {
  const accentClass = {
    sky: 'text-sky-600 dark:text-sky-300',
    rose: 'text-rose-600 dark:text-rose-300',
    amber: 'text-amber-600 dark:text-amber-300',
  }[accent];
  return (
    <div className="coding-surface rounded-2xl p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] coding-text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${accentClass || 'coding-text-strong'}`}>{value}</p>
    </div>
  );
}

export default Member360LabTasksPage;
