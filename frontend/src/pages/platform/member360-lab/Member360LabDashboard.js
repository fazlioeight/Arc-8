import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import { fetchMember360Dashboard } from '../../../services/member360LabService';
import { MetricCard, RiskBadge, SectionCard } from './components';

const currencyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const formatMetricValue = (m) => {
  if (m.key === 'estimated_savings' || m.key === 'validated_savings') {
    return currencyFmt.format(m.value || 0);
  }
  return new Intl.NumberFormat('en-US').format(m.value || 0);
};

const Member360LabDashboard = () => {
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMember360Dashboard(token, tenant)
      .then((res) => { if (!cancelled) { setData(res); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, tenant]);

  const openMember = (id) => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${id}`);

  return (
    <PortalPageLayout
      eyebrow="Nexora Lab Member360"
      title="Care intelligence dashboard"
      subtitle="Risk, tasks, journeys, and savings — surfaced before nurses and coordinators ask."
      navItems={PORTAL_NAV_ITEMS}
      currentNav="member360-lab"
      navProps={{ align: 'center', tone: 'surface' }}
      align="left"
      maxWidthClassName="max-w-7xl"
      mainClassName="space-y-6"
    >
      {loading && <LoadingState title="Loading dashboard" description="Building the population view" />}
      {error && <ErrorState title="Dashboard unavailable" description={error} />}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.metrics?.map((m) => (
              <MetricCard
                key={m.key}
                label={m.label}
                value={formatMetricValue(m)}
                hint={m.hint}
                accent={['estimated_savings', 'validated_savings'].includes(m.key) ? 'currency' : undefined}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SectionCard
              title="High-priority members"
              subtitle="Sorted by composite risk score."
              action={
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.MEMBER360_LAB.MEMBERS)}
                  className="text-xs font-semibold coding-text-strong hover:opacity-80"
                >
                  View all →
                </button>
              }
              className="lg:col-span-2"
            >
              <div className="overflow-hidden rounded-lg ring-1 ring-black/5 dark:ring-white/10">
                <table className="min-w-full text-sm">
                  <thead className="coding-surface-subtle text-xs uppercase tracking-wide coding-text-muted">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Member</th>
                      <th className="text-left px-3 py-2 font-medium">Risk</th>
                      <th className="text-left px-3 py-2 font-medium">Gaps</th>
                      <th className="text-left px-3 py-2 font-medium">Journey</th>
                      <th className="text-left px-3 py-2 font-medium">Next best action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y coding-divider">
                    {(data.high_priority_members || []).map((m) => (
                      <tr
                        key={m.id}
                        className="cursor-pointer coding-hoverable transition"
                        onClick={() => openMember(m.id)}
                      >
                        <td className="px-3 py-2">
                          <p className="coding-text-strong font-semibold">{m.first_name} {m.last_name}</p>
                          <p className="text-[11px] coding-text-muted">{m.member_key} · {m.plan_name}</p>
                        </td>
                        <td className="px-3 py-2"><RiskBadge tier={m.risk_tier} score={m.risk_score_composite} /></td>
                        <td className="px-3 py-2 tabular-nums">{m.open_care_gaps ?? 0}</td>
                        <td className="px-3 py-2 tabular-nums">{m.active_journey_count ?? 0}</td>
                        <td className="px-3 py-2 coding-text-soft">{m.next_best_action || '—'}</td>
                      </tr>
                    ))}
                    {(data.high_priority_members || []).length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-xs coding-text-soft">No high-priority members.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard title="Top risk drivers" subtitle="Highest average score across population.">
              <ul className="space-y-2">
                {(data.top_risk_drivers || []).map((d) => (
                  <li key={`${d.domain}-${d.driver}`} className="coding-surface-subtle rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold coding-text-strong">{d.domain}</span>
                      <span className="tabular-nums coding-text-muted">Avg {d.average_score.toFixed(1)} · {d.member_count} members</span>
                    </div>
                    <p className="text-sm coding-text-strong">{d.driver}</p>
                  </li>
                ))}
                {(data.top_risk_drivers || []).length === 0 && (
                  <li className="text-xs coding-text-soft">No drivers computed yet.</li>
                )}
              </ul>
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Recent activity">
              <ul className="space-y-2">
                {(data.recent_activity || []).map((a, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm">
                    <span className={`mt-1.5 h-2 w-2 rounded-full ${a.kind === 'note' ? 'bg-sky-400' : 'bg-violet-400'}`} />
                    <div className="flex-1">
                      <p className="coding-text-strong">{a.member_name}</p>
                      <p className="text-xs coding-text-soft">{a.summary}</p>
                      <p className="text-[10px] coding-text-muted">{new Date(a.timestamp).toLocaleString()}</p>
                    </div>
                  </li>
                ))}
                {(data.recent_activity || []).length === 0 && (
                  <li className="text-xs coding-text-soft">Activity will appear here as the team works.</li>
                )}
              </ul>
            </SectionCard>

            <SectionCard title="Upcoming care actions" subtitle="Open tasks sorted by due date.">
              <ul className="divide-y coding-divider">
                {(data.upcoming_actions || []).map((a, idx) => (
                  <li key={idx} className="py-2 flex items-center justify-between gap-3 text-sm">
                    <div>
                      <button
                        type="button"
                        onClick={() => openMember(a.member_id)}
                        className="coding-text-strong font-semibold hover:underline"
                      >
                        {a.member_name}
                      </button>
                      <p className="text-xs coding-text-soft">{a.next_action}</p>
                    </div>
                    <div className="text-right">
                      <RiskBadge tier={a.risk_tier} />
                      <p className="text-[11px] coding-text-muted">{a.due_date || 'No due date'}</p>
                    </div>
                  </li>
                ))}
                {(data.upcoming_actions || []).length === 0 && (
                  <li className="text-xs coding-text-soft py-2">No upcoming actions.</li>
                )}
              </ul>
            </SectionCard>
          </div>
        </>
      )}
    </PortalPageLayout>
  );
};

export default Member360LabDashboard;
