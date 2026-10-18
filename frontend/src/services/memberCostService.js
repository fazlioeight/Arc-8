const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

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
