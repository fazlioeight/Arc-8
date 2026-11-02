import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import { fetchCodingWorklist } from '../../../services/codingService';
import AlertShell from '../../../components/ui/AlertShell';
import FilterDropdown from '../../../components/ui/FilterDropdown';
import KpiTile from '../../../components/ui/KpiTile';
import SavedViewsBar from '../../../components/ui/SavedViewsBar';
import SearchInput from '../../../components/ui/SearchInput';
import { usePermissions } from '../../../hooks/usePermissions';
import { CHASE_STATUS, CHASE_STATUS_OPTIONS } from '../../../constants/codingStatus';

const STATUSES = CHASE_STATUS_OPTIONS;

const PRIORITIES = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
];

const SAVED_VIEWS = [
  { key: 'all', label: 'All chases' },
  { key: 'mine', label: 'My chases', assignedMode: 'me' },
  { key: 'unassigned', label: 'Unassigned', assigned: '__unassigned__' },
  { key: 'overdue', label: 'Overdue', overdueOnly: true },
  { key: 'completed', label: 'Completed', statuses: [CHASE_STATUS.COMPLETED] },
];

const STATUS_TONE = {
  open: 'coding-text-soft',
  in_progress: 'text-sky-700 dark:text-sky-300',
  pending_review: 'text-violet-700 dark:text-violet-300',
  audit_feedback: 'text-amber-700 dark:text-amber-300',
  query_pending: 'text-amber-700 dark:text-amber-300',
  completed: 'text-emerald-700 dark:text-emerald-300',
};

const PRIORITY_TONE = {
  urgent: 'bg-rose-100 text-rose-800 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:ring-rose-700/40',
  high: 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700/40',
  medium: 'bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:ring-sky-700/40',
  low: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-200 dark:ring-slate-600/40',
};

const formatStatus = (s) => (s ? s.replace(/_/g, ' ') : '');
const isOverdue = (dueDate) => Boolean(dueDate && new Date(dueDate) < new Date());

