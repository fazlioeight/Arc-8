import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PortalPageLayout from '../../../components/PortalPageLayout';
import { AuthContext } from '../../../context/AuthContext';
import { LoadingState, ErrorState } from '../../../components/ehr/Primitives';
import { PORTAL_NAV_ITEMS } from '../portal_page/portalNavItems';
import { ROUTES } from '../../../constants/routes';
import {
  createMember360Task,
  evaluateMember360TaskEscalations,
  fetchMember360Members,
  fetchMember360Tasks,
  updateMember360Task,
} from '../../../services/member360LabService';
import { fetchTaskQueues } from '../../../services/member360AdminService';
import { LabSubNav, Pagination, PriorityBadge, RiskBadge, TaskStatusBadge } from './components';
import FilterDropdown from '../../../components/ui/FilterDropdown';
import KpiTile from '../../../components/ui/KpiTile';
import SavedViewsBar from '../../../components/ui/SavedViewsBar';
import SearchInput from '../../../components/ui/SearchInput';

const PAGE_SIZE = 500;
const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

const COORDINATORS = [
  'Hannah Abbott, CCM',
  'Sarah Chen, RN',
  'Elena Rostova, RN',
  'Marcus Vance, MSW',
];

const DEFAULT_QUEUES = [
  { key: 'RN Complex Care & Transitions of Care Queue', label: 'RN Complex Care & Transitions of Care Queue' },
  { key: 'Care Coordinator Outreach & Gap Closure Queue', label: 'Care Coordinator Outreach & Gap Closure Queue' },
  { key: 'Pharmacy & Prior Authorization (Abarca PBM) Queue', label: 'Pharmacy & Prior Authorization (Abarca PBM) Queue' },
  { key: 'Clinical Supervisor Escalation Queue', label: 'Clinical Supervisor Escalation Queue' },
];

const CANONICAL_QUEUE_KEYS = new Set(DEFAULT_QUEUES.map((q) => q.key));

const LEGACY_QUEUE_MAP = {
  care_management: 'RN Complex Care & Transitions of Care Queue',
  'care management': 'RN Complex Care & Transitions of Care Queue',
  care_coordination: 'RN Complex Care & Transitions of Care Queue',
  'care coordination': 'RN Complex Care & Transitions of Care Queue',
  clinical_quality: 'RN Complex Care & Transitions of Care Queue',
  'clinical quality': 'RN Complex Care & Transitions of Care Queue',
  rn: 'RN Complex Care & Transitions of Care Queue',
  clinical: 'RN Complex Care & Transitions of Care Queue',
  outreach: 'Care Coordinator Outreach & Gap Closure Queue',
  'outreach & engagement': 'Care Coordinator Outreach & Gap Closure Queue',
  'outreach_&_engagement': 'Care Coordinator Outreach & Gap Closure Queue',
  coding: 'Care Coordinator Outreach & Gap Closure Queue',
  coding_review: 'Care Coordinator Outreach & Gap Closure Queue',
  'coding review': 'Care Coordinator Outreach & Gap Closure Queue',
  care_coordinator: 'Care Coordinator Outreach & Gap Closure Queue',
  'care coordinator': 'Care Coordinator Outreach & Gap Closure Queue',
  pharmacy: 'Pharmacy & Prior Authorization (Abarca PBM) Queue',
  pbm: 'Pharmacy & Prior Authorization (Abarca PBM) Queue',
  prior_auth: 'Pharmacy & Prior Authorization (Abarca PBM) Queue',
  'prior auth': 'Pharmacy & Prior Authorization (Abarca PBM) Queue',
  supervisor_escalation: 'Clinical Supervisor Escalation Queue',
  'supervisor escalation': 'Clinical Supervisor Escalation Queue',
  supervisor: 'Clinical Supervisor Escalation Queue',
};

const normalizeQueueName = (raw) => {
  if (!raw || !String(raw).trim()) return 'RN Complex Care & Transitions of Care Queue';
  const clean = String(raw).trim();
  if (CANONICAL_QUEUE_KEYS.has(clean)) return clean;
  const low = clean.toLowerCase();
  const slug = low.replace(/[\s_-]+/g, '_');
  if (LEGACY_QUEUE_MAP[low]) return LEGACY_QUEUE_MAP[low];
  if (LEGACY_QUEUE_MAP[slug]) return LEGACY_QUEUE_MAP[slug];
  if (low.includes('supervisor') || low.includes('escalat')) return 'Clinical Supervisor Escalation Queue';
  if (low.includes('pharm') || low.includes('pbm') || low.includes('prior') || low.includes('abarca') || low.includes('med')) {
    return 'Pharmacy & Prior Authorization (Abarca PBM) Queue';
  }
  if (low.includes('outreach') || low.includes('coding') || low.includes('gap') || low.includes('coordinator')) {
    return 'Care Coordinator Outreach & Gap Closure Queue';
  }
  return 'RN Complex Care & Transitions of Care Queue';
};

