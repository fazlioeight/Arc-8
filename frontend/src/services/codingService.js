const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

function buildHeaders(token, tenant) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Tenant-Key': tenant,
  };
}

function toQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach(v => qs.append(key, v));
    } else {
      qs.append(key, value);
    }
  });
  const query = qs.toString();
  return query ? `?${query}` : '';
}

async function handleResponse(res) {
  if (res.status === 401 || res.status === 403) {
    throw new Error('Unauthorized');
  }
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = body?.detail || res.statusText;
    throw new Error(detail);
  }
  return body;
}

export async function fetchCodingMembers(token, tenant, { search, status = [], lob = [], page = 1, pageSize = 25 } = {}) {
  const query = toQuery({ search, status, lob, page, page_size: pageSize });
  const res = await fetch(`${API_BASE}/api/coding/members${query}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
}

export async function fetchCodingMemberDetail(token, tenant, memberId) {
  const res = await fetch(`${API_BASE}/api/coding/members/${memberId}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
}

export async function createCodingMember(token, tenant, payload) {
  const res = await fetch(`${API_BASE}/api/coding/members`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function createCodingChase(token, tenant, memberId, payload) {
  const res = await fetch(`${API_BASE}/api/coding/members/${memberId}/chases`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function updateCodingChase(token, tenant, chaseId, payload) {
  const res = await fetch(`${API_BASE}/api/coding/chases/${chaseId}`, {
    method: 'PATCH',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function createCodingNote(token, tenant, memberId, payload) {
  const res = await fetch(`${API_BASE}/api/coding/members/${memberId}/notes`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function fetchCodingProviders(token, tenant, { search, page = 1, pageSize = 25 } = {}) {
  const query = toQuery({ search, page, page_size: pageSize });
  const res = await fetch(`${API_BASE}/api/coding/providers${query}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
}

export async function fetchCodingProviderDetail(token, tenant, providerId) {
  const res = await fetch(`${API_BASE}/api/coding/providers/${providerId}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
}
