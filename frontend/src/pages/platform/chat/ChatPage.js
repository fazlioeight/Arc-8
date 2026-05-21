import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import Chart from 'chart.js/auto';

import PortalUtilityBar from '../../../components/PortalUtilityBar';
import { AuthContext } from '../../../context/AuthContext';
import {
  chatWithFile,
  createConversation,
  deleteConversation,
  deleteWorkbook,
  downloadBlob,
  exportConversation,
  getConversation,
  listChatModels,
  listConversations,
  listDatasetTables,
  listWorkbooks,
  loadDatasetTable,
  renameConversation,
  sendChat,
  streamChat,
  streamConversationMessage,
  uploadWorkbook,
} from '../../../services/chatService';
import './ChatPage.css';

marked.use({ gfm: true, breaks: true });

const BG_SWATCHES = [
  { name: 'Terminal Black', color: '#0a0a0a' },
  { name: 'VS Code',        color: '#1e1e1e' },
  { name: 'GitHub Dark',    color: '#0d1117' },
  { name: 'Slate',          color: '#111827' },
  { name: 'Dark Teal',      color: '#0d1f1f' },
  { name: 'Dark Indigo',    color: '#0f0f1a' },
  { name: 'Dark Purple',    color: '#160020' },
  { name: 'Warm Dark',      color: '#141210' },
];

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
    prompt: 'Create an investor-ready roadmap for Nexora AI. Include phases, milestones, risks, costs, a table, and a chart.',
  },
];

const STATUS_LABEL = { pending: 'queued', ingesting: 'ingesting...', ready: 'ready', failed: 'failed' };

const hexToRgba = (hex, alpha) => {
  let clean = hex.replace('#', '');
  if (clean.length === 3) clean = clean.split('').map((c) => c + c).join('');
  const n = parseInt(clean, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const formatTs = (iso) => {
  if (!iso) return 'never';
  try { return new Date(iso).toLocaleString(); } catch (e) { return String(iso); }
};

const extractSegments = (markdown) => {
  if (!markdown) return [];
  const re = /```chart\s*([\s\S]*?)```/g;
  const segments = [];
  let lastIndex = 0;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'md', text: markdown.slice(lastIndex, m.index) });
    }
    let spec = null;
    try { spec = JSON.parse(m[1].trim()); } catch (e) { /* keep null */ }
    segments.push({ type: 'chart', spec });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < markdown.length) {
    segments.push({ type: 'md', text: markdown.slice(lastIndex) });
  }
  return segments;
};

const renderMarkdown = (text) => DOMPurify.sanitize(marked.parse(text || ''));

// Stable id format the backend uses to look up captured chart images.
// Keep in sync with backend chat/export.py.
const chartIdFor = (messageIdx, chartIdx) => `chart-${messageIdx}-${chartIdx}`;

const ChartBlock = ({ spec, chartId }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !spec || !spec.type) return undefined;
    const accent = '#d97706';
    const datasets = (spec.datasets || []).map((d, i) => ({
      label: d.label || `Series ${i + 1}`,
      data: d.data || [],
      backgroundColor: hexToRgba(accent, 0.55),
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
          legend: { labels: { color: '#9a9a9a', font: { family: 'Cascadia Code, monospace', size: 11 } } },
          tooltip: { backgroundColor: '#0f0f0f', borderColor: '#2a2a2a', borderWidth: 1 },
        },
        scales: ['bar', 'line'].includes(spec.type) ? {
          x: { ticks: { color: '#9a9a9a', font: { size: 10 } }, grid: { color: '#1e1e1e' } },
          y: { ticks: { color: '#9a9a9a', font: { size: 10 } }, grid: { color: '#1e1e1e' } },
        } : undefined,
      },
    };
    const chart = new Chart(ref.current, cfg);
    return () => chart.destroy();
  }, [spec]);

  if (!spec || !spec.type) {
    return (
      <div className="my-3 rounded-[3px] border border-[#1e1e1e] bg-[#0f0f0f] p-3 text-[11px] text-[#666]">
        Invalid chart JSON.
      </div>
    );
  }
  return (
    <div className="my-3 rounded-[3px] border border-[#1e1e1e] bg-[#0f0f0f] p-3">
      {spec.title && <div className="mb-2 text-xs font-bold text-[#d4d4d4]">{spec.title}</div>}
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

const MessageBody = ({ content, isTyping, messageIdx }) => {
  const segments = useMemo(() => extractSegments(content), [content]);
  if (isTyping) return <div className="nx-typing text-[13px] leading-relaxed text-[#d97706]" />;
  // Charts get a stable id keyed off message index + chart-block ordinal so
  // the export endpoint can match captured images to the right placeholder.
  let chartOrdinal = 0;
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'chart') {
          const chartId = chartIdFor(messageIdx ?? 0, chartOrdinal);
          chartOrdinal += 1;
          return <ChartBlock key={i} spec={seg.spec} chartId={chartId} />;
        }
        return (
          <div
            key={i}
            className="nx-md text-[13px] leading-relaxed text-[#9a9a9a]"
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
      // Use the raw canvas API rather than chart.toBase64Image(). We don't
      // hold Chart instance refs at this level, and Chart.js stores its
      // rendered bitmap on the canvas anyway.
      charts[id] = canvas.toDataURL('image/png');
    } catch (e) {
      // Most likely a tainted canvas; the chart will fall back to a text
      // placeholder in the export and the rest of the conversation still
      // renders.
      // eslint-disable-next-line no-console
      console.warn('chart capture failed', id, e);
    }
  });
  return charts;
};

