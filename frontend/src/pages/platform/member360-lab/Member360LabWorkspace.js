import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import ErrorBoundary from '../../../components/ErrorBoundary';
import AiAssistantPanel from '../../../components/ai/AiAssistantPanel';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import {
  createMember360CareJourney,
  createMember360CareOption,
  createMember360Message,
  createMember360Note,
  createMember360Task,
  fetchMember360GapAnalysis,
  fetchMember360JourneyTemplates,
  fetchMember360MemberDetail,
  generateMember360SubmissionExport,
  updateMember360CareJourney,
  updateMember360CareJourneyStage,
  updateMember360Member,
  updateMember360Task,
} from '../../../services/member360LabService';
import {
  CareJourneyCard,
  CareOptionCard,
  GuidedTriagePanel,
  MemberSummaryCard,
  MemberTimeline,
  PortalPreview,
  PriorityBadge,
  RecordHeader,
  RiskBadge,
  RiskInsightsCard,
  SBARPanel,
  SavingsCard,
  SectionCard,
  TalkdeskEmbedPlaceholder,
  TaskStatusBadge,
  WorkspaceDrawer,
  WorkspaceTabs,
} from './components';
import ProblemsHCCPage from './chart/ProblemsHCCPage';
import MedicationsPage from './chart/MedicationsPage';
import LabsImagingPage from './chart/LabsImagingPage';
import CareGapsPage from './chart/CareGapsPage';
import DocumentsPage from './chart/DocumentsPage';
import AuditLogPage from './chart/AuditLogPage';
import SharingPage from './chart/SharingPage';
import SettingsPage from './chart/SettingsPage';

const TABS = [
  { key: 'timeline', label: 'Timeline' },
  { key: 'notes', label: 'Notes' },
  { key: 'messages', label: 'Messages' },
  { key: 'care_journey', label: 'Care Journey' },
  { key: 'problems_hcc', label: 'Problems / HCC' },
  { key: 'medications', label: 'Medications' },
  { key: 'labs_imaging', label: 'Labs & Imaging' },
  { key: 'care_gaps', label: 'Care Gaps' },
  { key: 'claims', label: 'Claims' },
  { key: 'accumulators', label: 'Accumulators' },
  { key: 'documents', label: 'Documents' },
  { key: 'portal', label: 'Portal Preview' },
  { key: 'audit_log', label: 'Audit Log' },
  { key: 'sharing', label: 'Sharing' },
  { key: 'settings', label: 'Settings' },
];

const PRIMARY_ACTIONS = [
  { key: 'create_task', label: 'Create Task', primary: true },
  { key: 'add_note', label: 'Add Note' },
  { key: 'start_journey', label: 'Start Journey' },
  { key: 'send_message', label: 'Send Message' },
  { key: 'recommend_care_option', label: 'Create Care Option' },
  { key: 'escalate', label: 'Escalate' },
];

const currencyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const Member360LabWorkspace = () => {
  const { memberId } = useParams();
  const navigate = useNavigate();
  const { token, tenant } = useContext(AuthContext) || {};
  const [detail, setDetail] = useState(null);
  const [gap, setGap] = useState(null);
  const [tab, setTab] = useState('timeline');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionDialog, setActionDialog] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [submissionState, setSubmissionState] = useState('idle');
  const [submissionResult, setSubmissionResult] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [journeyTemplates, setJourneyTemplates] = useState([]);

  const reload = useCallback(() => {
    setLoading(true);
    return fetchMember360MemberDetail(token, tenant, Number(memberId))
      .then((res) => { setDetail(res); setError(null); })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  }, [token, tenant, memberId]);

  const saveMemberField = useCallback(async (field, value) => {
    if (!memberId) return;
    const updated = await updateMember360Member(token, tenant, Number(memberId), { [field]: value });
    // Merge the canonical detail payload (member + nested arrays) back into
    // local state so badges/quick-stats reflect the saved value immediately.
    setDetail((prev) => prev ? { ...prev, ...(updated || {}) } : updated);
  }, [token, tenant, memberId]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    let cancelled = false;
    if (!token || !tenant || !memberId) return undefined;
    fetchMember360GapAnalysis(token, tenant, Number(memberId))
      .then((res) => { if (!cancelled) setGap(res); })
      .catch(() => { if (!cancelled) setGap(null); });
    return () => { cancelled = true; };
  }, [token, tenant, memberId]);

  // Care journey templates are fetched once per tenant and reused by the
  // Start Journey dialog. Failure is non-fatal — the dialog still lets the
  // user create a freeform journey when no templates are available.
  useEffect(() => {
    let cancelled = false;
    if (!token || !tenant) return undefined;
    fetchMember360JourneyTemplates(token, tenant)
      .then((res) => { if (!cancelled) setJourneyTemplates(Array.isArray(res) ? res : []); })
      .catch(() => { if (!cancelled) setJourneyTemplates([]); });
    return () => { cancelled = true; };
  }, [token, tenant]);

  const member = detail?.member;
  const missingHccCount = (gap?.missing_hcc || []).length;

  const pcpHref = useMemo(() => {
    if (!member?.primary_care_provider) return null;
    const key = encodeURIComponent(String(member.primary_care_provider).trim());
    const params = new URLSearchParams();
    if (member.id != null) params.set('fromMemberId', String(member.id));
    params.set('providerName', member.primary_care_provider);
    return `${ROUTES.PROVIDERS.LANDING}/${key}?${params.toString()}`;
  }, [member]);

  const pcpState = useMemo(() => {
    if (!member?.primary_care_provider) return undefined;
    return {
      fromMemberId: member.id,
      providerName: member.primary_care_provider,
      breadcrumb: member.primary_care_provider,
    };
  }, [member]);

  // Trigger a browser download of the CSV embedded in a submission export
  // response. The backend returns CSV as a string field on the JSON response
  // (not a binary stream) so we wrap it in a Blob client-side and synthesize
  // a download via a temporary anchor. Safe to call repeatedly.
  const downloadSubmissionCsv = useCallback((response, memberKey) => {
    if (!response?.csv) return;
    const year = response.submission_year || new Date().getFullYear();
    const batch = response.batch_id != null ? `-batch-${response.batch_id}` : '';
    const member = memberKey ? `-${memberKey}` : '';
    const filename = `member360-submission-${year}${member}${batch}.csv`;
    const blob = new Blob([response.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const onSubmitToPayer = useCallback(async () => {
    if (!token || !tenant || !memberId) return;
    setSubmissionState('working');
    setActionMessage(null);
    try {
      const year = new Date().getFullYear();
      const response = await generateMember360SubmissionExport(token, tenant, year, [Number(memberId)]);
      setSubmissionResult(response);
      setSubmissionState('done');
      downloadSubmissionCsv(response, member?.member_key);
    } catch (err) {
      setSubmissionState('error');
      setActionMessage(`Submission preview failed: ${err.message || err}`);
    }
  }, [token, tenant, memberId, member, downloadSubmissionCsv]);

  const handleAction = useCallback((key, payload = {}) => {
    setActionMessage(null);
    setActionDialog({ key, payload });
  }, []);

  const submitDialog = useCallback(async (data) => {
    if (!actionDialog || !member) return;
    try {
      if (actionDialog.key === 'create_task') {
        const recommendation = actionDialog.payload?.recommendation;
        const sbar = data.sbar || {};
        const newTask = await createMember360Task(token, tenant, {
          member_id: member.id,
          title: data.title || 'New task',
          priority: data.priority || 'medium',
          status: 'open',
          due_date: data.due_date || undefined,
          sbar: {
            situation: sbar.situation || recommendation?.summary || null,
            background: sbar.background || null,
            assessment: sbar.assessment || null,
            recommendation: sbar.recommendation || recommendation?.summary || null,
          },
          recommended_next_action: recommendation?.summary || sbar.recommendation || null,
          auto_generated_reason: recommendation ? 'Created from guided triage' : null,
        });
        setActionMessage(`Task created: ${newTask.title}`);
      } else if (actionDialog.key === 'add_note') {
        const note = await createMember360Note(token, tenant, member.id, {
          body: data.body || '',
          channel: data.channel || 'Internal',
          note_type: data.note_type || 'Outreach',
        });
        setActionMessage(`Note added on ${note.channel}.`);
      } else if (actionDialog.key === 'send_message') {
        const msg = await createMember360Message(token, tenant, member.id, {
          channel: data.channel || member.preferred_channel || 'SMS',
          direction: 'outbound',
          body: data.body || '',
        });
        setActionMessage(`Sent ${msg.channel} message.`);
      } else if (actionDialog.key === 'recommend_care_option') {
        const opt = await createMember360CareOption(token, tenant, {
          member_id: member.id,
          service_type: data.service_type || 'Care option',
          recommended_provider: data.recommended_provider || null,
          facility_name: data.facility_name || data.recommended_provider || null,
          cost_estimate: Number(data.cost_estimate) || null,
          quality_score: Number(data.quality_score) || null,
          distance_miles: Number(data.distance_miles) || null,
          network_status: data.network_status || 'In Network',
          potential_savings: Number(data.potential_savings) || null,
          rationale: data.rationale || null,
          member_facing_explanation: data.member_facing_explanation || null,
          status: 'recommended',
        });
        setActionMessage(`Care option created: ${opt.service_type}.`);
      } else if (actionDialog.key === 'start_journey') {
        const recommendation = actionDialog.payload?.recommendation;
        const templateId = data.template_id ? Number(data.template_id) : null;
        const template = templateId ? journeyTemplates.find((t) => t.id === templateId) : null;
        const journey = await createMember360CareJourney(token, tenant, {
          member_id: member.id,
          template_id: templateId || undefined,
          name: data.name || template?.name || (recommendation?.summary?.slice(0, 80)) || 'Care journey',
          description: data.description || recommendation?.summary || null,
          assigned_to: data.assigned_to || null,
          start_date: data.start_date || undefined,
          target_completion_date: data.target_completion_date || undefined,
          source: recommendation ? 'guided_triage' : 'manual',
        });
        setActionMessage(`Care journey started: ${journey.name}.`);
      } else if (actionDialog.key === 'escalate') {
        // Escalation is modeled as an urgent task with status='escalated'. The
        // existing /tasks route already enforces member existence + SBAR.
        const recommendation = actionDialog.payload?.recommendation;
        const reason = data.reason || recommendation?.summary || 'Escalated by case manager';
        const task = await createMember360Task(token, tenant, {
          member_id: member.id,
          title: data.title || `Escalation: ${reason.slice(0, 60)}`,
          priority: data.priority || 'urgent',
          status: 'escalated',
          assigned_queue: data.assigned_queue || 'RN',
          due_date: data.due_date || undefined,
          sbar: {
            situation: reason,
            background: null,
            assessment: null,
            recommendation: data.recommendation || reason,
          },
          recommended_next_action: data.recommendation || reason,
          auto_generated_reason: recommendation ? 'Escalated from guided triage' : 'Manual escalation',
        });
        setActionMessage(`Escalation routed to ${task.assigned_queue || 'RN'} queue.`);
      }
      setActionDialog(null);
      reload();
    } catch (err) {
      setActionMessage(`Error: ${err.message || err}`);
    }
  }, [actionDialog, member, token, tenant, reload, journeyTemplates]);

  const handleTaskStatus = async (task, status) => {
    try {
      await updateMember360Task(token, tenant, task.id, { status });
      await reload();
    } catch (err) {
      setActionMessage(`Could not update task: ${err.message || err}`);
    }
  };

  const handleStageTransition = useCallback(async (journey, stage, nextStatus) => {
    try {
      await updateMember360CareJourneyStage(token, tenant, journey.id, stage.id, { status: nextStatus });
      setActionMessage(`Stage "${stage.name}" → ${nextStatus.replace('_', ' ')}.`);
      await reload();
    } catch (err) {
      setActionMessage(`Could not update stage: ${err.message || err}`);
    }
  }, [token, tenant, reload]);

  const handleJourneyTransition = useCallback(async (journey, nextStatus) => {
    try {
      await updateMember360CareJourney(token, tenant, journey.id, { status: nextStatus });
      setActionMessage(`Journey "${journey.name}" → ${nextStatus}.`);
      await reload();
    } catch (err) {
      setActionMessage(`Could not update journey: ${err.message || err}`);
    }
  }, [token, tenant, reload]);

  const tabContent = useMemo(() => {
    if (!detail) return null;
    switch (tab) {
      case 'timeline':
        return <MemberTimeline detail={detail} />;
      case 'notes':
        return (
          <div className="space-y-3">
            <button type="button" onClick={() => handleAction('add_note')} className="rounded-md bg-[var(--brand-primary)] text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90">Add note</button>
            <ul className="space-y-2">
              {(detail.notes || []).map((n) => (
                <li key={n.id} className="coding-surface-subtle rounded-lg p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="coding-text-strong font-semibold">{n.author_name || n.author_email}</span>
                    <span className="coding-text-muted">{n.channel} · {new Date(n.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm coding-text-strong mt-1 whitespace-pre-line">{n.body}</p>
                </li>
              ))}
              {(detail.notes || []).length === 0 && <p className="text-xs coding-text-soft">No notes yet.</p>}
            </ul>
          </div>
        );
      case 'messages':
        return (
          <div className="space-y-3">
            <TalkdeskEmbedPlaceholder member={member} />
            <button type="button" onClick={() => handleAction('send_message')} className="rounded-md bg-[var(--brand-primary)] text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90">Compose message</button>
            <ul className="space-y-2">
              {(detail.messages || []).map((m) => (
                <li key={m.id} className={`coding-surface-subtle rounded-lg p-3 ${m.direction === 'outbound' ? '' : 'ring-1 ring-violet-200 dark:ring-violet-700/30'}`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="coding-text-strong font-semibold capitalize">{m.channel} · {m.direction}</span>
                    <span className="coding-text-muted">{new Date(m.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="text-sm coding-text-strong mt-1 whitespace-pre-line">{m.body}</p>
                </li>
              ))}
              {(detail.messages || []).length === 0 && <p className="text-xs coding-text-soft">No messages yet.</p>}
            </ul>
          </div>
        );
      case 'care_journey':
        return (
          <div className="space-y-3">
            {(detail.care_journeys || []).map((j) => (
              <CareJourneyCard
                key={j.id}
                journey={j}
                onStageTransition={handleStageTransition}
                onJourneyTransition={handleJourneyTransition}
              />
            ))}
            {(detail.care_journeys || []).length === 0 && <p className="text-xs coding-text-soft">No active care journey. Start one from the right panel.</p>}
            <h4 className="text-xs uppercase tracking-wider coding-text-muted mt-4">Tasks in this workspace</h4>
            <ul className="space-y-2">
              {(detail.tasks || []).map((t) => (
                <li key={t.id} className="coding-surface-subtle rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm coding-text-strong font-semibold">{t.title}</p>
                    <div className="flex items-center gap-2">
                      <PriorityBadge priority={t.priority} />
                      <TaskStatusBadge status={t.status} />
                    </div>
                  </div>
                  {t.auto_generated_reason && <p className="text-[11px] italic coding-text-muted">{t.auto_generated_reason}</p>}
                  <SBARPanel sbar={t.sbar} />
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {t.status !== 'completed' && (
                      <button type="button" onClick={() => handleTaskStatus(t, 'completed')} className="rounded-md bg-emerald-600 text-white px-2 py-1 hover:opacity-90">Mark complete</button>
                    )}
                    {t.status === 'open' && (
                      <button type="button" onClick={() => handleTaskStatus(t, 'in_progress')} className="rounded-md coding-surface coding-text-strong ring-1 ring-black/5 dark:ring-white/10 px-2 py-1 hover:opacity-80">Start work</button>
                    )}
                    <span className="coding-text-muted ml-auto self-center">Due {t.due_date || '—'}</span>
                  </div>
                </li>
              ))}
              {(detail.tasks || []).length === 0 && <p className="text-xs coding-text-soft">No tasks for this member.</p>}
            </ul>
          </div>
        );
      case 'claims':
        return (
          <div className="overflow-hidden rounded-lg ring-1 ring-black/5 dark:ring-white/10">
            <table className="min-w-full text-sm">
              <thead className="coding-surface-subtle text-xs uppercase tracking-wide coding-text-muted">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Claim</th>
                  <th className="text-left px-3 py-2 font-medium">Service date</th>
                  <th className="text-left px-3 py-2 font-medium">Provider</th>
                  <th className="text-left px-3 py-2 font-medium">Category</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-right px-3 py-2 font-medium">Billed</th>
                  <th className="text-right px-3 py-2 font-medium">Paid</th>
                  <th className="text-right px-3 py-2 font-medium">Member resp.</th>
                </tr>
              </thead>
              <tbody className="divide-y coding-divider">
                {(detail.claims || []).map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2 font-mono text-xs">{c.claim_number}</td>
                    <td className="px-3 py-2">{c.service_date || '—'}</td>
                    <td className="px-3 py-2">{c.provider || '—'}</td>
                    <td className="px-3 py-2">{c.category || '—'}</td>
                    <td className="px-3 py-2 capitalize">{c.status}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.billed_amount != null ? currencyFmt.format(c.billed_amount) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.paid_amount != null ? currencyFmt.format(c.paid_amount) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.member_responsibility != null ? currencyFmt.format(c.member_responsibility) : '—'}</td>
                  </tr>
                ))}
                {(detail.claims || []).length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-xs coding-text-soft">No claims on file.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        );
      case 'accumulators': {
        const a = detail.accumulator || {};
        const dedPct = a.deductible ? Math.min(((a.deductible_met || 0) / a.deductible) * 100, 100) : 0;
        const oopPct = a.out_of_pocket_max ? Math.min(((a.out_of_pocket_met || 0) / a.out_of_pocket_max) * 100, 100) : 0;
        return (
          <div className="space-y-4">
            <div className="coding-surface-subtle rounded-lg p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="coding-text-strong font-semibold">Deductible</span>
                <span className="tabular-nums coding-text-muted">{currencyFmt.format(a.deductible_met || 0)} / {currencyFmt.format(a.deductible || 0)}</span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-200/60 dark:bg-slate-700/40 overflow-hidden">
                <div className="h-full bg-[var(--brand-primary)]" style={{ width: `${dedPct}%` }} />
              </div>
            </div>
            <div className="coding-surface-subtle rounded-lg p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="coding-text-strong font-semibold">Out-of-pocket max</span>
                <span className="tabular-nums coding-text-muted">{currencyFmt.format(a.out_of_pocket_met || 0)} / {currencyFmt.format(a.out_of_pocket_max || 0)}</span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-200/60 dark:bg-slate-700/40 overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${oopPct}%` }} />
              </div>
            </div>
            <p className="text-xs coding-text-muted">Plan year start: {a.plan_year_start || '—'}</p>
          </div>
        );
      }
      case 'portal':
        return <PortalPreview detail={detail} />;
      case 'problems_hcc':
        return <ProblemsHCCPage detail={detail} />;
      case 'medications':
        return <MedicationsPage detail={detail} />;
      case 'labs_imaging':
        return <LabsImagingPage detail={detail} />;
      case 'care_gaps':
        return <CareGapsPage gap={gap} member={member} />;
      case 'documents':
        return <DocumentsPage detail={detail} memberId={member?.id} onUploaded={reload} />;
      case 'audit_log':
        return <AuditLogPage memberId={member?.id} />;
      case 'sharing':
        return <SharingPage />;
      case 'settings':
        return <SettingsPage member={member} />;
      default:
        return null;
    }
  }, [detail, member, tab, handleStageTransition, handleJourneyTransition, reload]);

  if (loading) {
    return (
      <PortalPageLayout eyebrow="Nexora Lab Member360" title="Loading member" navItems={PORTAL_NAV_ITEMS} currentNav="member360-lab" maxWidthClassName="max-w-7xl">
        <LoadingState title="Loading workspace" />
      </PortalPageLayout>
    );
  }
  if (error || !detail) {
    return (
      <PortalPageLayout eyebrow="Nexora Lab Member360" title="Member unavailable" navItems={PORTAL_NAV_ITEMS} currentNav="member360-lab" maxWidthClassName="max-w-7xl">
        <ErrorState title="Could not open member" description={error || 'Member not found'} />
        <button type="button" onClick={() => navigate(ROUTES.MEMBER360_LAB.MEMBERS)} className="mt-3 rounded-md bg-[var(--brand-primary)] text-white px-3 py-1.5 text-xs font-semibold">Back to members</button>
      </PortalPageLayout>
    );
  }

  return (
    <PortalPageLayout
      eyebrow="Nexora Lab Member360"
      title={`${member.first_name || ''} ${member.last_name || ''}`.trim() || member.member_key}
      subtitle={`${member.member_key} · ${member.plan_name || 'Plan unknown'}`}
      navItems={PORTAL_NAV_ITEMS}
      currentNav="member360-lab"
      navProps={{ align: 'center', tone: 'surface' }}
      maxWidthClassName="max-w-[1500px]"
      mainClassName="space-y-4"
      hideHeader
    >
      <RecordHeader
        member={member}
        gapCount={missingHccCount}
        onAction={(key) => handleAction(key)}
        actions={PRIMARY_ACTIONS}
        onBack={() => navigate(ROUTES.MEMBER360_LAB.MEMBERS)}
        onDashboard={() => navigate(ROUTES.MEMBER360_LAB.DASHBOARD)}
        pcpHref={pcpHref}
        pcpState={pcpState}
      />

      {actionMessage && (
        <div className="rounded-lg ring-1 ring-emerald-200 dark:ring-emerald-700/40 bg-emerald-50/70 dark:bg-emerald-900/20 px-3 py-2 text-sm coding-text-strong">
          {actionMessage}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAiOpen((v) => !v)}
          className="rounded-md ring-1 coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)] px-3 py-1.5 text-sm font-semibold"
          aria-expanded={aiOpen}
        >
          {aiOpen ? 'Close AI assistant' : 'Ask AI about this member'}
        </button>
      </div>

      {aiOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-auto border-l coding-border bg-[var(--coding-surface,#fff)] shadow-2xl">
          <AiAssistantPanel
            memberId={member.member_key}
            title={`Ask about ${member.first_name || member.member_key}`}
            onClose={() => setAiOpen(false)}
          />
        </div>
      )}

      <section className="coding-surface rounded-2xl shadow-sm">
        <WorkspaceTabs tabs={TABS} activeKey={tab} onChange={setTab} />
        <div className="p-4">
          {/* Scope an error boundary to each tab so a broken sub-page
              (e.g. a chart sub-page that throws on unexpected detail
              shape) doesn't blank the whole workspace. `key={tab}`
              resets the boundary whenever the user switches tabs, so a
              previously-broken tab works again on next visit if the
              underlying data has recovered. */}
          <ErrorBoundary
            key={tab}
            fallback={({ error, resetError }) => (
              <div className="rounded-lg ring-1 ring-rose-200 dark:ring-rose-700/40 bg-rose-50/60 dark:bg-rose-900/15 px-3 py-3 text-sm">
                <p className="font-semibold coding-text-strong">This tab failed to render.</p>
                <p className="text-xs coding-text-soft mt-0.5">
                  The other tabs are unaffected. Switch tabs or click "Try again" below.
                </p>
                {error?.message && (
                  <pre className="mt-2 max-h-32 overflow-auto rounded bg-rose-100/60 dark:bg-rose-900/30 px-2 py-1.5 text-[11px] coding-text-strong">
                    {error.message}
                  </pre>
                )}
                <button
                  type="button"
                  onClick={resetError}
                  className="mt-2 inline-flex items-center rounded-md bg-[var(--brand-primary)] text-white px-2.5 py-1 text-xs font-semibold hover:bg-brand-700"
                >
                  Try again
                </button>
              </div>
            )}
          >
            {tabContent}
          </ErrorBoundary>
        </div>
      </section>

      <div className="grid grid-cols-12 gap-4">
        {/* Left rail — properties */}
        <div className="col-span-12 xl:col-span-6 space-y-4">
          <MemberSummaryCard
            member={member}
            pcpHref={pcpHref}
            pcpState={pcpState}
            onSaveField={saveMemberField}
          />

          <SectionCard
            title="Coding actions"
            subtitle="Preview a payer submission for this member."
          >
            <button
              type="button"
              onClick={onSubmitToPayer}
              disabled={submissionState === 'working'}
              className="w-full rounded-md bg-[var(--brand-primary)] text-white px-3 py-2 text-xs font-semibold hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submissionState === 'working' ? 'Generating export...' : 'Submit to Payer (Preview)'}
            </button>
            {submissionResult?.batch_id && (
              <div className="mt-2 space-y-1">
                <p className="text-[11px] coding-text-muted">
                  Last batch {submissionResult.batch_id}
                  {submissionResult.record_count != null
                    ? ` · ${submissionResult.record_count} record${submissionResult.record_count === 1 ? '' : 's'}`
                    : ''}
                </p>
                {submissionResult.csv && (
                  <button
                    type="button"
                    onClick={() => downloadSubmissionCsv(submissionResult, member?.member_key)}
                    className="text-[11px] font-semibold text-[var(--brand-primary)] hover:underline"
                  >
                    Download CSV again
                  </button>
                )}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right rail — associations */}
        <div className="col-span-12 xl:col-span-6 space-y-4">
          <GuidedTriagePanel member={member} onAction={(key, payload) => handleAction(key, payload)} />
          <RiskInsightsCard member={member} insights={detail.risk_insights} />
          <SectionCard title="Recommended care options" subtitle="Steer toward lower-cost, high-quality providers.">
            <div className="space-y-2">
              {(detail.care_options || []).map((o) => (
                <CareOptionCard key={o.id} option={o} />
              ))}
              {(detail.care_options || []).length === 0 && (
                <p className="text-xs coding-text-soft">No care option recommendations yet. Use the triage panel to create one.</p>
              )}
            </div>
          </SectionCard>
          <SavingsCard savings={detail.savings || []} />
        </div>
      </div>

      {actionDialog && (
        <ActionDialog
          dialog={actionDialog}
          member={member}
          journeyTemplates={journeyTemplates}
          onSubmit={submitDialog}
          onCancel={() => setActionDialog(null)}
        />
      )}
    </PortalPageLayout>
  );
};

function ActionDialog({ dialog, member, journeyTemplates = [], onSubmit, onCancel }) {
  const [form, setForm] = useState(() => {
    const rec = dialog.payload?.recommendation;
    if (dialog.key === 'create_task') {
      return {
        title: rec?.summary?.slice(0, 80) || '',
        priority: 'medium',
        due_date: '',
        sbar: {
          situation: rec?.summary || '',
          background: '',
          assessment: '',
          recommendation: rec?.summary || '',
        },
      };
    }
    if (dialog.key === 'add_note') {
      return { body: rec?.summary || '', channel: 'Internal', note_type: 'Outreach' };
    }
    if (dialog.key === 'send_message') {
      return { channel: member?.preferred_channel || 'SMS', body: rec?.summary || '' };
    }
    if (dialog.key === 'recommend_care_option') {
      return {
        service_type: '',
        recommended_provider: '',
        cost_estimate: '',
        quality_score: '',
        distance_miles: '',
        network_status: 'In Network',
        potential_savings: '',
        rationale: rec?.summary || '',
        member_facing_explanation: rec?.summary || '',
      };
    }
    if (dialog.key === 'start_journey') {
      return {
        template_id: '',
        name: rec?.summary?.slice(0, 80) || '',
        description: rec?.summary || '',
        assigned_to: '',
        start_date: '',
        target_completion_date: '',
      };
    }
    if (dialog.key === 'escalate') {
      return {
        reason: rec?.summary || '',
        priority: 'urgent',
        assigned_queue: 'RN',
        due_date: '',
        recommendation: rec?.summary || '',
      };
    }
    return {};
  });

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const updateSbar = (key, value) => setForm((prev) => ({ ...prev, sbar: { ...prev.sbar, [key]: value } }));

  const title = {
    create_task: 'Create task',
    add_note: 'Add note',
    send_message: 'Send message',
    recommend_care_option: 'Create care option report',
    start_journey: 'Start care journey',
    escalate: 'Escalate to RN',
  }[dialog.key] || 'Action';

  const memberLabel = [member?.first_name, member?.last_name].filter(Boolean).join(' ');
  const subtitle = memberLabel ? `${memberLabel} · ${member?.member_key}` : member?.member_key;

  return (
    <WorkspaceDrawer
      title={title}
      subtitle={subtitle}
      onClose={onCancel}
      footer={
        <>
          <button type="button" onClick={onCancel} className="rounded-md ring-1 coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)] px-3 py-1.5 text-xs font-semibold">
            Cancel
          </button>
          <button type="button" onClick={() => onSubmit(form)} className="rounded-md bg-[var(--brand-primary)] text-white px-3 py-1.5 text-xs font-semibold hover:bg-brand-700">
            Submit
          </button>
        </>
      }
    >
      <div className="flex items-center justify-between -mt-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] coding-text-muted">Member context</span>
        <RiskBadge tier={member?.risk_tier} score={member?.risk_score_composite} />
      </div>

      {dialog.key === 'create_task' && (
        <div className="space-y-3">
          <Input label="Title" value={form.title} onChange={(v) => update('title', v)} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Priority" value={form.priority} onChange={(v) => update('priority', v)} options={['low', 'medium', 'high', 'urgent']} />
            <Input type="date" label="Due date" value={form.due_date} onChange={(v) => update('due_date', v)} />
          </div>
          <h4 className="text-[11px] uppercase tracking-[0.14em] font-semibold coding-text-muted pt-1">SBAR</h4>
          <Textarea label="Situation" value={form.sbar.situation} onChange={(v) => updateSbar('situation', v)} />
          <Textarea label="Background" value={form.sbar.background} onChange={(v) => updateSbar('background', v)} />
          <Textarea label="Assessment" value={form.sbar.assessment} onChange={(v) => updateSbar('assessment', v)} />
          <Textarea label="Recommendation" value={form.sbar.recommendation} onChange={(v) => updateSbar('recommendation', v)} />
        </div>
      )}

      {dialog.key === 'add_note' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Select label="Channel" value={form.channel} onChange={(v) => update('channel', v)} options={['Internal', 'Phone', 'Chat', 'SMS', 'Secure Message', 'Email']} />
            <Input label="Note type" value={form.note_type} onChange={(v) => update('note_type', v)} />
          </div>
          <Textarea label="Body" value={form.body} onChange={(v) => update('body', v)} rows={5} />
        </div>
      )}

      {dialog.key === 'send_message' && (
        <div className="space-y-3">
          <Select label="Channel" value={form.channel} onChange={(v) => update('channel', v)} options={['SMS', 'Chat', 'Secure Message', 'Email']} />
          <Textarea label="Message" value={form.body} onChange={(v) => update('body', v)} rows={4} />
          <p className="text-[11px] coding-text-muted">Recipient: {member?.phone || member?.email || member?.member_key}</p>
        </div>
      )}

      {dialog.key === 'recommend_care_option' && (
        <div className="space-y-3">
          <Input label="Service type" value={form.service_type} onChange={(v) => update('service_type', v)} placeholder="e.g. MRI - Shoulder" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Recommended provider / facility" value={form.recommended_provider} onChange={(v) => update('recommended_provider', v)} />
            <Select label="Network status" value={form.network_status} onChange={(v) => update('network_status', v)} options={['In Network', 'Out of Network', 'Tier 1', 'Tier 2']} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Cost ($)" value={form.cost_estimate} onChange={(v) => update('cost_estimate', v)} placeholder="640" />
            <Input label="Quality" value={form.quality_score} onChange={(v) => update('quality_score', v)} placeholder="4.7" />
            <Input label="Distance (mi)" value={form.distance_miles} onChange={(v) => update('distance_miles', v)} placeholder="5.2" />
            <Input label="Savings ($)" value={form.potential_savings} onChange={(v) => update('potential_savings', v)} placeholder="620" />
          </div>
          <Textarea label="Rationale (internal)" value={form.rationale} onChange={(v) => update('rationale', v)} rows={3} />
          <Textarea label="Member-facing explanation" value={form.member_facing_explanation} onChange={(v) => update('member_facing_explanation', v)} rows={3} />
        </div>
      )}

      {dialog.key === 'start_journey' && (
        <div className="space-y-3">
          {journeyTemplates.length > 0 ? (
            <label className="block">
              <span className="block text-[11px] font-semibold coding-text-muted uppercase tracking-wider mb-1">Template</span>
              <select
                value={form.template_id || ''}
                onChange={(e) => {
                  const id = e.target.value;
                  const tpl = journeyTemplates.find((t) => String(t.id) === id);
                  setForm((prev) => ({
                    ...prev,
                    template_id: id,
                    name: prev.name || tpl?.name || '',
                    description: prev.description || tpl?.description || '',
                  }));
                }}
                className="coding-input w-full rounded-md px-2 py-1.5 text-sm"
              >
                <option value="">— No template (freeform) —</option>
                {journeyTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.recommended_for_risk_tier ? ` · ${t.recommended_for_risk_tier} risk` : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-[11px] coding-text-muted">No templates configured. Creating a freeform journey.</p>
          )}
          <Input label="Name" value={form.name} onChange={(v) => update('name', v)} placeholder="Heart failure stabilization" />
          <Textarea label="Description" value={form.description} onChange={(v) => update('description', v)} rows={3} />
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" label="Start date" value={form.start_date} onChange={(v) => update('start_date', v)} />
            <Input type="date" label="Target completion" value={form.target_completion_date} onChange={(v) => update('target_completion_date', v)} />
          </div>
          <Input label="Assigned to (email)" value={form.assigned_to} onChange={(v) => update('assigned_to', v)} placeholder="rn@plan.com" />
        </div>
      )}

      {dialog.key === 'escalate' && (
        <div className="space-y-3">
          <Textarea label="Reason for escalation" value={form.reason} onChange={(v) => update('reason', v)} rows={3} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Priority" value={form.priority} onChange={(v) => update('priority', v)} options={['urgent', 'high', 'medium']} />
            <Select label="Queue" value={form.assigned_queue} onChange={(v) => update('assigned_queue', v)} options={['RN', 'MD', 'Pharmacy', 'Behavioral Health', 'Care Management']} />
          </div>
          <Input type="date" label="Due date" value={form.due_date} onChange={(v) => update('due_date', v)} />
          <Textarea label="Recommended next action" value={form.recommendation} onChange={(v) => update('recommendation', v)} rows={2} />
        </div>
      )}
    </WorkspaceDrawer>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold coding-text-muted uppercase tracking-wider mb-1">{label}</span>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="coding-input w-full rounded-md px-2 py-1.5 text-sm"
      />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold coding-text-muted uppercase tracking-wider mb-1">{label}</span>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)} className="coding-input w-full rounded-md px-2 py-1.5 text-sm">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Textarea({ label, value, onChange, rows = 3 }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold coding-text-muted uppercase tracking-wider mb-1">{label}</span>
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="coding-input w-full rounded-md px-2 py-1.5 text-sm"
      />
    </label>
  );
}

export default Member360LabWorkspace;
