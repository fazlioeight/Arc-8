import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AuthContext } from '../../../context/AuthContext';
import {
  chatWithFile,
  deleteWorkbook,
  getWorkbook,
  listChatModels,
  listDatasetTables,
  listWorkbooks,
  sendChat,
  streamChat,
  uploadWorkbook,
} from '../../../services/chatService';
import './ChatPage.css';

const formatBytes = (n) => {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const STATUS_LABEL = {
  pending: 'Queued',
  ingesting: 'Ingesting…',
  ready: 'Ready',
  failed: 'Failed',
};

const ChatPage = () => {
  const { token, tenant } = useContext(AuthContext) || {};
  const tenantKey = typeof tenant === 'string' ? tenant : tenant?.key;

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState('');
  const [useStreaming, setUseStreaming] = useState(true);
  const [attachedFile, setAttachedFile] = useState(null);
  const [workbooks, setWorkbooks] = useState([]);
  const [activeWorkbookId, setActiveWorkbookId] = useState(null);
  const [datasetEnabled, setDatasetEnabled] = useState(false);
  const [datasetTables, setDatasetTables] = useState([]);

  const fileInputRef = useRef(null);
  const workbookInputRef = useRef(null);
  const threadRef = useRef(null);

  // ── Load initial data ────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    listChatModels({ token, tenant: tenantKey })
      .then((data) => {
        const list = data?.models || [];
        setModels(list);
        if (!model && data?.default) setModel(data.default);
      })
      .catch(() => setModels([]));
  }, [token, tenantKey, model]);

  const refreshWorkbooks = useCallback(async () => {
    if (!token) return;
    try {
      const data = await listWorkbooks({ token, tenant: tenantKey });
      setWorkbooks(data?.workbooks || []);
    } catch (e) {
      // workbooks endpoint may 503 if tenant DB lacks the table
    }
  }, [token, tenantKey]);

  useEffect(() => { refreshWorkbooks(); }, [refreshWorkbooks]);

  useEffect(() => {
    if (!token) return;
    listDatasetTables({ token, tenant: tenantKey })
      .then((data) => setDatasetTables(data?.tables || []))
      .catch(() => setDatasetTables([]));
  }, [token, tenantKey]);

  // Poll any in-progress workbooks until they reach a terminal state.
  useEffect(() => {
    const pending = workbooks.filter((w) => w.status === 'pending' || w.status === 'ingesting');
    if (!pending.length) return undefined;
    const handle = setInterval(refreshWorkbooks, 4000);
    return () => clearInterval(handle);
  }, [workbooks, refreshWorkbooks]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Sending ──────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (busy) return;
    const text = draft.trim();
    if (!text && !attachedFile) return;
    setError(null);

    if (attachedFile) {
      const fileForSend = attachedFile;
      const userMsg = { role: 'user', content: text || `Analyze this file: ${fileForSend.name}` };
      setMessages((prev) => [...prev, userMsg]);
      setDraft('');
      setAttachedFile(null);
      setBusy(true);
      try {
        const res = await chatWithFile({
          token, tenant: tenantKey,
          prompt: userMsg.content, file: fileForSend, model,
        });
        setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      } catch (e) {
        setError(e.message);
        setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${e.message}`, error: true }]);
      } finally {
        setBusy(false);
      }
      return;
    }

    const userMsg = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setDraft('');
    setBusy(true);

    const usingTool = Boolean(activeWorkbookId) || datasetEnabled;

    try {
      if (useStreaming && !usingTool) {
        let buffer = '';
        setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
        await streamChat({
          token, tenant: tenantKey, model,
          messages: nextMessages,
          onDelta: (delta) => {
            buffer += delta;
            setMessages((prev) => {
              const copy = [...prev];
              const idx = copy.length - 1;
              copy[idx] = { ...copy[idx], content: buffer };
              return copy;
            });
          },
          onError: (err) => setError(err),
        });
      } else {
        const res = await sendChat({
          token, tenant: tenantKey, model,
          messages: nextMessages,
          workbookId: activeWorkbookId,
          dataset: datasetEnabled,
        });
        setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      }
    } catch (e) {
      setError(e.message);
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${e.message}`, error: true }]);
    } finally {
      setBusy(false);
    }
  }, [busy, draft, attachedFile, messages, token, tenantKey, model, useStreaming, activeWorkbookId, datasetEnabled]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFilePick = (e) => {
    const file = e.target.files?.[0];
    if (file) setAttachedFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleWorkbookPick = async (e) => {
    const file = e.target.files?.[0];
    if (workbookInputRef.current) workbookInputRef.current.value = '';
    if (!file) return;
    try {
      await uploadWorkbook({ token, tenant: tenantKey, file });
      await refreshWorkbooks();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteWorkbook = async (workbookId) => {
    try {
      await deleteWorkbook({ token, tenant: tenantKey, workbookId });
      if (activeWorkbookId === workbookId) setActiveWorkbookId(null);
      await refreshWorkbooks();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAttachWorkbook = (workbookId, status) => {
    if (status !== 'ready') return;
    setActiveWorkbookId((prev) => (prev === workbookId ? null : workbookId));
    setDatasetEnabled(false);
  };

  const handleToggleDataset = () => {
    setDatasetEnabled((prev) => {
      const next = !prev;
      if (next) setActiveWorkbookId(null);
      return next;
    });
  };

  const handleClearThread = () => {
    setMessages([]);
    setError(null);
    setAttachedFile(null);
  };

  const activeWorkbook = useMemo(
    () => workbooks.find((w) => w.id === activeWorkbookId) || null,
    [workbooks, activeWorkbookId],
  );

  return (
    <div className="chat-shell">
      <aside className="chat-sidebar">
        <div>
          <h3>Mode</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              className={`chat-btn ${datasetEnabled ? '' : 'secondary'}`}
              onClick={handleToggleDataset}
              disabled={!datasetTables.length}
              title={!datasetTables.length ? 'Dataset not yet loaded for this tenant' : ''}
              type="button"
            >
              {datasetEnabled ? '✓ Analytics dataset' : 'Use analytics dataset'}
            </button>
            {datasetEnabled && (
              <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)' }}>
                {datasetTables.length} table(s) available
              </div>
            )}
          </div>
        </div>

        <div>
          <h3>Workbooks</h3>
          <button
            type="button"
            className="chat-btn secondary"
            onClick={() => workbookInputRef.current?.click()}
            style={{ width: '100%', marginBottom: 10 }}
          >
            + Upload .xlsx workbook
          </button>
          <input
            ref={workbookInputRef}
            type="file"
            accept=".xlsx"
            style={{ display: 'none' }}
            onChange={handleWorkbookPick}
          />
          {workbooks.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)' }}>
              No workbooks yet.
            </div>
          ) : (
            <ul className="workbook-list">
              {workbooks.map((wb) => (
                <li
                  key={wb.id}
                  className={`workbook-item ${activeWorkbookId === wb.id ? 'active' : ''}`}
                >
                  <span className="workbook-item-title" title={wb.filename}>
                    {wb.filename}
                  </span>
                  <span className="workbook-item-meta">
                    {formatBytes(wb.size_bytes)} · {STATUS_LABEL[wb.status] || wb.status}
                  </span>
                  {wb.error_message && (
                    <span className="workbook-item-meta" style={{ color: '#b91c1c' }}>
                      {wb.error_message}
                    </span>
                  )}
                  <div className="workbook-item-actions">
                    <button
                      type="button"
                      className={activeWorkbookId === wb.id ? 'active' : ''}
                      onClick={() => handleAttachWorkbook(wb.id, wb.status)}
                      disabled={wb.status !== 'ready'}
                    >
                      {activeWorkbookId === wb.id ? 'Attached' : 'Attach'}
                    </button>
                    <button type="button" onClick={() => handleDeleteWorkbook(wb.id)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className="chat-main">
        <div className="chat-header">
          <h1>Nexora Chat</h1>
          <div className="chat-header-controls">
            {activeWorkbook && (
              <span className="mode-pill">Workbook: {activeWorkbook.filename}</span>
            )}
            {datasetEnabled && <span className="mode-pill">Analytics dataset</span>}
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8 }}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={useStreaming}
                onChange={(e) => setUseStreaming(e.target.checked)}
              />
              Stream
            </label>
            <button type="button" className="chat-btn secondary" onClick={handleClearThread}>
              Clear
            </button>
          </div>
        </div>

        <div ref={threadRef} className="chat-thread">
          {messages.length === 0 ? (
            <div className="chat-empty">
              Ask anything. Upload a workbook to chat over your data, or enable the analytics dataset for shared queries.
            </div>
          ) : (
            messages.map((m, idx) => (
              <div
                key={idx}
                className={`chat-bubble ${m.error ? 'error' : m.role}`}
              >
                {m.content || (idx === messages.length - 1 && busy ? '…' : '')}
              </div>
            ))
          )}
        </div>

        <div className="chat-input-row">
          {attachedFile ? (
            <span className="attached-file">
              📎 {attachedFile.name}
              <button type="button" onClick={() => setAttachedFile(null)}>×</button>
            </span>
          ) : (
            <button
              type="button"
              className="chat-btn secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              + File
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.csv,.json,.docx,.xlsx,.pptx,.png,.jpg,.jpeg"
            style={{ display: 'none' }}
            onChange={handleFilePick}
          />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Send a message…"
            disabled={busy}
            rows={1}
          />
          <button
            type="button"
            className="chat-btn"
            onClick={handleSend}
            disabled={busy || (!draft.trim() && !attachedFile)}
          >
            {busy ? '…' : 'Send'}
          </button>
        </div>
        {error && (
          <div style={{
            padding: '8px 14px',
            background: '#fef2f2',
            color: '#991b1b',
            fontSize: 12,
            borderTop: '1px solid #fecaca',
          }}>
            {error}
          </div>
        )}
      </main>
    </div>
  );
};

export default ChatPage;
