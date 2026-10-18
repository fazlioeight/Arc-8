const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

const buildHeaders = (token, tenant, extra = {}) => ({
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(tenant ? { 'X-Tenant-Key': tenant } : {}),
  ...extra,
});

const buildJsonHeaders = (token, tenant) =>
  buildHeaders(token, tenant, { 'Content-Type': 'application/json' });

const toQuery = (params = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else qs.append(key, value);
  });
  const q = qs.toString();
  return q ? `?${q}` : '';
};

const handleResponse = async (res) => {
  if (res.status === 401 || res.status === 403) throw new Error('Unauthorized');
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = body?.detail || res.statusText;
    throw new Error(detail);
  }
  return body;
};

export const fetchImportJobs = async (token, tenant, filters = {}) => {
  const query = toQuery({
    status: filters.status,
    source_type: filters.sourceType,
    search: filters.search,
    limit: filters.limit,
    offset: filters.offset,
  });
  const res = await fetch(`${API_BASE}/api/imports/jobs${query}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const fetchImportJob = async (token, tenant, jobId) => {
  const res = await fetch(`${API_BASE}/api/imports/jobs/${jobId}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const fetchImportJobLogs = async (token, tenant, jobId, limit = 200) => {
  const res = await fetch(
    `${API_BASE}/api/imports/jobs/${jobId}/logs?limit=${limit}`,
    { headers: buildHeaders(token, tenant) },
  );
  return handleResponse(res);
};

export const retryImportJob = async (token, tenant, jobId) => {
  const res = await fetch(`${API_BASE}/api/imports/jobs/${jobId}/retry`, {
    method: 'POST',
    headers: buildJsonHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const downloadImportJobLogs = async (token, tenant, jobId) => {
  const res = await fetch(`${API_BASE}/api/imports/jobs/${jobId}/download`, {
    headers: buildHeaders(token, tenant),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('Unauthorized');
    throw new Error(`Download failed: ${res.statusText}`);
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${jobId}.log`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
  return true;
};

export const uploadImportFile = async (token, tenant, { entity, file }) => {
  const form = new FormData();
  form.append('entity', entity);
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/imports/uploads`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: form,
  });
  return handleResponse(res);
};

export const queueFhirImportJob = async (token, tenant, payload) => {
  const res = await fetch(`${API_BASE}/api/imports/fhir/jobs`, {
    method: 'POST',
    headers: buildJsonHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
};

export const testFhirImportConnection = async (token, tenant, payload) => {
  const res = await fetch(`${API_BASE}/api/imports/fhir/test`, {
    method: 'POST',
    headers: buildJsonHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
};
