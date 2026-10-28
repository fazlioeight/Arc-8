import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import { fetchMember360CareOptions } from '../../../services/member360LabService';
import { LabSubNav, Pagination, RiskBadge } from './components';

const PAGE_SIZE = 100;
import FilterDropdown from '../../../components/ui/FilterDropdown';
import KpiTile from '../../../components/ui/KpiTile';
import SavedViewsBar from '../../../components/ui/SavedViewsBar';
import SearchInput from '../../../components/ui/SearchInput';

const currencyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const STATUSES = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'declined', label: 'Declined' },
  { key: 'completed', label: 'Completed' },
];

const NETWORKS = ['In Network', 'Out of Network', 'Tier 1', 'Tier 2'];

const SORT_OPTIONS = [
  { key: 'savings', label: 'Savings (high → low)' },
  { key: 'quality', label: 'Quality (high → low)' },
  { key: 'distance', label: 'Distance (low → high)' },
  { key: 'cost', label: 'Cost (low → high)' },
];

const SAVED_VIEWS = [
  { key: 'all', label: 'All options' },
  { key: 'recommended', label: 'Recommended', statuses: ['recommended'] },
  { key: 'accepted', label: 'Accepted', statuses: ['accepted'] },
  { key: 'in_network', label: 'In network', networks: ['In Network'] },
];

const STATUS_TONE = {
  recommended: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200',
  accepted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
  declined: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  completed: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-200',
};

const Member360LabCareOptionsPage = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [sortKey, setSortKey] = useState('savings');
  const [activeView, setActiveView] = useState('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMember360CareOptions(token, tenant, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setRows(res.items || []);
        setTotal(res.total || 0);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, tenant, page]);

  const applySavedView = (key) => {
    const view = SAVED_VIEWS.find((v) => v.key === key);
    setActiveView(key);
    setStatuses(view?.statuses || []);
    setNetworks(view?.networks || []);
  };

  const toggleStatus = (k) =>
    setStatuses((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  const toggleNetwork = (k) =>
    setNetworks((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const filtered = useMemo(() => {
    return rows
      .filter((o) => {
        if (statuses.length > 0 && !statuses.includes(o.status)) return false;
        if (networks.length > 0 && !networks.includes(o.network_status)) return false;
        if (search) {
          const term = search.toLowerCase();
          const hay = [o.service_type, o.recommended_provider, o.facility_name, o.member_name, o.member_key, o.rationale].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortKey === 'savings') return (b.potential_savings || 0) - (a.potential_savings || 0);
        if (sortKey === 'quality') return (b.quality_score || 0) - (a.quality_score || 0);
        if (sortKey === 'distance') return (a.distance_miles || Infinity) - (b.distance_miles || Infinity);
        if (sortKey === 'cost') return (a.cost_estimate || Infinity) - (b.cost_estimate || Infinity);
        return 0;
      });
  }, [rows, search, statuses, networks, sortKey]);

  const totals = useMemo(() => {
    const total = rows.length;
    const recommended = rows.filter((o) => o.status === 'recommended').length;
    const sumSavings = rows.reduce((s, o) => s + (o.potential_savings || 0), 0);
    const accepted = rows.filter((o) => o.status === 'accepted').length;
    return { total, recommended, sumSavings, accepted };
  }, [rows]);

  const activeFilterCount = (statuses.length > 0 ? 1 : 0) + (networks.length > 0 ? 1 : 0);

  return (
    <PortalPageLayout
      eyebrow="Arc-8 Member360"
      title="Care options"
      subtitle="Every steerage opportunity surfaced across the population, with potential savings."
      navItems={PORTAL_NAV_ITEMS}
      currentNav="member360-lab"
      navProps={{ align: 'center', tone: 'surface' }}
      align="left"
      maxWidthClassName="max-w-7xl"
      mainClassName="space-y-4"
    >
      <LabSubNav />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Total options" value={totals.total} />
        <KpiTile label="Recommended" value={totals.recommended} tone="info" />
        <KpiTile label="Accepted" value={totals.accepted} tone="success" />
        <KpiTile label="Potential savings" value={currencyFmt.format(totals.sumSavings)} tone="success" />
      </section>

      <SavedViewsBar views={SAVED_VIEWS} activeKey={activeView} onChange={applySavedView} />

      <section className="coding-surface rounded-2xl shadow-sm">
        <div className="p-3 flex flex-col lg:flex-row gap-2 lg:items-center">
          <SearchInput
            placeholder="Search service, provider, member, or rationale"
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
          <FilterDropdown label="Network" count={networks.length}>
            <div className="flex flex-col gap-1 min-w-[180px]">
              {NETWORKS.map((n) => (
                <label key={n} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--coding-hover)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={networks.includes(n)}
                    onChange={() => toggleNetwork(n)}
                    className="accent-[var(--brand-primary)]"
                  />
                  <span className="coding-text-strong">{n}</span>
                </label>
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

      {loading && <LoadingState title="Loading care options" />}
      {error && <ErrorState title="Care options unavailable" description={error} />}

      {!loading && !error && (
        <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between text-xs coding-text-muted border-b coding-border">
            <span>
              {filtered.length} care option{filtered.length === 1 ? '' : 's'} shown
              {rows.length !== filtered.length ? ` (filtered from ${rows.length} on this page)` : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider coding-text-muted">
                <tr className="border-b coding-border">
                  <th className="text-left px-4 py-2.5 font-semibold">Service</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Member</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Provider</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Cost</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Quality</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Distance</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Savings</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer border-b coding-border-subtle hover:bg-[var(--coding-hover)] transition"
                    onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${o.member_id}`)}
                  >
                    <td className="px-4 py-3 align-top">
                      <p className="coding-text-strong font-medium">{o.service_type}</p>
                      <p className="text-[11px] coding-text-soft line-clamp-2">{o.rationale}</p>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <p className="coding-text-strong font-medium">{o.member_name || '—'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[11px] coding-text-muted">{o.member_key}</p>
                        {o.risk_tier && <RiskBadge tier={o.risk_tier} />}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <p className="coding-text-strong">{o.recommended_provider || o.facility_name || '—'}</p>
                      {o.network_status && <p className="text-[11px] coding-text-muted">{o.network_status}</p>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums coding-text-strong">{o.cost_estimate != null ? currencyFmt.format(o.cost_estimate) : '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums coding-text-soft">{o.quality_score != null ? Number(o.quality_score).toFixed(1) : '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums coding-text-soft">{o.distance_miles != null ? `${o.distance_miles} mi` : '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-300">
                      {o.potential_savings != null ? currencyFmt.format(o.potential_savings) : '—'}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 capitalize ${STATUS_TONE[o.status] || STATUS_TONE.recommended}`}>
                        {o.status || 'recommended'}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-12 text-center text-sm coding-text-soft">No care options match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} label="care options" />
        </section>
      )}
    </PortalPageLayout>
  );
};

export default Member360LabCareOptionsPage;
