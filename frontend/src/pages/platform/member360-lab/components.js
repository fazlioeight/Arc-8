import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ROUTES } from '../../../constants/routes';
import SharedRecordHeader from '../../../components/ui/RecordHeader';
import SharedWorkspaceTabs from '../../../components/ui/WorkspaceTabs';
import SharedWorkspaceDrawer from '../../../components/ui/WorkspaceDrawer';
import { PropertyRow as SharedPropertyRow, PropertySection } from '../../../components/ui/PropertyList';
import { usePermissions } from '../../../hooks/usePermissions';

// Re-export the generic primitives so existing imports from this module
// continue to work. New consumers should import from /components/ui directly.
export const WorkspaceTabs = SharedWorkspaceTabs;
export const WorkspaceDrawer = SharedWorkspaceDrawer;

const joinClass = (...parts) => parts.filter(Boolean).join(' ');

export const LAB_SUB_NAV = [
  { key: 'dashboard', label: 'Dashboard', href: ROUTES.MEMBER360_LAB.DASHBOARD, exact: true, permission: 'menu:care_intelligence' },
  { key: 'members', label: 'Members', href: ROUTES.MEMBER360_LAB.MEMBERS, prefix: ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT, permission: 'menu:patient_roster' },
  { key: 'tasks', label: 'Tasks', href: ROUTES.MEMBER360_LAB.TASKS, permission: 'menu:tasks' },
  { key: 'care_journeys', label: 'Care Journeys', href: ROUTES.MEMBER360_LAB.CARE_JOURNEYS, permission: 'menu:care_journeys' },
  { key: 'risk', label: 'Risk Intelligence', href: ROUTES.MEMBER360_LAB.RISK_INTELLIGENCE, permission: 'menu:risk_intelligence' },
  { key: 'care_options', label: 'Care Options', href: ROUTES.MEMBER360_LAB.CARE_OPTIONS, permission: 'menu:care_options' },
  { key: 'messages', label: 'Messages', href: ROUTES.MEMBER360_LAB.MESSAGES, permission: 'menu:messages' },
  { key: 'documents', label: 'Documents', href: ROUTES.MEMBER360_LAB.DOCUMENTS, permission: 'menu:documents' },
  { key: 'admin', label: 'Admin', href: ROUTES.MEMBER360_LAB.ADMIN, permission: 'menu:master_admin', adminOnly: true },
];

