import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import { fetchMember360AllCareOptions } from '../../../services/member360LabService';
import { LabSubNav, MetricCard, RiskBadge, SectionCard } from './components';

const currencyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const STATUS_OPTIONS = ['any', 'recommended', 'accepted', 'declined', 'completed'];
const NETWORK_OPTIONS = ['any', 'In Network', 'Out of Network', 'Tier 1', 'Tier 2'];
const SORT_OPTIONS = [
  { key: 'savings', label: 'Savings (high → low)' },
  { key: 'quality', label: 'Quality (high → low)' },
  { key: 'distance', label: 'Distance (low → high)' },
  { key: 'cost', label: 'Cost (low → high)' },
];

const Member360LabCareOptionsPage = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('any');
  const [networkFilter, setNetworkFilter] = useState('any');
  const [sortKey, setSortKey] = useState('savings');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMember360AllCareOptions(token, tenant)
      .then((items) => { if (!cancelled) { setRows(items); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, tenant]);

  const filtered = useMemo(() => {
    return rows
      .filter((o) => {
        if (statusFilter !== 'any' && o.status !== statusFilter) return false;
        if (networkFilter !== 'any' && o.network_status !== networkFilter) return false;
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
  }, [rows, search, statusFilter, networkFilter, sortKey]);

  const totals = useMemo(() => {
    const total = rows.length;
    const recommended = rows.filter((o) => o.status === 'recommended').length;
    const sumSavings = rows.reduce((s, o) => s + (o.potential_savings || 0), 0);
    const accepted = rows.filter((o) => o.status === 'accepted').length;
    return { total, recommended, sumSavings, accepted };
  }, [rows]);

  return (
    <PortalPageLayout
      eyebrow="Nexora Lab Member360"
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total options" value={totals.total} />
        <MetricCard label="Recommended" value={totals.recommended} />
        <MetricCard label="Accepted" value={totals.accepted} />
        <MetricCard label="Potential savings" value={currencyFmt.format(totals.sumSavings)} accent="currency" />
      </div>

      <section className="coding-surface rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3">
          <input
            type="search"
            placeholder="Search by service, provider, member, or rationale"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="coding-input w-full rounded-lg px-3 py-2 text-sm"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="coding-input rounded-lg px-3 py-2 text-sm lg:w-44">
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s === 'any' ? 'Any status' : `Status: ${s}`}</option>)}
          </select>
          <select value={networkFilter} onChange={(e) => setNetworkFilter(e.target.value)} className="coding-input rounded-lg px-3 py-2 text-sm lg:w-44">
            {NETWORK_OPTIONS.map((s) => <option key={s} value={s}>{s === 'any' ? 'Any network' : s}</option>)}
          </select>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="coding-input rounded-lg px-3 py-2 text-sm lg:w-56">
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>Sort: {o.label}</option>)}
          </select>
        </div>
      </section>

      {loading && <LoadingState title="Loading care options" />}
      {error && <ErrorState title="Care options unavailable" description={error} />}

      {!loading && !error && (
        <SectionCard title={`${filtered.length} care option${filtered.length === 1 ? '' : 's'}`}>
          <div className="overflow-x-auto rounded-lg ring-1 ring-black/5 dark:ring-white/10">
            <table className="min-w-full text-sm">
              <thead className="coding-surface-subtle text-xs uppercase tracking-wide coding-text-muted">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Service</th>
                  <th className="text-left px-3 py-2 font-medium">Member</th>
                  <th className="text-left px-3 py-2 font-medium">Provider</th>
                  <th className="text-right px-3 py-2 font-medium">Cost</th>
                  <th className="text-right px-3 py-2 font-medium">Quality</th>
                  <th className="text-right px-3 py-2 font-medium">Distance</th>
                  <th className="text-right px-3 py-2 font-medium">Savings</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y coding-divider">
                {filtered.map((o) => (
                  <tr
                    key={o.id}
                    className="coding-hoverable cursor-pointer"
                    onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${o.member_id}`)}
                  >
                    <td className="px-3 py-2 align-top">
                      <p className="coding-text-strong font-semibold">{o.service_type}</p>
                      <p className="text-[11px] coding-text-soft line-clamp-2">{o.rationale}</p>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <p className="coding-text-strong">{o.member_name || '—'}</p>
                      <p className="text-[11px] coding-text-muted">{o.member_key}</p>
                      {o.risk_tier && <div className="mt-1"><RiskBadge tier={o.risk_tier} /></div>}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <p className="coding-text-strong">{o.recommended_provider || o.facility_name || '—'}</p>
                      {o.network_status && <p className="text-[11px] coding-text-muted">{o.network_status}</p>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{o.cost_estimate != null ? currencyFmt.format(o.cost_estimate) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{o.quality_score != null ? Number(o.quality_score).toFixed(1) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{o.distance_miles != null ? `${o.distance_miles} mi` : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-300">
                      {o.potential_savings != null ? currencyFmt.format(o.potential_savings) : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs capitalize">
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 coding-text-strong">{o.status || 'recommended'}</span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-sm coding-text-soft">No care options match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </PortalPageLayout>
  );
};

export default Member360LabCareOptionsPage;
