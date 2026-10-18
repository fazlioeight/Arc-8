import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import RecordHeader from '../../../components/ui/RecordHeader';
import WorkspaceTabs from '../../../components/ui/WorkspaceTabs';
import { PropertyRow, PropertySection } from '../../../components/ui/PropertyList';
import AlertShell from '../../../components/ui/AlertShell';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { AuthContext } from '../../../context/AuthContext';
import { fetchCodingWorklist, updateCodingChase } from '../../../services/codingService';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import { CHASE_STATUS_OPTIONS } from '../../../constants/codingStatus';
import '../../../styles/memberWorkspace.css';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'codes', label: 'Code selections' },
  { key: 'documents', label: 'Documents' },
  { key: 'audit', label: 'Audit log' },
];

const STATUS_TONE = {
  open: 'coding-text-soft',
  in_progress: 'text-sky-700 dark:text-sky-300',
  pending_review: 'text-violet-700 dark:text-violet-300',
  audit_feedback: 'text-amber-700 dark:text-amber-300',
  query_pending: 'text-amber-700 dark:text-amber-300',
  completed: 'text-emerald-700 dark:text-emerald-300',
};

const PRIORITY_TONE = {
  urgent: 'bg-rose-100 text-rose-800 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:ring-rose-700/40',
  high: 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-700/40',
  medium: 'bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:ring-sky-700/40',
  low: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-200 dark:ring-slate-600/40',
};

const formatStatus = (s) => (s ? s.replace(/_/g, ' ') : '—');
const isOverdue = (d) => Boolean(d && new Date(d) < new Date());

