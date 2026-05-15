import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import Chart from 'chart.js/auto';

import { AuthContext } from '../../../context/AuthContext';
import {
  chatWithFile,
  deleteWorkbook,
  getDatasetLoad,
  listChatModels,
  listDatasetTables,
  listWorkbooks,
  loadDatasetTable,
  sendChat,
  streamChat,
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

// Split a markdown blob into segments: text strings and chart specs in order.
// Chart blocks are fenced with ```chart ... ```.
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
    segments.push({ type: 'chart', spec, raw: m[1].trim() });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < markdown.length) {
    segments.push({ type: 'md', text: markdown.slice(lastIndex) });
  }
  return segments;
};

const renderMarkdown = (text) =>
  DOMPurify.sanitize(marked.parse(text || ''));

const ChartBlock = ({ spec, accent }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !spec || !spec.type) return undefined;
    const datasets = (spec.datasets || []).map((d, i) => ({
      label: d.label || `Series ${i + 1}`,
      data: d.data || [],
      backgroundColor: hexToRgba(accent || '#d97706', 0.55),
      borderColor: accent || '#d97706',
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
  }, [spec, accent]);

  if (!spec || !spec.type) {
    return <div className="nx-chart-card"><div className="nx-row-meta">Invalid chart JSON.</div></div>;
  }
  return (
    <div className="nx-chart-card">
      {spec.title && <div className="nx-chart-title">{spec.title}</div>}
      <div className="nx-chart-container"><canvas ref={ref} /></div>
    </div>
  );
};

