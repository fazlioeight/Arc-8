const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

const shouldUseApi = (token) => {
  if (!token) return false;
  return !String(token).toLowerCase().startsWith('sample');
};

const buildHeaders = (token, tenant) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(tenant ? { 'X-Tenant-Key': tenant } : {}),
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

export const fetchUserPreferences = async ({ token, tenant } = {}) => {
  if (!shouldUseApi(token)) return null;
  const response = await fetch(`${API_BASE}/api/settings/preferences`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(response);
};

export const updateUserPreferences = async ({ token, tenant, settings, memories } = {}) => {
  if (!shouldUseApi(token)) return null;
  const response = await fetch(`${API_BASE}/api/settings/preferences`, {
    method: 'PATCH',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify({ settings: settings || {}, memories: memories || [] }),
  });
  return handleResponse(response);
};

// Soft-delete all of the caller's chat conversations server-side.
export const clearChatHistory = async ({ token, tenant } = {}) => {
  const response = await fetch(`${API_BASE}/api/chat/conversations`, {
    method: 'DELETE',
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(response);
};

// Self-service account deactivation (soft close + token revocation, audited).
export const deactivateAccount = async ({ token, tenant } = {}) => {
  const response = await fetch(`${API_BASE}/api/account/deactivate`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(response);
};