export default function CodingWorklistPage() {
  const navigate = useNavigate();
  const { token, tenant, user } = useContext(AuthContext) || {};
  const userEmail = user?.email || null;

  const [activeView, setActiveView] = useState('all');
  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [assigned, setAssigned] = useState(null); // '__unassigned__' | email | null
  const [overdueOnly, setOverdueOnly] = useState(false);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const applySavedView = (key) => {
    const view = SAVED_VIEWS.find((v) => v.key === key);
    setActiveView(key);
    setStatuses(view?.statuses || []);
    setPriorities(view?.priorities || []);
    setAssigned(
      view?.assignedMode === 'me' ? userEmail : view?.assigned ?? null
    );
    setOverdueOnly(Boolean(view?.overdueOnly));
  };

  const { can, isAdmin, hasRole } = usePermissions();
  const isAuthorized = isAdmin || hasRole('coder') || can('menu:coding_worklist');

  useEffect(() => {
    if (!token || !tenant || !isAuthorized) {
      if (!isAuthorized) setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchCodingWorklist(token, tenant, {
      search: search.trim() || undefined,
      statuses,
      priorities,
      assigned: assigned || undefined,
      pageSize: 100,
    })
      .then((res) => {
        if (cancelled) return;
        let list = res.items || [];
        if (overdueOnly) list = list.filter((i) => isOverdue(i.due_date));
        setItems(list);
        setTotal(res.total ?? list.length);
        setSummary(res.summary || null);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, tenant, search, statuses, priorities, assigned, overdueOnly, isAuthorized]);

  const toggleStatus = (key) =>
    setStatuses((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const togglePriority = (key) =>
    setPriorities((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const activeFilterCount =
    (statuses.length > 0 ? 1 : 0) +
    (priorities.length > 0 ? 1 : 0) +
    (assigned ? 1 : 0) +
    (overdueOnly ? 1 : 0);

  const assigneeLabel = useMemo(() => {
    if (!assigned) return null;
    if (assigned === '__unassigned__') return 'Unassigned';
    if (assigned === userEmail) return 'Me';
    return assigned.split('@')[0];
  }, [assigned, userEmail]);

  if (!isAuthorized) {
    return (
      <PortalPageLayout
        eyebrow="Coding"
        title="Coding Worklist"
        subtitle="Chases ready for coder review across PHA, PCF, and PCPE programs."
        navItems={PORTAL_NAV_ITEMS}
        currentNav="coding"
        navProps={{ align: 'center', tone: 'surface' }}
        maxWidthClassName="max-w-7xl"
        mainClassName="space-y-4"
      >
        <AlertShell
          tone="critical"
          title="Coding Worklist Access Restricted"
          description="Access to the Risk Adjustment Coding Worklist is restricted to certified risk adjustment coders (CPC/CRC) and administrators. Please switch to Marcus Vance (Coder) or an Administrator persona."
        />
      </PortalPageLayout>
    );
  }

  return (
    <PortalPageLayout
      eyebrow="Coding"
      title="Coding Worklist"
      subtitle="Chases ready for coder review across PHA, PCF, and PCPE programs."
      navItems={PORTAL_NAV_ITEMS}
      currentNav="coding"
      navProps={{ align: 'center', tone: 'surface' }}
      maxWidthClassName="max-w-7xl"
      mainClassName="space-y-4"
    >
      {/* KPI strip — README HERO Internal Programs spec */}
      {summary && (
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiTile label="Open" value={summary.status_counts?.open || 0} />
          <KpiTile label="In progress" value={summary.status_counts?.in_progress || 0} />
          <KpiTile label="Pending review" value={summary.status_counts?.pending_review || 0} />
          <KpiTile label="Audit feedback" value={summary.status_counts?.audit_feedback || 0} tone="warning" />
          <KpiTile label="Query pending" value={summary.status_counts?.query_pending || 0} tone="warning" />
          <KpiTile label="Overdue" value={summary.overdue || 0} tone={summary.overdue > 0 ? 'critical' : 'neutral'} />
        </section>
      )}

      <SavedViewsBar views={SAVED_VIEWS} activeKey={activeView} onChange={applySavedView} />

      <section className="coding-surface rounded-2xl shadow-sm">
        <div className="p-3 flex flex-col lg:flex-row gap-2 lg:items-center">
          <SearchInput
            placeholder="Search member, HCC, or coder"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="border-t coding-border px-3 py-2 flex flex-wrap items-center gap-1.5 text-xs">
          <FilterDropdown
            label="Status"
            count={statuses.length}
          >
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

          <FilterDropdown
            label="Priority"
            count={priorities.length}
          >
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

          <FilterDropdown
            label="Assignee"
            count={assigned ? 1 : 0}
            display={assigneeLabel}
          >
            {({ close }) => (
              <div className="flex flex-col gap-1 min-w-[200px]">
                <button
                  type="button"
                  onClick={() => { setAssigned(null); close(); }}
                  className={`text-left px-2 py-1 rounded hover:bg-[var(--coding-hover)] ${!assigned ? 'coding-text-strong font-semibold' : 'coding-text-soft'}`}
                >
                  Any assignee
                </button>
                {userEmail && (
                  <button
                    type="button"
                    onClick={() => { setAssigned(userEmail); close(); }}
                    className={`text-left px-2 py-1 rounded hover:bg-[var(--coding-hover)] ${assigned === userEmail ? 'coding-text-strong font-semibold' : 'coding-text-soft'}`}
                  >
                    Me ({userEmail})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setAssigned('__unassigned__'); close(); }}
                  className={`text-left px-2 py-1 rounded hover:bg-[var(--coding-hover)] ${assigned === '__unassigned__' ? 'coding-text-strong font-semibold' : 'coding-text-soft'}`}
                >
                  Unassigned
                </button>
              </div>
            )}
          </FilterDropdown>

          <button
            type="button"
            onClick={() => setOverdueOnly((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md ring-1 px-2.5 py-1.5 text-xs font-medium transition ${
              overdueOnly
                ? 'ring-rose-300 text-rose-700 bg-rose-50 dark:ring-rose-700/40 dark:text-rose-200 dark:bg-rose-900/20'
                : 'coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)]'
            }`}
          >
            Overdue only
          </button>

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

      {loading && <LoadingState title="Loading worklist" />}
      {error && <ErrorState title="Worklist unavailable" description={error} />}

      {!loading && !error && (
        <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between text-xs coding-text-muted border-b coding-border">
            <span>{items.length} chase{items.length === 1 ? '' : 's'}{total !== items.length ? ` of ${total}` : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider coding-text-muted">
                <tr className="border-b coding-border">
                  <th className="text-left px-4 py-2.5 font-semibold">Chase</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Member</th>
                  <th className="text-left px-3 py-2.5 font-semibold">HCC</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Status</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Priority</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Assignee</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Service date</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Due</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => {
                  const overdue = isOverdue(c.due_date);
                  const openChase = () => navigate(`${ROUTES.CODING.CHASE_ROOT}/${c.chase_id}`, { state: { chase: c } });
                  const openMember = (e) => {
                    e.stopPropagation();
                    navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${c.member_id}`);
                  };
                  return (
                    <tr
                      key={c.chase_id}
                      className="cursor-pointer border-b coding-border-subtle hover:bg-[var(--coding-hover)] transition"
                      onClick={openChase}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-[var(--brand-primary)] font-semibold">#{c.chase_id}</td>
                      <td className="px-3 py-3">
                        <button type="button" onClick={openMember} className="text-left coding-text-strong font-medium hover:text-[var(--brand-primary)] hover:underline">
                          {c.member_name || '—'}
                        </button>
                        <p className="text-[11px] coding-text-muted">{c.member_key}</p>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs coding-text-strong">{c.hcc_code || '—'}</td>
                      <td className={`px-3 py-3 text-xs capitalize ${STATUS_TONE[c.status] || 'coding-text-soft'}`}>
                        {formatStatus(c.status)}
                      </td>
                      <td className="px-3 py-3">
                        {c.priority ? (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 capitalize ${PRIORITY_TONE[c.priority] || PRIORITY_TONE.medium}`}>
                            {c.priority}
                          </span>
                        ) : <span className="coding-text-soft text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3 text-xs coding-text-soft">
                        {c.assigned_coder_email || <span className="italic">Unassigned</span>}
                      </td>
                      <td className="px-3 py-3 text-xs coding-text-soft">
                        {c.service_date_from || '—'}
                      </td>
                      <td className={`px-3 py-3 text-xs ${overdue ? 'text-rose-600 dark:text-rose-300 font-medium' : 'coding-text-soft'}`}>
                        {c.due_date || '—'}
                      </td>
                      <td className="px-3 py-3 text-xs coding-text-soft">
                        {c.updated_at ? new Date(c.updated_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-12 text-center text-sm coding-text-soft">No chases match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </PortalPageLayout>
  );
}

