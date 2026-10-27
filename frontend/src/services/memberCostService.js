const API_BASE = (typeof window !== 'undefined' && window.location && (window.location.port === '7777' || window.location.port === '7778' || window.location.port === '3000' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) ? (window.location.protocol + '//' + window.location.hostname + ':8989') : (process.env.REACT_APP_API_BASE || 'http://localhost:8989');

export async function getMemberCosts(memberId, token, tenant) {
  const res = await fetch(`${API_BASE}/member/${memberId}/costs`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Tenant-Key': tenant,
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    throw new Error('Failed to fetch member costs');
  }
  return await res.json();
}
