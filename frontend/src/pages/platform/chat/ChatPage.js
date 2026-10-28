import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import Chart from 'chart.js/auto';

import PortalUtilityBar from '../../../components/PortalUtilityBar';
import { AuthContext } from '../../../context/AuthContext';
import {
  addProjectMember,
  attachConversationToProject,
  chatWithFile,
  createConversation,
  createProject,
  deleteConversation,
  deleteProject,
  deleteWorkbook,
  detachConversationFromProject,
  downloadBlob,
  exportConversation,
  getConversation,
  getProject,
  listChatModels,
  listConversations,
  listDatasetTables,
  listProjectMembers,
  listProjects,
  listTenantUsers,
  listWorkbooks,
  removeProjectMember,
  renameConversation,
  streamChat,
  streamConversationMessage,
  updateProject,
  updateProjectMemberRole,
  uploadWorkbook,
} from '../../../services/chatService';
import '../../../styles/memberWorkspace.css';
import './ChatPage.css';

// API base must match chatService.js — artifact URLs returned by the backend
// are relative paths (``/api/chat/artifacts/...``), so we prepend the API
// origin before navigating. Without this, ``<a href="/api/...">`` resolves
// against the *frontend* origin and the SPA catches it as a 404.
const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

const absoluteApiUrl = (relative) => {
  if (!relative) return relative;
  if (/^https?:\/\//i.test(relative)) return relative;
  return `${API_BASE}${relative.startsWith('/') ? '' : '/'}${relative}`;
};

marked.use({ gfm: true, breaks: true });

// Post-process rendered HTML to rewrite any anchor whose href points at the
// artifacts API. We do this on the HTML string (not via marked's renderer
// API) because marked v9+ renderer methods receive token objects and need
// access to the parser instance to call ``parseInline`` — overriding them
// from outside is brittle across marked versions.
const _ARTIFACT_HREF_RE = /<a\b([^>]*?)\shref="(\/api\/chat\/artifacts\/[^"]+)"([^>]*?)>/gi;

const rewriteArtifactAnchors = (html) =>
  html.replace(_ARTIFACT_HREF_RE, (match, pre, href, post) => {
    const abs = absoluteApiUrl(href).replace(/"/g, '&quot;');
    // Strip any existing target/rel so we don't double up.
    const attrs = `${pre} ${post}`.replace(/\s*\b(target|rel)="[^"]*"/gi, '').trim();
    return `<a ${attrs} target="_blank" rel="noopener noreferrer" href="${abs}">`;
  });

const SUPPORTED_FILES = ['PDF', 'DOCX', 'XLSX', 'PPTX', 'CSV', 'JSON', 'TXT', 'PNG', 'JPG'];
const OUTPUT_FORMATS = ['Markdown', 'Tables', 'Charts', 'Export'];

const SUGGESTED_PROMPTS = [
  {
    title: 'Executive summary',
    summary: 'CEO-ready operating summary with table and chart.',
    prompt: 'Create a CEO-ready one-page operating summary for a Medicare Advantage health plan that is behind on risk adjustment submissions. Include a table and a bar chart.',
  },
  {
    title: '30-day action plan',
    summary: 'Improve call center performance.',
    prompt: 'Build a 30-day action plan for improving call center performance using claims, enrollment, and member service data. Include a table and line chart.',
  },
  {
    title: 'Dashboard design',
    summary: 'COO-level KPI dashboard with table and chart.',
    prompt: 'Draft an executive dashboard layout for a health plan COO showing enrollment, claims, risk adjustment, appeals, grievances, and call center KPIs. Include a Markdown table and a bar chart.',
  },
  {
    title: 'Investor roadmap',
    summary: 'Roadmap with milestones, risks, and chart.',
    prompt: 'Create an investor-ready roadmap for Arc-8 AI. Include phases, milestones, risks, costs, a table, and a chart.',
  },
];

const STATUS_LABEL = { pending: 'queued', ingesting: 'ingesting...', ready: 'ready', failed: 'failed' };

const hexToRgba = (hex, alpha) => {
  let clean = hex.replace('#', '');
  if (clean.length === 3) clean = clean.split('').map((c) => c + c).join('');
  const n = parseInt(clean, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

// Resolve a CSS custom property from :root. Returns a fallback if the
// browser isn't available (e.g. tests) or the var hasn't been defined.
const cssVar = (name, fallback) => {
  if (typeof window === 'undefined') return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return val || fallback;
};

// Recognise download links to /api/chat/artifacts/{id}?token=... emitted by
// the assistant's build_artifact tool calls. We intercept them here so the
// link renders as a rich download card (thumbnail + metadata) instead of a
// plain anchor. The regex tolerates extra query params and arbitrary label
// text, so the model can write `[Download Q1.pptx](/api/chat/artifacts/...)`
// in any natural-language phrasing.
const ARTIFACT_LINK_RE = /\[([^\]]+)\]\((\/api\/chat\/artifacts\/([a-f0-9]+)\?token=([^)\s]+))\)/g;

const extractSegments = (markdown) => {
  if (!markdown) return [];
  const segments = [];
  // First pass: split on chart blocks.
  const chartRe = /```chart\s*([\s\S]*?)```/g;
  let lastIndex = 0;
  let m;
  const pre = [];
  while ((m = chartRe.exec(markdown)) !== null) {
    if (m.index > lastIndex) pre.push({ type: 'md', text: markdown.slice(lastIndex, m.index) });
    let spec = null;
    try { spec = JSON.parse(m[1].trim()); } catch (e) { /* keep null */ }
    pre.push({ type: 'chart', spec });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < markdown.length) pre.push({ type: 'md', text: markdown.slice(lastIndex) });
  // Second pass: inside each md segment, split out artifact-link rows so we
  // can render them as cards. We only treat a link as an "artifact card" if
  // it's the only content on its line — inline mentions stay plain links.
  pre.forEach((seg) => {
    if (seg.type !== 'md') {
      segments.push(seg);
      return;
    }
    const lines = seg.text.split(/\r?\n/);
    let buffer = [];
    const flush = () => {
      if (!buffer.length) return;
      const text = buffer.join('\n');
      if (text.trim()) segments.push({ type: 'md', text });
      buffer = [];
    };
    lines.forEach((line) => {
      const trimmed = line.trim();
      // Reset regex state per line; only a line whose whole content is the
      // link counts as an artifact card.
      ARTIFACT_LINK_RE.lastIndex = 0;
      const match = ARTIFACT_LINK_RE.exec(trimmed);
      if (match && match[0] === trimmed) {
        flush();
        segments.push({
          type: 'artifact',
          label: match[1],
          downloadUrl: match[2],
          artifactId: match[3],
          token: match[4],
        });
      } else {
        buffer.push(line);
      }
    });
    flush();
  });
  return segments;
};

const renderMarkdown = (text) => {
  const rendered = rewriteArtifactAnchors(marked.parse(text || ''));
  // ADD_ATTR keeps target/rel on the anchors we just rewrote — DOMPurify
  // permits them by default but being explicit avoids a future config
  // change silently breaking the download links.
  return DOMPurify.sanitize(rendered, { ADD_ATTR: ['target', 'rel'] });
};

// Stable id format the backend uses to look up captured chart images.
// Keep in sync with backend chat/export.py.
const chartIdFor = (messageIdx, chartIdx) => `chart-${messageIdx}-${chartIdx}`;

const ChartBlock = ({ spec, chartId }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !spec || !spec.type) return undefined;
    // Resolve once per chart mount so charts pick up the portal theme.
    const accent = cssVar('--brand-primary', '#0a66c2');
    const tickColor = cssVar('--text-muted', '#516f90');
    const gridColor = cssVar('--border', '#dfe3eb');
    const bgCard = cssVar('--bg-card', '#ffffff');
    const titleColor = cssVar('--text', '#33475b');
    const datasets = (spec.datasets || []).map((d, i) => ({
      label: d.label || `Series ${i + 1}`,
      data: d.data || [],
      backgroundColor: hexToRgba(accent.startsWith('#') ? accent : '#0a66c2', 0.45),
      borderColor: accent,
      borderWidth: 2,
    }));
    const cfg = {
      type: spec.type,
      data: { labels: spec.labels || [], datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: tickColor, font: { family: 'Inter, system-ui, sans-serif', size: 11 } } },
          tooltip: {
            backgroundColor: bgCard,
            titleColor,
            bodyColor: titleColor,
            borderColor: gridColor,
            borderWidth: 1,
          },
        },
        scales: ['bar', 'line'].includes(spec.type) ? {
          x: { ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor } },
          y: { ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor } },
        } : undefined,
      },
    };
    const chart = new Chart(ref.current, cfg);
    return () => chart.destroy();
  }, [spec]);

  if (!spec || !spec.type) {
    return (
      <div className="my-3 rounded-lg border coding-border bg-[var(--bg-card)] p-3 text-xs coding-text-muted">
        Invalid chart JSON.
      </div>
    );
  }
  return (
    <div className="my-3 rounded-lg border coding-border bg-[var(--bg-card)] p-3 shadow-sm">
      {spec.title && <div className="mb-2 text-sm font-semibold coding-text-strong">{spec.title}</div>}
      <div className="relative h-[280px]">
        <canvas
          ref={ref}
          data-chart-id={chartId || undefined}
          data-chart-title={(spec && spec.title) || ''}
        />
      </div>
    </div>
  );
};

