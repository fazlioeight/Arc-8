import { SAMPLE_ADMIN_APPLICATIONS, SAMPLE_ADMIN_USERS } from '../utils/sampleData';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

const shouldUseSample = (token) => {
  if (!token) return true;
  const value = String(token).toLowerCase();
  return value.startsWith('sample');
};

const buildHeaders = (token, tenant) => {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenant) headers['X-Tenant-Key'] = tenant;
  return headers;
};

const handleResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.detail || data.error || 'Request failed';
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
};

let samplePurchaseState = new Set(
  SAMPLE_ADMIN_APPLICATIONS.filter((app) => app.purchased || app.core).map((app) => app.key)
);

const buildSampleAdminApps = () =>
  SAMPLE_ADMIN_APPLICATIONS.map((app) => ({
    ...app,
    purchased: app.core ? true : samplePurchaseState.has(app.key),
  }));

const sampleApplicationsResponse = () => ({ applications: buildSampleAdminApps(), __sample: true });
const sampleUsersResponse = () => ({ users: SAMPLE_ADMIN_USERS, __sample: true });

const buildSampleApplications = (__fullApplications, overrides = {}) => {
  if (__fullApplications) return { ...__fullApplications };
  const base = {};
  SAMPLE_ADMIN_APPLICATIONS.forEach((app) => {
    base[app.key] = app.key === 'portal' ? 'user' : 'none';
  });
  return { ...base, ...overrides };
};

const makeSampleUser = (payload = {}) => {
  const applications = buildSampleApplications(payload.__fullApplications, payload.applications);
  return {
    id: payload.id || `sample-user-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    email: payload.email,
    role: payload.role || 'user',
    is_active: payload.is_active !== undefined ? payload.is_active : true,
    applications,
  };
};

export const fetchAdminApplications = async ({ token, tenant }) => {
  if (shouldUseSample(token)) {
    return sampleApplicationsResponse();
  }
  const response = await fetch(`${API_BASE}/api/admin/applications`, {
    method: 'GET',
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(response);
};

export const fetchAdminUsers = async ({ token, tenant }) => {
  if (shouldUseSample(token)) {
    return sampleUsersResponse();
  }
  const response = await fetch(`${API_BASE}/api/admin/users`, {
    method: 'GET',
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(response);
};

export const createAdminUser = async ({ token, tenant, payload = {} }) => {
  const { __fullApplications, ...apiPayload } = payload;
  if (shouldUseSample(token)) {
    return makeSampleUser({ ...apiPayload, __fullApplications });
  }
  const response = await fetch(`${API_BASE}/api/admin/users`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(apiPayload),
  });
  return handleResponse(response);
};

export const updateAdminUser = async ({ token, tenant, userId, payload = {} }) => {
  const { __fullApplications, ...apiPayload } = payload;
  if (shouldUseSample(token)) {
    return makeSampleUser({ id: userId, ...apiPayload, __fullApplications });
  }
  const response = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
    method: 'PATCH',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(apiPayload),
  });
  return handleResponse(response);
};

export const updatePurchasedApplications = async ({ token, tenant, purchased = [] }) => {
  if (shouldUseSample(token)) {
    const coreKeys = SAMPLE_ADMIN_APPLICATIONS.filter((app) => app.core).map((app) => app.key);
    samplePurchaseState = new Set([...purchased, ...coreKeys]);
    return { applications: buildSampleAdminApps(), __sample: true };
  }
  const response = await fetch(`${API_BASE}/api/admin/applications`, {
    method: 'PATCH',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify({ purchased }),
  });
  return handleResponse(response);
};