const SidebarSection = ({ label, children }) => (
  <div className="flex flex-col gap-1.5">
    <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#666]">{label}</div>
    {children}
  </div>
);

const Pill = ({ children }) => (
  <span className="rounded-[3px] border border-[#2a2a2a] px-1.5 py-0.5 text-[11px] text-[#9a9a9a]">
    {children}
  </span>
);

const ChatPage = () => {
  const auth = useContext(AuthContext) || {};
  const { token, tenant, user } = auth;
  const tenantKey = typeof tenant === 'string' ? tenant : tenant?.key;
  const userEmail = user?.email || 'signed in';

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
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
  const [bg, setBg] = useState(() => {
    try { return localStorage.getItem('nexoraChatBackground') || '#0a0a0a'; } catch (e) { return '#0a0a0a'; }
  });

  const fileInputRef = useRef(null);
  const workbookFileRef = useRef(null);
  const threadRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem('nexoraChatBackground', bg); } catch (e) { /* ignore */ }
  }, [bg]);

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
      const title = `Nexora Chat — ${new Date().toLocaleDateString()}`;
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
      // Silent: an empty sidebar is the right fallback.
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

  const handleNewChat = async () => {
    if (busy) return;
    setError(null);
    setAttachedFile(null);
    setDraft('');
    // Create a persisted conversation if we have a token. The first send
    // will fill in the title from the user's first message. If the create
    // call fails (e.g. API down), fall back to ephemeral mode.
    if (token) {
      try {
        const convo = await createConversation({ token, tenant: tenantKey });
        setActiveConversationId(convo.id);
        setMessages([]);
        setConversations((prev) => [convo, ...prev]);
        return;
      } catch (e) {
        // Silent fallback to ephemeral.
      }
    }
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

  const handlePickPrompt = (prompt) => {
    setDraft(prompt);
    textareaRef.current?.focus();
  };

  const handleSend = useCallback(async () => {
    if (busy) return;
    const text = draft.trim();
    if (!text && !attachedFile) return;
    setError(null);

    const usingTool = Boolean(activeWorkbookId) || datasetMode;
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
      } else if (usingTool) {
        const res = await sendChat({
          token, tenant: tenantKey, model,
          messages: nextMessages, workbookId: activeWorkbookId, dataset: datasetMode,
        });
        setMessages([...nextMessages, { role: 'assistant', content: res.reply }]);
      } else if (activeConversationId) {
        // Persisted streaming path. Server writes the user message + the
        // final assistant message; client just renders deltas.
        let buffer = '';
        await streamConversationMessage({
          token, tenant: tenantKey, model,
          conversationId: activeConversationId,
          content: userMsg.content,
          onDelta: (delta) => {
            buffer += delta;
            setMessages([...nextMessages, { role: 'assistant', content: buffer }]);
          },
          onError: (err) => setError(err),
        });
        if (!buffer) setMessages([...nextMessages, { role: 'assistant', content: '(no response)' }]);
        // Refresh the sidebar so this conversation jumps to the top and
        // any auto-generated title appears.
        refreshConversations();
      } else {
        // Ephemeral mode — existing stateless stream.
        let buffer = '';
        await streamChat({
          token, tenant: tenantKey, model,
          messages: nextMessages,
          onDelta: (delta) => {
            buffer += delta;
            setMessages([...nextMessages, { role: 'assistant', content: buffer }]);
          },
          onError: (err) => setError(err),
        });
        if (!buffer) setMessages([...nextMessages, { role: 'assistant', content: '(no response)' }]);
      }
    } catch (e) {
      setError(e.message);
      setMessages([...nextMessages, { role: 'assistant', content: `Error: ${e.message}`, error: true }]);
    } finally {
      setBusy(false);
    }
  }, [busy, draft, attachedFile, messages, token, tenantKey, model, activeWorkbookId, datasetMode, activeConversationId, refreshConversations]);

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

  const handleDatasetUpload = async (tableName, file, mode) => {
    if (!file) return;
    try {
      await loadDatasetTable({ token, tenant: tenantKey, tableName, file, mode });
      await refreshDatasetTables();
    } catch (err) { setError(err.message); }
  };

  // Tailwind class tokens reused across the chat shell.
  const fileBtn =
    "rounded-[3px] border border-[#2a2a2a] bg-transparent px-2 py-0.5 text-[11px] text-[#9a9a9a] " +
    "transition hover:border-[#d97706] hover:text-[#d4d4d4] disabled:cursor-not-allowed disabled:opacity-40";
  const modalBtn =
    "rounded-[3px] border border-[#2a2a2a] bg-transparent px-2 py-0.5 text-[11px] text-[#9a9a9a] " +
    "transition hover:border-[#d97706] hover:text-[#d4d4d4] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="coding-member-workspace portal-theme flex h-screen min-h-screen flex-col">
      <PortalUtilityBar />
      <div
        className="nx-chat-root grid min-h-0 flex-1 grid-cols-[200px_1fr] grid-rows-1 overflow-hidden bg-[#0a0a0a] text-[13px] text-[#d4d4d4]"
      >
        {/* ─ Sidebar ────────────────────────────────────────────────── */}
        <aside
          className="nx-scroll flex h-full flex-col gap-3.5 overflow-y-auto border-r border-[#1e1e1e] bg-[#0f0f0f] p-3"
          aria-label="Nexora AI navigation"
        >
          <div className="border-b border-[#1e1e1e] pb-3">
            <div className="flex items-center gap-2">
              <div className="grid h-[18px] w-[18px] place-items-center text-[13px] text-[#d97706]" aria-hidden="true">◆</div>
              <div>
                <div className="text-[13px] font-bold tracking-wide">
                  Nexora <span className="text-[#d97706]">AI</span>
                </div>
                <div className="mt-0.5 text-[11px] leading-tight text-[#666]">
                  Claude-powered assistant
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleNewChat}
            className="flex w-full items-center gap-1.5 rounded-[3px] border border-[#2a2a2a] bg-transparent px-2 py-1 text-left text-[12px] text-[#9a9a9a] transition hover:border-[#d97706] hover:text-[#d4d4d4]"
            aria-label="Start a new chat"
          >
            <span aria-hidden="true">+</span> new chat
          </button>

          {conversations.length > 0 && (
            <SidebarSection label="History">
              <ul className="flex flex-col gap-0.5" aria-label="Past conversations">
                {conversations.map((c) => (
                  <li key={c.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleSelectConversation(c.id)}
                      disabled={busy || loadingConversation}
                      className={`flex-1 truncate rounded-[3px] px-1.5 py-1 text-left text-[11px] transition hover:bg-[#1e1e1e] disabled:cursor-not-allowed ${
                        activeConversationId === c.id
                          ? 'bg-[#1e1e1e] text-[#d4d4d4]'
                          : 'text-[#9a9a9a]'
                      }`}
                      title={c.title || 'Untitled conversation'}
                    >
                      {c.title || 'Untitled conversation'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = window.prompt('Rename conversation', c.title || '');
                        if (next && next.trim() && next !== c.title) {
                          handleRenameConversation(c.id, next);
                        }
                      }}
                      className="opacity-0 transition group-hover:opacity-100 rounded-[3px] border border-transparent px-1 text-[10px] text-[#666] hover:border-[#2a2a2a] hover:text-[#d4d4d4]"
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
                      className="opacity-0 transition group-hover:opacity-100 rounded-[3px] border border-transparent px-1 text-[10px] text-[#666] hover:border-[#2a2a2a] hover:text-[#f87171]"
                      title="Delete"
                      aria-label={`Delete conversation ${c.title || 'untitled'}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </SidebarSection>
          )}

          <SidebarSection label="Model">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-[3px] border border-[#2a2a2a] bg-[#141414] py-1 pl-1.5 pr-5 text-[11px] text-[#9a9a9a] transition hover:border-[#d97706] hover:text-[#d4d4d4] focus:outline-none focus:ring-1 focus:ring-[#d97706]"
              style={{ appearance: 'none', WebkitAppearance: 'none' }}
              aria-label="Select Claude model"
            >
              {models.length === 0 && <option value="">loading…</option>}
              {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </SidebarSection>

          <SidebarSection label="About">
            <div className="text-[11px] leading-snug text-[#9a9a9a]">
              Ask a question or upload a document for analysis.
            </div>
          </SidebarSection>

          <SidebarSection label="Supported Files">
            <div className="flex flex-wrap gap-1">
              {SUPPORTED_FILES.map((p) => <Pill key={p}>{p}</Pill>)}
            </div>
          </SidebarSection>

          <SidebarSection label="Output">
            <div className="flex flex-wrap gap-1">
              {OUTPUT_FORMATS.map((p) => <Pill key={p}>{p}</Pill>)}
            </div>
          </SidebarSection>

          <SidebarSection label="Background">
            <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="Chat background colour">
              {BG_SWATCHES.map((sw) => (
                <button
                  key={sw.color}
                  type="button"
                  onClick={() => setBg(sw.color)}
                  className={`h-[22px] w-full rounded-[3px] border transition ${
                    bg === sw.color
                      ? 'border-[#d97706] outline outline-1 outline-[#d97706] outline-offset-1'
                      : 'border-[#2a2a2a] hover:border-[#d97706]'
                  }`}
                  style={{ background: sw.color }}
                  aria-label={sw.name}
                />
              ))}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                type="color"
                value={bg}
                onChange={(e) => setBg(e.target.value)}
                className="h-[22px] w-[30px] cursor-pointer rounded-[3px] border border-[#2a2a2a] bg-transparent p-0"
                aria-label="Custom background colour"
              />
              <span className="text-[11px] text-[#666]" aria-hidden="true">Custom</span>
            </div>
          </SidebarSection>

          <SidebarSection label="Guardrails">
            <div className="text-[11px] leading-snug text-[#9a9a9a]" role="note">
              Do not upload PHI, member identifiers, medical records, claims files, or confidential production data.
            </div>
          </SidebarSection>

          <div className="mt-auto border-t border-[#1e1e1e] pt-2.5 text-[10px] leading-snug text-[#666]">
            Nexora AI · Azure-hosted<br />
            Claude-powered
          </div>
        </aside>

        {/* ─ Main ───────────────────────────────────────────────────── */}
        <main className="flex h-full min-h-0 min-w-0 flex-col" style={{ background: bg }}>
          {/* Inner topbar (light) — gives Status + signed-in user without
              duplicating the portal nav above. */}
          <header className="flex h-[44px] flex-none items-center justify-between border-b border-[#1e1e1e] bg-[#0f0f0f] px-4">
            <div className="flex items-baseline gap-2.5">
              <strong className="text-[13px] font-bold">nexora</strong>
              <span className="text-[11px] text-[#666]">Claude-powered AI assistant</span>
            </div>
            <div className="flex items-center gap-2" role="status" aria-live="polite">
              {/* Export controls — disabled until there's something to export.
                  Two buttons rather than a dropdown so both formats are one
                  click away. */}
              <button
                type="button"
                className="rounded-[3px] border border-[#2a2a2a] bg-transparent px-2 py-0.5 text-[11px] text-[#9a9a9a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => handleExport('docx')}
                disabled={!messages.length || exporting}
                title="Export the conversation as a Word document"
              >
                {exporting ? '...' : 'export .docx'}
              </button>
              <button
                type="button"
                className="rounded-[3px] border border-[#2a2a2a] bg-transparent px-2 py-0.5 text-[11px] text-[#9a9a9a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => handleExport('pdf')}
                disabled={!messages.length || exporting}
                title="Export the conversation as a PDF"
              >
                {exporting ? '...' : 'export .pdf'}
              </button>
              <button
                type="button"
                className="rounded-[3px] border border-[#2a2a2a] bg-transparent px-2 py-0.5 text-[11px] text-[#9a9a9a] transition hover:border-[#3a3a3a] hover:text-[#d4d4d4] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => handleExport('pptx')}
                disabled={!messages.length || exporting}
                title="Export the conversation as a PowerPoint deck (one slide per chart and table)"
              >
                {exporting ? '...' : 'export .pptx'}
              </button>
              <div className="flex items-center gap-1.5 rounded-[3px] border border-[#2a2a2a] px-2 py-0.5 text-[11px] text-[#4ade80]" aria-label="Service active">
                <span className="h-[5px] w-[5px] rounded-full bg-[#4ade80]" aria-hidden="true" />
                active
              </div>
              <div className="max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[#666]" title={userEmail}>
                {userEmail}
              </div>
            </div>
          </header>

          {error && (
            <div
              className="mx-auto mt-2.5 w-[calc(100%-32px)] max-w-[760px] rounded-[3px] border border-[rgba(248,113,113,0.3)] px-3 py-1.5 text-[12px] text-[#f87171]"
              role="alert"
            >
              {error}
            </div>
          )}

          <section
            ref={threadRef}
            className="nx-scroll flex-1 overflow-y-auto px-5 pb-44 pt-0"
            aria-label="Conversation"
          >
            <div className="mx-auto flex max-w-[760px] flex-col">
              {messages.length === 0 ? (
                <div className="border-b border-[#1e1e1e] py-6">
                  <h1 className="nx-welcome-h mb-1.5 text-[14px] font-bold leading-tight text-[#d4d4d4]">Nexora AI</h1>
                  <p className="mb-3.5 max-w-[560px] text-[12px] leading-relaxed text-[#9a9a9a]">
                    Ask a question or attach a file (PDF, DOCX, XLSX, PPTX, CSV, JSON, TXT, PNG, JPG) for analysis.
                    Responses can include tables, charts, and markdown formatting.
                  </p>
                  <div className="flex flex-col" role="list" aria-label="Suggested prompts">
                    {SUGGESTED_PROMPTS.map((p) => (
                      <button
                        key={p.title}
                        type="button"
                        className="nx-prompt-card flex items-baseline gap-2 border-none bg-transparent py-1 text-left text-[12px] leading-relaxed text-[#9a9a9a] transition hover:text-[#d4d4d4]"
                        onClick={() => handlePickPrompt(p.prompt)}
                        role="listitem"
                      >
                        <strong className="min-w-[148px] flex-none text-[12px] font-semibold text-[#60a5fa]">
                          {p.title}
                        </strong>
                        <span>{p.summary}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) => (
                  <article
                    key={i}
                    className="grid grid-cols-[16px_1fr] items-start gap-2.5 border-t border-[#1e1e1e] py-3"
                  >
                    <div className={`pt-px text-[12px] leading-[1.7] ${m.role === 'user' ? 'text-[#60a5fa]' : 'text-[#d97706]'}`} aria-hidden="true">
                      {m.role === 'user' ? '›' : '◆'}
                    </div>
                    <div className="min-w-0 overflow-x-auto">
                      <div className={`mb-1 text-[11px] font-bold tracking-wide ${m.role === 'user' ? 'text-[#60a5fa]' : 'text-[#d97706]'}`}>
                        {m.role === 'user' ? 'USER' : 'ASSISTANT'}
                      </div>
                      {m.file && <div className="text-[11px] text-[#666]">📎 {m.file}</div>}
                      {m.role === 'user' ? (
                        <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#d4d4d4]">{m.content}</div>
                      ) : (
                        <MessageBody content={m.content} isTyping={m.isTyping} messageIdx={i} />
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          {/* ─ Composer ─────────────────────────────────────────────── */}
          <div
            className="sticky bottom-0 px-5 pb-4 pt-3"
            style={{ background: `linear-gradient(to top, ${bg} 70%, transparent)` }}
          >
            <div className="mx-auto max-w-[760px] rounded-[3px] border border-[#2a2a2a] bg-[#0f0f0f] px-2.5 py-2">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5 border-b border-dashed border-[#1e1e1e] pb-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.csv,.json,.docx,.xlsx,.pptx,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={handlePickFile}
                />
                <button className={fileBtn} type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>attach</button>
                <button className={fileBtn} type="button" onClick={() => setAttachedFile(null)} disabled={!attachedFile}>clear</button>
                <button className={fileBtn} type="button" onClick={() => setWorkbookModalOpen(true)}>
                  workbooks
                  {workbooks.some((w) => w.status === 'pending' || w.status === 'ingesting') && (
                    <span className="ml-1 rounded-[6px] bg-[#d97706] px-1 text-[9px] font-bold text-black">
                      {workbooks.filter((w) => w.status === 'pending' || w.status === 'ingesting').length}
                    </span>
                  )}
                </button>
                <button
                  className={fileBtn}
                  type="button"
                  onClick={() => setDatasetModalOpen(true)}
                  disabled={datasetTables.length === 0}
                  title={datasetTables.length === 0 ? 'Dataset not yet loaded for this tenant' : ''}
                >
                  dataset
                </button>
                <span className="text-[11px] text-[#666]">
                  {attachedFile ? `📎 ${attachedFile.name}` : 'no file selected'}
                </span>
                {activeWorkbook && (
                  <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-[#d97706] px-2 py-0.5 text-[11px] text-[#d4d4d4]">
                    workbook: {activeWorkbook.filename}
                    <button className="border-none bg-transparent px-0.5 text-[12px] text-[#666] hover:text-[#d97706]" onClick={() => setActiveWorkbookId(null)} aria-label="Detach workbook">×</button>
                  </span>
                )}
                {datasetMode && (
                  <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-[#d97706] px-2 py-0.5 text-[11px] text-[#d4d4d4]">
                    dataset
                    <button className="border-none bg-transparent px-0.5 text-[12px] text-[#666] hover:text-[#d97706]" onClick={() => setDatasetMode(false)} aria-label="Detach dataset">×</button>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-[auto_1fr_auto] items-end gap-1.5">
                <span className="select-none pb-2 text-[14px] leading-none text-[#d97706] opacity-85" aria-hidden="true">›</span>
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="message nexora..."
                  rows={1}
                  disabled={busy}
                  className="w-full min-h-[36px] max-h-[140px] resize-none border-none bg-transparent px-1 py-2 text-[13px] leading-relaxed text-[#d4d4d4] outline-none placeholder:text-[#666]"
                  aria-label="Type your message"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={busy || (!draft.trim() && !attachedFile)}
                  className="mb-0.5 grid h-8 w-8 place-items-center rounded-[3px] border border-[#2a2a2a] bg-transparent text-[14px] text-[#9a9a9a] transition hover:border-[#d97706] hover:text-[#d97706] disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Send message"
                  title="Send (Enter)"
                >
                  <span aria-hidden="true">↑</span>
                </button>
              </div>

              <div className="mx-1 mt-1.5 text-center text-[10px] leading-tight text-[#666]" role="note">
                Do not enter or upload PHI, member identifiers, claims files, medical records, or confidential production data.
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ─ Workbook modal ─────────────────────────────────────────────── */}
      {workbookModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setWorkbookModalOpen(false); }}
        >
          <div className="nx-chat-root max-h-[80vh] w-[min(560px,92vw)] overflow-y-auto rounded-[3px] border border-[#2a2a2a] bg-[#0f0f0f] p-4 text-[12px] text-[#d4d4d4]">
            <h2 className="mb-2 text-[13px] text-[#d4d4d4]">Workbooks</h2>
            <div className="mb-2 flex items-center gap-1.5 border-b border-[#2a2a2a] pb-3">
              <input
                ref={workbookFileRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={handleUploadWorkbook}
              />
              <button className={modalBtn} type="button" onClick={() => workbookFileRef.current?.click()}>upload .xlsx</button>
              <span className="text-[11px] text-[#666]">drop in an Excel workbook to query it with SQL</span>
            </div>
            <div>
              {workbooks.length === 0 ? (
                <div className="py-3 text-center text-[#666]">no workbooks yet</div>
              ) : workbooks.map((wb) => (
                <div key={wb.id} className="flex items-center justify-between gap-2 border-b border-dashed border-[#1e1e1e] py-2 last:border-b-0">
                  <div>
                    <div>
                      {wb.filename}
                      {(wb.status === 'pending' || wb.status === 'ingesting') && (
                        <span className="ml-1.5 inline-block rounded-[8px] border border-[#d97706] px-1.5 py-px text-[10px] text-[#d97706]">ingesting...</span>
                      )}
                      {wb.status === 'failed' && (
                        <span className="ml-1.5 inline-block rounded-[8px] border border-[rgba(248,113,113,0.4)] px-1.5 py-px text-[10px] text-[#f87171]">failed</span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#666]">
                      {STATUS_LABEL[wb.status] || wb.status} · {(wb.size_bytes / 1024).toFixed(0)} KB
                      {wb.error_message && ` — ${wb.error_message}`}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <button type="button" onClick={() => handleAttachWorkbook(wb)} disabled={wb.status !== 'ready'} className={modalBtn}>
                      {activeWorkbookId === wb.id ? 'attached' : 'attach'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteWorkbook(wb.id)}
                      className="rounded-[3px] border border-[#2a2a2a] bg-transparent px-2 py-0.5 text-[11px] text-[#9a9a9a] transition hover:border-[#f87171] hover:text-[#f87171]"
                    >
                      delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-right">
              <button className={modalBtn} type="button" onClick={() => setWorkbookModalOpen(false)}>close</button>
            </div>
          </div>
        </div>
      )}

      {/* ─ Dataset modal ──────────────────────────────────────────────── */}
      {datasetModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setDatasetModalOpen(false); }}
        >
          <div className="nx-chat-root max-h-[80vh] w-[min(560px,92vw)] overflow-y-auto rounded-[3px] border border-[#2a2a2a] bg-[#0f0f0f] p-4 text-[12px] text-[#d4d4d4]">
            <h2 className="mb-2 text-[13px] text-[#d4d4d4]">Analytics dataset</h2>
            <div className="mb-2 flex items-center gap-1.5 border-b border-[#2a2a2a] pb-3">
              <button className={modalBtn} type="button" onClick={handleToggleDatasetMode}>
                {datasetMode ? 'detach dataset' : 'use dataset for chat'}
              </button>
              <span className="text-[11px] text-[#666]">
                {datasetMode ? 'chat is now routed to the dataset' : 'ask natural-language questions over the shared tables below'}
              </span>
            </div>
            <div>
              {datasetTables.length === 0 ? (
                <div className="py-3 text-center text-[#666]">no dataset tables defined</div>
              ) : datasetTables.map((t) => (
                <DatasetRow
                  key={t.table_name}
                  table={t}
                  onUpload={(file, mode) => handleDatasetUpload(t.table_name, file, mode)}
                />
              ))}
            </div>
            <div className="mt-3 text-right">
              <button className={modalBtn} type="button" onClick={() => setDatasetModalOpen(false)}>close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DatasetRow = ({ table, onUpload }) => {
  const fileRef = useRef(null);
  const [mode, setMode] = useState('replace');
  const [uploading, setUploading] = useState(false);
  const last = table.last_loaded_at;
  const handleChange = async (e) => {
    const f = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!f) return;
    setUploading(true);
    try { await onUpload(f, mode); }
    finally { setUploading(false); }
  };
  return (
    <div className="flex items-center justify-between gap-2 border-b border-dashed border-[#1e1e1e] py-2 last:border-b-0">
      <div>
        <div>{table.friendly_name} ({table.table_name})</div>
        <div className="text-[11px] text-[#666]">
          {table.row_count == null
            ? 'table missing — apply the migration'
            : `${table.row_count.toLocaleString()} rows`}
          {last && ` — last load ${formatTs(last)}`}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1.5">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="rounded-[3px] border border-[#2a2a2a] bg-[#141414] px-1.5 py-0.5 text-[11px] text-[#9a9a9a]"
        >
          <option value="replace">replace</option>
          <option value="append">append</option>
        </select>
        <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleChange} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="rounded-[3px] border border-[#2a2a2a] bg-transparent px-2 py-0.5 text-[11px] text-[#9a9a9a] transition hover:border-[#d97706] hover:text-[#d4d4d4] disabled:opacity-40"
        >
          {uploading ? 'uploading...' : 'upload csv/xlsx'}
        </button>
      </div>
    </div>
  );
};

export default ChatPage;