const MessageBody = ({ content, accent, isTyping }) => {
  if (isTyping) return <div className="nx-typing" aria-label="Assistant is typing" />;
  const segments = useMemo(() => extractSegments(content), [content]);
  return (
    <>
      {segments.map((seg, i) => (
        seg.type === 'chart'
          ? <ChartBlock key={i} spec={seg.spec} accent={accent} />
          : <div key={i} className="nx-bubble markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(seg.text) }} />
      ))}
    </>
  );
};

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

  // Auto-grow the textarea.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [draft]);

  // Scroll to bottom on new content.
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages]);

  // Load models.
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
    } catch (e) { /* tenant DB may not have the table yet */ }
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

  // Poll while any workbook is ingesting.
  useEffect(() => {
    const pending = workbooks.some((w) => w.status === 'pending' || w.status === 'ingesting');
    if (!pending) return undefined;
    const handle = setInterval(refreshWorkbooks, 4000);
    return () => clearInterval(handle);
  }, [workbooks, refreshWorkbooks]);

  // Poll dataset loads while the modal is open and any load is in flight.
  useEffect(() => {
    if (!datasetModalOpen) return undefined;
    const handle = setInterval(refreshDatasetTables, 3500);
    return () => clearInterval(handle);
  }, [datasetModalOpen, refreshDatasetTables]);

  const handleNewChat = () => {
    setMessages([]);
    setError(null);
    setAttachedFile(null);
    setDraft('');
  };

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
        const res = await chatWithFile({
          token, tenant: tenantKey, prompt: userMsg.content, file: fileToSend, model,
        });
        setMessages([...nextMessages, { role: 'assistant', content: res.reply }]);
      } else if (usingTool) {
        const res = await sendChat({
          token, tenant: tenantKey, model,
          messages: nextMessages, workbookId: activeWorkbookId, dataset: datasetMode,
        });
        setMessages([...nextMessages, { role: 'assistant', content: res.reply }]);
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
        });
        if (!buffer) setMessages([...nextMessages, { role: 'assistant', content: '(no response)' }]);
      }
    } catch (e) {
      setError(e.message);
      setMessages([...nextMessages, { role: 'assistant', content: `Error: ${e.message}`, error: true }]);
    } finally {
      setBusy(false);
    }
  }, [busy, draft, attachedFile, messages, token, tenantKey, model, activeWorkbookId, datasetMode]);

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

  return (
    <div className="nx-chat" style={{ ['--nx-chat-bg']: bg }}>
      <aside className="nx-sidebar" aria-label="Nexora AI navigation">
        <div className="nx-brand-card">
          <div className="nx-brand-row">
            <div className="nx-logo" aria-hidden="true">◆</div>
            <div>
              <div className="nx-brand-title">Nexora <span>AI</span></div>
              <div className="nx-brand-subtitle">Claude-powered assistant</div>
            </div>
          </div>
        </div>

        <button type="button" className="nx-new-chat" onClick={handleNewChat} aria-label="Start a new chat">
          <span aria-hidden="true">+</span> new chat
        </button>

        <div className="nx-section">
          <div className="nx-section-label">Model</div>
          <select
            className="nx-model-select"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            aria-label="Select Claude model"
          >
            {models.length === 0 && <option value="">loading…</option>}
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>

        <div className="nx-section">
          <div className="nx-section-label">About</div>
          <div className="nx-hint">Ask a question or upload a document for analysis.</div>
        </div>

        <div className="nx-section">
          <div className="nx-section-label">Supported Files</div>
          <div className="nx-pills">
            {SUPPORTED_FILES.map((p) => <span key={p} className="nx-pill">{p}</span>)}
          </div>
        </div>

        <div className="nx-section">
          <div className="nx-section-label">Output</div>
          <div className="nx-pills">
            {OUTPUT_FORMATS.map((p) => <span key={p} className="nx-pill">{p}</span>)}
          </div>
        </div>

        <div className="nx-section">
          <div className="nx-section-label">Background</div>
          <div className="nx-color-grid" role="radiogroup" aria-label="Chat background colour">
            {BG_SWATCHES.map((sw) => (
              <button
                key={sw.color}
                type="button"
                className={`nx-swatch${bg === sw.color ? ' active' : ''}`}
                style={{ background: sw.color }}
                onClick={() => setBg(sw.color)}
                aria-label={sw.name}
              />
            ))}
          </div>
          <div className="nx-custom-color">
            <input
              type="color"
              value={bg}
              onChange={(e) => setBg(e.target.value)}
              aria-label="Custom background colour"
            />
            <span aria-hidden="true">Custom</span>
          </div>
        </div>

        <div className="nx-section">
          <div className="nx-section-label">Guardrails</div>
          <div className="nx-hint" role="note">
            Do not upload PHI, member identifiers, medical records, claims files, or confidential production data.
          </div>
        </div>

        <div className="nx-sidebar-footer" aria-label="Application info">
          Nexora AI · Azure-hosted<br />
          Claude-powered
        </div>
      </aside>

      <main className="nx-main">
        <header className="nx-topbar" role="banner">
          <div className="nx-topbar-title">
            <strong>nexora</strong>
            <span>Claude-powered AI assistant</span>
          </div>
          <div className="nx-status-row" role="status" aria-live="polite">
            <div className="nx-status-chip" aria-label="Service active">
              <span className="nx-status-dot" aria-hidden="true" />
              active
            </div>
            <div className="nx-user-chip" title={userEmail}>{userEmail}</div>
          </div>
        </header>

        {error && (
          <div className="nx-error" role="alert" aria-live="assertive">{error}</div>
        )}

        <section className="nx-chat-wrap" ref={threadRef} aria-label="Conversation">
          <div className="nx-chat-inner">
            {messages.length === 0 ? (
              <div className="nx-welcome">
                <h1>Nexora AI</h1>
                <p>
                  Ask a question or attach a file (PDF, DOCX, XLSX, PPTX, CSV, JSON, TXT, PNG, JPG) for analysis.
                  Responses can include tables, charts, and markdown formatting.
                </p>
                <div className="nx-prompt-grid" role="list" aria-label="Suggested prompts">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p.title}
                      type="button"
                      className="nx-prompt-card"
                      onClick={() => handlePickPrompt(p.prompt)}
                      role="listitem"
                    >
                      <strong>{p.title}</strong>
                      <span>{p.summary}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <article key={i} className={`nx-message ${m.role}`}>
                  <div className="nx-avatar" aria-hidden="true">{m.role === 'user' ? '›' : '◆'}</div>
                  <div className="nx-message-body">
                    <div className="nx-message-meta">{m.role === 'user' ? 'USER' : 'ASSISTANT'}</div>
                    {m.file && <div className="nx-row-meta">📎 {m.file}</div>}
                    {m.role === 'user'
                      ? <div className="nx-bubble">{m.content}</div>
                      : <MessageBody content={m.content} accent="#d97706" isTyping={m.isTyping} />
                    }
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <div className="nx-composer-outer">
          <div className="nx-composer-card">
            <div className="nx-file-row">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.csv,.json,.docx,.xlsx,.pptx,.png,.jpg,.jpeg"
                style={{ display: 'none' }}
                onChange={handlePickFile}
              />
              <button
                className="nx-file-btn"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                attach
              </button>
              <button
                className="nx-file-btn"
                type="button"
                onClick={() => setAttachedFile(null)}
                disabled={!attachedFile}
              >
                clear
              </button>
              <button
                className="nx-file-btn"
                type="button"
                onClick={() => setWorkbookModalOpen(true)}
              >
                workbooks
                {workbooks.some((w) => w.status === 'pending' || w.status === 'ingesting') && (
                  <span className="nx-badge">{workbooks.filter((w) => w.status === 'pending' || w.status === 'ingesting').length}</span>
                )}
              </button>
              <button
                className="nx-file-btn"
                type="button"
                onClick={() => setDatasetModalOpen(true)}
                disabled={datasetTables.length === 0}
                title={datasetTables.length === 0 ? 'Dataset not yet loaded for this tenant' : ''}
              >
                dataset
              </button>
              <span className="nx-file-label">
                {attachedFile ? `📎 ${attachedFile.name}` : 'no file selected'}
              </span>
              {activeWorkbook && (
                <span className="nx-chip">
                  workbook: {activeWorkbook.filename}
                  <button className="detach" onClick={() => setActiveWorkbookId(null)} aria-label="Detach workbook">×</button>
                </span>
              )}
              {datasetMode && (
                <span className="nx-chip">
                  dataset
                  <button className="detach" onClick={() => setDatasetMode(false)} aria-label="Detach dataset">×</button>
                </span>
              )}
            </div>

            <div className="nx-composer">
              <span className="nx-prompt-char" aria-hidden="true">›</span>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKey}
                placeholder="message nexora..."
                rows={1}
                disabled={busy}
                aria-label="Type your message"
              />
              <button
                className="nx-send"
                type="button"
                onClick={handleSend}
                disabled={busy || (!draft.trim() && !attachedFile)}
                aria-label="Send message"
                title="Send (Enter)"
              >
                <span aria-hidden="true">↑</span>
              </button>
            </div>

            <div className="nx-composer-note" role="note">
              Do not enter or upload PHI, member identifiers, claims files, medical records, or confidential production data.
            </div>
          </div>
        </div>
      </main>

      {workbookModalOpen && (
        <div className="nx-modal-backdrop" role="dialog" aria-modal="true" onClick={(e) => {
          if (e.target.classList.contains('nx-modal-backdrop')) setWorkbookModalOpen(false);
        }}>
          <div className="nx-modal-card">
            <h2>Workbooks</h2>
            <div className="nx-upload-row">
              <input
                ref={workbookFileRef}
                type="file"
                accept=".xlsx"
                style={{ display: 'none' }}
                onChange={handleUploadWorkbook}
              />
              <button type="button" onClick={() => workbookFileRef.current?.click()}>upload .xlsx</button>
              <span className="nx-row-meta">drop in an Excel workbook to query it with SQL</span>
            </div>
            <div>
              {workbooks.length === 0 ? (
                <div className="nx-modal-empty">no workbooks yet</div>
              ) : workbooks.map((wb) => (
                <div key={wb.id} className="nx-modal-row">
                  <div>
                    <div>
                      {wb.filename}
                      {(wb.status === 'pending' || wb.status === 'ingesting') && (
                        <span className={`nx-status-pill ${wb.status}`}>ingesting...</span>
                      )}
                      {wb.status === 'failed' && (
                        <span className="nx-status-pill failed">failed</span>
                      )}
                    </div>
                    <div className="nx-row-meta">
                      {STATUS_LABEL[wb.status] || wb.status} · {(wb.size_bytes / 1024).toFixed(0)} KB
                      {wb.error_message && ` — ${wb.error_message}`}
                    </div>
                  </div>
                  <div className="nx-row-actions">
                    <button
                      type="button"
                      onClick={() => handleAttachWorkbook(wb)}
                      disabled={wb.status !== 'ready'}
                    >
                      {activeWorkbookId === wb.id ? 'attached' : 'attach'}
                    </button>
                    <button type="button" className="danger" onClick={() => handleDeleteWorkbook(wb.id)}>delete</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="nx-modal-footer">
              <button type="button" onClick={() => setWorkbookModalOpen(false)}>close</button>
            </div>
          </div>
        </div>
      )}

      {datasetModalOpen && (
        <div className="nx-modal-backdrop" role="dialog" aria-modal="true" onClick={(e) => {
          if (e.target.classList.contains('nx-modal-backdrop')) setDatasetModalOpen(false);
        }}>
          <div className="nx-modal-card">
            <h2>Analytics dataset</h2>
            <div className="nx-upload-row">
              <button type="button" onClick={handleToggleDatasetMode}>
                {datasetMode ? 'detach dataset' : 'use dataset for chat'}
              </button>
              <span className="nx-row-meta">
                {datasetMode ? 'chat is now routed to the dataset' : 'ask natural-language questions over the shared tables below'}
              </span>
            </div>
            <div>
              {datasetTables.length === 0 ? (
                <div className="nx-modal-empty">no dataset tables defined</div>
              ) : datasetTables.map((t) => (
                <DatasetRow
                  key={t.table_name}
                  table={t}
                  onUpload={(file, mode) => handleDatasetUpload(t.table_name, file, mode)}
                />
              ))}
            </div>
            <div className="nx-modal-footer">
              <button type="button" onClick={() => setDatasetModalOpen(false)}>close</button>
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
    <div className="nx-modal-row">
      <div>
        <div>{table.friendly_name} ({table.table_name})</div>
        <div className="nx-row-meta">
          {table.row_count == null
            ? 'table missing — apply the migration'
            : `${table.row_count.toLocaleString()} rows`}
          {last && ` — last load ${formatTs(last)}`}
        </div>
      </div>
      <div className="nx-row-actions">
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="replace">replace</option>
          <option value="append">append</option>
        </select>
        <input ref={fileRef} type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={handleChange} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'uploading...' : 'upload csv/xlsx'}
        </button>
      </div>
    </div>
  );
};

export default ChatPage;
