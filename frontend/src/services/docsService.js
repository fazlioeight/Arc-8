const API_BASE = (typeof window !== 'undefined' && window.location && (window.location.port === '7777' || window.location.port === '7778' || window.location.port === '3000' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) ? (window.location.protocol + '//' + window.location.hostname + ':8989') : (process.env.REACT_APP_API_BASE || 'http://localhost:8989');

const shouldUseApi = (token) => {
  if (!token) return false;
  return !String(token).toLowerCase().startsWith('sample');
};

const buildHeaders = (token, tenant) => ({
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

export const searchDocsArticles = async ({ token, tenant, query } = {}) => {
  if (!shouldUseApi(token)) return null;
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  const qs = params.toString();
  const response = await fetch(`${API_BASE}/api/docs/articles${qs ? `?${qs}` : ''}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(response);
};
