import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import {
  fetchMember360AllRiskInsights,
  fetchMember360Members,
} from '../../../services/member360LabService';
import { LabSubNav, MetricCard, RiskBadge, SectionCard } from './components';

const TIER_ORDER = ['Critical', 'High', 'Moderate', 'Low'];
const DOMAINS = ['Clinical', 'Utilization', 'Cost', 'Engagement'];

const Member360LabRiskIntelligencePage = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};
  const [members, setMembers] = useState([]);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [domainFilter, setDomainFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchMember360Members(token, tenant, { limit: 500 }),
      fetchMember360AllRiskInsights(token, tenant),
    ])
      .then(([memberRes, insightRows]) => {
        if (cancelled) return;
        setMembers(memberRes.items || []);
        setInsights(insightRows || []);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, tenant]);

  const tierBreakdown = useMemo(() => {
    const counts = Object.fromEntries(TIER_ORDER.map((t) => [t, 0]));
    members.forEach((m) => { if (counts[m.risk_tier] != null) counts[m.risk_tier] += 1; });
    return counts;
  }, [members]);

  const domainAverages = useMemo(() => {
    return DOMAINS.map((domain) => {
      const scores = members.map((m) => {
        const key = `${domain.toLowerCase()}_risk_score`;
        return Number(m[key]);
      }).filter((v) => Number.isFinite(v));
      const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      const high = members.filter((m) => Number(m[`${domain.toLowerCase()}_risk_score`]) >= 7).length;
      return { domain, average: avg, high };
    });
  }, [members]);

  const driverRollup = useMemo(() => {
    const filtered = domainFilter === 'all' ? insights : insights.filter((i) => i.domain === domainFilter);
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
  }, [insights, domainFilter]);

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

      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {TIER_ORDER.map((tier) => (
              <MetricCard
                key={tier}
                label={`${tier} risk`}
                value={tierBreakdown[tier]}
                hint={`${((tierBreakdown[tier] / totalMembers) * 100).toFixed(0)}% of members`}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Risk distribution" subtitle="Members per tier as a share of the population.">
              <ul className="space-y-2">
                {TIER_ORDER.map((tier) => {
                  const count = tierBreakdown[tier];
                  const pct = (count / totalMembers) * 100;
                  return (
                    <li key={tier} className="text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <RiskBadge tier={tier} />
                        <span className="tabular-nums coding-text-muted">{count} · {pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-200/50 dark:bg-slate-700/40 overflow-hidden">
                        <div
                          className={`h-full ${tier === 'Critical' ? 'bg-rose-500' : tier === 'High' ? 'bg-amber-500' : tier === 'Moderate' ? 'bg-sky-500' : 'bg-emerald-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>

            <SectionCard title="Average score by domain" subtitle="Where risk concentrates across the population.">
              <ul className="space-y-3">
                {domainAverages.map((d) => (
                  <li key={d.domain}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold coding-text-strong">{d.domain}</span>
                      <span className="tabular-nums coding-text-muted">avg {d.average.toFixed(1)} · {d.high} ≥7</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-200/50 dark:bg-slate-700/40 overflow-hidden">
                      <div className="h-full bg-[var(--brand-primary)]" style={{ width: `${Math.min(d.average * 10, 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>

          <SectionCard
            title="Top drivers"
            subtitle="Highest-impact drivers across the population, with members affected."
            action={(
              <select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)} className="coding-input rounded-md px-2 py-1 text-xs">
                <option value="all">All domains</option>
                {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
          >
            <div className="overflow-x-auto rounded-lg ring-1 ring-black/5 dark:ring-white/10">
              <table className="min-w-full text-sm">
                <thead className="coding-surface-subtle text-xs uppercase tracking-wide coding-text-muted">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Driver</th>
                    <th className="text-left px-3 py-2 font-medium">Domain</th>
                    <th className="text-right px-3 py-2 font-medium">Members</th>
                    <th className="text-right px-3 py-2 font-medium">Avg score</th>
                    <th className="text-right px-3 py-2 font-medium">Confidence</th>
                    <th className="text-left px-3 py-2 font-medium">Recommendation</th>
                  </tr>
                </thead>
                <tbody className="divide-y coding-divider">
                  {driverRollup.map((d, idx) => (
                    <tr key={`${d.domain}-${d.driver}-${idx}`} className="coding-hoverable">
                      <td className="px-3 py-2 coding-text-strong">{d.driver}</td>
                      <td className="px-3 py-2 text-xs"><span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 coding-text-muted">{d.domain}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.member_count}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.average_score.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.confidence != null ? `${(d.confidence * 100).toFixed(0)}%` : '—'}</td>
                      <td className="px-3 py-2 text-xs coding-text-soft">{d.recommendation || '—'}</td>
                    </tr>
                  ))}
                  {driverRollup.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-xs coding-text-soft">No drivers in this view.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Highest composite risk" subtitle="Top members ranked by composite score.">
            <div className="overflow-x-auto rounded-lg ring-1 ring-black/5 dark:ring-white/10">
              <table className="min-w-full text-sm">
                <thead className="coding-surface-subtle text-xs uppercase tracking-wide coding-text-muted">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Member</th>
                    <th className="text-left px-3 py-2 font-medium">Tier</th>
                    <th className="text-right px-3 py-2 font-medium">Composite</th>
                    <th className="text-right px-3 py-2 font-medium">Clinical</th>
                    <th className="text-right px-3 py-2 font-medium">Utilization</th>
                    <th className="text-right px-3 py-2 font-medium">Cost</th>
                    <th className="text-right px-3 py-2 font-medium">Engagement</th>
                    <th className="text-left px-3 py-2 font-medium">Next best action</th>
                  </tr>
                </thead>
                <tbody className="divide-y coding-divider">
                  {topMembers.map((m) => (
                    <tr
                      key={m.id}
                      className="cursor-pointer coding-hoverable"
                      onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${m.id}`)}
                    >
                      <td className="px-3 py-2">
                        <p className="coding-text-strong font-semibold">{m.first_name} {m.last_name}</p>
                        <p className="text-[11px] coding-text-muted">{m.member_key}</p>
                      </td>
                      <td className="px-3 py-2"><RiskBadge tier={m.risk_tier} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.risk_score_composite != null ? Number(m.risk_score_composite).toFixed(1) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.clinical_risk_score != null ? Number(m.clinical_risk_score).toFixed(1) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.utilization_risk_score != null ? Number(m.utilization_risk_score).toFixed(1) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.cost_risk_score != null ? Number(m.cost_risk_score).toFixed(1) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.engagement_risk_score != null ? Number(m.engagement_risk_score).toFixed(1) : '—'}</td>
                      <td className="px-3 py-2 text-xs coding-text-soft">{m.next_best_action || '—'}</td>
                    </tr>
                  ))}
                  {topMembers.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-6 text-center text-xs coding-text-soft">No members loaded.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </PortalPageLayout>
  );
};

export default Member360LabRiskIntelligencePage;
