import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import PortalPageLayout from '../../../components/PortalPageLayout';
import PortalPageHeader from '../../../components/PortalPageHeader';
import PortalCard from '../../../components/PortalCard';
import PortalStat from '../../../components/PortalStat';
import { AuthContext } from '../../../context/AuthContext';
import { useCommandPalette } from '../../../context/CommandPaletteContext';
import { CoderWorklistService } from '../../../services/codingService';
import { CODING_NAV_ITEMS } from './codingNavItems';
import '../coding/member/memberWorkspace.css';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'In Review' },
  { value: 'closed', label: 'Closed' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All priorities' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const STATUS_TONES = {
  open: 'bg-sky-100 text-sky-800 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-100 dark:ring-sky-400/40',
  in_review: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-100 dark:ring-amber-400/40',
  closed: 'bg-slate-200 text-slate-700 ring-1 ring-slate-300 dark:bg-slate-700/40 dark:text-slate-200 dark:ring-slate-600/50',
  default: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-100 dark:ring-emerald-400/40',
};

const PRIORITY_TONES = {
  high: 'bg-rose-100 text-rose-800 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-100 dark:ring-rose-400/40',
  medium: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-100 dark:ring-amber-400/40',
  low: 'bg-slate-200 text-slate-700 ring-1 ring-slate-300 dark:bg-slate-700/40 dark:text-slate-200 dark:ring-slate-600/50',
  default: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-100 dark:ring-slate-600/50',
};

const inputClasses =
  'mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-offset-slate-900';

const primaryButtonClasses =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-70 dark:bg-sky-500 dark:hover:bg-sky-400 dark:focus-visible:ring-offset-slate-900';

const subtleButtonClasses =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-700 dark:focus-visible:ring-offset-slate-900';

const linkButtonClasses =
  'inline-flex items-center justify-center rounded-lg border border-transparent px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:text-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:text-sky-200 dark:hover:text-sky-100 dark:focus-visible:ring-offset-slate-900';

const CODER_PLATFORM_COMMAND_SCOPE = 'coding-coder-platform-commands';

const SpinnerIcon = ({ className = 'h-4 w-4 text-sky-500' }) => (
  <svg
    className={`animate-spin ${className}`}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
    />
  </svg>
);

