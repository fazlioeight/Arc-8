import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import { fetchMember360Members } from '../../../services/member360LabService';
import { LabSubNav, Pagination, RiskBadge } from './components';

const PAGE_SIZE = 100;
import FilterDropdown from '../../../components/ui/FilterDropdown';
import SavedViewsBar from '../../../components/ui/SavedViewsBar';
import SearchInput from '../../../components/ui/SearchInput';

const RISK_TIERS = ['Critical', 'High', 'Moderate', 'Low'];
const SORT_OPTIONS = [
  { key: 'risk', label: 'Risk score (desc)' },
  { key: 'tasks', label: 'Open tasks' },
  { key: 'last_interaction', label: 'Most recent interaction' },
];

const SAVED_VIEWS = [
  { key: 'all', label: 'All members' },
  { key: 'critical', label: 'Critical & High', tiers: ['Critical', 'High'] },
  { key: 'active_journey', label: 'In a journey', journey: 'yes' },
  { key: 'open_tasks', label: 'Open tasks', task: 'yes' },
];

const Member360LabMembersPage = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};
  const [search, setSearch] = useState('');
  const [selectedTiers, setSelectedTiers] = useState([]);
  const [journeyFilter, setJourneyFilter] = useState('any');
  const [taskFilter, setTaskFilter] = useState('any');
  const [sortKey, setSortKey] = useState('risk');
  const [activeView, setActiveView] = useState('all');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const applySavedView = (key) => {
    const view = SAVED_VIEWS.find((v) => v.key === key);
    setActiveView(key);
    setSelectedTiers(view?.tiers || []);
    setJourneyFilter(view?.journey || 'any');
    setTaskFilter(view?.task || 'any');
    setPage(1);
  };

  const activeFilterCount =
    (selectedTiers.length > 0 ? 1 : 0) +
    (journeyFilter !== 'any' ? 1 : 0) +
    (taskFilter !== 'any' ? 1 : 0);

  // Reset to page 1 whenever the server-side filters change so the user always
  // lands on the first page of the new result set instead of, say, page 7 of
  // a much smaller filtered set.
  useEffect(() => {
    setPage(1);
  }, [search, selectedTiers, journeyFilter, taskFilter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const filters = {
      search: search.trim() || undefined,
      risk_tier: selectedTiers.length ? selectedTiers : undefined,
      has_active_journey: journeyFilter === 'any' ? undefined : journeyFilter === 'yes',
      has_open_task: taskFilter === 'any' ? undefined : taskFilter === 'yes',
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    };
    fetchMember360Members(token, tenant, filters)
      .then((res) => { if (!cancelled) { setItems(res.items || []); setTotal(res.total || (res.items || []).length); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, tenant, search, selectedTiers, journeyFilter, taskFilter, page]);

  const sorted = useMemo(() => {
    const copy = [...items];
    if (sortKey === 'risk') {
      copy.sort((a, b) => (b.risk_score_composite || 0) - (a.risk_score_composite || 0));
    } else if (sortKey === 'tasks') {
      copy.sort((a, b) => (b.open_task_count || 0) - (a.open_task_count || 0));
    } else if (sortKey === 'last_interaction') {
      copy.sort((a, b) => new Date(b.last_interaction_at || 0) - new Date(a.last_interaction_at || 0));
    }
    return copy;
  }, [items, sortKey]);

  const toggleTier = (tier) => {
    setSelectedTiers((prev) => prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier]);
  };

  return (
    <PortalPageLayout
      eyebrow="Arc-8 Member360"
      title="Members"
      subtitle="Search, filter, and triage your member roster by risk, journeys, and open work."
      navItems={PORTAL_NAV_ITEMS}
      currentNav="member360-lab"
      navProps={{ align: 'center', tone: 'surface' }}
      align="left"
      maxWidthClassName="max-w-7xl"
      mainClassName="space-y-4"
    >
      <LabSubNav />

      <SavedViewsBar views={SAVED_VIEWS} activeKey={activeView} onChange={applySavedView} />

      <section className="coding-surface rounded-2xl shadow-sm">
        <div className="p-3 flex flex-col lg:flex-row gap-2 lg:items-center">
          <SearchInput
            placeholder="Search name, member ID, PCP, or plan"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="coding-input rounded-md px-3 py-2 text-sm lg:w-56"
          >
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>Sort: {o.label}</option>)}
          </select>
        </div>
        <div className="border-t coding-border px-3 py-2 flex flex-wrap items-center gap-1.5 text-xs">
          <FilterDropdown label="Risk tier" count={selectedTiers.length}>
            <div className="flex flex-col gap-1">
              {RISK_TIERS.map((tier) => (
                <label key={tier} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--coding-hover)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTiers.includes(tier)}
                    onChange={() => toggleTier(tier)}
                    className="accent-[var(--brand-primary)]"
                  />
                  <span className="coding-text-strong">{tier}</span>
                </label>
              ))}
            </div>
          </FilterDropdown>
          <FilterDropdown label="Journey" count={journeyFilter !== 'any' ? 1 : 0} display={journeyFilter === 'any' ? null : journeyFilter === 'yes' ? 'Has active' : 'No active'}>
            <div className="flex flex-col gap-1">
              {[{ v: 'any', label: 'Any' }, { v: 'yes', label: 'Has active' }, { v: 'no', label: 'No active' }].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setJourneyFilter(o.v)}
                  className={`text-left px-2 py-1 rounded hover:bg-[var(--coding-hover)] ${journeyFilter === o.v ? 'coding-text-strong font-semibold' : 'coding-text-soft'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </FilterDropdown>
          <FilterDropdown label="Tasks" count={taskFilter !== 'any' ? 1 : 0} display={taskFilter === 'any' ? null : taskFilter === 'yes' ? 'Open' : 'None'}>
            <div className="flex flex-col gap-1">
              {[{ v: 'any', label: 'Any' }, { v: 'yes', label: 'Open tasks' }, { v: 'no', label: 'No tasks' }].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setTaskFilter(o.v)}
                  className={`text-left px-2 py-1 rounded hover:bg-[var(--coding-hover)] ${taskFilter === o.v ? 'coding-text-strong font-semibold' : 'coding-text-soft'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
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

      {loading && <LoadingState title="Loading members" />}
      {error && <ErrorState title="Members unavailable" description={error} />}

      {!loading && !error && (
        <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between text-xs coding-text-muted border-b coding-border">
            <span>{sorted.length} member{sorted.length === 1 ? '' : 's'}{total !== sorted.length ? ` of ${total}` : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider coding-text-muted">
                <tr className="border-b coding-border">
                  <th className="text-left px-4 py-2.5 font-semibold">Member</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Plan</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Risk</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Gaps</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Journey</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Tasks</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Last interaction</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Next best action</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => (
                  <tr
                    key={m.id}
                    className="cursor-pointer border-b coding-border-subtle hover:bg-[var(--coding-hover)] transition"
                    onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${m.id}`)}
                  >
                    <td className="px-4 py-3">
                      <p className="coding-text-strong font-medium">{m.first_name} {m.last_name}</p>
                      <p className="text-[11px] coding-text-muted">{m.member_key} · {m.primary_care_provider || '—'}</p>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <p className="coding-text-strong">{m.plan_name || '—'}</p>
                      <p className="coding-text-muted">{m.line_of_business || '—'}</p>
                    </td>
                    <td className="px-3 py-3"><RiskBadge tier={m.risk_tier} score={m.risk_score_composite} /></td>
                    <td className="px-3 py-3 text-right tabular-nums coding-text-strong">{m.open_care_gaps ?? 0}</td>
                    <td className="px-3 py-3 text-right tabular-nums coding-text-strong">{m.active_journey_count ?? 0}</td>
                    <td className="px-3 py-3 text-right tabular-nums coding-text-strong">{m.open_task_count ?? 0}</td>
                    <td className="px-3 py-3 text-xs coding-text-soft">{m.last_interaction_at ? new Date(m.last_interaction_at).toLocaleDateString() : '—'}</td>
                    <td className="px-3 py-3 text-xs coding-text-strong">{m.next_best_action || '—'}</td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-12 text-center text-sm coding-text-soft">No members match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} label="members" />
        </section>
      )}
    </PortalPageLayout>
  );
};

export default Member360LabMembersPage;