const EMAIL_TO_COORDINATOR = {
  'care.team@prominencehealth.com': 'Sarah Chen, RN',
  'sarah.chen@prominencehealth.com': 'Sarah Chen, RN',
  'rn@prominencehealth.com': 'Sarah Chen, RN',
  'clinical@prominencehealth.com': 'Sarah Chen, RN',
  'dr.chen@prominencehealth.com': 'Sarah Chen, RN',
  'coordinator@prominencehealth.com': 'Hannah Abbott, CCM',
  'hannah.abbott@prominencehealth.com': 'Hannah Abbott, CCM',
  'outreach@prominencehealth.com': 'Hannah Abbott, CCM',
  'coding@prominencehealth.com': 'Hannah Abbott, CCM',
  'elena.nurse@prominencehealth.com': 'Elena Rostova, RN',
  'elena.rostova@prominencehealth.com': 'Elena Rostova, RN',
  'pharmacy@prominencehealth.com': 'Elena Rostova, RN',
  'pbm@prominencehealth.com': 'Elena Rostova, RN',
  'supervisor@prominencehealth.com': 'Marcus Vance, MSW',
  'marcus.vance@prominencehealth.com': 'Marcus Vance, MSW',
};

const normalizeAssigneeName = (raw) => {
  if (!raw || !String(raw).trim()) return '';
  const clean = String(raw).trim();
  if (COORDINATORS.includes(clean)) return clean;
  const low = clean.toLowerCase();
  if (EMAIL_TO_COORDINATOR[low]) return EMAIL_TO_COORDINATOR[low];
  if (low.includes('@')) {
    if (low.includes('outreach') || low.includes('coord') || low.includes('coding') || low.includes('hannah') || low.includes('abbott')) {
      return 'Hannah Abbott, CCM';
    }
    if (low.includes('supervis') || low.includes('escalat') || low.includes('marcus') || low.includes('vance')) {
      return 'Marcus Vance, MSW';
    }
    if (low.includes('pharm') || low.includes('pbm') || low.includes('elena') || low.includes('rostova')) {
      return 'Elena Rostova, RN';
    }
    return 'Sarah Chen, RN';
  }
  return clean;
};

const STATUSES = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'escalated', label: 'Escalated (Supervisor)' },
  { key: 'completed', label: 'Completed' },
];

const PRIORITIES = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
];

const DUE_OPTIONS = [
  { key: 'any', label: 'Any due date' },
  { key: 'overdue', label: 'Overdue (SLA Breach)' },
  { key: 'today', label: 'Due today' },
  { key: 'week', label: 'Next 7 days' },
];

const SORT_OPTIONS = [
  { key: 'priority', label: 'Priority (urgent first)' },
  { key: 'due', label: 'Due date (soonest)' },
  { key: 'risk', label: 'Member risk tier' },
  { key: 'recent', label: 'Recently updated' },
];

const SAVED_VIEWS = [
  { key: 'all', label: 'All tasks' },
  { key: 'my_todo', label: 'My To-Do', statuses: ['open', 'in_progress', 'waiting'] },
  { key: 'open', label: 'Open & in progress', statuses: ['open', 'in_progress'] },
  { key: 'supervisor', label: 'Supervisor Queue (Escalated)', statuses: ['escalated'] },
  { key: 'urgent', label: 'Urgent', priorities: ['urgent'], statuses: ['open', 'in_progress', 'waiting', 'escalated'] },
  { key: 'overdue', label: 'Overdue / SLA Breach', due: 'overdue' },
  { key: 'completed', label: 'Completed', statuses: ['completed'] },
];

const getTodayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const startOfDay = (d) => {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) {
    const [y, m, day] = d.trim().split('-').map(Number);
    return new Date(y, m - 1, day, 0, 0, 0, 0);
  }
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const isTaskOverdueOrSlaBreached = (t, todayDate) => {
  if (!t || t.status === 'completed') return false;
  const pastDue = Boolean(t.due_date && startOfDay(t.due_date) < todayDate);
  const hasSlaBreach = Boolean(
    t.auto_generated_reason && /sla breach/i.test(t.auto_generated_reason)
  );
  return pastDue || hasSlaBreach;
};

const TASKS_FILTER_STORAGE_KEY = 'arc8.tasks.filters.v1';