const CodingCoderPlatformPage = () => {
  const navigate = useNavigate();
  const { registerCommands } = useCommandPalette();
  const { token, tenant, user, recordAuditEvent } = useContext(AuthContext) || {};

  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    assigned: user?.email || '',
    search: '',
  });
  const [worklist, setWorklist] = useState([]);
  const [summary, setSummary] = useState({ statusCounts: {}, priorityCounts: {}, dueSoon: 0, overdue: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const effectiveToken = token || 'sample-coder-platform';
  const effectiveTenant = tenant || 'prominencehealth';
  const worklistService = useMemo(
    () => new CoderWorklistService({ token: effectiveToken, tenant: effectiveTenant }),
    [effectiveTenant, effectiveToken]
  );

  const statusCounts = useMemo(() => summary.statusCounts || {}, [summary]);
  const priorityCounts = useMemo(() => summary.priorityCounts || {}, [summary]);
  const openTotal = useMemo(
    () => (statusCounts.open || 0) + (statusCounts.in_review || 0),
    [statusCounts],
  );

  const metrics = useMemo(() => ([
    { label: 'Open queue', value: openTotal, hint: 'Open or in review records' },
    { label: 'Due in 7 days', value: summary.dueSoon ?? 0, hint: 'Due within the next week' },
    { label: 'Overdue', value: summary.overdue ?? 0, hint: 'Past due date' },
    { label: 'Total matches', value: total, hint: 'Records matching filters' },
  ]), [openTotal, summary, total]);

  const viewWorklist = useMemo(
    () =>
      (worklist || []).map((item, index) => {
        const record = item || {};
        const chaseId = record.chaseId ?? record.chase_id ?? record.id ?? null;
        const memberId = record.memberId ?? record.member_id ?? null;
        const memberKey = record.memberKey ?? record.member_key ?? null;
        const memberName = record.memberName ?? record.member_name ?? record.member ?? null;
        const icd10Code = record.icd10Code ?? record.icd10_code ?? null;
        const hccCode = record.hccCode ?? record.hcc_code ?? null;
        const assignedCoderEmail = record.assignedCoderEmail ?? record.assigned_coder_email ?? null;
        const dueDate = record.dueDate ?? record.due_date ?? null;
        const serviceDateFrom = record.serviceDateFrom ?? record.service_date_from ?? null;
        const serviceDateTo = record.serviceDateTo ?? record.service_date_to ?? null;
        const status = record.status || 'open';
        const priority = record.priority || null;

        return {
          id: chaseId || memberId || memberKey || `worklist-${index}`,
          memberId,
          memberName: memberName || 'Unknown member',
          memberKey: memberKey || 'N/A',
          status,
          priority,
          assignedCoderEmail,
          dueDate,
          serviceDateFrom,
          serviceDateTo,
          icd10Code,
          hccCode,
          hasMemberDetail: Boolean(memberId),
        };
      }),
    [worklist],
  );

  const loadWorklist = async (overrides = {}) => {
    setLoading(true);
    setError(null);
    const nextFilters = { ...filters, ...overrides };
    try {
      const response = await worklistService.fetchWorklist({
        status: nextFilters.status ? [nextFilters.status] : [],
        priority: nextFilters.priority ? [nextFilters.priority] : [],
        assigned: nextFilters.assigned?.trim() || undefined,
        search: nextFilters.search?.trim() || undefined,
        page: 1,
        pageSize: 50,
      });
      setWorklist(response.items || []);
      setSummary(response.summary || { statusCounts: {}, priorityCounts: {}, dueSoon: 0, overdue: 0 });
      setTotal(response.total || 0);
      recordAuditEvent?.('coding.platform.load', { filters: nextFilters });
    } catch (err) {
      setError(err.message || 'Unable to load coder platform queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorklist();
    // eslint-disable-next-line
  }, [effectiveToken, effectiveTenant]);

  useEffect(() => {
    const coderPlatformCommands = [
      {
        id: 'coder-platform-refresh',
        label: 'Refresh coder platform',
        category: 'Coding',
        action: () => { void loadWorklist(); },
      },
      {
        id: 'coder-platform-clear-filters',
        label: 'Clear coder platform filters',
        category: 'Coding',
        action: () => {
          const reset = { status: '', priority: '', assigned: user?.email || '', search: '' };
          setFilters(reset);
          void loadWorklist(reset);
        },
      },
    ];

    const unregister = registerCommands(coderPlatformCommands, { id: CODER_PLATFORM_COMMAND_SCOPE });
    return unregister;
    // eslint-disable-next-line
  }, [registerCommands, user?.email]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    void loadWorklist();
  };

  const renderStatusBadge = (status) => {
    if (!status) return '-';
    const tone = STATUS_TONES[status] || STATUS_TONES.default;
    return (
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>
        {status}
      </span>
    );
  };

  const renderPriorityBadge = (priority) => {
    if (!priority) return '-';
    const tone = PRIORITY_TONES[priority] || PRIORITY_TONES.default;
    return (
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>
        {priority}
      </span>
    );
  };

  const layoutProps = useMemo(
    () => ({
      backgroundClassName:
        'coding-member-workspace portal-theme bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100',
      maxWidthClassName: 'max-w-6xl',
      paddingClassName: 'px-4',
      navItems: CODING_NAV_ITEMS,
      currentNav: 'platform',
      utilityBar: true,
      navProps: { align: 'center' },
    }),
    []
  );

  const headerContent = (
    <PortalPageHeader
      eyebrow="Coding"
      title="Coder platform"
      subtitle="Review, triage, and assign member coding tasks in one workspace."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <PortalStat label="Open queue" value={openTotal} meta="Open + in review" tone="info" />
          <PortalStat label="Due 7d" value={summary.dueSoon ?? 0} meta="Upcoming" tone="warning" />
          <PortalStat label="Overdue" value={summary.overdue ?? 0} meta="Attention" tone="danger" />
        </div>
      }
    />
  );

  return (
    <PortalPageLayout {...layoutProps} headerContent={headerContent}>
      <PortalCard title="Queue metrics" subtitle="Snapshot of current workload.">
        <div className="portal-section-grid">
          {metrics.map((metric) => (
            <PortalStat key={metric.label} label={metric.label} value={metric.value} meta={metric.hint} tone="info" />
          ))}
        </div>
      </PortalCard>

      <PortalCard
        title="Worklist"
        subtitle="Apply filters to slice the coder worklist."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={subtleButtonClasses}
              onClick={() => {
                const reset = { status: '', priority: '', assigned: user?.email || '', search: '' };
                setFilters(reset);
                void loadWorklist(reset);
              }}
              disabled={loading}
            >
              Clear filters
            </button>
            <button
              type="button"
              className={subtleButtonClasses}
              onClick={() => void loadWorklist()}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        }
      >
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label
              htmlFor="coder-platform-status"
              className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-200"
            >
              Status
            </label>
            <select
              id="coder-platform-status"
              name="status"
              value={filters.status}
              onChange={handleInputChange}
              className={inputClasses}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="coder-platform-priority"
              className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-200"
            >
              Priority
            </label>
            <select
              id="coder-platform-priority"
              name="priority"
              value={filters.priority}
              onChange={handleInputChange}
              className={inputClasses}
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="coder-platform-assigned"
              className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-200"
            >
              Assigned coder
            </label>
            <input
              id="coder-platform-assigned"
              type="email"
              name="assigned"
              value={filters.assigned}
              onChange={handleInputChange}
              placeholder="coder@example.com"
              className={inputClasses}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="coder-platform-search"
              className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-200"
            >
              Search
            </label>
            <input
              id="coder-platform-search"
              type="text"
              name="search"
              value={filters.search}
              onChange={handleInputChange}
              placeholder="Member name or key"
              className={inputClasses}
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-4">
            <div className="flex justify-end">
              <button type="submit" className={primaryButtonClasses} disabled={loading}>
                {loading ? (
                  <>
                    <SpinnerIcon className="h-4 w-4 text-white" />
                    Applying...
                  </>
                ) : (
                  'Apply filters'
                )}
              </button>
            </div>
          </div>
        </form>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
            {error}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Member
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Priority
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Assigned
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Due date
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Service dates
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Codes
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-300">
                    <div className="flex items-center justify-center gap-2">
                      <SpinnerIcon className="h-5 w-5 text-sky-500" />
                      Loading coder platform records...
                    </div>
                  </td>
                </tr>
              )}

              {!loading && viewWorklist.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-300">
                    No coder platform records found. Adjust filters or try loading sample data.
                  </td>
                </tr>
              )}

              {viewWorklist.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-100">
                    <div className="font-semibold">{item.memberName}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-300">{item.memberKey}</div>
                  </td>
                  <td className="px-4 py-3">{renderStatusBadge(item.status)}</td>
                  <td className="px-4 py-3">{renderPriorityBadge(item.priority)}</td>
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-100">
                    {item.assignedCoderEmail ?? (
                      <span className="text-slate-500 dark:text-slate-300">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-100">
                    {item.dueDate ?? <span className="text-slate-500 dark:text-slate-300">Not set</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-100">
                    <div>{item.serviceDateFrom || '-'}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-300">{item.serviceDateTo || '-'}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-100">
                    <div>{item.icd10Code || '-'}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-300">{item.hccCode || '-'}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className={linkButtonClasses}
                      disabled={!item.hasMemberDetail}
                      onClick={() => item.hasMemberDetail && navigate(`/coding/member/${item.memberId}`)}
                    >
                      {item.hasMemberDetail ? 'View member' : 'Member unavailable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PortalCard>

      <div className="portal-section-grid">
        <PortalCard title="Status distribution" subtitle="Live counts across results.">
          <div className="space-y-2">
            {Object.keys(statusCounts).length === 0 && (
              <div className="text-sm text-slate-500 dark:text-slate-300">No status data yet.</div>
            )}
            {Object.entries(statusCounts).map(([key, value]) => {
              const label = key.replace(/_/g, ' ');
              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:bg-slate-800/60 dark:text-slate-100"
                >
                  <span className="capitalize">{label}</span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-800 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700">
                    {value}
                  </span>
                </div>
              );
            })}
          </div>
        </PortalCard>

        <PortalCard title="Priority mix" subtitle="Across current results.">
          <div className="space-y-2">
            {Object.keys(priorityCounts).length === 0 && (
              <div className="text-sm text-slate-500 dark:text-slate-300">No priority data yet.</div>
            )}
            {Object.entries(priorityCounts).map(([key, value]) => {
              const label = key.replace(/_/g, ' ');
              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:bg-slate-800/60 dark:text-slate-100"
                >
                  <span className="capitalize">{label}</span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-800 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700">
                    {value}
                  </span>
                </div>
              );
            })}
          </div>
        </PortalCard>
      </div>
    </PortalPageLayout>
  );
};

export default CodingCoderPlatformPage;
