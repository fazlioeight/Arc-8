const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

const buildHeaders = (token, tenant) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(tenant ? { 'X-Tenant-Key': tenant } : {}),
});

const handleResponse = async (res) => {
  if (res.status === 401 || res.status === 403) throw new Error('Unauthorized');
  if (res.status === 204) return null;
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = body?.detail || res.statusText;
    throw new Error(detail);
  }
  return body;
};

const get = (path, token, tenant) =>
  fetch(`${API_BASE}${path}`, { headers: buildHeaders(token, tenant) }).then(handleResponse);

const post = (path, token, tenant, payload) =>
  fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  }).then(handleResponse);

const patch = (path, token, tenant, payload) =>
  fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  }).then(handleResponse);

const del = (path, token, tenant) =>
  fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: buildHeaders(token, tenant),
  }).then(handleResponse);

const base = '/api/member360/admin';

export const fetchTemplates = (token, tenant) => get(`${base}/templates`, token, tenant);
export const createTemplate = (token, tenant, payload) => post(`${base}/templates`, token, tenant, payload);
export const updateTemplate = (token, tenant, id, payload) => patch(`${base}/templates/${id}`, token, tenant, payload);
export const deleteTemplate = (token, tenant, id) => del(`${base}/templates/${id}`, token, tenant);

export const fetchRiskRules = (token, tenant) => get(`${base}/risk-rules`, token, tenant);
export const createRiskRule = (token, tenant, payload) => post(`${base}/risk-rules`, token, tenant, payload);
export const updateRiskRule = (token, tenant, id, payload) => patch(`${base}/risk-rules/${id}`, token, tenant, payload);
export const deleteRiskRule = (token, tenant, id) => del(`${base}/risk-rules/${id}`, token, tenant);

export const fetchTaskQueues = (token, tenant) => get(`${base}/task-queues`, token, tenant);
export const createTaskQueue = (token, tenant, payload) => post(`${base}/task-queues`, token, tenant, payload);
export const updateTaskQueue = (token, tenant, id, payload) => patch(`${base}/task-queues/${id}`, token, tenant, payload);
export const deleteTaskQueue = (token, tenant, id) => del(`${base}/task-queues/${id}`, token, tenant);

export const fetchOutreachChannels = (token, tenant) => get(`${base}/outreach-channels`, token, tenant);
export const createOutreachChannel = (token, tenant, payload) => post(`${base}/outreach-channels`, token, tenant, payload);
export const updateOutreachChannel = (token, tenant, id, payload) => patch(`${base}/outreach-channels/${id}`, token, tenant, payload);
export const deleteOutreachChannel = (token, tenant, id) => del(`${base}/outreach-channels/${id}`, token, tenant);

export const fetchCareOptionPolicies = (token, tenant) => get(`${base}/care-option-policies`, token, tenant);
export const createCareOptionPolicy = (token, tenant, payload) => post(`${base}/care-option-policies`, token, tenant, payload);
export const updateCareOptionPolicy = (token, tenant, id, payload) => patch(`${base}/care-option-policies/${id}`, token, tenant, payload);
export const deleteCareOptionPolicy = (token, tenant, id) => del(`${base}/care-option-policies/${id}`, token, tenant);

export const fetchAuditEvents = (token, tenant, { prefix = 'member360.', limit = 100, offset = 0 } = {}) => {
  const qs = new URLSearchParams();
  if (prefix) qs.append('event_type_prefix', prefix);
  qs.append('limit', String(limit));
  qs.append('offset', String(offset));
  return get(`${base}/audit?${qs.toString()}`, token, tenant);
};
