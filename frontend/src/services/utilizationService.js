// Over-utilization analytics client. Flags members whose visit count
// (claims, as a proxy) meets or exceeds a threshold.

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

const buildHeaders = (token, tenant) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(tenant ? { 'X-Tenant-Key': tenant } : {}),
});

export const getOverutilization = async (token, tenant, threshold = 5) => {
  const params = new URLSearchParams({ threshold: String(threshold) });
  const response = await fetch(`${API_BASE}/overutilization/?${params.toString()}`, {
    headers: buildHeaders(token, tenant),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to load over-utilization data');
  }
  return response.json();
};

export default { getOverutilization };
