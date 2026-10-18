import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import { fetchMember360Dashboard } from '../../../services/member360LabService';
import { LabSubNav, RiskBadge } from './components';
import KpiTile from '../../../components/ui/KpiTile';

const currencyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const formatMetricValue = (m) => {
  if (m.key === 'estimated_savings' || m.key === 'validated_savings') {
    return currencyFmt.format(m.value || 0);
  }
  return new Intl.NumberFormat('en-US').format(m.value || 0);
};

const metricTone = (key) => {
  if (key === 'estimated_savings' || key === 'validated_savings') return 'success';
  if (key === 'high_risk_members' || key === 'overdue_tasks') return 'critical';
  if (key === 'active_journeys' || key === 'open_tasks') return 'info';
  return 'neutral';
};

const ACTIVITY_DOT_TONE = {
  note: 'bg-sky-400',
  message: 'bg-violet-400',
  task: 'bg-amber-400',
  journey: 'bg-emerald-400',
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
      <LabSubNav />

      {loading && <LoadingState title="Loading dashboard" description="Building the population view" />}
      {error && <ErrorState title="Dashboard unavailable" description={error} />}

      {data && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.metrics?.map((m) => (
              <KpiTile
                key={m.key}
                label={m.label}
                value={formatMetricValue(m)}
                hint={m.hint}
                tone={metricTone(m.key)}
              />
            ))}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <section className="coding-surface rounded-2xl shadow-sm overflow-hidden lg:col-span-2">
              <header className="flex items-start justify-between gap-3 px-5 py-3 border-b coding-border">
                <div>
                  <h3 className="text-sm font-semibold coding-text-strong">High-priority members</h3>
                  <p className="text-xs coding-text-soft">Sorted by composite risk score.</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.MEMBER360_LAB.MEMBERS)}
                  className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
                >
                  View all →
                </button>
              </header>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider coding-text-muted">
                    <tr className="border-b coding-border">
                      <th className="text-left px-4 py-2.5 font-semibold">Member</th>
                      <th className="text-left px-3 py-2.5 font-semibold">Risk</th>
                      <th className="text-right px-3 py-2.5 font-semibold">Gaps</th>
                      <th className="text-right px-3 py-2.5 font-semibold">Journey</th>
                      <th className="text-left px-3 py-2.5 font-semibold">Next best action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.high_priority_members || []).map((m) => (
                      <tr
                        key={m.id}
                        className="cursor-pointer border-b coding-border-subtle hover:bg-[var(--coding-hover)] transition"
                        onClick={() => openMember(m.id)}
                      >
                        <td className="px-4 py-3">
                          <p className="coding-text-strong font-medium">{m.first_name} {m.last_name}</p>
                          <p className="text-[11px] coding-text-muted">{m.member_key} · {m.plan_name}</p>
                        </td>
                        <td className="px-3 py-3"><RiskBadge tier={m.risk_tier} score={m.risk_score_composite} /></td>
                        <td className="px-3 py-3 text-right tabular-nums coding-text-strong">{m.open_care_gaps ?? 0}</td>
                        <td className="px-3 py-3 text-right tabular-nums coding-text-strong">{m.active_journey_count ?? 0}</td>
                        <td className="px-3 py-3 text-xs coding-text-soft">{m.next_best_action || '—'}</td>
                      </tr>
                    ))}
                    {(data.high_priority_members || []).length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-12 text-center text-sm coding-text-soft">No high-priority members.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="coding-surface rounded-2xl shadow-sm p-5">
              <header className="mb-3">
                <h3 className="text-sm font-semibold coding-text-strong">Top risk drivers</h3>
                <p className="text-xs coding-text-soft">Highest average score across population.</p>
              </header>
              <ul className="space-y-2">
                {(data.top_risk_drivers || []).map((d) => (
                  <li key={`${d.domain}-${d.driver}`} className="coding-surface-subtle rounded-md px-3 py-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold coding-text-strong">{d.domain}</span>
                      <span className="tabular-nums coding-text-muted">Avg {d.average_score.toFixed(1)} · {d.member_count} members</span>
                    </div>
                    <p className="text-sm coding-text-strong mt-0.5">{d.driver}</p>
                  </li>
                ))}
                {(data.top_risk_drivers || []).length === 0 && (
                  <li className="text-xs coding-text-soft italic">No drivers computed yet.</li>
                )}
              </ul>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="coding-surface rounded-2xl shadow-sm p-5">
              <header className="mb-3">
                <h3 className="text-sm font-semibold coding-text-strong">Recent activity</h3>
              </header>
              <ol className="space-y-3">
                {(data.recent_activity || []).map((a, idx) => (
                  <li key={idx} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${ACTIVITY_DOT_TONE[a.kind] || 'bg-slate-400'}`} />
                      <span className="flex-1 w-px bg-slate-200 dark:bg-slate-700 mt-1" />
                    </div>
                    <div className="flex-1 pb-2">
                      <p className="text-sm coding-text-strong font-medium">{a.member_name}</p>
                      <p className="text-xs coding-text-soft">{a.summary}</p>
                      <p className="text-[10px] coding-text-muted mt-0.5">{new Date(a.timestamp).toLocaleString()}</p>
                    </div>
                  </li>
                ))}
                {(data.recent_activity || []).length === 0 && (
                  <li className="text-xs coding-text-soft italic">Activity will appear here as the team works.</li>
                )}
              </ol>
            </section>

            <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
              <header className="px-5 py-3 border-b coding-border">
                <h3 className="text-sm font-semibold coding-text-strong">Upcoming care actions</h3>
                <p className="text-xs coding-text-soft">Open tasks sorted by due date.</p>
              </header>
              <ul>
                {(data.upcoming_actions || []).map((a, idx) => (
                  <li key={idx} className="border-b coding-border-subtle px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => openMember(a.member_id)}
                        className="coding-text-strong font-medium hover:text-[var(--brand-primary)] hover:underline"
                      >
                        {a.member_name}
                      </button>
                      <p className="text-xs coding-text-soft truncate">{a.next_action}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <RiskBadge tier={a.risk_tier} />
                      <p className="text-[11px] coding-text-muted mt-1">{a.due_date || 'No due date'}</p>
                    </div>
                  </li>
                ))}
                {(data.upcoming_actions || []).length === 0 && (
                  <li className="px-5 py-12 text-center text-sm coding-text-soft">No upcoming actions.</li>
                )}
              </ul>
            </section>
          </div>
        </>
      )}
    </PortalPageLayout>
  );
};

export default Member360LabDashboard;
