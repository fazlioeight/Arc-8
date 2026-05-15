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

export const listDatasetTables = async ({ token, tenant }) => {
  const res = await fetch(`${API_BASE}/api/chat/dataset/tables`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const loadDatasetTable = async ({ token, tenant, tableName, file, mode = 'replace' }) => {
  const form = new FormData();
  form.append('file', file);
  form.append('mode', mode);
  const res = await fetch(`${API_BASE}/api/chat/dataset/${tableName}/load`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: form,
  });
  return handleResponse(res);
};

export const getDatasetLoad = async ({ token, tenant, loadId }) => {
  const res = await fetch(`${API_BASE}/api/chat/dataset/loads/${loadId}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};