export default function CodingChasePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { chaseId } = useParams();
  const { token, tenant, isAuthenticated, user } = useContext(AuthContext) || {};
  const [chase, setChase] = useState(location.state?.chase || null);
  const [loading, setLoading] = useState(!location.state?.chase);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    if (!isAuthenticated || chase?.chase_id === Number(chaseId)) return;
    let cancelled = false;
    setLoading(true);
    fetchCodingWorklist(token, tenant, { pageSize: 200 })
      .then((res) => {
        if (cancelled) return;
        const found = (res.items || []).find((c) => String(c.chase_id) === String(chaseId));
        if (!found) {
          setError('Chase not found');
          setChase(null);
        } else {
          setChase(found);
          setError(null);
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message || String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated, token, tenant, chaseId, chase]);

  if (!isAuthenticated) {
    return (
      <PortalPageLayout
        eyebrow="Coding"
        title="Authentication required"
        navItems={PORTAL_NAV_ITEMS}
        currentNav="coding"
        navProps={{ align: 'center', tone: 'surface' }}
        maxWidthClassName="max-w-5xl"
      >
        <AlertShell tone="warning" title="Authentication required" description="Sign in to open chase records." />
      </PortalPageLayout>
    );
  }

  if (loading) {
    return (
      <PortalPageLayout
        eyebrow="Coding"
        title="Loading chase"
        navItems={PORTAL_NAV_ITEMS}
        currentNav="coding"
        navProps={{ align: 'center', tone: 'surface' }}
        maxWidthClassName="max-w-7xl"
      >
        <LoadingState title="Loading chase" />
      </PortalPageLayout>
    );
  }

  if (error || !chase) {
    return (
      <PortalPageLayout
        eyebrow="Coding"
        title="Chase unavailable"
        navItems={PORTAL_NAV_ITEMS}
        currentNav="coding"
        navProps={{ align: 'center', tone: 'surface' }}
        maxWidthClassName="max-w-5xl"
        mainClassName="space-y-4"
      >
        <ErrorState title="Could not open chase" description={error || 'Chase not found'} />
        <button
          type="button"
          onClick={() => navigate(ROUTES.CODING.WORKLIST)}
          className="rounded-md bg-[var(--brand-primary)] text-white px-3 py-1.5 text-xs font-semibold hover:bg-brand-700"
        >
          Back to worklist
        </button>
      </PortalPageLayout>
    );
  }

  const meta = [
    chase.member_key,
    chase.hcc_code ? `HCC ${chase.hcc_code}` : null,
    chase.service_date_from ? `DOS ${chase.service_date_from}` : null,
  ].filter(Boolean);

  const saveChaseField = (field) => async (value) => {
    if (!chase?.chase_id) return;
    const payload = { [field]: value === '' ? null : value };
    const updated = await updateCodingChase(token, tenant, chase.chase_id, payload);
    // Backend returns the canonical chase shape; merge into local state so the
    // header badges and other rows reflect the saved value immediately.
    setChase((prev) => ({ ...(prev || {}), ...(updated || {}) }));
  };

  const overdue = isOverdue(chase.due_date);
  const badges = (
    <>
      <span className={`inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800/60 px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_TONE[chase.status] || 'coding-text-soft'}`}>
        {formatStatus(chase.status)}
      </span>
      {chase.priority && (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 capitalize ${PRIORITY_TONE[chase.priority] || PRIORITY_TONE.medium}`}>
          {chase.priority}
        </span>
      )}
      {overdue && (
        <span className="inline-flex items-center rounded-full bg-rose-100 text-rose-800 ring-1 ring-rose-200 px-2 py-0.5 text-[11px] font-semibold dark:bg-rose-900/30 dark:text-rose-200 dark:ring-rose-700/40">
          Overdue
        </span>
      )}
    </>
  );

  const assignedToMe = Boolean(user?.email && chase.assigned_coder_email === user.email);
  const actions = [
    { key: 'start', label: 'Start coding', primary: true, onClick: () => setTab('codes') },
    {
      key: 'assign',
      label: assignedToMe ? 'Assigned to me' : 'Assign to me',
      disabled: !user?.email || assignedToMe,
      onClick: () => saveChaseField('assigned_coder_email')(user.email),
    },
    // "Open query" stays inert: provider-query workflow is not yet modeled on
    // the backend (tracked under the coding-query decision).
    { key: 'query', label: 'Open query' },
    { key: 'audit', label: 'Audit', onClick: () => setTab('audit') },
  ];

  const rightSlot = (
    <>
      <button
        type="button"
        onClick={() => navigate(ROUTES.CODING.WORKLIST)}
        className="rounded-md ring-1 coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)] px-2.5 py-1.5 text-xs font-semibold"
      >
        Worklist
      </button>
      <button
        type="button"
        onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${chase.member_id}`)}
        className="rounded-md ring-1 coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)] px-2.5 py-1.5 text-xs font-semibold"
      >
        Member
      </button>
    </>
  );

  return (
    <PortalPageLayout
      eyebrow="Coding"
      title={`Chase #${chase.chase_id}`}
      navItems={PORTAL_NAV_ITEMS}
      currentNav="coding"
      navProps={{ align: 'center', tone: 'surface' }}
      maxWidthClassName="max-w-[1500px]"
      mainClassName="space-y-4"
      hideHeader
    >
      <RecordHeader
        avatarInitials={`#${chase.chase_id}`.slice(-4)}
        title={chase.member_name || `Chase #${chase.chase_id}`}
        meta={meta}
        badges={badges}
        actions={actions}
        rightSlot={rightSlot}
      />

      <div className="grid grid-cols-12 gap-4">
        {/* Left rail — properties */}
        <div className="col-span-12 xl:col-span-3 space-y-4">
          <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
            <header className="px-4 py-2.5 border-b coding-border flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] coding-text-muted">About this chase</h3>
            </header>
            <dl>
              <PropertyRow label="Chase #" value={`#${chase.chase_id}`} />
              <PropertyRow
                label="Status"
                value={<span className="capitalize">{formatStatus(chase.status)}</span>}
                editValue={chase.status || 'open'}
                type="select"
                options={CHASE_STATUS_OPTIONS.map((s) => ({ value: s.key, label: s.label }))}
                onEdit={saveChaseField('status')}
              />
              <PropertyRow
                label="Priority"
                value={<span className="capitalize">{chase.priority}</span>}
                editValue={chase.priority || 'medium'}
                type="select"
                options={[
                  { value: 'urgent', label: 'Urgent' },
                  { value: 'high', label: 'High' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'low', label: 'Low' },
                ]}
                onEdit={saveChaseField('priority')}
              />
              <PropertyRow label="HCC" value={chase.hcc_code} onEdit={saveChaseField('hcc_code')} />
              <PropertyRow
                label="DOS from"
                value={chase.service_date_from}
                type="date"
                onEdit={saveChaseField('service_date_from')}
              />
              <PropertyRow
                label="DOS to"
                value={chase.service_date_to}
                type="date"
                onEdit={saveChaseField('service_date_to')}
              />
              <PropertyRow
                label="Due date"
                value={chase.due_date}
                type="date"
                onEdit={saveChaseField('due_date')}
              />
              <PropertyRow
                label="Assignee"
                value={chase.assigned_coder_email}
                type="email"
                validate={(v) => v && !/.+@.+\..+/.test(v) ? 'Enter a valid email' : null}
                onEdit={saveChaseField('assigned_coder_email')}
              />
              <PropertyRow label="Updated" value={chase.updated_at ? new Date(chase.updated_at).toLocaleString() : null} />
            </dl>

            <PropertySection title="Member">
              <dl>
                <PropertyRow label="Name" value={chase.member_name} />
                <PropertyRow label="Member ID" value={chase.member_key} />
                <PropertyRow label="Open member" value={
                  <button
                    type="button"
                    onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${chase.member_id}`)}
                    className="text-[var(--brand-primary)] hover:underline text-left"
                  >
                    Go to workspace →
                  </button>
                } />
              </dl>
            </PropertySection>
          </section>
        </div>

        {/* Center — tabs */}
        <div className="col-span-12 xl:col-span-9 space-y-4">
          <section className="coding-surface rounded-2xl shadow-sm">
            <WorkspaceTabs tabs={TABS} activeKey={tab} onChange={setTab} />
            <div className="p-5">
              {tab === 'overview' && <ChaseOverviewTab chase={chase} />}
              {tab === 'codes' && (
                <CodeSelectionsTab
                  onOpenWorkbench={
                    chase.member_key
                      ? () => navigate(`${ROUTES.CODING.WORKBENCH_ROOT}/${encodeURIComponent(chase.member_key)}`)
                      : null
                  }
                />
              )}
              {tab === 'documents' && <DocumentsTab />}
              {tab === 'audit' && <AuditTab chase={chase} />}
            </div>
          </section>
        </div>
      </div>
    </PortalPageLayout>
  );
}

function ChaseOverviewTab({ chase }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold coding-text-strong">Next best action</h3>
        <p className="mt-1 text-sm coding-text-soft">
          Open code selections to begin reviewing {chase.member_name}'s chart for HCC {chase.hcc_code || '—'}.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SnapshotTile label="Status" value={chase.status?.replace(/_/g, ' ') || '—'} />
        <SnapshotTile label="Priority" value={chase.priority || '—'} />
        <SnapshotTile label="Due" value={chase.due_date || '—'} />
        <SnapshotTile label="HCC" value={chase.hcc_code || '—'} />
      </div>
      <AlertShell
        tone="info"
        title="Code selections live in the next view"
        description="The full coding workspace (ICD-10 / CPT pickers, quality pane, SBAR) renders inside the Code selections tab. This Overview gives leadership a chase-level snapshot."
      />
    </div>
  );
}

function CodeSelectionsTab({ onOpenWorkbench }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold coding-text-strong">Code selections</h3>
      <p className="text-sm coding-text-soft">
        Review suspect conditions, select supporting evidence, and finalize HCC codes in the coding workbench.
        The HERO spec requires no autosave — coders explicitly finalize.
      </p>
      {onOpenWorkbench ? (
        <button
          type="button"
          onClick={onOpenWorkbench}
          className="rounded-md bg-[var(--brand-primary)] text-white px-3 py-2 text-sm font-semibold hover:bg-brand-700"
        >
          Open coding workbench →
        </button>
      ) : (
        <div className="rounded-md border coding-border-dashed p-6 text-center text-sm coding-text-soft">
          Member identifier unavailable for this chase.
        </div>
      )}
    </div>
  );
}

function DocumentsTab() {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold coding-text-strong">Documents</h3>
      <p className="text-sm coding-text-soft">Uploads attached to this chase will appear here.</p>
      <div className="rounded-md border coding-border-dashed p-6 text-center text-sm coding-text-soft">
        No documents on this chase yet.
      </div>
    </div>
  );
}

function AuditTab({ chase }) {
  const events = [
    { ts: chase.updated_at, who: chase.assigned_coder_email || 'system', what: `Status set to ${chase.status}` },
  ].filter((e) => e.ts);
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold coding-text-strong">Audit log</h3>
      {events.length === 0 ? (
        <p className="text-sm coding-text-soft">No audit events yet.</p>
      ) : (
        <ol className="space-y-2">
          {events.map((e, i) => (
            <li key={i} className="coding-surface-subtle rounded-md px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="coding-text-strong font-medium">{e.what}</span>
                <span className="coding-text-muted">{new Date(e.ts).toLocaleString()}</span>
              </div>
              <p className="coding-text-soft">{e.who}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function SnapshotTile({ label, value }) {
  return (
    <div className="coding-surface-subtle rounded-lg px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider coding-text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold coding-text-strong capitalize">{value}</p>
    </div>
  );
}
