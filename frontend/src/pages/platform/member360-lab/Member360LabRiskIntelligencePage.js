import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import {
  fetchMember360Members,
  fetchMember360RiskInsights,
} from '../../../services/member360LabService';
import { LabSubNav, RiskBadge } from './components';

// Risk intelligence is an analytics page (tier distribution, domain averages,
// driver rollups) rather than a row-by-row list, so it intentionally fetches
// up to 500 members and 500 risk insights in one shot rather than paginating.
// Real customer scale will want server-side rollup endpoints — until then we
// surface the cap below as an honest footnote.
const ANALYTICS_SAMPLE_SIZE = 500;
import FilterDropdown from '../../../components/ui/FilterDropdown';
import KpiTile from '../../../components/ui/KpiTile';

const TIER_ORDER = ['Critical', 'High', 'Moderate', 'Low'];
const DOMAINS = ['Clinical', 'Utilization', 'Cost', 'Engagement'];

const TIER_BAR = {
  Critical: 'bg-rose-500',
  High: 'bg-amber-500',
  Moderate: 'bg-sky-500',
  Low: 'bg-emerald-500',
};

const Member360LabRiskIntelligencePage = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};
  const [members, setMembers] = useState([]);
  const [memberTotal, setMemberTotal] = useState(0);
  const [insights, setInsights] = useState([]);
  const [insightTotal, setInsightTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [domain, setDomain] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchMember360Members(token, tenant, { limit: ANALYTICS_SAMPLE_SIZE }),
      fetchMember360RiskInsights(token, tenant, { limit: ANALYTICS_SAMPLE_SIZE }),
    ])
      .then(([memberRes, insightRes]) => {
        if (cancelled) return;
        setMembers(memberRes.items || []);
        setMemberTotal(memberRes.total || 0);
        setInsights(insightRes.items || []);
        setInsightTotal(insightRes.total || 0);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, tenant]);

  const membersCapped = memberTotal > members.length;
  const insightsCapped = insightTotal > insights.length;

  const tierBreakdown = useMemo(() => {
    const counts = Object.fromEntries(TIER_ORDER.map((t) => [t, 0]));
    members.forEach((m) => { if (counts[m.risk_tier] != null) counts[m.risk_tier] += 1; });
    return counts;
  }, [members]);

  const domainAverages = useMemo(() => {
    return DOMAINS.map((d) => {
      const scores = members.map((m) => Number(m[`${d.toLowerCase()}_risk_score`])).filter((v) => Number.isFinite(v));
      const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      const high = members.filter((m) => Number(m[`${d.toLowerCase()}_risk_score`]) >= 7).length;
      return { domain: d, average: avg, high };
    });
  }, [members]);

  const driverRollup = useMemo(() => {
    const filtered = !domain ? insights : insights.filter((i) => i.domain === domain);
    const map = new Map();
    filtered.forEach((i) => {
      const key = `${i.domain}|${i.driver}`;
      const entry = map.get(key) || { domain: i.domain, driver: i.driver, recommendation: i.recommendation, members: [], total: 0, confidence: 0, confidenceCount: 0 };
      entry.members.push({
        id: i.member_id,
        name: i.member_name,
        member_key: i.member_key,
        risk_tier: i.risk_tier,
        score: Number(i.score) || 0,
      });
      entry.total += Number(i.score) || 0;
      if (i.confidence != null) {
        entry.confidence += Number(i.confidence);
        entry.confidenceCount += 1;
      }
      map.set(key, entry);
    });
    return Array.from(map.values())
      .map((d) => ({
        ...d,
        member_count: d.members.length,
        average_score: d.members.length ? d.total / d.members.length : 0,
        confidence: d.confidenceCount ? d.confidence / d.confidenceCount : null,
      }))
      .sort((a, b) => b.average_score - a.average_score);
  }, [insights, domain]);

  const topMembers = useMemo(() => {
    return [...members]
      .sort((a, b) => (b.risk_score_composite || 0) - (a.risk_score_composite || 0))
      .slice(0, 12);
  }, [members]);

  const totalMembers = members.length || 1;

  return (
    <PortalPageLayout
      eyebrow="Nexora Lab Member360"
      title="Risk intelligence"
      subtitle="Drivers behind composite risk scores, rolled up across your population."
      navItems={PORTAL_NAV_ITEMS}
      currentNav="member360-lab"
      navProps={{ align: 'center', tone: 'surface' }}
      align="left"
      maxWidthClassName="max-w-7xl"
      mainClassName="space-y-4"
    >
      <LabSubNav />

      {loading && <LoadingState title="Loading risk insights" />}
      {error && <ErrorState title="Risk data unavailable" description={error} />}

      {!loading && !error && (membersCapped || insightsCapped) && (
        <div className="rounded-md border coding-border bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2 text-[11px] coding-text-muted">
          Showing analytics across the first {ANALYTICS_SAMPLE_SIZE.toLocaleString()} {membersCapped ? `members (of ${memberTotal.toLocaleString()})` : 'members'}
          {insightsCapped ? ` and ${ANALYTICS_SAMPLE_SIZE.toLocaleString()} risk insights (of ${insightTotal.toLocaleString()})` : ''}.
          Larger populations will get a dedicated server-side rollup endpoint.
        </div>
      )}

      {!loading && !error && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {TIER_ORDER.map((tier) => (
              <KpiTile
                key={tier}
                label={`${tier} risk`}
                value={tierBreakdown[tier]}
                hint={`${((tierBreakdown[tier] / totalMembers) * 100).toFixed(0)}% of members`}
                tone={tier}
              />
            ))}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="coding-surface rounded-2xl shadow-sm p-5">
              <header className="mb-3">
                <h3 className="text-sm font-semibold coding-text-strong">Risk distribution</h3>
                <p className="text-xs coding-text-soft">Members per tier as a share of the population.</p>
              </header>
              <ul className="space-y-3">
                {TIER_ORDER.map((tier) => {
                  const count = tierBreakdown[tier];
                  const pct = (count / totalMembers) * 100;
                  return (
                    <li key={tier}>
                      <div className="flex items-center justify-between mb-1.5">
                        <RiskBadge tier={tier} />
                        <span className="text-xs tabular-nums coding-text-muted">{count} · {pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-200/50 dark:bg-slate-700/40 overflow-hidden">
                        <div className={`h-full ${TIER_BAR[tier]}`} style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="coding-surface rounded-2xl shadow-sm p-5">
              <header className="mb-3">
                <h3 className="text-sm font-semibold coding-text-strong">Average score by domain</h3>
                <p className="text-xs coding-text-soft">Where risk concentrates across the population.</p>
              </header>
              <ul className="space-y-3">
                {domainAverages.map((d) => (
                  <li key={d.domain}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold coding-text-strong">{d.domain}</span>
                      <span className="tabular-nums coding-text-muted">avg {d.average.toFixed(1)} · {d.high} ≥7</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-200/50 dark:bg-slate-700/40 overflow-hidden">
                      <div className="h-full bg-[var(--brand-primary)]" style={{ width: `${Math.min(d.average * 10, 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
            <header className="px-5 py-3 border-b coding-border flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold coding-text-strong">Top drivers</h3>
                <p className="text-xs coding-text-soft">Highest-impact drivers across the population, with members affected.</p>
              </div>
              <FilterDropdown label="Domain" count={domain ? 1 : 0} display={domain}>
                {({ close }) => (
                  <div className="flex flex-col gap-1 min-w-[160px]">
                    <button
                      type="button"
                      onClick={() => { setDomain(null); close(); }}
                      className={`text-left px-2 py-1 rounded hover:bg-[var(--coding-hover)] ${!domain ? 'coding-text-strong font-semibold' : 'coding-text-soft'}`}
                    >
                      All domains
                    </button>
                    {DOMAINS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => { setDomain(d); close(); }}
                        className={`text-left px-2 py-1 rounded hover:bg-[var(--coding-hover)] ${domain === d ? 'coding-text-strong font-semibold' : 'coding-text-soft'}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                )}
              </FilterDropdown>
            </header>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider coding-text-muted">
                  <tr className="border-b coding-border">
                    <th className="text-left px-4 py-2.5 font-semibold">Driver</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Domain</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Members</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Avg score</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Confidence</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {driverRollup.map((d, idx) => (
                    <tr key={`${d.domain}-${d.driver}-${idx}`} className="border-b coding-border-subtle hover:bg-[var(--coding-hover)] transition">
                      <td className="px-4 py-3 coding-text-strong font-medium">{d.driver}</td>
                      <td className="px-3 py-3 text-xs">
                        <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 coding-text-muted">{d.domain}</span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums coding-text-strong">{d.member_count}</td>
                      <td className="px-3 py-3 text-right tabular-nums coding-text-strong">{d.average_score.toFixed(1)}</td>
                      <td className="px-3 py-3 text-right tabular-nums coding-text-soft">{d.confidence != null ? `${(d.confidence * 100).toFixed(0)}%` : '—'}</td>
                      <td className="px-3 py-3 text-xs coding-text-soft">{d.recommendation || '—'}</td>
                    </tr>
                  ))}
                  {driverRollup.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-12 text-center text-sm coding-text-soft">No drivers in this view.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
            <header className="px-5 py-3 border-b coding-border">
              <h3 className="text-sm font-semibold coding-text-strong">Highest composite risk</h3>
              <p className="text-xs coding-text-soft">Top members ranked by composite score.</p>
            </header>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider coding-text-muted">
                  <tr className="border-b coding-border">
                    <th className="text-left px-4 py-2.5 font-semibold">Member</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Tier</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Composite</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Clinical</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Utilization</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Cost</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Engagement</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Next best action</th>
                  </tr>
                </thead>
                <tbody>
                  {topMembers.map((m) => (
                    <tr
                      key={m.id}
                      className="cursor-pointer border-b coding-border-subtle hover:bg-[var(--coding-hover)] transition"
                      onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${m.id}`)}
                    >
                      <td className="px-4 py-3">
                        <p className="coding-text-strong font-medium">{m.first_name} {m.last_name}</p>
                        <p className="text-[11px] coding-text-muted">{m.member_key}</p>
                      </td>
                      <td className="px-3 py-3"><RiskBadge tier={m.risk_tier} /></td>
                      <td className="px-3 py-3 text-right tabular-nums coding-text-strong font-medium">{m.risk_score_composite != null ? Number(m.risk_score_composite).toFixed(1) : '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums coding-text-soft">{m.clinical_risk_score != null ? Number(m.clinical_risk_score).toFixed(1) : '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums coding-text-soft">{m.utilization_risk_score != null ? Number(m.utilization_risk_score).toFixed(1) : '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums coding-text-soft">{m.cost_risk_score != null ? Number(m.cost_risk_score).toFixed(1) : '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums coding-text-soft">{m.engagement_risk_score != null ? Number(m.engagement_risk_score).toFixed(1) : '—'}</td>
                      <td className="px-3 py-3 text-xs coding-text-soft">{m.next_best_action || '—'}</td>
                    </tr>
                  ))}
                  {topMembers.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-12 text-center text-sm coding-text-soft">No members loaded.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </PortalPageLayout>
  );
};

export default Member360LabRiskIntelligencePage;
