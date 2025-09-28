const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000";

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

export const fetchAdminApplications = async ({ token, tenant }) => {
  const response = await fetch(`${API_BASE}/api/admin/applications`, {
    method: 'GET',
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(response);
};

export const fetchAdminUsers = async ({ token, tenant }) => {
  const response = await fetch(`${API_BASE}/api/admin/users`, {
    method: 'GET',
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(response);
};

export const createAdminUser = async ({ token, tenant, payload }) => {
  const response = await fetch(`${API_BASE}/api/admin/users`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

export const updateAdminUser = async ({ token, tenant, userId, payload }) => {
  const response = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
    method: 'PATCH',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

