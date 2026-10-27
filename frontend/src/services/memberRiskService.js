const API_BASE = (typeof window !== 'undefined' && window.location && (window.location.port === '7777' || window.location.port === '7778' || window.location.port === '3000' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) ? (window.location.protocol + '//' + window.location.hostname + ':8989') : (process.env.REACT_APP_API_BASE || 'http://localhost:8989');

const buildHeaders = (token, tenant) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(tenant ? { 'X-Tenant-Key': tenant } : {}),
});

export const getMemberRisk = async (token, tenant, memberId) => {
  const response = await fetch(
    `${API_BASE}/member/${encodeURIComponent(memberId)}/risk`,
    { headers: buildHeaders(token, tenant) },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to load risk data');
  }
  return response.json();
};

export default { getMemberRisk };