const formatBytes = (n) => {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const FORMAT_BADGES = {
  pptx: { label: 'PPTX', color: '#D97706' },
  docx: { label: 'DOCX', color: '#2563EB' },
  pdf: { label: 'PDF', color: '#DC2626' },
};

const ArtifactCard = ({ label, downloadUrl, artifactId, token }) => {
  const [meta, setMeta] = useState(null);
  const [imgError, setImgError] = useState(false);
  // Backend returns relative URLs — prepend the API origin so the browser
  // hits the backend domain instead of the SPA's catch-all 404 route.
  const absDownloadUrl = absoluteApiUrl(downloadUrl);
  const metaUrl = absoluteApiUrl(`/api/chat/artifacts/${artifactId}/meta?token=${token}`);
  const thumbUrl = absoluteApiUrl(`/api/chat/artifacts/${artifactId}/thumbnail.png?token=${token}`);

  useEffect(() => {
    let cancelled = false;
    fetch(metaUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data) setMeta(data); })
      .catch(() => { /* leave meta as null; card still renders downloadable */ });
    return () => { cancelled = true; };
  }, [metaUrl]);

  const stats = meta?.stats || {};
  const fmtKey = (meta?.format || '').toLowerCase();
  const badge = FORMAT_BADGES[fmtKey] || { label: fmtKey.toUpperCase() || 'FILE', color: '#6B7280' };
  const filename = meta?.filename || label;
  const title = meta?.title || label.replace(/^Download\s+/i, '');

  const handleDownload = useCallback(() => {
    // The token is in the URL so a plain anchor click works without JWT
    // headers. We trigger via JS so the filename hint from the backend's
    // Content-Disposition wins over the URL's path basename. target=_blank
    // means the download starts in a new tab that closes itself once the
    // browser sees the attachment header — the user's chat session stays
    // intact even if the response is slow.
    const a = document.createElement('a');
    a.href = absDownloadUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [absDownloadUrl]);

  return (
    <div className="my-3 flex gap-3 rounded-xl border coding-border bg-[var(--bg-card)] p-3 shadow-sm">
      <div className="relative h-[88px] w-[156px] flex-shrink-0 overflow-hidden rounded-lg border coding-border bg-[var(--bg-canvas)]">
        {meta?.has_thumbnail && !imgError ? (
          <img
            src={thumbUrl}
            alt={title}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-xl font-bold tracking-wide"
            style={{ color: badge.color, backgroundColor: 'var(--bg-canvas)' }}
          >
            {badge.label}
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white"
            style={{ backgroundColor: badge.color }}
          >
            {badge.label}
          </span>
          <div className="truncate text-sm font-semibold coding-text-strong">{title}</div>
        </div>
        <div className="truncate text-xs coding-text-muted">{filename}</div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] coding-text-muted">
          {typeof stats.slide_count === 'number' && fmtKey === 'pptx' && (
            <span>{stats.slide_count} slide{stats.slide_count === 1 ? '' : 's'}</span>
          )}
          {typeof stats.chart_count === 'number' && stats.chart_count > 0 && (
            <span>{stats.chart_count} chart{stats.chart_count === 1 ? '' : 's'}</span>
          )}
          {typeof stats.table_count === 'number' && stats.table_count > 0 && (
            <span>{stats.table_count} table{stats.table_count === 1 ? '' : 's'}</span>
          )}
          {typeof meta?.size_bytes === 'number' && <span>{formatBytes(meta.size_bytes)}</span>}
          {typeof stats.render_ms === 'number' && <span>{stats.render_ms} ms</span>}
          {stats.template && stats.template !== 'default' && (
            <span className="rounded bg-[var(--bg-canvas)] px-1.5 py-0.5">{stats.template.replace(/_/g, ' ')}</span>
          )}
          {typeof stats.revisions === 'number' && stats.revisions > 0 && (
            <span>rev {stats.revisions}</span>
          )}
        </div>
        <div className="mt-1">
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:opacity-90"
            style={{ backgroundColor: badge.color }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 1.5a.75.75 0 01.75.75v6.69l2.22-2.22a.75.75 0 111.06 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 011.06-1.06l2.22 2.22V2.25A.75.75 0 018 1.5z" />
              <path d="M2.75 12a.75.75 0 01.75.75v.75h9v-.75a.75.75 0 011.5 0v1.5a.75.75 0 01-.75.75h-10.5a.75.75 0 01-.75-.75v-1.5a.75.75 0 01.75-.75z" />
            </svg>
            Download
          </button>
        </div>
      </div>
    </div>
  );
};

const MessageBody = ({ content, isTyping, messageIdx }) => {
  const segments = useMemo(() => extractSegments(content), [content]);
  if (isTyping) return <div className="nx-typing text-sm leading-relaxed" />;
  let chartOrdinal = 0;
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'chart') {
          const chartId = chartIdFor(messageIdx ?? 0, chartOrdinal);
          chartOrdinal += 1;
          return <ChartBlock key={i} spec={seg.spec} chartId={chartId} />;
        }
        if (seg.type === 'artifact') {
          return (
            <ArtifactCard
              key={i}
              label={seg.label}
              downloadUrl={seg.downloadUrl}
              artifactId={seg.artifactId}
              token={seg.token}
            />
          );
        }
        return (
          <div
            key={i}
            className="nx-md"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(seg.text) }}
          />
        );
      })}
    </>
  );
};

/**
 * Walk the thread DOM and pull each rendered chart canvas into a base64 PNG.
 * Keys are the same `chart-{msg}-{ord}` ids ChartBlock tagged the canvases
 * with. Failures are swallowed per-canvas so one broken capture doesn't kill
 * the whole export — the backend falls back to a textual placeholder.
 */
const captureRenderedCharts = (root) => {
  if (!root) return {};
  const charts = {};
  const canvases = root.querySelectorAll('canvas[data-chart-id]');
  canvases.forEach((canvas) => {
    const id = canvas.getAttribute('data-chart-id');
    if (!id) return;
    try {
      charts[id] = canvas.toDataURL('image/png');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('chart capture failed', id, e);
    }
  });
  return charts;
};

const SidebarSection = ({ label, children }) => (
  <div className="flex flex-col gap-1.5">
    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] coding-text-muted">{label}</div>
    {children}
  </div>
);

