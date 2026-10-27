const API_BASE = (typeof window !== 'undefined' && window.location && (window.location.port === '7777' || window.location.port === '7778' || window.location.port === '3000' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) ? (window.location.protocol + '//' + window.location.hostname + ':8989') : (process.env.REACT_APP_API_BASE || 'http://localhost:8989');

const buildHeaders = (token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
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

export const bootstrapStaff = async ({ email, name, password }) => {
  const response = await fetch(`${API_BASE}/api/staff/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, password }),
  });
  return handleResponse(response);
};

export const staffLogin = async ({ email, password, mfa_code }) => {
  const response = await fetch(`${API_BASE}/api/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, mfa_code: mfa_code || null }),
  });
  return handleResponse(response);
};

export const staffLogout = async ({ token }) => {
  await fetch(`${API_BASE}/api/staff/logout`, {
    method: 'POST',
    headers: buildHeaders(token),
  }).catch(() => undefined);
};

export const fetchStaffMe = async ({ token }) => {
  const response = await fetch(`${API_BASE}/api/staff/me`, {
    method: 'GET',
    headers: buildHeaders(token),
  });
  return handleResponse(response);
};

export const fetchStaffTenants = async ({ token }) => {
  const response = await fetch(`${API_BASE}/api/staff/tenants`, {
    method: 'GET',
    headers: buildHeaders(token),
  });
  return handleResponse(response);
};

export const impersonateTenant = async ({ token, tenantKey }) => {
  const response = await fetch(
    `${API_BASE}/api/staff/tenants/${encodeURIComponent(tenantKey)}/impersonate`,
    {
      method: 'POST',
      headers: buildHeaders(token),
    }
  );
  return handleResponse(response);
};

export const fetchStaffUsers = async ({ token }) => {
  const response = await fetch(`${API_BASE}/api/staff/users`, {
    method: 'GET',
    headers: buildHeaders(token),
  });
  return handleResponse(response);
};

export const createStaffUser = async ({ token, payload }) => {
  const response = await fetch(`${API_BASE}/api/staff/users`, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

export const updateStaffUser = async ({ token, staffId, payload }) => {
  const response = await fetch(`${API_BASE}/api/staff/users/${staffId}`, {
    method: 'PATCH',
    headers: buildHeaders(token),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

export const deleteStaffUser = async ({ token, staffId }) => {
  const response = await fetch(`${API_BASE}/api/staff/users/${staffId}`, {
    method: 'DELETE',
    headers: buildHeaders(token),
  });
  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.detail || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return { id: staffId };
};

export const enrollStaffMfa = async ({ token }) => {
  const response = await fetch(`${API_BASE}/api/staff/mfa/enroll`, {
    method: 'POST',
    headers: buildHeaders(token),
  });
  return handleResponse(response);
};

export const verifyStaffMfa = async ({ token, code }) => {
  const response = await fetch(`${API_BASE}/api/staff/mfa/verify`, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify({ code }),
  });
  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.detail || 'Request failed');
    error.status = response.status;
    throw error;
  }
};
