import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import { fetchMember360Members } from '../../../services/member360LabService';
import { LabSubNav, RiskBadge } from './components';

const RISK_TIERS = ['Critical', 'High', 'Moderate', 'Low'];
const SORT_OPTIONS = [
  { key: 'risk', label: 'Risk score (desc)' },
  { key: 'tasks', label: 'Open tasks' },
  { key: 'last_interaction', label: 'Most recent interaction' },
];

const Member360LabMembersPage = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};
  const [search, setSearch] = useState('');
  const [selectedTiers, setSelectedTiers] = useState([]);
  const [journeyFilter, setJourneyFilter] = useState('any');
  const [taskFilter, setTaskFilter] = useState('any');
  const [sortKey, setSortKey] = useState('risk');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const filters = {
      search: search.trim() || undefined,
      risk_tier: selectedTiers.length ? selectedTiers : undefined,
      has_active_journey: journeyFilter === 'any' ? undefined : journeyFilter === 'yes',
      has_open_task: taskFilter === 'any' ? undefined : taskFilter === 'yes',
      limit: 200,
    };
    fetchMember360Members(token, tenant, filters)
      .then((res) => { if (!cancelled) { setItems(res.items || []); setTotal(res.total || (res.items || []).length); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, tenant, search, selectedTiers, journeyFilter, taskFilter]);

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
      eyebrow="Nexora Lab Member360"
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

      <section className="coding-surface rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <input
            type="search"
            placeholder="Search by name, member ID, PCP, or plan"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="coding-input w-full rounded-lg px-3 py-2 text-sm"
          />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="coding-input rounded-lg px-3 py-2 text-sm lg:w-56"
          >
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>Sort: {o.label}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="coding-text-muted uppercase tracking-wider">Risk tier:</span>
          {RISK_TIERS.map((tier) => {
            const active = selectedTiers.includes(tier);
            return (
              <button
                key={tier}
                type="button"
                onClick={() => toggleTier(tier)}
                className={`rounded-full px-2.5 py-1 ring-1 transition ${active ? 'bg-[var(--brand-primary)] text-white ring-[var(--brand-primary)]' : 'coding-surface-subtle coding-text-strong ring-black/5 dark:ring-white/10 hover:opacity-80'}`}
              >
                {tier}
              </button>
            );
          })}
          <span className="coding-text-muted uppercase tracking-wider ml-3">Journey:</span>
          {['any', 'yes', 'no'].map((v) => (
            <button key={v} type="button" onClick={() => setJourneyFilter(v)}
              className={`rounded-full px-2.5 py-1 ring-1 transition ${journeyFilter === v ? 'bg-[var(--brand-primary)] text-white ring-[var(--brand-primary)]' : 'coding-surface-subtle coding-text-strong ring-black/5 dark:ring-white/10 hover:opacity-80'}`}>
              {v === 'any' ? 'Any' : v === 'yes' ? 'Has active' : 'No active'}
            </button>
          ))}
          <span className="coding-text-muted uppercase tracking-wider ml-3">Tasks:</span>
          {['any', 'yes', 'no'].map((v) => (
            <button key={v} type="button" onClick={() => setTaskFilter(v)}
              className={`rounded-full px-2.5 py-1 ring-1 transition ${taskFilter === v ? 'bg-[var(--brand-primary)] text-white ring-[var(--brand-primary)]' : 'coding-surface-subtle coding-text-strong ring-black/5 dark:ring-white/10 hover:opacity-80'}`}>
              {v === 'any' ? 'Any' : v === 'yes' ? 'Open' : 'None'}
            </button>
          ))}
        </div>
      </section>

      {loading && <LoadingState title="Loading members" />}
      {error && <ErrorState title="Members unavailable" description={error} />}

      {!loading && !error && (
        <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2 flex items-center justify-between text-xs coding-text-muted">
            <span>{sorted.length} members{total !== sorted.length ? ` of ${total}` : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="coding-surface-subtle text-xs uppercase tracking-wide coding-text-muted">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Member</th>
                  <th className="text-left px-3 py-2 font-medium">Plan</th>
                  <th className="text-left px-3 py-2 font-medium">Risk</th>
                  <th className="text-left px-3 py-2 font-medium">Gaps</th>
                  <th className="text-left px-3 py-2 font-medium">Journey</th>
                  <th className="text-left px-3 py-2 font-medium">Tasks</th>
                  <th className="text-left px-3 py-2 font-medium">Last interaction</th>
                  <th className="text-left px-3 py-2 font-medium">Next best action</th>
                </tr>
              </thead>
              <tbody className="divide-y coding-divider">
                {sorted.map((m) => (
                  <tr
                    key={m.id}
                    className="cursor-pointer coding-hoverable transition"
                    onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${m.id}`)}
                  >
                    <td className="px-3 py-2">
                      <p className="coding-text-strong font-semibold">{m.first_name} {m.last_name}</p>
                      <p className="text-[11px] coding-text-muted">{m.member_key} · {m.primary_care_provider || '—'}</p>
                    </td>
                    <td className="px-3 py-2 coding-text-soft text-xs">{m.plan_name || '—'}<br/><span className="coding-text-muted">{m.line_of_business || '—'}</span></td>
                    <td className="px-3 py-2"><RiskBadge tier={m.risk_tier} score={m.risk_score_composite} /></td>
                    <td className="px-3 py-2 tabular-nums">{m.open_care_gaps ?? 0}</td>
                    <td className="px-3 py-2 tabular-nums">{m.active_journey_count ?? 0}</td>
                    <td className="px-3 py-2 tabular-nums">{m.open_task_count ?? 0}</td>
                    <td className="px-3 py-2 text-xs coding-text-soft">{m.last_interaction_at ? new Date(m.last_interaction_at).toLocaleDateString() : '—'}</td>
                    <td className="px-3 py-2 text-xs coding-text-strong">{m.next_best_action || '—'}</td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-sm coding-text-soft">No members match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </PortalPageLayout>
  );
};

export default Member360LabMembersPage;