const ChatPage = () => {
  const auth = useContext(AuthContext) || {};
  const { token, tenant, user } = auth;
  const tenantKey = typeof tenant === 'string' ? tenant : tenant?.key;
  const userEmail = user?.email || 'signed in';

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  // While the model is running a server-side tool (e.g. build_artifact)
  // the SSE stream pauses delivering text deltas. Without an indicator the
  // chat looks frozen — this state surfaces "Building deck…" or similar
  // until the tool_done event fires.
  const [toolStatus, setToolStatus] = useState(null);
  const [error, setError] = useState(null);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState('');
  const [attachedFile, setAttachedFile] = useState(null);
  const [workbooks, setWorkbooks] = useState([]);
  const [activeWorkbookId, setActiveWorkbookId] = useState(null);
  const [datasetTables, setDatasetTables] = useState([]);
  const [datasetMode, setDatasetMode] = useState(false);
  const [workbookModalOpen, setWorkbookModalOpen] = useState(false);
  const [datasetModalOpen, setDatasetModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Conversation history — list = sidebar items, activeId = currently open
  // conversation (null = ephemeral mode where nothing persists).
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  // Projects — list of {id, title, my_role, conversation_count, ...}.
  // ``activeProjectId`` is the project the user has expanded in the sidebar;
  // new chats created while a project is active are auto-attached to it.
  // ``expandedProjectIds`` is a Set of project ids whose chat lists are
  // visible in the sidebar (separate from active so a user can keep one
  // project expanded while working in another).
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [expandedProjectIds, setExpandedProjectIds] = useState(() => new Set());
  // Chats per project — { [projectId]: [conversation summary, ...] }.
  // Loaded lazily on first expand so the initial render doesn't fan-out
  // one request per project.
  const [projectConversations, setProjectConversations] = useState({});
  // Share / settings modal state for a single project. ``shareProjectId``
  // null means the modal is closed.
  const [shareProjectId, setShareProjectId] = useState(null);
  const [shareMembers, setShareMembers] = useState([]);
  const [tenantUserOptions, setTenantUserOptions] = useState([]);
  const [shareInviteUserId, setShareInviteUserId] = useState('');
  const [shareInviteRole, setShareInviteRole] = useState('viewer');
  const [shareBusy, setShareBusy] = useState(false);
  // "Add chat to project" picker. ``attachTarget`` holds the conversation
  // the user is moving + its title (for the modal heading). Null = closed.
  // ``attachSelectedProjectId`` tracks the radio selection inside the modal.
  const [attachTarget, setAttachTarget] = useState(null);
  const [attachSelectedProjectId, setAttachSelectedProjectId] = useState(null);
  const [attachBusy, setAttachBusy] = useState(false);
  // Right-click context menu for a project row. ``{ projectId, x, y }`` —
  // coordinates are clientX/clientY so the menu renders under the cursor
  // regardless of sidebar scroll position. Null = closed.
  const [projectContextMenu, setProjectContextMenu] = useState(null);

  const fileInputRef = useRef(null);
  const workbookFileRef = useRef(null);
  const threadRef = useRef(null);
  const textareaRef = useRef(null);

  const activeWorkbook = useMemo(
    () => workbooks.find((w) => w.id === activeWorkbookId) || null,
    [workbooks, activeWorkbookId],
  );

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [draft]);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages]);

  // Export the current conversation as a .docx or .pdf. We capture the
  // currently-rendered Chart.js canvases here (rather than re-rendering
  // server-side) so the doc matches exactly what the user saw on screen.
  // Charts that haven't finished rendering or that can't be read (tainted
  // canvas) fall back to a textual placeholder backend-side — the export
  // never fails because of a chart capture problem.
  const handleExport = useCallback(async (format) => {
    if (!token) return;
    if (!messages.length || exporting) return;
    setError(null);
    setExporting(true);
    try {
      const charts = captureRenderedCharts(threadRef.current);
      // Strip transient frontend-only fields before sending; the backend
      // only needs role, content, and optional model/file/timestamp.
      const payload = messages
        .filter((m) => !m.isTyping)
        .map((m) => ({
          role: m.role,
          content: m.content || '',
          model: m.model || null,
          file: m.file || null,
          timestamp: m.timestamp || null,
        }));
      const title = `Arc-8 Chat — ${new Date().toLocaleDateString()}`;
      const { blob, filename } = await exportConversation({
        token,
        tenant: tenantKey,
        format,
        title,
        messages: payload,
        charts,
        includeUserMessages: true,
      });
      downloadBlob(blob, filename);
    } catch (e) {
      setError((e && e.message) || `Failed to export ${format}`);
    } finally {
      setExporting(false);
    }
  }, [token, tenantKey, messages, exporting]);

  useEffect(() => {
    if (!token) return;
    listChatModels({ token, tenant: tenantKey })
      .then((data) => {
        setModels(data?.models || []);
        if (!model && data?.default) setModel(data.default);
      })
      .catch(() => setModels([]));
  }, [token, tenantKey, model]);

  const refreshWorkbooks = useCallback(async () => {
    if (!token) return;
    try {
      const data = await listWorkbooks({ token, tenant: tenantKey });
      setWorkbooks(data?.workbooks || []);
    } catch (e) { /* tenant DB may not have the table */ }
  }, [token, tenantKey]);

  const refreshDatasetTables = useCallback(async () => {
    if (!token) return;
    try {
      const data = await listDatasetTables({ token, tenant: tenantKey });
      setDatasetTables(data?.tables || []);
    } catch (e) { setDatasetTables([]); }
  }, [token, tenantKey]);

  useEffect(() => { refreshWorkbooks(); }, [refreshWorkbooks]);
  useEffect(() => { refreshDatasetTables(); }, [refreshDatasetTables]);

  useEffect(() => {
    const pending = workbooks.some((w) => w.status === 'pending' || w.status === 'ingesting');
    if (!pending) return undefined;
    const handle = setInterval(refreshWorkbooks, 4000);
    return () => clearInterval(handle);
  }, [workbooks, refreshWorkbooks]);

  useEffect(() => {
    if (!datasetModalOpen) return undefined;
    const handle = setInterval(refreshDatasetTables, 3500);
    return () => clearInterval(handle);
  }, [datasetModalOpen, refreshDatasetTables]);

  // ── Conversation history ─────────────────────────────────────────────────
  // Best-effort load on mount. If the API is down (e.g. before the migration
  // has been applied for this tenant) we leave the sidebar empty and the
  // chat falls back to ephemeral mode.
  const refreshConversations = useCallback(async () => {
    if (!token) return;
    try {
      const data = await listConversations({ token, tenant: tenantKey });
      setConversations(data?.conversations || []);
    } catch (e) {
      setConversations([]);
    }
  }, [token, tenantKey]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  const handleSelectConversation = useCallback(async (id) => {
    if (!token || !id) return;
    if (busy) return;
    setLoadingConversation(true);
    setError(null);
    try {
      const detail = await getConversation({ token, tenant: tenantKey, conversationId: id });
      const msgs = (detail?.messages || []).map((m) => ({
        role: m.role,
        content: m.content,
        model: m.model,
        file: m.attached_file_name,
      }));
      setMessages(msgs);
      setActiveConversationId(detail.id);
      setAttachedFile(null);
      setDraft('');
    } catch (e) {
      setError(e.message || 'Failed to load conversation');
    } finally {
      setLoadingConversation(false);
    }
  }, [token, tenantKey, busy]);

  const handleNewChat = () => {
    if (busy) return;
    setError(null);
    setAttachedFile(null);
    setDraft('');
    // Reset to an unsent state. The server-side row is created on first
    // send (handleSend) — pre-creating it produced orphan empty rows that
    // would land in the sidebar and look broken when clicked.
    setActiveConversationId(null);
    setMessages([]);
  };

  const handleDeleteConversation = useCallback(async (id) => {
    if (!token || !id) return;
    try {
      await deleteConversation({ token, tenant: tenantKey, conversationId: id });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (e) {
      setError(e.message);
    }
  }, [token, tenantKey, activeConversationId]);

  const handleRenameConversation = useCallback(async (id, nextTitle) => {
    if (!token || !id || !nextTitle?.trim()) return;
    try {
      const updated = await renameConversation({
        token, tenant: tenantKey, conversationId: id, title: nextTitle.trim(),
      });
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
    } catch (e) {
      setError(e.message);
    }
  }, [token, tenantKey]);

  // ── Projects ─────────────────────────────────────────────────────────────
  // Best-effort load on mount, mirroring refreshConversations. Empty
  // ``projects`` is a valid state — the sidebar just hides the section.
  const refreshProjects = useCallback(async () => {
    if (!token) return;
    try {
      const data = await listProjects({ token, tenant: tenantKey });
      setProjects(data?.projects || []);
    } catch (e) {
      setProjects([]);
    }
  }, [token, tenantKey]);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  // Lazily fetch a project's conversation list the first time it's expanded.
  const ensureProjectConversations = useCallback(async (projectId) => {
    if (!token || !projectId) return;
    if (projectConversations[projectId]) return;
    try {
      const data = await getProject({ token, tenant: tenantKey, projectId });
      setProjectConversations((prev) => ({
        ...prev,
        [projectId]: data?.conversations || [],
      }));
    } catch (e) {
      setProjectConversations((prev) => ({ ...prev, [projectId]: [] }));
    }
  }, [token, tenantKey, projectConversations]);

  const handleToggleProject = useCallback((projectId) => {
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
        // Fetch on first expand; ensureProjectConversations no-ops if cached.
        ensureProjectConversations(projectId);
      }
      return next;
    });
  }, [ensureProjectConversations]);

  const handleCreateProject = useCallback(async () => {
    const title = window.prompt('New project name');
    if (!title || !title.trim()) return;
    try {
      const project = await createProject({
        token, tenant: tenantKey, title: title.trim(),
      });
      setProjects((prev) => [project, ...prev]);
      setProjectConversations((prev) => ({ ...prev, [project.id]: [] }));
      setExpandedProjectIds((prev) => new Set(prev).add(project.id));
      setActiveProjectId(project.id);
    } catch (e) {
      setError(e.message || 'Failed to create project');
    }
  }, [token, tenantKey]);

  const handleRenameProject = useCallback(async (projectId, currentTitle) => {
    const next = window.prompt('Rename project', currentTitle || '');
    if (!next || !next.trim() || next === currentTitle) return;
    try {
      const updated = await updateProject({
        token, tenant: tenantKey, projectId, title: next.trim(),
      });
      setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, ...updated } : p)));
    } catch (e) {
      setError(e.message || 'Failed to rename project');
    }
  }, [token, tenantKey]);

  const handleDeleteProject = useCallback(async (projectId, title) => {
    if (!window.confirm(`Delete project "${title || 'untitled'}"? Chats inside the project are not deleted.`)) {
      return;
    }
    try {
      await deleteProject({ token, tenant: tenantKey, projectId });
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      setProjectConversations((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
      setExpandedProjectIds((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
      if (activeProjectId === projectId) setActiveProjectId(null);
    } catch (e) {
      setError(e.message || 'Failed to delete project');
    }
  }, [token, tenantKey, activeProjectId]);

  // Right-click on a project row → floating menu near the cursor. We
  // suppress the browser's native context menu so the sidebar action set
  // (share, rename, delete) is what users see instead.
  const handleProjectContextMenu = useCallback((event, projectId) => {
    event.preventDefault();
    setProjectContextMenu({ projectId, x: event.clientX, y: event.clientY });
  }, []);

  const closeProjectContextMenu = useCallback(() => {
    setProjectContextMenu(null);
  }, []);

  // Escape closes the context menu. Mounted only while the menu is open
  // so we're not paying for an unused listener on every keypress.
  useEffect(() => {
    if (!projectContextMenu) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeProjectContextMenu(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [projectContextMenu, closeProjectContextMenu]);

  // Open the "add chat to project" picker. The actual attach POST happens
  // in confirmAttachConversation when the user clicks Add — splitting the
  // two lets the modal preview the destination without committing.
  const handleAttachConversationToProject = useCallback((conversationId, conversationTitle) => {
    const choices = projects.filter((p) => p.my_role === 'owner' || p.my_role === 'editor');
    if (choices.length === 0) {
      setError('No projects available. Create a project first.');
      return;
    }
    setAttachTarget({ conversationId, conversationTitle });
    setAttachSelectedProjectId(choices[0].id);
  }, [projects]);

  const closeAttachModal = () => {
    setAttachTarget(null);
    setAttachSelectedProjectId(null);
  };

  const confirmAttachConversation = useCallback(async () => {
    if (!attachTarget || !attachSelectedProjectId) return;
    const projectId = attachSelectedProjectId;
    const { conversationId } = attachTarget;
    setAttachBusy(true);
    try {
      await attachConversationToProject({
        token, tenant: tenantKey, projectId, conversationId,
      });
      // Invalidate the cached chat list for the project so a re-expand re-fetches.
      setProjectConversations((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
      setProjects((prev) => prev.map((p) =>
        p.id === projectId ? { ...p, conversation_count: (p.conversation_count || 0) + 1 } : p,
      ));
      setExpandedProjectIds((prev) => new Set(prev).add(projectId));
      ensureProjectConversations(projectId);
      closeAttachModal();
    } catch (e) {
      // Stay open on error so the user can see what went wrong and retry.
      setError(e.message || 'Failed to add chat to project');
    } finally {
      setAttachBusy(false);
    }
  }, [token, tenantKey, attachTarget, attachSelectedProjectId, ensureProjectConversations]);

  // ── Project share / settings modal ───────────────────────────────────────
  // Opening the modal triggers two loads in parallel: the project's current
  // members (so we render the existing access list) and the tenant's users
  // (so the "Add member" select has options). Errors are surfaced inline.
  const openShareModal = useCallback(async (projectId) => {
    setShareProjectId(projectId);
    setShareInviteUserId('');
    setShareInviteRole('viewer');
    try {
      const [membersResp, usersResp] = await Promise.all([
        listProjectMembers({ token, tenant: tenantKey, projectId }),
        listTenantUsers({ token, tenant: tenantKey }),
      ]);
      setShareMembers(Array.isArray(membersResp) ? membersResp : []);
      setTenantUserOptions(usersResp?.users || []);
    } catch (e) {
      setError(e.message || 'Failed to load project members');
      setShareMembers([]);
      setTenantUserOptions([]);
    }
  }, [token, tenantKey]);

  const closeShareModal = () => {
    setShareProjectId(null);
    setShareMembers([]);
    setTenantUserOptions([]);
  };

  const handleInviteMember = useCallback(async () => {
    if (!shareProjectId || !shareInviteUserId) return;
    setShareBusy(true);
    try {
      const member = await addProjectMember({
        token, tenant: tenantKey, projectId: shareProjectId,
        userId: Number(shareInviteUserId), role: shareInviteRole,
      });
      setShareMembers((prev) => [...prev, member]);
      setProjects((prev) => prev.map((p) =>
        p.id === shareProjectId ? { ...p, member_count: (p.member_count || 1) + 1 } : p,
      ));
      setShareInviteUserId('');
    } catch (e) {
      setError(e.message || 'Failed to add member');
    } finally {
      setShareBusy(false);
    }
  }, [token, tenantKey, shareProjectId, shareInviteUserId, shareInviteRole]);

  const handleRemoveMember = useCallback(async (userId) => {
    if (!shareProjectId) return;
    setShareBusy(true);
    try {
      await removeProjectMember({
        token, tenant: tenantKey, projectId: shareProjectId, userId,
      });
      setShareMembers((prev) => prev.filter((m) => m.user_id !== userId));
      setProjects((prev) => prev.map((p) =>
        p.id === shareProjectId
          ? { ...p, member_count: Math.max(1, (p.member_count || 1) - 1) }
          : p,
      ));
    } catch (e) {
      setError(e.message || 'Failed to remove member');
    } finally {
      setShareBusy(false);
    }
  }, [token, tenantKey, shareProjectId]);

  const handleChangeMemberRole = useCallback(async (userId, role) => {
    if (!shareProjectId) return;
    setShareBusy(true);
    try {
      const updated = await updateProjectMemberRole({
        token, tenant: tenantKey, projectId: shareProjectId, userId, role,
      });
      setShareMembers((prev) => prev.map((m) => (m.user_id === userId ? updated : m)));
    } catch (e) {
      setError(e.message || 'Failed to update member role');
    } finally {
      setShareBusy(false);
    }
  }, [token, tenantKey, shareProjectId]);

  // Tenant users not yet a member — feeds the invite picker. Memoised
  // against the current member list so the dropdown stays consistent
  // while the modal is open.
  const inviteCandidates = useMemo(() => {
    const memberIds = new Set(shareMembers.map((m) => m.user_id));
    return tenantUserOptions.filter((u) => !memberIds.has(u.id));
  }, [shareMembers, tenantUserOptions]);

  const handlePickPrompt = (prompt) => {
    setDraft(prompt);
    textareaRef.current?.focus();
  };

  const handleSend = useCallback(async () => {
    if (busy) return;
    const text = draft.trim();
    if (!text && !attachedFile) return;
    setError(null);

    const fileToSend = attachedFile;

    const userMsg = {
      role: 'user',
      content: text || (fileToSend ? `Analyze this file: ${fileToSend.name}` : ''),
      file: fileToSend?.name,
    };
    const nextMessages = [...messages, userMsg];
    setMessages([...nextMessages, { role: 'assistant', content: '', isTyping: true }]);
    setDraft('');
    setAttachedFile(null);
    setBusy(true);

    try {
      if (fileToSend) {
        const res = await chatWithFile({ token, tenant: tenantKey, prompt: userMsg.content, file: fileToSend, model });
        setMessages([...nextMessages, { role: 'assistant', content: res.reply }]);
      } else if (token) {
        // Persisted streaming path — for every chat, including workbook /
        // dataset turns. Previously workbook chats went through the
        // non-persisting /api/chat endpoint, so they never landed in the
        // sidebar history; now the conversation endpoint dispatches to
        // the right SQL tool internally based on workbookId / dataset.
        let conversationId = activeConversationId;
        if (!conversationId) {
          try {
            // If a project is active in the sidebar, route the create through
            // the project endpoint so the new chat is auto-attached to it.
            // Otherwise fall back to the plain conversation create.
            const convo = activeProjectId
              ? await attachConversationToProject({
                  token, tenant: tenantKey, projectId: activeProjectId,
                })
              : await createConversation({ token, tenant: tenantKey });
            conversationId = convo.id;
            setActiveConversationId(conversationId);
            setConversations((prev) => [{ ...convo, message_count: 1 }, ...prev]);
            if (activeProjectId) {
              // Invalidate the cached chat list for the active project so
              // the new chat shows up on next sidebar expand.
              setProjectConversations((prev) => {
                const next = { ...prev };
                delete next[activeProjectId];
                return next;
              });
              setProjects((prev) => prev.map((p) =>
                p.id === activeProjectId
                  ? { ...p, conversation_count: (p.conversation_count || 0) + 1 }
                  : p,
              ));
              ensureProjectConversations(activeProjectId);
            }
          } catch (e) {
            // Fall through to ephemeral path below.
          }
        }
        const toolHandlers = {
          onToolStart: ({ name }) => {
            const labels = {
              build_artifact: 'Building artifact…',
              revise_artifact: 'Revising artifact…',
              run_sql: 'Running query…',
              run_dataset_sql: 'Running query…',
            };
            setToolStatus(labels[name] || `Running ${name}…`);
          },
          onToolDone: () => setToolStatus(null),
        };
        if (conversationId) {
          let buffer = '';
          await streamConversationMessage({
            token, tenant: tenantKey, model,
            conversationId,
            content: userMsg.content,
            workbookId: activeWorkbookId,
            dataset: datasetMode,
            onDelta: (delta) => {
              buffer += delta;
              setMessages([...nextMessages, { role: 'assistant', content: buffer }]);
            },
            onError: (err) => setError(err),
            ...toolHandlers,
          });
          if (!buffer) setMessages([...nextMessages, { role: 'assistant', content: '(no response)' }]);
          refreshConversations();
        } else {
          // No conversation created — ephemeral, non-persisting path.
          // /api/chat/stream now routes workbook/dataset itself, so this path
          // streams uniformly whether or not a tool is active.
          let buffer = '';
          await streamChat({
            token, tenant: tenantKey, model,
            messages: nextMessages,
            workbookId: activeWorkbookId,
            dataset: datasetMode,
            onDelta: (delta) => {
              buffer += delta;
              setMessages([...nextMessages, { role: 'assistant', content: buffer }]);
            },
            onError: (err) => setError(err),
            ...toolHandlers,
          });
          if (!buffer) setMessages([...nextMessages, { role: 'assistant', content: '(no response)' }]);
        }
      } else {
        let buffer = '';
        await streamChat({
          token, tenant: tenantKey, model,
          messages: nextMessages,
          onDelta: (delta) => {
            buffer += delta;
            setMessages([...nextMessages, { role: 'assistant', content: buffer }]);
          },
          onError: (err) => setError(err),
          onToolStart: ({ name }) => setToolStatus(
            name === 'build_artifact' ? 'Building artifact…'
              : name === 'revise_artifact' ? 'Revising artifact…'
              : `Running ${name}…`,
          ),
          onToolDone: () => setToolStatus(null),
        });
        if (!buffer) setMessages([...nextMessages, { role: 'assistant', content: '(no response)' }]);
      }
    } catch (e) {
      setError(e.message);
      setMessages([...nextMessages, { role: 'assistant', content: `Error: ${e.message}`, error: true }]);
    } finally {
      setBusy(false);
      setToolStatus(null);
    }
  }, [busy, draft, attachedFile, messages, token, tenantKey, model, activeWorkbookId, datasetMode, activeConversationId, refreshConversations, activeProjectId, ensureProjectConversations]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePickFile = (e) => {
    const f = e.target.files?.[0];
    if (f) setAttachedFile(f);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAttachWorkbook = (wb) => {
    if (wb.status !== 'ready') return;
    setActiveWorkbookId((prev) => (prev === wb.id ? null : wb.id));
    setDatasetMode(false);
    setWorkbookModalOpen(false);
  };

  const handleDeleteWorkbook = async (id) => {
    try {
      await deleteWorkbook({ token, tenant: tenantKey, workbookId: id });
      if (activeWorkbookId === id) setActiveWorkbookId(null);
      await refreshWorkbooks();
    } catch (e) { setError(e.message); }
  };

  const handleUploadWorkbook = async (e) => {
    const f = e.target.files?.[0];
    if (workbookFileRef.current) workbookFileRef.current.value = '';
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      setError('Only .xlsx workbooks are supported.');
      return;
    }
    try {
      await uploadWorkbook({ token, tenant: tenantKey, file: f });
      await refreshWorkbooks();
    } catch (err) { setError(err.message); }
  };

  const handleToggleDatasetMode = () => {
    setDatasetMode((prev) => {
      const next = !prev;
      if (next) setActiveWorkbookId(null);
      return next;
    });
  };

  // Reusable button styles for the chat shell — anchored on the shared
  // coding-ghost-button utility for portal-theme consistency.
  const ghostBtn =
    'coding-ghost-button inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ' +
    'disabled:cursor-not-allowed disabled:opacity-50';
  const ghostBtnSm =
    'coding-ghost-button inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ' +
    'disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="coding-member-workspace portal-theme flex h-screen min-h-screen flex-col">
      <PortalUtilityBar />
      <div className="nx-chat-root grid min-h-0 flex-1 grid-cols-[260px_1fr] grid-rows-1 overflow-hidden bg-[var(--bg)]">
        {/* ─ Sidebar ────────────────────────────────────────────────── */}
        <aside
          className="nx-scroll coding-sidebar flex h-full flex-col gap-4 overflow-y-auto p-4"
          aria-label="Arc-8 AI navigation"
        >
          <div className="border-b coding-border-subtle pb-3">
            <div className="flex items-center gap-2">
              <div
                className="grid h-8 w-8 place-items-center rounded-lg text-xs font-extrabold text-white shadow-sm"
                style={{ background: 'var(--brand-primary)' }}
                aria-hidden="true"
              >
                A8
              </div>
              <div>
                <div className="text-sm font-semibold coding-text-strong">
                  Arc-8 <span style={{ color: 'var(--brand-primary)' }}>AI</span>
                </div>
                <div className="text-[11px] leading-tight coding-text-muted">
                  Claude-powered assistant
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { setActiveProjectId(null); handleNewChat(); }}
            className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
            style={{ background: 'var(--brand-primary)' }}
            aria-label="Start a new chat"
          >
            <span aria-hidden="true">+</span> New chat
          </button>

          {/* Projects — owners/editors can create new chats inside; viewers
              see chats but the "+" actions are hidden. The active project
              pill at the top of this section is what handleSend reads to
              auto-attach freshly-created chats. */}
          <SidebarSection label="Projects">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={handleCreateProject}
                className="coding-ghost-button inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
                aria-label="Create a new project"
              >
                + New project
              </button>
              {activeProjectId && (
                <div className="flex items-center justify-between rounded-md px-2 py-1 text-[11px] coding-text-muted" style={{ background: 'var(--bg-canvas)' }}>
                  <span className="truncate">
                    New chats go to:{' '}
                    <span className="font-medium coding-text-strong">
                      {projects.find((p) => p.id === activeProjectId)?.title || 'project'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveProjectId(null)}
                    className="ml-2 rounded px-1 text-[10px] coding-text-muted hover:text-[var(--text)]"
                    title="Stop creating chats inside this project"
                    aria-label="Clear active project"
                  >
                    ×
                  </button>
                </div>
              )}
              {projects.length === 0 && (
                <div className="px-2 py-1 text-[11px] coding-text-soft">
                  No projects yet.
                </div>
              )}
              <ul className="flex flex-col gap-0.5" aria-label="Chat projects">
                {projects.map((project) => {
                  const expanded = expandedProjectIds.has(project.id);
                  const projectChats = projectConversations[project.id] || [];
                  const canEdit = project.my_role === 'owner' || project.my_role === 'editor';
                  return (
                    <li key={project.id} className="group flex flex-col">
                      <div
                        className="group flex items-center gap-1"
                        onContextMenu={(e) => handleProjectContextMenu(e, project.id)}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleProject(project.id)}
                          className={[
                            'flex-1 truncate rounded-md px-2 py-1.5 text-left text-xs transition coding-nav-link',
                            activeProjectId === project.id ? 'coding-nav-link--active' : '',
                          ].filter(Boolean).join(' ')}
                          title={project.title}
                        >
                          <span className="mr-1 inline-block w-3 text-center text-[10px] coding-text-muted">
                            {expanded ? '▾' : '▸'}
                          </span>
                          {project.title}
                          {project.my_role !== 'owner' && (
                            <span className="ml-1 text-[10px] coding-text-muted">
                              ({project.my_role})
                            </span>
                          )}
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveProjectId(project.id);
                              if (!expanded) handleToggleProject(project.id);
                              handleNewChat();
                            }}
                            className="opacity-0 group-hover:opacity-100 rounded px-1 text-[10px] coding-text-muted transition hover:text-[var(--text)]"
                            title="New chat in this project"
                            aria-label={`New chat in ${project.title}`}
                          >
                            +
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openShareModal(project.id)}
                          className="opacity-0 group-hover:opacity-100 rounded px-1 text-[10px] coding-text-muted transition hover:text-[var(--text)]"
                          title="Share"
                          aria-label={`Share ${project.title}`}
                        >
                          ⇨
                        </button>
                        {project.my_role === 'owner' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleRenameProject(project.id, project.title)}
                              className="opacity-0 group-hover:opacity-100 rounded px-1 text-[10px] coding-text-muted transition hover:text-[var(--text)]"
                              title="Rename project"
                              aria-label={`Rename project ${project.title}`}
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProject(project.id, project.title)}
                              className="opacity-0 group-hover:opacity-100 rounded px-1 text-[10px] coding-text-muted transition hover:text-[var(--state-critical)]"
                              title="Delete project"
                              aria-label={`Delete project ${project.title}`}
                            >
                              ×
                            </button>
                          </>
                        )}
                      </div>
                      {expanded && (
                        <ul className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l coding-border-subtle pl-2">
                          {projectChats.length === 0 && (
                            <li className="px-1 py-0.5 text-[11px] coding-text-soft">
                              No chats yet.
                            </li>
                          )}
                          {projectChats.map((c) => {
                            const isActive = activeConversationId === c.id;
                            return (
                              <li key={c.id} className="group flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveProjectId(project.id);
                                    handleSelectConversation(c.id);
                                  }}
                                  disabled={busy || loadingConversation}
                                  className={[
                                    'flex-1 truncate rounded-md px-2 py-1 text-left text-[11px] transition coding-nav-link',
                                    isActive ? 'coding-nav-link--active' : '',
                                  ].filter(Boolean).join(' ')}
                                  title={c.title || 'Untitled conversation'}
                                >
                                  {c.title || 'Untitled conversation'}
                                </button>
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!window.confirm(`Remove "${c.title || 'this chat'}" from project?`)) return;
                                      try {
                                        await detachConversationFromProject({
                                          token, tenant: tenantKey, projectId: project.id, conversationId: c.id,
                                        });
                                        setProjectConversations((prev) => ({
                                          ...prev,
                                          [project.id]: (prev[project.id] || []).filter((x) => x.id !== c.id),
                                        }));
                                        setProjects((prev) => prev.map((p) =>
                                          p.id === project.id
                                            ? { ...p, conversation_count: Math.max(0, (p.conversation_count || 1) - 1) }
                                            : p,
                                        ));
                                      } catch (e) {
                                        setError(e.message);
                                      }
                                    }}
                                    className="opacity-0 group-hover:opacity-100 rounded px-1 text-[10px] coding-text-muted transition hover:text-[var(--state-critical)]"
                                    title="Remove from project"
                                    aria-label={`Remove ${c.title || 'chat'} from project`}
                                  >
                                    ×
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </SidebarSection>

          {conversations.some((c) => (c.message_count || 0) > 0) && (
            <SidebarSection label="History">
              <ul className="flex flex-col gap-0.5" aria-label="Past conversations">
                {conversations.filter((c) => (c.message_count || 0) > 0).map((c) => {
                  const isActive = activeConversationId === c.id;
                  return (
                    <li key={c.id} className="group flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleSelectConversation(c.id)}
                        disabled={busy || loadingConversation}
                        className={[
                          'flex-1 truncate rounded-md px-2 py-1.5 text-left text-xs transition',
                          'coding-nav-link',
                          isActive ? 'coding-nav-link--active' : '',
                          'disabled:cursor-not-allowed',
                        ].filter(Boolean).join(' ')}
                        title={c.title || 'Untitled conversation'}
                      >
                        {c.title || 'Untitled conversation'}
                      </button>
                      {projects.some((p) => p.my_role === 'owner' || p.my_role === 'editor') && (
                        <button
                          type="button"
                          onClick={() => handleAttachConversationToProject(c.id, c.title)}
                          className="opacity-0 group-hover:opacity-100 rounded px-1 text-[10px] coding-text-muted transition hover:text-[var(--text)]"
                          title="Add to project"
                          aria-label={`Add ${c.title || 'conversation'} to a project`}
                        >
                          ⊞
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const next = window.prompt('Rename conversation', c.title || '');
                          if (next && next.trim() && next !== c.title) {
                            handleRenameConversation(c.id, next);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 rounded px-1 text-[10px] coding-text-muted transition hover:text-[var(--text)]"
                        title="Rename"
                        aria-label={`Rename conversation ${c.title || 'untitled'}`}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete "${c.title || 'this conversation'}"?`)) {
                            handleDeleteConversation(c.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 rounded px-1 text-[10px] coding-text-muted transition hover:text-[var(--state-critical)]"
                        title="Delete"
                        aria-label={`Delete conversation ${c.title || 'untitled'}`}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            </SidebarSection>
          )}

          <SidebarSection label="Model">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="coding-input w-full rounded-md py-1.5 pl-2 pr-7 text-xs"
              aria-label="Select Claude model"
            >
              {models.length === 0 && <option value="">loading…</option>}
              {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </SidebarSection>

          <SidebarSection label="About">
            <div className="text-[11px] leading-snug coding-text-soft">
              Ask a question or upload a document for analysis.
            </div>
          </SidebarSection>

          <SidebarSection label="Supported files">
            <div className="flex flex-wrap gap-1">
              {SUPPORTED_FILES.map((p) => <span key={p} className="coding-tag">{p}</span>)}
            </div>
          </SidebarSection>

          <SidebarSection label="Output">
            <div className="flex flex-wrap gap-1">
              {OUTPUT_FORMATS.map((p) => <span key={p} className="coding-tag">{p}</span>)}
            </div>
          </SidebarSection>

          <SidebarSection label="Guardrails">
            <div className="text-[11px] leading-snug coding-text-soft" role="note">
              Do not upload PHI, member identifiers, medical records, claims files, or confidential production data.
            </div>
          </SidebarSection>

          <div className="mt-auto border-t coding-border-subtle pt-3 text-[10px] leading-snug coding-text-muted">
            Arc-8 Clinical AI · HIPAA Compliant<br />
            Claude-powered
          </div>
        </aside>

        {/* ─ Main ───────────────────────────────────────────────────── */}
        <main className="flex h-full min-h-0 min-w-0 flex-col bg-[var(--bg)]">
          {/* Inner topbar — Status + signed-in user + export controls. */}
          <header className="coding-member-toolbar flex h-12 flex-none items-center justify-between px-5">
            <div className="flex items-baseline gap-3">
              <strong className="text-sm font-semibold coding-text-strong">Arc-8 Chat</strong>
              <span className="text-xs coding-text-muted">Claude-powered AI assistant</span>
            </div>
            <div className="flex items-center gap-2" role="status" aria-live="polite">
              <button
                type="button"
                className={ghostBtn}
                onClick={() => handleExport('docx')}
                disabled={!messages.length || exporting}
                title="Export the conversation as a Word document"
              >
                {exporting ? '...' : 'Export .docx'}
              </button>
              <button
                type="button"
                className={ghostBtn}
                onClick={() => handleExport('pdf')}
                disabled={!messages.length || exporting}
                title="Export the conversation as a PDF"
              >
                {exporting ? '...' : 'Export .pdf'}
              </button>
              <button
                type="button"
                className={ghostBtn}
                onClick={() => handleExport('pptx')}
                disabled={!messages.length || exporting}
                title="Export as a PowerPoint deck (one slide per chart and table)"
              >
                {exporting ? '...' : 'Export .pptx'}
              </button>
              <div
                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                style={{
                  background: 'color-mix(in srgb, var(--state-positive) 12%, transparent)',
                  borderColor: 'color-mix(in srgb, var(--state-positive) 40%, var(--border))',
                  color: 'var(--state-positive)',
                }}
                aria-label="Service active"
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--state-positive)' }} aria-hidden="true" />
                active
              </div>
              <div className="max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap text-xs coding-text-muted" title={userEmail}>
                {userEmail}
              </div>
            </div>
          </header>

          {error && (
            <div
              className="mx-auto mt-3 w-[calc(100%-32px)] max-w-[820px] rounded-md border px-3 py-2 text-xs"
              role="alert"
              style={{
                borderColor: 'color-mix(in srgb, var(--state-critical) 35%, var(--border))',
                background: 'color-mix(in srgb, var(--state-critical) 8%, var(--bg-card))',
                color: 'var(--state-critical)',
              }}
            >
              {error}
            </div>
          )}

          <section
            ref={threadRef}
            className="nx-scroll flex-1 overflow-y-auto px-6 pb-44 pt-2"
            aria-label="Conversation"
          >
            <div className="mx-auto flex max-w-[820px] flex-col">
              {messages.length === 0 ? (
                <div className="py-8">
                  <h1 className="mb-2 text-2xl font-semibold leading-tight coding-text-strong">Arc-8 AI</h1>
                  <p className="mb-5 max-w-[620px] text-sm leading-relaxed coding-text-muted">
                    Ask a question or attach a file (PDF, DOCX, XLSX, PPTX, CSV, JSON, TXT, PNG, JPG) for analysis.
                    Responses can include tables, charts, and markdown formatting.
                  </p>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] coding-text-muted mb-2">
                    Suggested prompts
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2" role="list" aria-label="Suggested prompts">
                    {SUGGESTED_PROMPTS.map((p) => (
                      <button
                        key={p.title}
                        type="button"
                        className="coding-surface flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition hover:bg-[var(--coding-hover)]"
                        onClick={() => handlePickPrompt(p.prompt)}
                        role="listitem"
                      >
                        <span className="text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>
                          {p.title}
                        </span>
                        <span className="text-xs leading-relaxed coding-text-soft">{p.summary}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) => {
                  const isUser = m.role === 'user';
                  const accent = isUser ? 'var(--brand-primary)' : 'var(--text)';
                  return (
                    <article
                      key={i}
                      className="grid grid-cols-[20px_1fr] items-start gap-3 border-t coding-border-subtle py-4 first:border-t-0"
                    >
                      <div
                        className="grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold"
                        style={{
                          background: isUser
                            ? 'color-mix(in srgb, var(--brand-primary) 14%, transparent)'
                            : 'color-mix(in srgb, var(--text) 8%, transparent)',
                          color: accent,
                        }}
                        aria-hidden="true"
                      >
                        {isUser ? '›' : '◆'}
                      </div>
                      <div className="min-w-0 overflow-x-auto">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: accent }}>
                          {isUser ? 'You' : 'Assistant'}
                        </div>
                        {m.file && <div className="text-xs coding-text-muted">📎 {m.file}</div>}
                        {isUser ? (
                          <div className="whitespace-pre-wrap text-sm leading-relaxed coding-text-strong">{m.content}</div>
                        ) : (
                          <MessageBody content={m.content} isTyping={m.isTyping} messageIdx={i} />
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
            {toolStatus && (
              <div
                className="mx-auto mt-2 inline-flex items-center gap-2 self-start rounded-full border coding-border bg-[var(--bg-card)] px-3 py-1 text-xs shadow-sm"
                role="status"
                aria-live="polite"
              >
                <span
                  className="inline-block h-2 w-2 animate-pulse rounded-full"
                  style={{ background: 'var(--brand-primary)' }}
                />
                <span className="coding-text-strong">{toolStatus}</span>
              </div>
            )}
          </section>

          {/* ─ Composer ─────────────────────────────────────────────── */}
          <div
            className="sticky bottom-0 px-6 pb-5 pt-3"
            style={{ background: 'linear-gradient(to top, var(--bg) 70%, transparent)' }}
          >
            <div className="coding-surface mx-auto max-w-[820px] rounded-xl px-3 py-2.5 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center gap-1.5 border-b coding-border-subtle pb-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.csv,.json,.docx,.xlsx,.pptx,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={handlePickFile}
                />
                <button className={ghostBtnSm} type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>Attach</button>
                <button className={ghostBtnSm} type="button" onClick={() => setAttachedFile(null)} disabled={!attachedFile}>Clear</button>
                <button className={ghostBtnSm} type="button" onClick={() => setWorkbookModalOpen(true)}>
                  Workbooks
                  {workbooks.some((w) => w.status === 'pending' || w.status === 'ingesting') && (
                    <span
                      className="ml-1 rounded-full px-1.5 text-[9px] font-bold text-white"
                      style={{ background: 'var(--brand-primary)' }}
                    >
                      {workbooks.filter((w) => w.status === 'pending' || w.status === 'ingesting').length}
                    </span>
                  )}
                </button>
                <button
                  className={ghostBtnSm}
                  type="button"
                  onClick={() => setDatasetModalOpen(true)}
                  disabled={datasetTables.length === 0}
                  title={datasetTables.length === 0 ? 'Dataset not yet loaded for this tenant' : ''}
                >
                  Dataset
                </button>
                <span className="text-[11px] coding-text-muted">
                  {attachedFile ? `📎 ${attachedFile.name}` : 'No file selected'}
                </span>
                {activeWorkbook && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
                    style={{
                      background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
                      borderColor: 'color-mix(in srgb, var(--brand-primary) 35%, var(--border))',
                      color: 'var(--brand-primary)',
                    }}
                  >
                    workbook: {activeWorkbook.filename}
                    <button
                      className="border-none bg-transparent px-0.5 text-xs coding-text-muted hover:text-[var(--brand-primary)]"
                      onClick={() => setActiveWorkbookId(null)}
                      aria-label="Detach workbook"
                    >
                      ×
                    </button>
                  </span>
                )}
                {datasetMode && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
                    style={{
                      background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
                      borderColor: 'color-mix(in srgb, var(--brand-primary) 35%, var(--border))',
                      color: 'var(--brand-primary)',
                    }}
                  >
                    dataset
                    <button
                      className="border-none bg-transparent px-0.5 text-xs coding-text-muted hover:text-[var(--brand-primary)]"
                      onClick={() => setDatasetMode(false)}
                      aria-label="Detach dataset"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Message Arc-8…"
                  rows={1}
                  disabled={busy}
                  className="w-full min-h-[36px] max-h-[140px] resize-none border-none bg-transparent px-1 py-2 text-sm leading-relaxed coding-text-strong outline-none placeholder:text-[var(--text-muted)]"
                  aria-label="Type your message"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={busy || (!draft.trim() && !attachedFile)}
                  className="mb-0.5 grid h-9 w-9 place-items-center rounded-md text-base text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: 'var(--brand-primary)' }}
                  aria-label="Send message"
                  title="Send (Enter)"
                >
                  <span aria-hidden="true">↑</span>
                </button>
              </div>

              <div className="mx-1 mt-2 text-center text-[10px] leading-tight coding-text-muted" role="note">
                Do not enter or upload PHI, member identifiers, claims files, medical records, or confidential production data.
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ─ Workbook modal ─────────────────────────────────────────────── */}
      {workbookModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setWorkbookModalOpen(false); }}
        >
          <div className="coding-member-workspace portal-theme">
            <div className="coding-surface max-h-[80vh] w-[min(560px,92vw)] overflow-y-auto rounded-xl p-5 shadow-lg">
              <h2 className="mb-3 text-base font-semibold coding-text-strong">Workbooks</h2>
              <div className="mb-3 flex items-center gap-2 border-b coding-border-subtle pb-3">
                <input
                  ref={workbookFileRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={handleUploadWorkbook}
                />
                <button className={ghostBtn} type="button" onClick={() => workbookFileRef.current?.click()}>Upload .xlsx</button>
                <span className="text-xs coding-text-muted">Drop in an Excel workbook to query it with SQL.</span>
              </div>
              <div>
                {workbooks.length === 0 ? (
                  <div className="py-6 text-center text-sm coding-text-muted">No workbooks yet.</div>
                ) : workbooks.map((wb) => (
                  <div key={wb.id} className="flex items-center justify-between gap-2 border-b coding-border-subtle py-2.5 last:border-b-0">
                    <div className="min-w-0">
                      <div className="truncate text-sm coding-text-strong">
                        {wb.filename}
                        {(wb.status === 'pending' || wb.status === 'ingesting') && (
                          <span
                            className="ml-1.5 inline-block rounded-full border px-1.5 py-px text-[10px]"
                            style={{
                              borderColor: 'color-mix(in srgb, var(--brand-primary) 35%, var(--border))',
                              color: 'var(--brand-primary)',
                              background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
                            }}
                          >
                            ingesting...
                          </span>
                        )}
                        {wb.status === 'failed' && (
                          <span
                            className="ml-1.5 inline-block rounded-full border px-1.5 py-px text-[10px]"
                            style={{
                              borderColor: 'color-mix(in srgb, var(--state-critical) 35%, var(--border))',
                              color: 'var(--state-critical)',
                              background: 'color-mix(in srgb, var(--state-critical) 10%, transparent)',
                            }}
                          >
                            failed
                          </span>
                        )}
                      </div>
                      <div className="text-xs coding-text-muted">
                        {STATUS_LABEL[wb.status] || wb.status} · {(wb.size_bytes / 1024).toFixed(0)} KB
                        {wb.error_message && ` — ${wb.error_message}`}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      <button type="button" onClick={() => handleAttachWorkbook(wb)} disabled={wb.status !== 'ready'} className={ghostBtn}>
                        {activeWorkbookId === wb.id ? 'Attached' : 'Attach'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteWorkbook(wb.id)}
                        className="inline-flex items-center rounded-md border bg-transparent px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                          borderColor: 'var(--coding-border)',
                          color: 'var(--text-muted)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--state-critical) 50%, var(--border))';
                          e.currentTarget.style.color = 'var(--state-critical)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--coding-border)';
                          e.currentTarget.style.color = 'var(--text-muted)';
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-right">
                <button className={ghostBtn} type="button" onClick={() => setWorkbookModalOpen(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─ Dataset modal ──────────────────────────────────────────────── */}
      {datasetModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setDatasetModalOpen(false); }}
        >
          <div className="coding-member-workspace portal-theme">
            <div className="coding-surface max-h-[80vh] w-[min(640px,92vw)] overflow-y-auto rounded-xl p-5 shadow-lg">
              <h2 className="mb-1 text-base font-semibold coding-text-strong">Tenant data</h2>
              <p className="mb-3 text-xs coding-text-muted">
                The chat can answer questions by running read-only SQL against
                your tenant&apos;s operational tables. Listed below are the tables
                Claude is allowed to query.
              </p>
              <div className="mb-3 flex items-center gap-2 border-b coding-border-subtle pb-3">
                <button className={ghostBtn} type="button" onClick={handleToggleDatasetMode}>
                  {datasetMode ? 'Detach data tools' : 'Enable data tools for chat'}
                </button>
                <span className="text-xs coding-text-muted">
                  {datasetMode ? 'Chat is now using the tables below.' : 'Ask natural-language questions over the tables below.'}
                </span>
              </div>
              <div>
                {datasetTables.length === 0 ? (
                  <div className="py-6 text-center text-sm coding-text-muted">No tables available for this tenant.</div>
                ) : datasetTables.map((t) => (
                  <DatasetRow key={t.table_name} table={t} />
                ))}
              </div>
              <div className="mt-4 text-right">
                <button className={ghostBtn} type="button" onClick={() => setDatasetModalOpen(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─ Project context menu (right-click on a project row) ─────── */}
      {projectContextMenu && (() => {
        const project = projects.find((p) => p.id === projectContextMenu.projectId);
        if (!project) return null;
        const isOwner = project.my_role === 'owner';
        // Clamp to viewport so the menu doesn't render off-screen when
        // right-clicking near the right/bottom edge. 200x150 is an
        // approximate cap on the menu's intrinsic size.
        const left = Math.min(projectContextMenu.x, window.innerWidth - 200);
        const top = Math.min(projectContextMenu.y, window.innerHeight - 150);
        const item =
          'w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-canvas)] ' +
          'disabled:cursor-not-allowed disabled:opacity-50';
        return (
          <div
            className="fixed inset-0 z-50"
            onClick={closeProjectContextMenu}
            onContextMenu={(e) => { e.preventDefault(); closeProjectContextMenu(); }}
            role="presentation"
          >
            <div
              role="menu"
              aria-label={`Actions for project ${project.title}`}
              className="absolute min-w-[180px] rounded-md py-1 shadow-lg"
              style={{
                left, top,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => { closeProjectContextMenu(); openShareModal(project.id); }}
              >
                Share…
              </button>
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => {
                  closeProjectContextMenu();
                  setActiveProjectId(project.id);
                  if (!expandedProjectIds.has(project.id)) handleToggleProject(project.id);
                  handleNewChat();
                }}
                disabled={!isOwner && project.my_role !== 'editor'}
              >
                New chat in project
              </button>
              <div className="my-1 border-t coding-border-subtle" role="separator" />
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => { closeProjectContextMenu(); handleRenameProject(project.id, project.title); }}
                disabled={!isOwner}
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                className={item}
                style={isOwner ? { color: 'var(--state-critical)' } : undefined}
                onClick={() => { closeProjectContextMenu(); handleDeleteProject(project.id, project.title); }}
                disabled={!isOwner}
              >
                Delete
              </button>
            </div>
          </div>
        );
      })()}

      {/* ─ Add chat to project picker ──────────────────────────────── */}
      {attachTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-label="Add chat to a project"
          onClick={attachBusy ? undefined : closeAttachModal}
        >
          <div
            className="w-full max-w-md rounded-lg p-5 shadow-xl"
            style={{ background: 'var(--bg-card)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold coding-text-strong">
                Add to project
              </div>
              <button
                type="button"
                className={ghostBtnSm}
                onClick={closeAttachModal}
                disabled={attachBusy}
                aria-label="Close picker"
              >
                ×
              </button>
            </div>
            <p className="mt-1 text-[11px] coding-text-muted">
              "{attachTarget.conversationTitle || 'Untitled conversation'}" will be
              visible to every member of the project, including its full history.
            </p>

            <ul className="mt-3 flex max-h-80 flex-col gap-1 overflow-y-auto" role="radiogroup" aria-label="Pick a project">
              {projects
                .filter((p) => p.my_role === 'owner' || p.my_role === 'editor')
                .map((p) => {
                  const selected = attachSelectedProjectId === p.id;
                  return (
                    <li key={p.id}>
                      <label
                        className={[
                          'flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs transition',
                          selected ? 'coding-nav-link--active' : 'coding-nav-link',
                        ].join(' ')}
                        style={selected ? undefined : { background: 'var(--bg-canvas)' }}
                      >
                        <input
                          type="radio"
                          name="attach-project-pick"
                          value={p.id}
                          checked={selected}
                          onChange={() => setAttachSelectedProjectId(p.id)}
                          className="cursor-pointer"
                          disabled={attachBusy}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium coding-text-strong" title={p.title}>
                          {p.title}
                        </span>
                        <span className="text-[10px] coding-text-muted">
                          {(p.conversation_count || 0)} chat{p.conversation_count === 1 ? '' : 's'}
                          {' · '}
                          {(p.member_count || 1)} member{p.member_count === 1 ? '' : 's'}
                          {p.my_role !== 'owner' && ` · ${p.my_role}`}
                        </span>
                      </label>
                    </li>
                  );
                })}
            </ul>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className={ghostBtn}
                onClick={closeAttachModal}
                disabled={attachBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: 'var(--brand-primary)' }}
                onClick={confirmAttachConversation}
                disabled={attachBusy || !attachSelectedProjectId}
              >
                {attachBusy ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─ Project share modal ─────────────────────────────────────── */}
      {shareProjectId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-label="Share project"
          onClick={closeShareModal}
        >
          <div
            className="w-full max-w-md rounded-lg p-5 shadow-xl"
            style={{ background: 'var(--bg-card)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold coding-text-strong">
                Share project — {projects.find((p) => p.id === shareProjectId)?.title}
              </div>
              <button
                type="button"
                className={ghostBtnSm}
                onClick={closeShareModal}
                aria-label="Close share dialog"
              >
                ×
              </button>
            </div>
            <p className="mt-1 text-[11px] coding-text-muted">
              Project members can see every chat attached to this project, including
              its full history.
            </p>

            {(() => {
              const project = projects.find((p) => p.id === shareProjectId);
              const isOwner = project?.my_role === 'owner';
              return (
                <>
                  {isOwner && (
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <div className="flex-1 min-w-[160px]">
                        <label className="block text-[10px] font-semibold uppercase tracking-wide coding-text-muted">
                          Add member
                        </label>
                        <select
                          value={shareInviteUserId}
                          onChange={(e) => setShareInviteUserId(e.target.value)}
                          className="coding-input mt-1 w-full rounded-md py-1.5 pl-2 pr-7 text-xs"
                          aria-label="Pick a tenant user to add"
                        >
                          <option value="">Select user…</option>
                          {inviteCandidates.map((u) => (
                            <option key={u.id} value={u.id}>{u.email}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wide coding-text-muted">
                          Role
                        </label>
                        <select
                          value={shareInviteRole}
                          onChange={(e) => setShareInviteRole(e.target.value)}
                          className="coding-input mt-1 rounded-md py-1.5 pl-2 pr-7 text-xs"
                          aria-label="Role for the new member"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                        </select>
                      </div>
                      <button
                        type="button"
                        className={ghostBtn}
                        onClick={handleInviteMember}
                        disabled={!shareInviteUserId || shareBusy}
                      >
                        Add
                      </button>
                    </div>
                  )}

                  <div className="mt-4">
                    <div className="text-[10px] font-semibold uppercase tracking-wide coding-text-muted">
                      Members ({shareMembers.length})
                    </div>
                    <ul className="mt-1 flex flex-col gap-1">
                      {shareMembers.map((m) => (
                        <li
                          key={m.user_id}
                          className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs"
                          style={{ background: 'var(--bg-canvas)' }}
                        >
                          <span className="truncate" title={m.user_email}>{m.user_email}</span>
                          <div className="flex items-center gap-2">
                            {m.role === 'owner' ? (
                              <span className="text-[10px] font-semibold coding-text-muted">OWNER</span>
                            ) : isOwner ? (
                              <>
                                <select
                                  value={m.role}
                                  onChange={(e) => handleChangeMemberRole(m.user_id, e.target.value)}
                                  className="coding-input rounded-md py-0.5 pl-1 pr-5 text-[11px]"
                                  disabled={shareBusy}
                                  aria-label={`Role for ${m.user_email}`}
                                >
                                  <option value="viewer">Viewer</option>
                                  <option value="editor">Editor</option>
                                </select>
                                <button
                                  type="button"
                                  className="rounded px-1 text-[11px] coding-text-muted hover:text-[var(--state-critical)]"
                                  onClick={() => handleRemoveMember(m.user_id)}
                                  disabled={shareBusy}
                                  title="Remove from project"
                                  aria-label={`Remove ${m.user_email}`}
                                >
                                  ×
                                </button>
                              </>
                            ) : (
                              <span className="text-[10px] coding-text-muted">{m.role}</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

// Read-only summary card for one dataset table. The dataset surface no
// longer supports uploads — the backend is the source of truth for these
// tables, populated by the rest of the application (Member360, Coding).
const DatasetRow = ({ table }) => {
  const missing = table.row_count == null;
  return (
    <div className="border-b coding-border-subtle py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold coding-text-strong" title={table.table_name}>
            {table.friendly_name}
          </div>
          <div className="text-[10px] coding-text-muted" style={{ fontFamily: "'SF Mono', Menlo, Consolas, monospace" }}>
            {table.table_name}
          </div>
        </div>
        <div className="flex-shrink-0 text-xs coding-text-soft">
          {missing
            ? <span style={{ color: 'var(--state-critical)' }}>not provisioned</span>
            : `${table.row_count.toLocaleString()} rows`}
        </div>
      </div>
      {table.description && (
        <div className="mt-1 text-xs leading-snug coding-text-muted">
          {table.description}
        </div>
      )}
    </div>
  );
};

export default ChatPage;
