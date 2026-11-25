import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import { fetchMember360Dashboard, updateMember360Task } from '../../../services/member360LabService';
import { LabSubNav, PriorityBadge, RiskBadge } from './components';
import KpiTile from '../../../components/ui/KpiTile';
import { usePermissions } from '../../../hooks/usePermissions';

const currencyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const COORDINATORS = [
  'Hannah Abbott, CCM',
  'Sarah Chen, RN',
  'Elena Rostova, RN',
  'Marcus Vance, MSW',
];

const EMAIL_TO_COORDINATOR = {
  'care.team@prominencehealth.com': 'Sarah Chen, RN',
  'coordinator@prominencehealth.com': 'Hannah Abbott, CCM',
  'elena.nurse@prominencehealth.com': 'Elena Rostova, RN',
  'dr.chen@prominencehealth.com': 'Sarah Chen, RN',
  'supervisor@prominencehealth.com': 'Marcus Vance, MSW',
};

const formatMetricValue = (m) => {
  if (m.key === 'estimated_savings' || m.key === 'validated_savings') {
    return currencyFmt.format(m.value || 0);
  }
  return new Intl.NumberFormat('en-US').format(m.value || 0);
};

const metricTone = (key) => {
  if (key === 'estimated_savings' || key === 'validated_savings') return 'success';
  if (key === 'high_risk' || key === 'critical_risk' || key === 'overdue_tasks') return 'critical';
  if (key === 'active_journeys' || key === 'open_tasks') return 'info';
  return 'neutral';
};

const ACTIVITY_DOT_TONE = {
  note: 'bg-sky-400',
  message: 'bg-violet-400',
  task: 'bg-amber-400',
  journey: 'bg-emerald-400',
};

const assignMemberCoordinator = (memberId) =>
  COORDINATORS[(Number(memberId) || 0) % COORDINATORS.length];

