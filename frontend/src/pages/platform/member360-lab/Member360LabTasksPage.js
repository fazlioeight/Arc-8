import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import { fetchMember360Tasks, updateMember360Task } from '../../../services/member360LabService';
import { LabSubNav, Pagination, PriorityBadge, RiskBadge, TaskStatusBadge } from './components';

const PAGE_SIZE = 100;
import FilterDropdown from '../../../components/ui/FilterDropdown';
import KpiTile from '../../../components/ui/KpiTile';
import SavedViewsBar from '../../../components/ui/SavedViewsBar';
import SearchInput from '../../../components/ui/SearchInput';

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

const STATUSES = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'completed', label: 'Completed' },
  { key: 'escalated', label: 'Escalated' },
];

const PRIORITIES = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
];

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

const SAVED_VIEWS = [
  { key: 'all', label: 'All tasks' },
  { key: 'open', label: 'Open & in progress', statuses: ['open', 'in_progress'] },
  { key: 'urgent', label: 'Urgent', priorities: ['urgent'] },
  { key: 'overdue', label: 'Overdue', due: 'overdue' },
  { key: 'completed', label: 'Completed', statuses: ['completed'] },
];

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

const TASKS_FILTER_STORAGE_KEY = 'arc8.tasks.filters.v1';

const readSavedTaskFilters = (searchParams) => {
  let stored = null;
  try {
    const raw = window.sessionStorage.getItem(TASKS_FILTER_STORAGE_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch (_err) {
    stored = null;
  }

  const hasUrlParams =
    searchParams.has('status') ||
    searchParams.has('priority') ||
    searchParams.has('due') ||
    searchParams.has('sort') ||
    searchParams.has('q') ||
    searchParams.has('view');

  if (hasUrlParams) {
    const rawStatus = searchParams.get('status');
    const statuses =
      rawStatus === null
        ? stored?.statuses ?? ['open', 'in_progress']
        : rawStatus === 'none' || rawStatus === ''
        ? []
        : rawStatus.split(',').filter(Boolean);
    const rawPriority = searchParams.get('priority');
    const priorities =
      rawPriority === null
        ? stored?.priorities ?? []
        : rawPriority === 'none' || rawPriority === ''
        ? []
        : rawPriority.split(',').filter(Boolean);
    return {
      search: searchParams.get('q') ?? stored?.search ?? '',
      activeView: searchParams.get('view') ?? stored?.activeView ?? (statuses.length === 2 && statuses.includes('open') && statuses.includes('in_progress') ? 'open' : 'all'),
      statuses,
      priorities,
      due: searchParams.get('due') || stored?.due || 'any',
      sortKey: searchParams.get('sort') || stored?.sortKey || 'priority',
    };
  }

  if (stored && typeof stored === 'object') {
    return {
      search: typeof stored.search === 'string' ? stored.search : '',
      activeView: typeof stored.activeView === 'string' ? stored.activeView : 'open',
      statuses: Array.isArray(stored.statuses) ? stored.statuses : ['open', 'in_progress'],
      priorities: Array.isArray(stored.priorities) ? stored.priorities : [],
      due: typeof stored.due === 'string' ? stored.due : 'any',
      sortKey: typeof stored.sortKey === 'string' ? stored.sortKey : 'priority',
    };
  }

  return {
    search: '',
    activeView: 'open',
    statuses: ['open', 'in_progress'],
    priorities: [],
    due: 'any',
    sortKey: 'priority',
  };
};

const Member360LabTasksPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { token, tenant } = useContext(AuthContext) || {};
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [initialFilters] = useState(() => readSavedTaskFilters(searchParams));
  const [search, setSearch] = useState(initialFilters.search);
  const [activeView, setActiveView] = useState(initialFilters.activeView);
  const [statuses, setStatuses] = useState(initialFilters.statuses);
  const [priorities, setPriorities] = useState(initialFilters.priorities);
  const [due, setDue] = useState(initialFilters.due);
  const [sortKey, setSortKey] = useState(initialFilters.sortKey);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        TASKS_FILTER_STORAGE_KEY,
        JSON.stringify({ search, activeView, statuses, priorities, due, sortKey })
      );
    } catch (_err) {
      // Ignore storage quota errors
    }
    const next = new URLSearchParams();
    next.set('status', statuses.length > 0 ? statuses.join(',') : 'none');
    if (priorities.length > 0) next.set('priority', priorities.join(','));
    if (due && due !== 'any') next.set('due', due);
    if (sortKey && sortKey !== 'priority') next.set('sort', sortKey);
    if (search.trim()) next.set('q', search.trim());
    if (activeView) next.set('view', activeView);
    setSearchParams(next, { replace: true });
  }, [search, activeView, statuses, priorities, due, sortKey, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMember360Tasks(token, tenant, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setRows(res.items || []);
        setTotal(res.total || 0);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, tenant, refreshKey, page]);

  const applySavedView = (key) => {
    const view = SAVED_VIEWS.find((v) => v.key === key);
    setActiveView(key);
    setStatuses(view?.statuses || []);
    setPriorities(view?.priorities || []);
    setDue(view?.due || 'any');
  };

  const toggleStatus = (key) => {
    setStatuses((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      if (next.length === 0 && priorities.length === 0 && due === 'any') setActiveView('all');
      else if (next.length === 2 && next.includes('open') && next.includes('in_progress') && priorities.length === 0 && due === 'any') setActiveView('open');
      else if (next.length === 1 && next[0] === 'completed' && priorities.length === 0 && due === 'any') setActiveView('completed');
      else setActiveView('custom');
      return next;
    });
  };
  const togglePriority = (key) => {
    setPriorities((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      setActiveView('custom');
      return next;
    });
  };

  const filtered = useMemo(() => {
    const today = startOfDay(new Date());
    const weekOut = new Date(today.getTime() + 7 * 86400000);
    return rows
      .filter((t) => {
        if (statuses.length > 0 && !statuses.includes(t.status)) return false;
        if (priorities.length > 0 && !priorities.includes(t.priority)) return false;
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
  }, [rows, statuses, priorities, due, search, sortKey]);

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

  const activeFilterCount =
    (statuses.length > 0 ? 1 : 0) +
    (priorities.length > 0 ? 1 : 0) +
    (due !== 'any' ? 1 : 0);

  const dueLabel = useMemo(() => {
    if (due === 'any') return null;
    return DUE_OPTIONS.find((o) => o.key === due)?.label || null;
  }, [due]);

  return (
    <PortalPageLayout
      eyebrow="Arc-8 Member360"
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

      {/* KPI strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="All tasks" value={summary.total} />
        <KpiTile label="Active" value={summary.open} tone="info" />
        <KpiTile label="Urgent" value={summary.urgent} tone="critical" />
        <KpiTile label="Overdue" value={summary.overdue} tone="warning" />
      </section>

      <SavedViewsBar views={SAVED_VIEWS} activeKey={activeView} onChange={applySavedView} />

      <section className="coding-surface rounded-2xl shadow-sm">
        <div className="p-3 flex flex-col lg:flex-row gap-2 lg:items-center">
          <SearchInput
            placeholder="Search title, member, queue, or assignee"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="coding-input rounded-md px-3 py-2 text-sm lg:w-56">
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>Sort: {o.label}</option>)}
          </select>
        </div>
        <div className="border-t coding-border px-3 py-2 flex flex-wrap items-center gap-1.5 text-xs">
          <FilterDropdown label="Status" count={statuses.length}>
            <div className="flex flex-col gap-1 min-w-[180px]">
              {STATUSES.map((s) => (
                <label key={s.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--coding-hover)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statuses.includes(s.key)}
                    onChange={() => toggleStatus(s.key)}
                    className="accent-[var(--brand-primary)]"
                  />
                  <span className="coding-text-strong">{s.label}</span>
                </label>
              ))}
            </div>
          </FilterDropdown>
          <FilterDropdown label="Priority" count={priorities.length}>
            <div className="flex flex-col gap-1 min-w-[160px]">
              {PRIORITIES.map((p) => (
                <label key={p.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--coding-hover)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={priorities.includes(p.key)}
                    onChange={() => togglePriority(p.key)}
                    className="accent-[var(--brand-primary)]"
                  />
                  <span className="coding-text-strong">{p.label}</span>
                </label>
              ))}
            </div>
          </FilterDropdown>
          <FilterDropdown label="Due" count={due !== 'any' ? 1 : 0} display={dueLabel}>
            {({ close }) => (
              <div className="flex flex-col gap-1 min-w-[180px]">
                {DUE_OPTIONS.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => { setDue(o.key); close(); }}
                    className={`text-left px-2 py-1 rounded hover:bg-[var(--coding-hover)] ${due === o.key ? 'coding-text-strong font-semibold' : 'coding-text-soft'}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </FilterDropdown>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => applySavedView('all')}
              className="ml-1 text-xs font-medium text-[var(--brand-primary)] hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      {loading && <LoadingState title="Loading tasks" />}
      {error && <ErrorState title="Tasks unavailable" description={error} />}

      {!loading && !error && (
        <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between text-xs coding-text-muted border-b coding-border">
            <span>
              {filtered.length} task{filtered.length === 1 ? '' : 's'} shown
              {rows.length !== filtered.length ? ` (filtered from ${rows.length} on this page)` : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider coding-text-muted">
                <tr className="border-b coding-border">
                  <th className="text-left px-4 py-2.5 font-semibold">Task</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Member</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Priority</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Status</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Due</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Queue</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b coding-border-subtle hover:bg-[var(--coding-hover)] transition">
                    <td className="px-4 py-3 align-top">
                      <button
                        type="button"
                        onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${t.member_id}`)}
                        className="text-left coding-text-strong font-medium hover:text-[var(--brand-primary)] hover:underline"
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
                    <td className="px-3 py-3 align-top">
                      <p className="coding-text-strong">{t.member_name || '—'}</p>
                      <p className="text-[11px] coding-text-muted">{t.member_key || ''}</p>
                      {t.risk_tier && <div className="mt-1"><RiskBadge tier={t.risk_tier} /></div>}
                    </td>
                    <td className="px-3 py-3 align-top"><PriorityBadge priority={t.priority} /></td>
                    <td className="px-3 py-3 align-top"><TaskStatusBadge status={t.status} /></td>
                    <td className="px-3 py-3 align-top text-xs coding-text-soft">{t.due_date || '—'}</td>
                    <td className="px-3 py-3 align-top text-xs">
                      <p className="coding-text-strong">{t.assigned_queue || '—'}</p>
                      <p className="coding-text-soft">{t.assigned_user || ''}</p>
                    </td>
                    <td className="px-3 py-3 align-top text-right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {t.status === 'open' && (
                          <button type="button" onClick={() => advance(t, 'in_progress')} className="rounded-md ring-1 coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)] px-2 py-1 text-xs font-semibold">Start</button>
                        )}
                        {t.status !== 'completed' && (
                          <button type="button" onClick={() => advance(t, 'completed')} className="rounded-md bg-emerald-600 text-white px-2 py-1 text-xs font-semibold hover:bg-emerald-700">Complete</button>
                        )}
                        <button type="button" onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${t.member_id}`)} className="rounded-md bg-[var(--brand-primary)] text-white px-2 py-1 text-xs font-semibold hover:bg-brand-700">Open</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-12 text-center text-sm coding-text-soft">No tasks match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} label="tasks" />
        </section>
      )}
    </PortalPageLayout>
  );
};

export default Member360LabTasksPage;