const readSavedTaskFilters = (searchParams) => {
  let stored = null;
  try {
    const raw = window.sessionStorage.getItem(TASKS_FILTER_STORAGE_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch (_err) {
    stored = null;
  }

  const hasUrlParams =
    searchParams.has('status') ||
    searchParams.has('priority') ||
    searchParams.has('due') ||
    searchParams.has('sort') ||
    searchParams.has('q') ||
    searchParams.has('view');

  if (hasUrlParams) {
    const rawStatus = searchParams.get('status');
    const statuses =
      rawStatus === null
        ? stored?.statuses ?? ['open', 'in_progress']
        : rawStatus === 'none' || rawStatus === ''
        ? []
        : rawStatus.split(',').filter(Boolean);
    const rawPriority = searchParams.get('priority');
    const priorities =
      rawPriority === null
        ? stored?.priorities ?? []
        : rawPriority === 'none' || rawPriority === ''
        ? []
        : rawPriority.split(',').filter(Boolean);
    return {
      search: searchParams.get('q') ?? stored?.search ?? '',
      activeView:
        searchParams.get('view') ??
        stored?.activeView ??
        (statuses.length === 2 && statuses.includes('open') && statuses.includes('in_progress') ? 'open' : 'all'),
      statuses,
      priorities,
      due: searchParams.get('due') || stored?.due || 'any',
      sortKey: searchParams.get('sort') || stored?.sortKey || 'priority',
    };
  }

  if (stored && typeof stored === 'object') {
    return {
      search: typeof stored.search === 'string' ? stored.search : '',
      activeView: typeof stored.activeView === 'string' ? stored.activeView : 'open',
      statuses: Array.isArray(stored.statuses) ? stored.statuses : ['open', 'in_progress'],
      priorities: Array.isArray(stored.priorities) ? stored.priorities : [],
      due: typeof stored.due === 'string' ? stored.due : 'any',
      sortKey: typeof stored.sortKey === 'string' ? stored.sortKey : 'priority',
    };
  }

  return {
    search: '',
    activeView: 'open',
    statuses: ['open', 'in_progress'],
    priorities: [],
    due: 'any',
    sortKey: 'priority',
  };
};

const Member360LabTasksPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { token, tenant, user } = useContext(AuthContext) || {};
  const currentCoordinatorName =
    EMAIL_TO_COORDINATOR[(user?.email || '').toLowerCase()] || 'Hannah Abbott, CCM';

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bannerMsg, setBannerMsg] = useState(null);

  const [initialFilters] = useState(() => readSavedTaskFilters(searchParams));
  const [search, setSearch] = useState(initialFilters.search);
  const [activeView, setActiveView] = useState(initialFilters.activeView);
  const [statuses, setStatuses] = useState(initialFilters.statuses);
  const [priorities, setPriorities] = useState(initialFilters.priorities);
  const [due, setDue] = useState(initialFilters.due);
  const [assigneeFilter, setAssigneeFilter] = useState('any');
  const [queueFilter, setQueueFilter] = useState('any');
  const [sortKey, setSortKey] = useState(initialFilters.sortKey);
  const [refreshKey, setRefreshKey] = useState(0);
  const [adminQueues, setAdminQueues] = useState(DEFAULT_QUEUES);

  // Create Task Modal state (A8S-75 / A8S-76 / A8S-175)
  const [createOpen, setCreateOpen] = useState(false);
  const [membersRoster, setMembersRoster] = useState([]);
  const [createForm, setCreateForm] = useState({
    member_id: '',
    title: '',
    priority: 'high',
    assigned_queue: 'RN Complex Care & Transitions of Care Queue',
    assigned_user: currentCoordinatorName,
    due_date: getTodayIso(),
    recommended_next_action: '',
    sbar_situation: '',
    sbar_background: '',
    sbar_assessment: '',
    sbar_recommendation: '',
  });
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState(null);

  // Escalate Task Modal state (A8S-77 / A8S-78)
  const [escalateTaskTarget, setEscalateTaskTarget] = useState(null);
  const [escalateReason, setEscalateReason] = useState('');
  const [escalateAction, setEscalateAction] = useState('');
  const [escalateBusy, setEscalateBusy] = useState(false);
  const [slaEvalBusy, setSlaEvalBusy] = useState(false);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        TASKS_FILTER_STORAGE_KEY,
        JSON.stringify({ search, activeView, statuses, priorities, due, sortKey })
      );
    } catch (_err) {
      // Ignore storage quota errors
    }
    const next = new URLSearchParams();
    next.set('status', statuses.length > 0 ? statuses.join(',') : 'none');
    if (priorities.length > 0) next.set('priority', priorities.join(','));
    if (due && due !== 'any') next.set('due', due);
    if (sortKey && sortKey !== 'priority') next.set('sort', sortKey);
    if (search.trim()) next.set('q', search.trim());
    if (activeView) next.set('view', activeView);
    setSearchParams(next, { replace: true });
  }, [search, activeView, statuses, priorities, due, sortKey, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMember360Tasks(token, tenant, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        const normalizedItems = (res.items || []).map((t) => ({
          ...t,
          assigned_queue: normalizeQueueName(t.assigned_queue),
          assigned_user: normalizeAssigneeName(t.assigned_user),
        }));
        setRows(normalizedItems);
        setTotal(res.total || 0);
        setError(null);
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
  }, [token, tenant, refreshKey, page]);

  useEffect(() => {
    if (!token || !tenant) return;
    fetchTaskQueues(token, tenant)
      .then((list) => {
        if (Array.isArray(list) && list.length > 0) {
          const mapped = list.map((q) => ({ key: q.name, label: q.name }));
          setAdminQueues(mapped);
          setCreateForm((prev) => ({
            ...prev,
            assigned_queue: mapped.some((m) => m.key === prev.assigned_queue)
              ? prev.assigned_queue
              : mapped[0].key,
          }));
        }
      })
      .catch(() => {});
  }, [token, tenant]);

  useEffect(() => {
    if (!createOpen || membersRoster.length > 0 || !token || !tenant) return;
    fetchMember360Members(token, tenant, { limit: 150 })
      .then((res) => {
        const items = res?.items || [];
        setMembersRoster(items);
      })
      .catch(() => {});
  }, [createOpen, membersRoster.length, token, tenant]);

  const applySavedView = (key) => {
    const view = SAVED_VIEWS.find((v) => v.key === key);
    setActiveView(key);
    setStatuses(view?.statuses || []);
    setPriorities(view?.priorities || []);
    setDue(view?.due || 'any');
    if (key === 'my_todo') {
      setAssigneeFilter(currentCoordinatorName);
    } else {
      setAssigneeFilter('any');
      if (key === 'all' || key === 'supervisor') {
        setQueueFilter('any');
      }
    }
  };

  const toggleStatus = (key) => {
    setStatuses((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      if (next.length === 0 && priorities.length === 0 && due === 'any') setActiveView('all');
      else if (next.length === 2 && next.includes('open') && next.includes('in_progress') && priorities.length === 0 && due === 'any') setActiveView('open');
      else if (next.length === 1 && next[0] === 'escalated' && priorities.length === 0 && due === 'any') setActiveView('supervisor');
      else if (next.length === 1 && next[0] === 'completed' && priorities.length === 0 && due === 'any') setActiveView('completed');
      else setActiveView('custom');
      return next;
    });
  };
  const togglePriority = (key) => {
    setPriorities((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      setActiveView('custom');
      return next;
    });
  };

  const filtered = useMemo(() => {
    const today = startOfDay(new Date());
    const weekOut = new Date(today.getTime() + 7 * 86400000);
    return rows
      .filter((t) => {
        if (activeView === 'urgent' && t.status === 'completed') return false;
        if (activeView === 'supervisor' && t.status !== 'escalated' && t.assigned_queue !== 'Clinical Supervisor Escalation Queue') return false;
        if (statuses.length > 0 && !statuses.includes(t.status)) return false;
        if (priorities.length > 0 && !priorities.includes(t.priority)) return false;
        if (assigneeFilter !== 'any' && (t.assigned_user || '') !== assigneeFilter) return false;
        if (queueFilter !== 'any' && (t.assigned_queue || '') !== queueFilter) return false;
        if (search && search.trim()) {
          const term = search.trim().toLowerCase();
          const hay = [
            t.title,
            t.member_name,
            t.member_key,
            t.assigned_queue,
            t.assigned_user,
            t.legacy_assignee,
            t.recommended_next_action,
            t.sbar?.situation,
            t.sbar?.background,
            t.sbar?.assessment,
            t.sbar?.recommendation,
            t.auto_generated_reason,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!hay.includes(term)) return false;
        }
        if (due !== 'any') {
          if (due === 'overdue') {
            if (!isTaskOverdueOrSlaBreached(t, today)) return false;
          } else {
            if (!t.due_date) return false;
            const d = startOfDay(t.due_date);
            if (due === 'today' && d.getTime() !== today.getTime()) return false;
            if (due === 'week' && (d < today || d > weekOut)) return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (sortKey === 'priority') return (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4);
        if (sortKey === 'due') return new Date(a.due_date || 0) - new Date(b.due_date || 0);
        if (sortKey === 'risk') {
          const order = { Critical: 0, High: 1, Moderate: 2, Low: 3 };
          return (order[a.risk_tier] ?? 4) - (order[b.risk_tier] ?? 4);
        }
        if (sortKey === 'recent') return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
        return 0;
      });
  }, [rows, activeView, statuses, priorities, assigneeFilter, queueFilter, due, search, sortKey]);

  const summary = useMemo(() => {
    const today = startOfDay(new Date());
    return {
      total: rows.length,
      open: rows.filter((t) => ['open', 'in_progress', 'waiting'].includes(t.status)).length,
      urgent: rows.filter((t) => t.priority === 'urgent' && t.status !== 'completed').length,
      overdue: rows.filter((t) => isTaskOverdueOrSlaBreached(t, today)).length,
      escalated: rows.filter((t) => t.status === 'escalated' || t.assigned_queue === 'Clinical Supervisor Escalation Queue').length,
    };
  }, [rows]);

  const advance = async (task, newStatus) => {
    try {
      await updateMember360Task(token, tenant, task.id, { status: newStatus });
      setBannerMsg(`Task "${task.title}" updated to ${newStatus.replace('_', ' ')}.`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || String(err));
    }
  };

  const reassignTask = async (task, patchPayload) => {
    try {
      await updateMember360Task(token, tenant, task.id, patchPayload);
      setBannerMsg(`Task "${task.title}" assignment updated.`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || String(err));
    }
  };

  const handleCreateTaskSubmit = async (e) => {
    e.preventDefault();
    setCreateErr(null);
    if (!createForm.member_id) {
      setCreateErr('Please select a member.');
      return;
    }
    if (!createForm.title.trim()) {
      setCreateErr('Task title is required.');
      return;
    }
    setCreateBusy(true);
    try {
      const created = await createMember360Task(token, tenant, {
        member_id: Number(createForm.member_id),
        title: createForm.title.trim(),
        priority: createForm.priority,
        status: 'open',
        assigned_queue: createForm.assigned_queue,
        assigned_user: createForm.assigned_user,
        due_date: createForm.due_date || undefined,
        recommended_next_action: createForm.recommended_next_action.trim() || null,
        sbar: {
          situation: createForm.sbar_situation.trim() || null,
          background: createForm.sbar_background.trim() || null,
          assessment: createForm.sbar_assessment.trim() || null,
          recommendation: createForm.sbar_recommendation.trim() || createForm.recommended_next_action.trim() || null,
        },
      });
      setCreateOpen(false);
      setCreateForm((prev) => ({
        ...prev,
        member_id: '',
        title: '',
        recommended_next_action: '',
        sbar_situation: '',
        sbar_background: '',
        sbar_assessment: '',
        sbar_recommendation: '',
      }));
      setBannerMsg(`Created task "${created.title}" and assigned to ${created.assigned_user || created.assigned_queue}.`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setCreateErr(err.message || String(err));
    } finally {
      setCreateBusy(false);
    }
  };

  const handleEscalateSubmit = async (e) => {
    e.preventDefault();
    if (!escalateTaskTarget || !escalateReason.trim()) return;
    setEscalateBusy(true);
    try {
      await updateMember360Task(token, tenant, escalateTaskTarget.id, {
        status: 'escalated',
        priority: 'urgent',
        assigned_queue: 'Clinical Supervisor Escalation Queue',
        assigned_user: 'Marcus Vance, MSW',
        recommended_next_action: escalateAction.trim() || escalateTaskTarget.recommended_next_action || 'Supervisor review required',
        auto_generated_reason: `Escalated to Supervisor Queue: ${escalateReason.trim()}`,
        sbar: {
          situation: escalateReason.trim(),
          background: escalateTaskTarget.sbar?.background || null,
          assessment: escalateTaskTarget.sbar?.assessment || null,
          recommendation: escalateAction.trim() || escalateTaskTarget.sbar?.recommendation || 'Supervisor intervention required',
        },
      });
      setBannerMsg(`Escalated "${escalateTaskTarget.title}" to Clinical Supervisor Escalation Queue.`);
      setEscalateTaskTarget(null);
      setEscalateReason('');
      setEscalateAction('');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setEscalateBusy(false);
    }
  };

  const runSlaEscalationTriggers = async () => {
    setSlaEvalBusy(true);
    try {
      const res = await evaluateMember360TaskEscalations(token, tenant);
      setBannerMsg(
        `SLA Escalation Check complete: evaluated ${res.evaluated} active tasks, auto-escalated ${res.escalated} SLA-breached tasks to Supervisor Queue.`
      );
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSlaEvalBusy(false);
    }
  };

  const activeFilterCount =
    (statuses.length > 0 ? 1 : 0) +
    (priorities.length > 0 ? 1 : 0) +
    (due !== 'any' ? 1 : 0) +
    (assigneeFilter !== 'any' ? 1 : 0) +
    (queueFilter !== 'any' ? 1 : 0);

  const dueLabel = useMemo(() => {
    if (due === 'any') return null;
    return DUE_OPTIONS.find((o) => o.key === due)?.label || null;
  }, [due]);

  const today = startOfDay(new Date());

  return (
    <PortalPageLayout
      eyebrow="Arc-8 Member360"
      title="Coordinator Worklist & Supervisor Escalation Queue"
      subtitle="Task creation, coordinator to-do assignments, configurable SLA escalation triggers, and supervisor review."
      navItems={PORTAL_NAV_ITEMS}
      currentNav="member360-lab"
      navProps={{ align: 'center', tone: 'surface' }}
      align="left"
      maxWidthClassName="max-w-7xl"
      mainClassName="space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LabSubNav />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runSlaEscalationTriggers}
            disabled={slaEvalBusy}
            className="rounded-lg ring-1 ring-amber-400/70 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200 px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {slaEvalBusy ? 'Evaluating SLA Triggers…' : '⚡ Run SLA Escalation Check'}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateErr(null);
              setCreateForm((prev) => ({ ...prev, member_id: '' }));
              setCreateOpen(true);
            }}
            className="rounded-lg bg-[var(--brand-primary)] text-white px-3.5 py-1.5 text-xs font-semibold shadow-xs hover:opacity-90"
          >
            + Create Task
          </button>
        </div>
      </div>

      {bannerMsg && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl ring-1 ring-emerald-200 dark:ring-emerald-700/40 bg-emerald-50/80 dark:bg-emerald-900/20 px-4 py-2.5 text-xs coding-text-strong"
        >
          <span>{bannerMsg}</span>
          <button type="button" onClick={() => setBannerMsg(null)} className="text-xs coding-text-muted hover:coding-text-strong">
            ✕
          </button>
        </div>
      )}

      {/* KPI strip */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="cursor-pointer" onClick={() => applySavedView('all')}>
          <KpiTile label="All tasks" value={summary.total} />
        </div>
        <div className="cursor-pointer" onClick={() => applySavedView('open')}>
          <KpiTile label="Active worklist" value={summary.open} tone="info" />
        </div>
        <div className="cursor-pointer" onClick={() => applySavedView('urgent')}>
          <KpiTile label="Urgent" value={summary.urgent} tone="critical" />
        </div>
        <div className="cursor-pointer" onClick={() => applySavedView('overdue')}>
          <KpiTile label="Overdue (SLA)" value={summary.overdue} tone="warning" />
        </div>
        <div className="cursor-pointer" onClick={() => applySavedView('supervisor')}>
          <KpiTile label="Supervisor Queue" value={summary.escalated} tone="critical" />
        </div>
      </section>

      <SavedViewsBar views={SAVED_VIEWS} activeKey={activeView} onChange={applySavedView} />

      <section className="coding-surface rounded-2xl shadow-sm">
        <div className="p-3 flex flex-col lg:flex-row gap-2 lg:items-center">
          <SearchInput
            placeholder="Search title, member, queue, assignee, or SBAR reason"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            value={assigneeFilter}
            onChange={(e) => {
              setAssigneeFilter(e.target.value);
              setActiveView('custom');
            }}
            className="coding-input rounded-md px-3 py-2 text-xs lg:w-52"
            aria-label="Filter by Assignee"
          >
            <option value="any">Assignee: All coordinators</option>
            {COORDINATORS.map((c) => (
              <option key={c} value={c}>
                {c === currentCoordinatorName ? `My To-Do (${c})` : c}
              </option>
            ))}
          </select>
          <select
            value={queueFilter}
            onChange={(e) => {
              setQueueFilter(e.target.value);
              setActiveView('custom');
            }}
            className="coding-input rounded-md px-3 py-2 text-xs lg:w-52"
            aria-label="Filter by Queue"
          >
            <option value="any">Queue: All queues</option>
            {adminQueues.map((q) => (
              <option key={q.key} value={q.key}>
                {q.label}
              </option>
            ))}
          </select>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="coding-input rounded-md px-3 py-2 text-xs lg:w-52">
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                Sort: {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="border-t coding-border px-3 py-2 flex flex-wrap items-center gap-1.5 text-xs">
          <FilterDropdown label="Status" count={statuses.length}>
            <div className="flex flex-col gap-1 min-w-[180px]">
              {STATUSES.map((s) => (
                <label key={s.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--coding-hover)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statuses.includes(s.key)}
                    onChange={() => toggleStatus(s.key)}
                    className="accent-[var(--brand-primary)]"
                  />
                  <span className="coding-text-strong">{s.label}</span>
                </label>
              ))}
            </div>
          </FilterDropdown>
          <FilterDropdown label="Priority" count={priorities.length}>
            <div className="flex flex-col gap-1 min-w-[160px]">
              {PRIORITIES.map((p) => (
                <label key={p.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--coding-hover)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={priorities.includes(p.key)}
                    onChange={() => togglePriority(p.key)}
                    className="accent-[var(--brand-primary)]"
                  />
                  <span className="coding-text-strong">{p.label}</span>
                </label>
              ))}
            </div>
          </FilterDropdown>
          <FilterDropdown label="Due" count={due !== 'any' ? 1 : 0} display={dueLabel}>
            {({ close }) => (
              <div className="flex flex-col gap-1 min-w-[180px]">
                {DUE_OPTIONS.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => {
                      setDue(o.key);
                      close();
                    }}
                    className={`text-left px-2 py-1 rounded hover:bg-[var(--coding-hover)] ${
                      due === o.key ? 'coding-text-strong font-semibold' : 'coding-text-soft'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </FilterDropdown>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => applySavedView('all')}
              className="ml-1 text-xs font-medium text-[var(--brand-primary)] hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      {loading && <LoadingState title="Loading tasks" />}
      {error && <ErrorState title="Tasks unavailable" description={error} />}

      {!loading && !error && (
        <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between text-xs coding-text-muted border-b coding-border">
            <span>
              {filtered.length} task{filtered.length === 1 ? '' : 's'} shown
              {rows.length !== filtered.length ? ` (filtered from ${rows.length} on this page)` : ''}
            </span>
            {activeView === 'supervisor' && (
              <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                Clinical Supervisor Escalation Queue — SLA Target: 2h Urgent / 12h High
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider coding-text-muted">
                <tr className="border-b coding-border">
                  <th className="text-left px-4 py-2.5 font-semibold">Task & Clinical SBAR</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Member</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Priority</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Status & SLA</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Due</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Queue & Assignee</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const isOverdue = isTaskOverdueOrSlaBreached(t, today);
                  const isEscalated =
                    t.status === 'escalated' || t.assigned_queue === 'Clinical Supervisor Escalation Queue';
                  return (
                    <tr key={t.id} className="border-b coding-border-subtle hover:bg-[var(--coding-hover)] transition">
                      <td className="px-4 py-3 align-top max-w-md">
                        <button
                          type="button"
                          onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${t.member_id}`)}
                          className="text-left coding-text-strong font-medium hover:text-[var(--brand-primary)] hover:underline"
                        >
                          {t.title}
                        </button>
                        {t.recommended_next_action && (
                          <p className="text-[11px] coding-text-soft line-clamp-2 mt-0.5">{t.recommended_next_action}</p>
                        )}
                        {(t.sbar?.situation || t.sbar?.background || t.sbar?.assessment || t.sbar?.recommendation) && (
                          <div className="text-[11px] coding-text-muted mt-0.5 space-y-0.5">
                            {t.sbar?.situation && (
                              <p>
                                <strong>SBAR Situation:</strong> {t.sbar.situation}
                              </p>
                            )}
                            {t.sbar?.background && (
                              <p>
                                <strong>Background:</strong> {t.sbar.background}
                              </p>
                            )}
                            {t.sbar?.assessment && (
                              <p>
                                <strong>Assessment:</strong> {t.sbar.assessment}
                              </p>
                            )}
                            {t.sbar?.recommendation && t.sbar.recommendation !== t.recommended_next_action && (
                              <p>
                                <strong>Recommendation:</strong> {t.sbar.recommendation}
                              </p>
                            )}
                          </div>
                        )}
                        {t.auto_generated_reason && (
                          <p className="text-[10px] italic text-amber-700 dark:text-amber-300 mt-0.5">{t.auto_generated_reason}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <p className="coding-text-strong">{t.member_name || '—'}</p>
                        <p className="text-[11px] coding-text-muted">{t.member_key || ''}</p>
                        {t.risk_tier && (
                          <div className="mt-1">
                            <RiskBadge tier={t.risk_tier} />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <PriorityBadge priority={t.priority} />
                      </td>
                      <td className="px-3 py-3 align-top space-y-1">
                        <TaskStatusBadge status={t.status} />
                        {isOverdue && (
                          <div>
                            <span className="inline-flex items-center rounded-full bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200 px-2 py-0.5 text-[10px] font-semibold">
                              ⚠️ SLA Breached
                            </span>
                          </div>
                        )}
                        {isEscalated && (
                          <div>
                            <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 px-2 py-0.5 text-[10px] font-semibold">
                              Supervisor Queue
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top text-xs coding-text-soft">{t.due_date || '—'}</td>
                      <td className="px-3 py-3 align-top text-xs space-y-1">
                        <select
                          value={normalizeQueueName(t.assigned_queue)}
                          onChange={(e) => reassignTask(t, { assigned_queue: e.target.value })}
                          className="coding-input rounded px-1.5 py-0.5 text-[11px] w-48 block"
                          aria-label="Reassign Queue"
                        >
                          {adminQueues.map((q) => (
                            <option key={q.key} value={q.key}>
                              {q.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={t.assigned_user || ''}
                          onChange={(e) => reassignTask(t, { assigned_user: e.target.value })}
                          className="coding-input rounded px-1.5 py-0.5 text-[11px] w-40 block"
                          aria-label="Reassign Coordinator"
                        >
                          <option value="">Unassigned</option>
                          {COORDINATORS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3 align-top text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {t.status === 'open' && (
                            <button
                              type="button"
                              onClick={() => advance(t, 'in_progress')}
                              className="rounded-md ring-1 coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)] px-2 py-1 text-xs font-semibold"
                            >
                              Start
                            </button>
                          )}
                          {t.status === 'escalated' && (
                            <button
                              type="button"
                              onClick={() => advance(t, 'in_progress')}
                              className="rounded-md bg-amber-600 text-white px-2 py-1 text-xs font-semibold hover:bg-amber-700"
                            >
                              Acknowledge
                            </button>
                          )}
                          {t.status !== 'completed' && t.status !== 'escalated' && (
                            <button
                              type="button"
                              onClick={() => {
                                setEscalateTaskTarget(t);
                                setEscalateReason(t.sbar?.situation || '');
                                setEscalateAction(t.recommended_next_action || '');
                              }}
                              className="rounded-md ring-1 ring-rose-300 text-rose-700 dark:text-rose-300 bg-rose-50/60 dark:bg-rose-900/20 px-2 py-1 text-xs font-semibold hover:opacity-90"
                            >
                              Escalate
                            </button>
                          )}
                          {t.status !== 'completed' && (
                            <button
                              type="button"
                              onClick={() => advance(t, 'completed')}
                              className="rounded-md bg-emerald-600 text-white px-2 py-1 text-xs font-semibold hover:bg-emerald-700"
                            >
                              {t.status === 'escalated' ? 'Resolve' : 'Complete'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => navigate(`${ROUTES.MEMBER360_LAB.MEMBER_WORKSPACE_ROOT}/${t.member_id}`)}
                            className="rounded-md bg-[var(--brand-primary)] text-white px-2 py-1 text-xs font-semibold hover:bg-brand-700"
                          >
                            Open
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-12 text-center text-sm coding-text-soft">
                      No tasks match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} label="tasks" />
        </section>
      )}

      {/* Create Task Modal (A8S-75 / A8S-76) */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="coding-surface rounded-2xl shadow-xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold coding-text-strong">Create & Assign Care Coordinator Task</h3>
              <button type="button" onClick={() => setCreateOpen(false)} className="text-xs coding-text-muted">
                ✕
              </button>
            </div>
            {createErr && (
              <div className="rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-200 px-3 py-2 text-xs">
                {createErr}
              </div>
            )}
            <form onSubmit={handleCreateTaskSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold coding-text-strong mb-1">Member *</label>
                <select
                  value={createForm.member_id}
                  onChange={(e) => setCreateForm((p) => ({ ...p, member_id: e.target.value }))}
                  className="coding-input w-full rounded-md px-3 py-2"
                  required
                >
                  <option value="">Select member…</option>
                  {membersRoster.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.first_name} {m.last_name} ({m.member_key} · {m.risk_tier || 'Moderate'})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold coding-text-strong mb-1">Task Title *</label>
                <input
                  type="text"
                  value={createForm.title}
                  onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g., Complete 48-hour post-discharge medication reconciliation"
                  className="coding-input w-full rounded-md px-3 py-2"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold coding-text-strong mb-1">Priority</label>
                  <select
                    value={createForm.priority}
                    onChange={(e) => setCreateForm((p) => ({ ...p, priority: e.target.value }))}
                    className="coding-input w-full rounded-md px-3 py-2"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold coding-text-strong mb-1">Due Date</label>
                  <input
                    type="date"
                    min={getTodayIso()}
                    value={createForm.due_date}
                    onChange={(e) => setCreateForm((p) => ({ ...p, due_date: e.target.value }))}
                    className="coding-input w-full rounded-md px-3 py-2"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold coding-text-strong mb-1">Queue</label>
                  <select
                    value={createForm.assigned_queue}
                    onChange={(e) => setCreateForm((p) => ({ ...p, assigned_queue: e.target.value }))}
                    className="coding-input w-full rounded-md px-3 py-2"
                  >
                    {adminQueues.map((q) => (
                      <option key={q.key} value={q.key}>
                        {q.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold coding-text-strong mb-1">Assigned Coordinator</label>
                  <select
                    value={createForm.assigned_user}
                    onChange={(e) => setCreateForm((p) => ({ ...p, assigned_user: e.target.value }))}
                    className="coding-input w-full rounded-md px-3 py-2"
                  >
                    {COORDINATORS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-semibold coding-text-strong mb-1">Recommended Next Action</label>
                <input
                  type="text"
                  value={createForm.recommended_next_action}
                  onChange={(e) => setCreateForm((p) => ({ ...p, recommended_next_action: e.target.value }))}
                  placeholder="Outreach to member and verify prescription fills"
                  className="coding-input w-full rounded-md px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold coding-text-strong mb-1">SBAR Situation</label>
                  <textarea
                    rows={2}
                    value={createForm.sbar_situation}
                    onChange={(e) => setCreateForm((p) => ({ ...p, sbar_situation: e.target.value }))}
                    placeholder="Current clinical or care barrier situation…"
                    className="coding-input w-full rounded-md px-2 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold coding-text-strong mb-1">SBAR Background</label>
                  <textarea
                    rows={2}
                    value={createForm.sbar_background}
                    onChange={(e) => setCreateForm((p) => ({ ...p, sbar_background: e.target.value }))}
                    placeholder="Relevant clinical history, diagnoses, or recent encounters…"
                    className="coding-input w-full rounded-md px-2 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold coding-text-strong mb-1">SBAR Assessment</label>
                  <textarea
                    rows={2}
                    value={createForm.sbar_assessment}
                    onChange={(e) => setCreateForm((p) => ({ ...p, sbar_assessment: e.target.value }))}
                    placeholder="Coordinator clinical assessment and risk evaluation…"
                    className="coding-input w-full rounded-md px-2 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold coding-text-strong mb-1">SBAR Recommendation</label>
                  <textarea
                    rows={2}
                    value={createForm.sbar_recommendation}
                    onChange={(e) => setCreateForm((p) => ({ ...p, sbar_recommendation: e.target.value }))}
                    placeholder="Recommended intervention or next step…"
                    className="coding-input w-full rounded-md px-2 py-1.5"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-md ring-1 coding-border px-3 py-1.5 text-xs font-semibold coding-text-strong"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createBusy}
                  className="rounded-md bg-[var(--brand-primary)] text-white px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  {createBusy ? 'Creating…' : 'Create & Assign Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Escalate Task to Supervisor Modal (A8S-77 / A8S-78) */}
      {escalateTaskTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="coding-surface rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold coding-text-strong">Escalate to Clinical Supervisor Queue</h3>
              <button type="button" onClick={() => setEscalateTaskTarget(null)} className="text-xs coding-text-muted">
                ✕
              </button>
            </div>
            <p className="text-xs coding-text-soft">
              Task: <strong>{escalateTaskTarget.title}</strong> ({escalateTaskTarget.member_name})
            </p>
            <form onSubmit={handleEscalateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold coding-text-strong mb-1">Escalation Reason (SBAR Situation) *</label>
                <textarea
                  rows={3}
                  value={escalateReason}
                  onChange={(e) => setEscalateReason(e.target.value)}
                  placeholder="Describe clinical barrier, SLA breach, or complex care exception…"
                  className="coding-input w-full rounded-md px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold coding-text-strong mb-1">Recommended Supervisor Action *</label>
                <input
                  type="text"
                  value={escalateAction}
                  onChange={(e) => setEscalateAction(e.target.value)}
                  placeholder="e.g., Authorize expedited specialist referral & supervisor outreach"
                  className="coding-input w-full rounded-md px-3 py-2"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEscalateTaskTarget(null)}
                  className="rounded-md ring-1 coding-border px-3 py-1.5 text-xs font-semibold coding-text-strong"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={escalateBusy}
                  className="rounded-md bg-rose-600 text-white px-4 py-1.5 text-xs font-semibold hover:bg-rose-700 disabled:opacity-50"
                >
                  {escalateBusy ? 'Escalating…' : 'Escalate to Supervisor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PortalPageLayout>
  );
};

export default Member360LabTasksPage;
