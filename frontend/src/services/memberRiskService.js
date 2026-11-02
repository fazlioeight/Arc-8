import { API_BASE } from '../utils/apiBase';

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