export function LabSubNav() {
  const { pathname } = useLocation();
  const { can, isAdmin } = usePermissions();

  const visibleItems = LAB_SUB_NAV.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.permission && !can(item.permission)) return false;
    return true;
  });

  return (
    <nav className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-900/80 border border-slate-800/80 shadow-sm mb-4">
      {visibleItems.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`) ||
            (item.prefix && (pathname === item.prefix || pathname.startsWith(`${item.prefix}/`)));
        return (
          <Link
            key={item.key}
            to={item.href}
            className={joinClass(
              'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
              active
                ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

const RISK_TIER_STYLES = {
  Critical: 'bg-rose-100 text-rose-800 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:ring-rose-700/50',
  High: 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700/50',
  Moderate: 'bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:ring-sky-700/50',
  Low: 'bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-700/50',
};

const PRIORITY_STYLES = {
  urgent: 'bg-rose-100 text-rose-800 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-200',
  high: 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200',
  medium: 'bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-900/30 dark:text-sky-200',
  low: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-200',
};

const STATUS_STYLES = {
  open: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200',
  in_progress: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200',
  waiting: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
  escalated: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200',
};

const normalizeRiskTier = (tier) => {
  if (!tier) return 'Unknown';
  const lower = String(tier).trim().toLowerCase();
  if (lower === 'critical' || lower === 'complex') return 'Critical';
  if (lower === 'high') return 'High';
  if (lower === 'moderate' || lower === 'rising' || lower === 'medium') return 'Moderate';
  if (lower === 'low') return 'Low';
  return tier;
};

export function parseUtcDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const str = String(value).trim();
  if (!str) return null;
  // Date-only ISO string (YYYY-MM-DD): treat as local calendar date so it never shifts backward by 1 day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(`${str}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Naive ISO datetime from server (UTC without Z/offset): append 'Z' so browser converts UTC -> local time.
  const normalized =
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(str) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(str)
      ? `${str.replace(' ', 'T')}Z`
      : str;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatLocalDateTime(value) {
  const d = parseUtcDate(value);
  if (!d) return value || '—';
  return d.toLocaleString();
}

export function RiskBadge({ tier, score }) {
  const canonical = normalizeRiskTier(tier);
  const style = RISK_TIER_STYLES[canonical] || RISK_TIER_STYLES.Low;
  return (
    <span className={joinClass('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1', style)}>
      <span className="font-semibold">{canonical}</span>
      {typeof score === 'number' && (
        <span className="opacity-80 font-normal">{score.toFixed(1)}</span>
      )}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  const style = PRIORITY_STYLES[priority?.toLowerCase?.()] || PRIORITY_STYLES.medium;
  return (
    <span className={joinClass('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1', style)}>
      {priority || 'medium'}
    </span>
  );
}

export function TaskStatusBadge({ status }) {
  const normalized = status?.toLowerCase?.();
  const style = STATUS_STYLES[normalized] || STATUS_STYLES.open;
  return (
    <span className={joinClass('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', style)}>
      {status || 'open'}
    </span>
  );
}

export function MetricCard({ label, value, hint, accent }) {
  return (
    <div className="coding-surface rounded-2xl p-4 border border-transparent shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] coding-text-muted">{label}</p>
      <p className={joinClass('mt-2 text-2xl font-semibold coding-text-strong', accent === 'currency' && 'tabular-nums')}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs coding-text-soft">{hint}</p>}
    </div>
  );
}

export function SectionCard({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={joinClass('coding-surface rounded-2xl p-5 shadow-sm', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            {title && <h3 className="text-sm font-semibold coding-text-strong">{title}</h3>}
            {subtitle && <p className="text-xs coding-text-soft">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Member-flavoured wrapper around the shared RecordHeader primitive. Keeps the
 * existing call-site signature (member, gapCount, onBack/onDashboard, etc.)
 * while delegating layout to the generic component.
 */
export function RecordHeader({ member, gapCount, onAction, actions = [], onBack, onDashboard, pcpHref, pcpState }) {
  if (!member) return null;
  const fullName = [member.first_name, member.last_name].filter(Boolean).join(' ') || member.member_key;
  const meta = [
    member.member_key,
    member.plan_name,
    member.age != null ? `Age ${member.age}` : null,
    member.gender,
    member.line_of_business,
  ];
  const pcpValue = member.primary_care_provider;
  const link = pcpHref && pcpValue ? (
    <>
      <span>PCP </span>
      <Link to={pcpHref} state={pcpState} className="font-medium text-[var(--brand-primary)] hover:underline">
        {pcpValue}
      </Link>
    </>
  ) : null;

  const badges = (
    <>
      <RiskBadge tier={member.risk_tier} score={member.risk_score_composite} />
      {gapCount != null && gapCount > 0 && (
        <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 ring-1 ring-amber-200 px-2 py-0.5 text-[11px] font-semibold dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700/40">
          {gapCount} gap{gapCount === 1 ? '' : 's'}
        </span>
      )}
    </>
  );

  const rightSlot = (onBack || onDashboard) ? (
    <>
      {onBack && (
        <button type="button" onClick={onBack} className="rounded-md ring-1 coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)] px-2.5 py-1.5 text-xs font-semibold">
          Members
        </button>
      )}
      {onDashboard && (
        <button type="button" onClick={onDashboard} className="rounded-md ring-1 coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)] px-2.5 py-1.5 text-xs font-semibold">
          Dashboard
        </button>
      )}
    </>
  ) : null;

  return (
    <SharedRecordHeader
      title={fullName}
      meta={meta}
      link={link}
      badges={badges}
      actions={actions}
      onAction={onAction}
      rightSlot={rightSlot}
    />
  );
}

export function MemberSummaryCard({ member, pcpHref, pcpState, onSaveField }) {
  if (!member) return null;
  const pcpValue = member.primary_care_provider;
  const pcpNode = pcpHref && pcpValue ? (
    <Link to={pcpHref} state={pcpState} className="text-[var(--brand-primary)] hover:underline">
      {pcpValue}
    </Link>
  ) : pcpValue;
  const cityValue = member.address_city ? `${member.address_city}, ${member.address_state || ''}` : null;

  // When onSaveField is supplied, build per-row save handlers. Without it,
  // rows render as visual-only (editable pencil affordance but no commit).
  const save = (field) => onSaveField
    ? (value) => onSaveField(field, value === '' ? null : value)
    : undefined;

  const channelOptions = ['', 'SMS', 'Chat', 'Secure Message', 'Email', 'Phone', 'Internal'];

  return (
    <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
      <header className="px-4 py-2.5 border-b coding-border flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] coding-text-muted">About this member</h3>
      </header>
      <dl>
        <SharedPropertyRow label="Plan" value={member.plan_name} onEdit={save('plan_name')} editable />
        <SharedPropertyRow label="Line of business" value={member.line_of_business} onEdit={save('line_of_business')} editable />
        <SharedPropertyRow label="Phone" value={member.phone} type="tel" onEdit={save('phone')} editable />
        <SharedPropertyRow
          label="Email"
          value={member.email}
          type="email"
          validate={(v) => v && !/.+@.+\..+/.test(v) ? 'Enter a valid email' : null}
          onEdit={save('email')}
          editable
        />
        <SharedPropertyRow
          label="PCP"
          value={pcpNode}
          editValue={pcpValue || ''}
          onEdit={save('primary_care_provider')}
          editable
        />
        <SharedPropertyRow
          label="Channel"
          value={member.preferred_channel}
          editValue={member.preferred_channel || ''}
          type="select"
          options={channelOptions}
          onEdit={save('preferred_channel')}
          editable
        />
        <SharedPropertyRow label="Language" value={member.preferred_language} onEdit={save('preferred_language')} editable />
        <SharedPropertyRow
          label="City"
          value={cityValue}
          editValue={member.address_city || ''}
          onEdit={save('address_city')}
          editable
        />
      </dl>

      <PropertySection title="Quick stats">
        <div className="grid grid-cols-2 gap-2 p-3">
          <Stat label="Care gaps" value={member.open_care_gaps ?? 0} />
          <Stat label="Open tasks" value={member.open_task_count ?? 0} />
          <Stat label="Active journeys" value={member.active_journey_count ?? 0} />
          <Stat label="Composite risk" value={member.risk_score_composite != null ? Number(member.risk_score_composite).toFixed(1) : '—'} />
        </div>
      </PropertySection>

      <PropertySection title="Risk dimensions">
        <div className="grid grid-cols-2 gap-2 p-3">
          <RiskMini label="Clinical" value={member.clinical_risk_score} />
          <RiskMini label="Utilization" value={member.utilization_risk_score} />
          <RiskMini label="Cost" value={member.cost_risk_score} />
          <RiskMini label="Engagement" value={member.engagement_risk_score} />
        </div>
      </PropertySection>
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="coding-surface-subtle rounded-lg px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider coding-text-muted">{label}</p>
      <p className="text-base font-semibold coding-text-strong">{value}</p>
    </div>
  );
}

function RiskMini({ label, value }) {
  const score = value != null ? Number(value) : null;
  let tone = 'bg-slate-200 dark:bg-slate-700';
  if (score != null) {
    if (score >= 8) tone = 'bg-rose-400';
    else if (score >= 6) tone = 'bg-amber-400';
    else if (score >= 4) tone = 'bg-sky-400';
    else tone = 'bg-emerald-400';
  }
  return (
    <div className="coding-surface-subtle rounded-lg px-2 py-2 text-center">
      <p className="text-[10px] uppercase tracking-wider coding-text-muted">{label}</p>
      <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200/50 dark:bg-slate-600/40 overflow-hidden">
        <div className={joinClass('h-full', tone)} style={{ width: `${Math.min((score || 0) * 10, 100)}%` }} />
      </div>
      <p className="mt-1 text-xs font-semibold coding-text-strong tabular-nums">{score != null ? score.toFixed(1) : '—'}</p>
    </div>
  );
}

export function RiskInsightsCard({ member, insights = [] }) {
  return (
    <SectionCard title="Risk insights" subtitle="Composite score and key drivers behind the recommendation.">
      <div className="space-y-3">
        <div className="flex items-baseline gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider coding-text-muted">Composite</p>
            <p className="text-3xl font-semibold coding-text-strong tabular-nums">
              {member?.risk_score_composite != null ? Number(member.risk_score_composite).toFixed(1) : '—'}
            </p>
          </div>
          <RiskBadge tier={member?.risk_tier} />
        </div>
        <ul className="space-y-2">
          {insights.map((insight) => (
            <li key={insight.id} className="coding-surface-subtle rounded-lg px-3 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold coding-text-strong">{insight.domain}</span>
                <span className="tabular-nums coding-text-muted">
                  {Number(insight.score || 0).toFixed(1)}
                  {insight.confidence != null && ` · ${(insight.confidence * 100).toFixed(0)}% confidence`}
                </span>
              </div>
              <p className="mt-1 text-sm coding-text-strong">{insight.driver}</p>
              <p className="text-xs coding-text-soft">{insight.recommendation}</p>
            </li>
          ))}
          {insights.length === 0 && (
            <li className="text-xs coding-text-soft">No insights computed.</li>
          )}
        </ul>
      </div>
    </SectionCard>
  );
}

const TRIAGE_QUESTIONS = [
  { key: 'q1', label: 'Why is the member calling?', type: 'text', placeholder: 'e.g. MRI ordered for shoulder' },
  { key: 'q2', label: 'Is this urgent?', type: 'choice', options: ['No', 'Yes'] },
  { key: 'q3', label: 'Is there an active care gap?', type: 'choice', options: ['Unknown', 'Yes', 'No'] },
  { key: 'q4', label: 'Is there a steerage opportunity?', type: 'choice', options: ['Unknown', 'Yes', 'No'] },
  { key: 'q5', label: 'Is a lower-cost / high-quality provider option available?', type: 'choice', options: ['Unknown', 'Yes', 'No'] },
];

export function GuidedTriagePanel({ member, onAction }) {
  const [answers, setAnswers] = React.useState({});
  const [recommendation, setRecommendation] = React.useState(null);

  const update = (key, value) => setAnswers((prev) => ({ ...prev, [key]: value }));

  const computeRecommendation = () => {
    const urgent = answers.q2 === 'Yes';
    const steerage = answers.q4 === 'Yes' || answers.q5 === 'Yes';
    const gap = answers.q3 === 'Yes';
    const reason = answers.q1 || 'Member contact';
    let action;
    let summary;
    if (urgent) {
      action = 'create_task_urgent';
      summary = `Create urgent task for "${reason}". Escalate to RN if not reachable within 1 hour.`;
    } else if (steerage) {
      action = 'create_care_option';
      summary = `Build care option report for "${reason}". Highlight savings and member-facing explanation.`;
    } else if (gap) {
      action = 'start_journey';
      summary = `Start care journey to close the open gap for "${reason}".`;
    } else {
      action = 'send_message';
      summary = `Send outreach via ${member?.preferred_channel || 'preferred channel'} regarding "${reason}".`;
    }
    setRecommendation({ action, summary });
  };

  return (
    <SectionCard title="Guided triage" subtitle="Surface the next best action before the call ends.">
      <div className="space-y-3">
        {TRIAGE_QUESTIONS.map((q) => (
          <div key={q.key}>
            <label className="block text-xs font-semibold coding-text-muted mb-1">{q.label}</label>
            {q.type === 'text' ? (
              <input
                type="text"
                placeholder={q.placeholder}
                value={answers[q.key] || ''}
                onChange={(e) => update(q.key, e.target.value)}
                className="coding-input w-full rounded-lg px-2 py-1.5 text-sm"
              />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((opt) => {
                  const selected = answers[q.key] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => update(q.key, opt)}
                      className={joinClass(
                        'rounded-full px-2.5 py-1 text-xs ring-1 transition',
                        selected
                          ? 'bg-[var(--brand-primary)] text-white ring-[var(--brand-primary)]'
                          : 'coding-surface-subtle coding-text-strong ring-black/5 dark:ring-white/10 hover:opacity-80'
                      )}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={computeRecommendation}
          className="w-full inline-flex items-center justify-center rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90"
        >
          Compute next best action
        </button>

        {recommendation && (
          <div className="rounded-lg ring-1 ring-emerald-200 dark:ring-emerald-700/40 bg-emerald-50/60 dark:bg-emerald-900/20 px-3 py-2 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Recommended next action</p>
            <p className="text-sm coding-text-strong">{recommendation.summary}</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => onAction?.('create_task', { recommendation })} className="rounded-md px-2 py-1 text-xs font-semibold bg-white dark:bg-slate-800 coding-text-strong ring-1 ring-emerald-200 dark:ring-emerald-700/40 hover:opacity-80">Create task</button>
              <button type="button" onClick={() => onAction?.('start_journey', { recommendation })} className="rounded-md px-2 py-1 text-xs font-semibold bg-white dark:bg-slate-800 coding-text-strong ring-1 ring-emerald-200 dark:ring-emerald-700/40 hover:opacity-80">Start journey</button>
              <button type="button" onClick={() => onAction?.('recommend_care_option', { recommendation })} className="rounded-md px-2 py-1 text-xs font-semibold bg-white dark:bg-slate-800 coding-text-strong ring-1 ring-emerald-200 dark:ring-emerald-700/40 hover:opacity-80">Recommend care option</button>
              <button type="button" onClick={() => onAction?.('send_message', { recommendation })} className="rounded-md px-2 py-1 text-xs font-semibold bg-white dark:bg-slate-800 coding-text-strong ring-1 ring-emerald-200 dark:ring-emerald-700/40 hover:opacity-80">Send message</button>
              <button type="button" onClick={() => onAction?.('escalate', { recommendation })} className="rounded-md px-2 py-1 text-xs font-semibold bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-200 ring-1 ring-rose-200 dark:ring-rose-700/40 hover:opacity-80">Escalate</button>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

export function CareOptionCard({ option, onAccept }) {
  return (
    <div className="coding-surface-subtle rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider coding-text-muted">{option.service_type}</p>
          <p className="text-sm font-semibold coding-text-strong">{option.recommended_provider || option.facility_name}</p>
        </div>
        <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-semibold ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-700/40">
          Save ${Math.round(option.potential_savings || 0)}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div><p className="coding-text-muted">Cost</p><p className="coding-text-strong tabular-nums">${Math.round(option.cost_estimate || 0)}</p></div>
        <div><p className="coding-text-muted">Quality</p><p className="coding-text-strong tabular-nums">{option.quality_score != null ? option.quality_score.toFixed(1) : '—'}</p></div>
        <div><p className="coding-text-muted">Distance</p><p className="coding-text-strong tabular-nums">{option.distance_miles != null ? `${option.distance_miles} mi` : '—'}</p></div>
      </div>
      <p className="text-xs coding-text-soft">{option.rationale}</p>
      {option.member_facing_explanation && (
        <div className="rounded-md bg-sky-50 dark:bg-sky-900/20 ring-1 ring-sky-200 dark:ring-sky-700/40 px-2 py-1.5">
          <p className="text-[10px] uppercase tracking-wider text-sky-700 dark:text-sky-300">Member-facing explanation</p>
          <p className="text-xs coding-text-strong">{option.member_facing_explanation}</p>
        </div>
      )}
      {onAccept && (
        <button type="button" onClick={() => onAccept(option)} className="text-xs font-semibold rounded-md bg-[var(--brand-primary)] text-white px-2 py-1 hover:opacity-90">
          Send to member
        </button>
      )}
    </div>
  );
}

export function SavingsCard({ savings = [] }) {
  if (!savings.length) {
    return (
      <SectionCard title="Collaborative care savings">
        <p className="text-xs coding-text-soft">No savings opportunities tracked yet.</p>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Collaborative care savings" subtitle="Steered cost, savings claimed, and validation status.">
      <ul className="space-y-2">
        {savings.map((s) => (
          <li key={s.id} className="coding-surface-subtle rounded-lg p-3 grid grid-cols-2 gap-2 text-xs">
            <div><p className="coding-text-muted">Original</p><p className="coding-text-strong tabular-nums">${Math.round(s.original_expected_cost || 0)}</p></div>
            <div><p className="coding-text-muted">Steered</p><p className="coding-text-strong tabular-nums">${Math.round(s.steered_option_cost || 0)}</p></div>
            <div><p className="coding-text-muted">Savings</p><p className="font-semibold text-emerald-600 dark:text-emerald-300 tabular-nums">${Math.round(s.estimated_savings || 0)}</p></div>
            <div><p className="coding-text-muted">Validation</p><p className="coding-text-strong capitalize">{s.validation_status}</p></div>
            <div className="col-span-2 flex items-center justify-between">
              <span className="coding-text-soft">Claim received: {s.claim_received ? 'Yes' : 'No'}</span>
              <span className="coding-text-soft">Validated: {s.savings_validated ? 'Yes' : 'Pending'}</span>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export function TalkdeskEmbedPlaceholder({ member }) {
  return (
    <div className="rounded-xl ring-1 ring-purple-300/60 dark:ring-purple-500/30 bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/20 dark:to-slate-900 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-purple-600 text-[10px] font-bold text-white">TD</span>
        <p className="text-sm font-semibold coding-text-strong">Talkdesk Embedded Workspace</p>
        <span className="ml-auto text-[10px] uppercase tracking-wider coding-text-muted">Integration seam</span>
      </div>
      <p className="text-xs coding-text-soft mb-3">
        Voice, SMS, chat, and call history would render here when the Talkdesk widget is connected.
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <button type="button" className="rounded-md bg-purple-600 text-white px-2 py-1.5 hover:opacity-90">Start voice call</button>
        <button type="button" className="rounded-md coding-surface-subtle coding-text-strong ring-1 ring-black/5 dark:ring-white/10 px-2 py-1.5 hover:opacity-80">Send SMS</button>
        <button type="button" className="rounded-md coding-surface-subtle coding-text-strong ring-1 ring-black/5 dark:ring-white/10 px-2 py-1.5 hover:opacity-80">Open chat</button>
        <button type="button" className="rounded-md coding-surface-subtle coding-text-strong ring-1 ring-black/5 dark:ring-white/10 px-2 py-1.5 hover:opacity-80">Log call</button>
      </div>
      <p className="mt-2 text-[10px] coding-text-muted">Recipient: {member?.phone || member?.email || member?.member_key || '—'}</p>
    </div>
  );
}

export function SBARPanel({ sbar }) {
  const data = sbar || {};
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
      <SBARField label="Situation" value={data.situation} />
      <SBARField label="Background" value={data.background} />
      <SBARField label="Assessment" value={data.assessment} />
      <SBARField label="Recommendation" value={data.recommendation} accent />
    </div>
  );
}

function SBARField({ label, value, accent }) {
  return (
    <div className={joinClass('coding-surface-subtle rounded-lg p-3', accent && 'ring-1 ring-emerald-200 dark:ring-emerald-700/40')}>
      <p className="text-[10px] uppercase tracking-wider coding-text-muted">{label}</p>
      <p className="text-sm coding-text-strong whitespace-pre-line">{value || '—'}</p>
    </div>
  );
}

export function MemberTimeline({ detail }) {
  const events = React.useMemo(() => {
    const items = [];
    (detail?.notes || []).forEach((n) => items.push({ kind: 'note', timestamp: n.created_at, title: `${n.channel} note`, body: n.body, author: n.author_name }));
    (detail?.messages || []).forEach((m) => items.push({ kind: 'message', timestamp: m.timestamp, title: `${m.channel} ${m.direction}`, body: m.body, author: m.sender }));
    (detail?.tasks || []).forEach((t) => items.push({ kind: 'task', timestamp: t.created_at, title: t.title, body: t.recommended_next_action || t.description, author: t.assigned_user }));
    (detail?.claims || []).forEach((c) => items.push({ kind: 'claim', timestamp: c.service_date, title: `Claim ${c.claim_number}`, body: `${c.category} · ${c.provider || ''}`, author: null }));
    (detail?.care_options || []).forEach((o) => items.push({ kind: 'care_option', timestamp: detail?.member?.last_interaction_at || new Date().toISOString(), title: `Care option · ${o.service_type}`, body: o.rationale, author: o.recommended_provider }));
    return items
      .filter((i) => i.timestamp)
      .sort((a, b) => (parseUtcDate(b.timestamp)?.getTime() || 0) - (parseUtcDate(a.timestamp)?.getTime() || 0))
      .slice(0, 25);
  }, [detail]);

  if (!events.length) return <p className="text-xs coding-text-soft">No activity yet.</p>;
  return (
    <ol className="space-y-3">
      {events.map((e, idx) => (
        <li key={`${e.kind}-${idx}`} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={joinClass(
              'mt-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900',
              e.kind === 'note' ? 'bg-sky-400' :
              e.kind === 'message' ? 'bg-violet-400' :
              e.kind === 'task' ? 'bg-amber-400' :
              e.kind === 'care_option' ? 'bg-emerald-400' :
              'bg-slate-400'
            )} />
            <span className="flex-1 w-px bg-slate-200 dark:bg-slate-700" />
          </div>
          <div className="flex-1 pb-3">
            <div className="flex items-center justify-between text-xs">
              <p className="font-semibold coding-text-strong">{e.title}</p>
              <p className="coding-text-muted">{formatLocalDateTime(e.timestamp)}</p>
            </div>
            <p className="text-sm coding-text-strong line-clamp-2">{e.body}</p>
            {e.author && <p className="text-[11px] coding-text-soft">{e.author}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function PortalPreview({ detail }) {
  if (!detail?.member) return null;
  const m = detail.member;
  const acc = detail.accumulator || {};
  return (
    <div className="rounded-2xl ring-1 ring-black/5 dark:ring-white/10 bg-gradient-to-br from-sky-50 via-white to-emerald-50 dark:from-sky-900/20 dark:via-slate-900 dark:to-emerald-900/20 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] coding-text-muted">Member portal preview</p>
          <h3 className="text-lg font-semibold coding-text-strong">Welcome back, {m.first_name}</h3>
        </div>
        <span className="text-[10px] uppercase tracking-wider coding-text-muted">{m.plan_name}</span>
      </div>
      <div className="rounded-xl bg-white/70 dark:bg-slate-900/40 ring-1 ring-black/5 dark:ring-white/10 p-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="coding-text-muted">Digital ID</p>
          <p className="coding-text-strong font-mono">{m.member_key}</p>
        </div>
        <div>
          <p className="coding-text-muted">Primary care</p>
          <p className="coding-text-strong">{m.primary_care_provider || '—'}</p>
        </div>
        <div>
          <p className="coding-text-muted">Deductible</p>
          <p className="coding-text-strong tabular-nums">${Math.round(acc.deductible_met || 0)} / ${Math.round(acc.deductible || 0)}</p>
          <Bar v={(acc.deductible_met || 0) / (acc.deductible || 1)} />
        </div>
        <div>
          <p className="coding-text-muted">Out of pocket</p>
          <p className="coding-text-strong tabular-nums">${Math.round(acc.out_of_pocket_met || 0)} / ${Math.round(acc.out_of_pocket_max || 0)}</p>
          <Bar v={(acc.out_of_pocket_met || 0) / (acc.out_of_pocket_max || 1)} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <PortalTile label="Recent claims" value={detail.claims?.length || 0} />
        <PortalTile label="Documents" value={detail.documents?.length || 0} />
        <PortalTile label="Care waivers" value={detail.documents?.filter((d) => d.document_type === 'Care Waiver').length || 0} />
      </div>
      <div className="rounded-xl bg-white/70 dark:bg-slate-900/40 ring-1 ring-black/5 dark:ring-white/10 p-3">
        <p className="text-xs coding-text-muted">Need help?</p>
        <p className="text-sm coding-text-strong">Chat with your care team or message securely from your portal.</p>
      </div>
    </div>
  );
}

function PortalTile({ label, value }) {
  return (
    <div className="coding-surface-subtle rounded-lg px-3 py-2 text-center">
      <p className="text-[10px] uppercase tracking-wider coding-text-muted">{label}</p>
      <p className="text-base font-semibold coding-text-strong">{value}</p>
    </div>
  );
}

function Bar({ v }) {
  const pct = Math.min(Math.max(Number(v || 0) * 100, 0), 100);
  return (
    <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200/60 dark:bg-slate-700/40 overflow-hidden">
      <div className="h-full bg-[var(--brand-primary)]" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function CareJourneyCard({ journey, onStageTransition, onJourneyTransition }) {
  if (!journey) return null;
  const completed = journey.stages?.filter((s) => s.status === 'completed').length || 0;
  const total = journey.stages?.length || 0;
  const pct = total ? (completed / total) * 100 : 0;
  const journeyOpen = journey.status === 'active' || journey.status === 'paused';
  return (
    <div className="coding-surface-subtle rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold coding-text-strong">{journey.name}</p>
          <p className="text-[10px] uppercase tracking-wider coding-text-muted">{journey.template_name || journey.source || 'Journey'}</p>
        </div>
        <span className="text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 ring-1 ring-black/5 dark:ring-white/10 coding-surface coding-text-strong">{journey.status}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-200/60 dark:bg-slate-700/40 overflow-hidden">
        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <ol className="space-y-1">
        {(journey.stages || []).map((s) => (
          <li key={s.id} className="flex items-center justify-between text-xs px-2 py-1 rounded">
            <span className="flex items-center gap-2 min-w-0">
              <span className={joinClass(
                'inline-block h-2 w-2 rounded-full shrink-0',
                s.status === 'completed' ? 'bg-emerald-500' :
                s.status === 'in_progress' ? 'bg-amber-500' :
                s.status === 'skipped' ? 'bg-slate-400 dark:bg-slate-500' :
                'bg-slate-300 dark:bg-slate-600'
              )} />
              <span className="coding-text-strong truncate">{s.name}</span>
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
              {s.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => onStageTransition?.(journey, s, 'in_progress')}
                  className="rounded-md bg-white dark:bg-slate-800 coding-text-strong ring-1 ring-black/5 dark:ring-white/10 px-1.5 py-0.5 hover:opacity-80"
                >Start</button>
              )}
              {s.status === 'in_progress' && (
                <button
                  type="button"
                  onClick={() => onStageTransition?.(journey, s, 'completed')}
                  className="rounded-md bg-emerald-600 text-white px-1.5 py-0.5 hover:opacity-90"
                >Complete</button>
              )}
              {s.status === 'completed' && (
                <button
                  type="button"
                  onClick={() => onStageTransition?.(journey, s, 'in_progress')}
                  className="rounded-md coding-surface coding-text-strong ring-1 ring-black/5 dark:ring-white/10 px-1.5 py-0.5 hover:opacity-80"
                >Reopen</button>
              )}
              <span className="coding-text-muted capitalize">{s.status?.replace('_', ' ')}</span>
            </span>
          </li>
        ))}
      </ol>
      {journeyOpen && (
        <div className="flex flex-wrap gap-1.5 pt-1 text-xs">
          {journey.status === 'active' && (
            <button
              type="button"
              onClick={() => onJourneyTransition?.(journey, 'paused')}
              className="rounded-md coding-surface coding-text-strong ring-1 ring-black/5 dark:ring-white/10 px-2 py-1 hover:opacity-80"
            >Pause</button>
          )}
          {journey.status === 'paused' && (
            <button
              type="button"
              onClick={() => onJourneyTransition?.(journey, 'active')}
              className="rounded-md coding-surface coding-text-strong ring-1 ring-black/5 dark:ring-white/10 px-2 py-1 hover:opacity-80"
            >Resume</button>
          )}
          <button
            type="button"
            onClick={() => onJourneyTransition?.(journey, 'completed')}
            className="rounded-md bg-emerald-600 text-white px-2 py-1 hover:opacity-90"
          >Mark journey complete</button>
        </div>
      )}
    </div>
  );
}

/**
 * Pagination control for population list pages. Stateless — caller owns
 * the current page in component state. `total` is the full row count from
 * the server (the value returned alongside `items`); `pageSize` is the
 * client's chosen page size (defaults to 50 on the backend).
 */
export function Pagination({ page = 1, pageSize = 50, total = 0, onPageChange, label = 'rows' }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const first = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const last = Math.min(safePage * pageSize, total);
  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

  const goTo = (p) => {
    if (!onPageChange) return;
    const next = Math.min(Math.max(1, p), totalPages);
    if (next !== safePage) onPageChange(next);
  };

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs coding-text-muted">
      <span>
        {total === 0
          ? `No ${label}`
          : `Showing ${first}–${last} of ${total.toLocaleString()} ${label}`}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => goTo(safePage - 1)}
          disabled={!canPrev}
          className="rounded-md ring-1 ring-black/5 dark:ring-white/10 coding-surface coding-text-strong px-2 py-1 hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← Prev
        </button>
        <span className="px-2">
          Page {safePage} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => goTo(safePage + 1)}
          disabled={!canNext}
          className="rounded-md ring-1 ring-black/5 dark:ring-white/10 coding-surface coding-text-strong px-2 py-1 hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
