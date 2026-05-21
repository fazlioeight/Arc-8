const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

const buildHeaders = (token, tenant, extra = {}) => ({
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(tenant ? { 'X-Tenant-Key': tenant } : {}),
  ...extra,
});

const handleResponse = async (response) => {
  const raw = await response.text();
  const body = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    const detail = body?.detail || response.statusText || 'Request failed';
    throw new Error(detail);
  }
  return body;
};

export const listChatModels = async ({ token, tenant }) => {
  const res = await fetch(`${API_BASE}/api/chat/models`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const sendChat = async ({ token, tenant, messages, model, workbookId, dataset }) => {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: buildHeaders(token, tenant, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      messages,
      model,
      workbook_id: workbookId || null,
      dataset: Boolean(dataset),
    }),
  });
  return handleResponse(res);
};

export const streamChat = async ({ token, tenant, messages, model, onDelta, onError, signal }) => {
  const res = await fetch(`${API_BASE}/api/chat/stream`, {
    method: 'POST',
    headers: buildHeaders(token, tenant, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ messages, model }),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || 'Stream failed');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const evt of events) {
      const line = evt.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const parsed = JSON.parse(payload);
        if (parsed.error && onError) onError(parsed.error);
        else if (parsed.delta && onDelta) onDelta(parsed.delta);
      } catch (e) {
        // ignore malformed line
      }
    }
  }
};

export const chatWithFile = async ({ token, tenant, prompt, file, model }) => {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('file', file);
  if (model) form.append('model', model);
  const res = await fetch(`${API_BASE}/api/chat/with-file`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: form,
  });
  return handleResponse(res);
};

export const listWorkbooks = async ({ token, tenant }) => {
  const res = await fetch(`${API_BASE}/api/chat/workbooks`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const uploadWorkbook = async ({ token, tenant, file }) => {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/chat/workbooks`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: form,
  });
  return handleResponse(res);
};

export const getWorkbook = async ({ token, tenant, workbookId }) => {
  const res = await fetch(`${API_BASE}/api/chat/workbooks/${workbookId}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const deleteWorkbook = async ({ token, tenant, workbookId }) => {
  const res = await fetch(`${API_BASE}/api/chat/workbooks/${workbookId}`, {
    method: 'DELETE',
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

// The dataset surface is read-only: the modal lists the tenant's operational
// tables (Member360 + Coding) so users know what they can ask about, but
// there is no upload path. The chat dataset SQL tool runs on the backend
// when ``dataset`` is true on a chat request.
export const listDatasetTables = async ({ token, tenant }) => {
  const res = await fetch(`${API_BASE}/api/chat/dataset/tables`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

// ── Conversation export ─────────────────────────────────────────────────────
// Sends the message array (plus optional captured chart PNGs) to the backend,
// which renders a .docx or .pdf and streams it back as a binary attachment.
// We do NOT use handleResponse() here because the body is a Blob, not JSON.
//
// The caller is responsible for triggering the browser download — see
// downloadBlob() below for the canonical pattern.

export const exportConversation = async ({
  token,
  tenant,
  format,
  title,
  messages,
  charts,
  includeUserMessages,
}) => {
  const res = await fetch(`${API_BASE}/api/chat/export`, {
    method: 'POST',
    headers: buildHeaders(token, tenant, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      format,
      title: title || null,
      messages,
      charts: charts || {},
      include_user_messages: includeUserMessages !== false,
    }),
  });
  if (!res.ok) {
    // Error responses are JSON; success responses are binary. Branch on
    // Content-Type so we don't try to JSON-parse a docx.
    let detail = res.statusText || 'Export failed';
    const ct = res.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) {
      try {
        const body = await res.json();
        detail = body?.detail || detail;
      } catch (e) {
        // fall through to statusText
      }
    }
    throw new Error(detail);
  }
  const blob = await res.blob();
  // Honor the server-provided filename if it set one.
  const cd = res.headers.get('Content-Disposition') || '';
  const match = cd.match(/filename="?([^";]+)"?/i);
  const filename = match ? match[1] : `nexora-chat-transcript.${format}`;
  return { blob, filename };
};

// ── Conversation history ────────────────────────────────────────────────────
// Per-tenant, per-user persisted chat history. The sidebar in ChatPage uses
// these endpoints to list past conversations, open one, send a new turn
// (which persists both user + assistant messages), rename, and soft-delete.

export const listConversations = async ({ token, tenant }) => {
  const res = await fetch(`${API_BASE}/api/chat/conversations`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const createConversation = async ({ token, tenant, title }) => {
  const res = await fetch(`${API_BASE}/api/chat/conversations`, {
    method: 'POST',
    headers: buildHeaders(token, tenant, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title: title || null }),
  });
  return handleResponse(res);
};

export const getConversation = async ({ token, tenant, conversationId }) => {
  const res = await fetch(`${API_BASE}/api/chat/conversations/${conversationId}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const renameConversation = async ({ token, tenant, conversationId, title }) => {
  const res = await fetch(`${API_BASE}/api/chat/conversations/${conversationId}`, {
    method: 'PATCH',
    headers: buildHeaders(token, tenant, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title }),
  });
  return handleResponse(res);
};

export const deleteConversation = async ({ token, tenant, conversationId }) => {
  const res = await fetch(`${API_BASE}/api/chat/conversations/${conversationId}`, {
    method: 'DELETE',
    headers: buildHeaders(token, tenant),
  });
  if (!res.ok && res.status !== 204) {
    const detail = await res.text();
    throw new Error(detail || 'Delete failed');
  }
  return { deleted: conversationId };
};

/**
 * Persisted, non-streaming send. Returns {conversation, user_message, assistant_message}
 * so the caller can update the sidebar's last-message timestamp + the open
 * conversation's message list from a single response.
 */
export const sendConversationMessage = async ({
  token, tenant, conversationId, content, model, workbookId, dataset,
}) => {
  const res = await fetch(
    `${API_BASE}/api/chat/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: buildHeaders(token, tenant, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        content,
        model: model || null,
        workbook_id: workbookId || null,
        dataset: Boolean(dataset),
      }),
    },
  );
  return handleResponse(res);
};

/**
 * Streaming variant. Persists the user message + assistant reply server-side
 * while yielding tokens to the client via SSE. Same surface as streamChat()
 * above, plus a conversationId parameter.
 */
export const streamConversationMessage = async ({
  token, tenant, conversationId, content, model, workbookId, dataset,
  onDelta, onError, signal,
}) => {
  const res = await fetch(
    `${API_BASE}/api/chat/conversations/${conversationId}/messages/stream`,
    {
      method: 'POST',
      headers: buildHeaders(token, tenant, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        content,
        model: model || null,
        workbook_id: workbookId || null,
        dataset: Boolean(dataset),
      }),
      signal,
    },
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || 'Stream failed');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const evt of events) {
      const line = evt.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const parsed = JSON.parse(payload);
        if (parsed.error && onError) onError(parsed.error);
        else if (parsed.delta && onDelta) onDelta(parsed.delta);
      } catch (e) {
        // ignore malformed line
      }
    }
  }
};


/**
 * Trigger a browser download for a Blob using an in-memory <a download> link.
 * Cleanup is intentional — failing to revokeObjectURL leaks memory until the
 * tab closes.
 */
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Small delay before revoke — some browsers cancel the download if the
  // URL is revoked synchronously after click().
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