const Member360LabDashboard = () => {
  const navigate = useNavigate();
  const { token, tenant, user } = useContext(AuthContext) || {};
  const { currentRole, can } = usePermissions();
  const currentCoordinator =
    EMAIL_TO_COORDINATOR[(user?.email || '').toLowerCase()] || 'Hannah Abbott, CCM';

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [caseloadFilter, setCaseloadFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionBanner, setActionBanner] = useState(null);

  useEffect(() => {
    if (currentRole === 'payer_executive' || !can('menu:care_intelligence')) {
      navigate(ROUTES.MEMBER360_LAB.PLAN_PERFORMANCE, { replace: true });
    }
  }, [currentRole, can, navigate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMember360Dashboard(token, tenant)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, tenant, refreshKey]);

  const openMember = (id) => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${id}`);

  const handleKpiClick = (key) => {
    if (key === 'total_members') navigate(ROUTES.MEMBER360_LAB.MEMBERS);
    else if (key === 'high_risk') navigate(`${ROUTES.MEMBER360_LAB.MEMBERS}?tier=High`);
    else if (key === 'critical_risk') navigate(`${ROUTES.MEMBER360_LAB.MEMBERS}?tier=Critical`);
    else if (key === 'open_tasks') navigate(`${ROUTES.MEMBER360_LAB.TASKS}?view=open&status=open,in_progress`);
    else if (key === 'overdue_tasks') navigate(`${ROUTES.MEMBER360_LAB.TASKS}?view=overdue&due=overdue`);
    else if (key === 'active_journeys') navigate(ROUTES.MEMBER360_LAB.CARE_JOURNEYS);
    else if (key === 'estimated_savings' || key === 'validated_savings') navigate(ROUTES.MEMBER360_LAB.CARE_OPTIONS);
  };

  const filteredHighPriorityMembers = useMemo(() => {
    const list = data?.high_priority_members || [];
    return list.filter((m) => {
      const coord = assignMemberCoordinator(m.id);
      if (caseloadFilter !== 'all' && coord !== caseloadFilter) return false;
      if (tierFilter !== 'all' && (m.risk_tier || '').toLowerCase() !== tierFilter.toLowerCase()) return false;
      return true;
    });
  }, [data, caseloadFilter, tierFilter]);

  const filteredUpcomingActions = useMemo(() => {
    const list = data?.upcoming_actions || [];
    return list.filter((a) => {
      const coord = a.assigned_user || assignMemberCoordinator(a.member_id);
      if (caseloadFilter !== 'all' && coord !== caseloadFilter) return false;
      if (tierFilter !== 'all' && (a.risk_tier || '').toLowerCase() !== tierFilter.toLowerCase()) return false;
      return true;
    });
  }, [data, caseloadFilter, tierFilter]);

  const completeActionInline = async (actionItem) => {
    if (!actionItem?.task_id) {
      openMember(actionItem.member_id);
      return;
    }
    try {
      await updateMember360Task(token, tenant, actionItem.task_id, { status: 'completed' });
      setActionBanner(`Completed care action "${actionItem.next_action}" for ${actionItem.member_name}.`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || String(err));
    }
  };

  return (
    <PortalPageLayout
      eyebrow="Arc-8 Member360"
      title="Care Coordinator Intelligence Dashboard"
      subtitle="Risk stratification, coordinator caseloads, tasks, journeys, and savings — surfaced before nurses and coordinators ask."
      navItems={PORTAL_NAV_ITEMS}
      currentNav="member360-lab"
      navProps={{ align: 'center', tone: 'surface' }}
      align="left"
      maxWidthClassName="max-w-7xl"
      mainClassName="space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LabSubNav />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={caseloadFilter}
            onChange={(e) => setCaseloadFilter(e.target.value)}
            className="coding-input rounded-lg px-3 py-1.5 text-xs font-medium"
            aria-label="Coordinator Caseload Filter"
          >
            <option value="all">Caseload: All Care Coordinators</option>
            <option value={currentCoordinator}>My Caseload ({currentCoordinator})</option>
            {COORDINATORS.filter((c) => c !== currentCoordinator).map((c) => (
              <option key={c} value={c}>
                Caseload: {c}
              </option>
            ))}
          </select>
          <div className="inline-flex rounded-lg ring-1 coding-border overflow-hidden">
            {['all', 'Critical', 'High'].map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setTierFilter(tier)}
                className={`px-2.5 py-1.5 text-xs font-semibold transition ${
                  tierFilter === tier
                    ? 'bg-[var(--brand-primary)] text-white'
                    : 'coding-surface coding-text-strong hover:bg-[var(--coding-hover)]'
                }`}
              >
                {tier === 'all' ? 'All Tiers' : `${tier} Risk`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {actionBanner && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl ring-1 ring-emerald-200 dark:ring-emerald-700/40 bg-emerald-50/80 dark:bg-emerald-900/20 px-4 py-2.5 text-xs coding-text-strong"
        >
          <span>{actionBanner}</span>
          <button type="button" onClick={() => setActionBanner(null)} className="text-xs coding-text-muted">
            ✕
          </button>
        </div>
      )}

      {loading && <LoadingState title="Loading dashboard" description="Building the population & coordinator caseload view" />}
      {error && <ErrorState title="Dashboard unavailable" description={error} />}

      {data && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.metrics?.map((m) => (
              <div
                key={m.key}
                role="button"
                tabIndex={0}
                onClick={() => handleKpiClick(m.key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleKpiClick(m.key);
                  }
                }}
                className="cursor-pointer transition transform hover:-translate-y-0.5"
                title={`Drill down into ${m.label}`}
              >
                <KpiTile
                  label={m.label}
                  value={formatMetricValue(m)}
                  hint={`${m.hint || ''} · Click to drill down`}
                  tone={metricTone(m.key)}
                />
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <section className="coding-surface rounded-2xl shadow-sm overflow-hidden lg:col-span-2">
              <header className="flex items-start justify-between gap-3 px-5 py-3 border-b coding-border">
                <div>
                  <h3 className="text-sm font-semibold coding-text-strong">
                    High-priority members {caseloadFilter !== 'all' ? `— ${caseloadFilter}` : ''}
                  </h3>
                  <p className="text-xs coding-text-soft">Sorted by composite risk score (0.0–10.0 scale).</p>
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
                      <th className="text-left px-3 py-2.5 font-semibold">Coordinator</th>
                      <th className="text-right px-3 py-2.5 font-semibold">Gaps</th>
                      <th className="text-right px-3 py-2.5 font-semibold">Journey</th>
                      <th className="text-left px-3 py-2.5 font-semibold">Next best action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHighPriorityMembers.map((m) => (
                      <tr
                        key={m.id}
                        className="cursor-pointer border-b coding-border-subtle hover:bg-[var(--coding-hover)] transition"
                        onClick={() => openMember(m.id)}
                      >
                        <td className="px-4 py-3">
                          <p className="coding-text-strong font-medium">
                            {m.first_name} {m.last_name}
                          </p>
                          <p className="text-[11px] coding-text-muted">
                            {m.member_key} · {m.plan_name}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <RiskBadge tier={m.risk_tier} score={m.risk_score_composite} />
                        </td>
                        <td className="px-3 py-3 text-xs coding-text-soft">{assignMemberCoordinator(m.id)}</td>
                        <td className="px-3 py-3 text-right tabular-nums coding-text-strong">{m.open_care_gaps ?? 0}</td>
                        <td className="px-3 py-3 text-right tabular-nums coding-text-strong">{m.active_journey_count ?? 0}</td>
                        <td className="px-3 py-3 text-xs coding-text-soft">{m.next_best_action || '—'}</td>
                      </tr>
                    ))}
                    {filteredHighPriorityMembers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-12 text-center text-sm coding-text-soft">
                          No high-priority members match the selected caseload filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="coding-surface rounded-2xl shadow-sm p-5">
              <header className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold coding-text-strong">Top risk drivers</h3>
                  <p className="text-xs coding-text-soft">Highest average score across population.</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.MEMBER360_LAB.RISK_STRATIFICATION)}
                  className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
                >
                  Explore →
                </button>
              </header>
              <ul className="space-y-2">
                {(data.top_risk_drivers || []).map((d) => (
                  <li
                    key={`${d.domain}-${d.driver}`}
                    onClick={() => navigate(ROUTES.MEMBER360_LAB.RISK_STRATIFICATION)}
                    className="coding-surface-subtle rounded-md px-3 py-2 cursor-pointer hover:ring-1 hover:ring-[var(--brand-primary)]/40 transition"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold coding-text-strong">{d.domain}</span>
                      <span className="tabular-nums coding-text-muted">
                        Avg {d.average_score.toFixed(1)} · {d.member_count} members
                      </span>
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
              <header className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold coding-text-strong">Recent clinical & outreach activity</h3>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.MEMBER360_LAB.MESSAGES)}
                  className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
                >
                  Communication Log →
                </button>
              </header>
              <ol className="space-y-3">
                {(data.recent_activity || []).map((a, idx) => (
                  <li
                    key={idx}
                    onClick={() => a.member_id && openMember(a.member_id)}
                    className="flex gap-3 cursor-pointer hover:opacity-90"
                  >
                    <div className="flex flex-col items-center">
                      <span
                        className={`mt-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                          ACTIVITY_DOT_TONE[a.kind] || 'bg-slate-400'
                        }`}
                      />
                      <span className="flex-1 w-px bg-slate-200 dark:bg-slate-700 mt-1" />
                    </div>
                    <div className="flex-1 pb-2">
                      <p className="text-sm coding-text-strong font-medium hover:text-[var(--brand-primary)]">
                        {a.member_name}
                      </p>
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
              <header className="px-5 py-3 border-b coding-border flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold coding-text-strong">Upcoming care actions</h3>
                  <p className="text-xs coding-text-soft">Open coordinator tasks sorted by due date.</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.MEMBER360_LAB.TASKS)}
                  className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
                >
                  Worklist →
                </button>
              </header>
              <ul>
                {filteredUpcomingActions.map((a, idx) => (
                  <li key={a.task_id || idx} className="border-b coding-border-subtle px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => openMember(a.member_id)}
                          className="coding-text-strong font-medium hover:text-[var(--brand-primary)] hover:underline"
                        >
                          {a.member_name}
                        </button>
                        {a.priority && <PriorityBadge priority={a.priority} />}
                        <RiskBadge tier={a.risk_tier} />
                      </div>
                      <p className="text-xs coding-text-soft truncate mt-0.5">{a.next_action}</p>
                      <p className="text-[11px] coding-text-muted mt-0.5">
                        {a.assigned_user || assignMemberCoordinator(a.member_id)} · Due {a.due_date || 'No due date'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {a.task_id && (
                        <button
                          type="button"
                          onClick={() => completeActionInline(a)}
                          className="rounded-md bg-emerald-600 text-white px-2.5 py-1 text-xs font-semibold hover:bg-emerald-700"
                        >
                          Complete
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openMember(a.member_id)}
                        className="rounded-md ring-1 coding-border coding-text-strong px-2.5 py-1 text-xs font-semibold hover:bg-[var(--coding-hover)]"
                      >
                        Open
                      </button>
                    </div>
                  </li>
                ))}
                {filteredUpcomingActions.length === 0 && (
                  <li className="px-5 py-12 text-center text-sm coding-text-soft">
                    No upcoming actions match the selected caseload filter.
                  </li>
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
