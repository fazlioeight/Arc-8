import { SAMPLE_CODING_MEMBERS } from '../utils/sampleData';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

const shouldUseSample = (token) => {
  if (!token) return true;
  const value = String(token).toLowerCase();
  return value.startsWith('sample');
};

const sampleState = {
  members: SAMPLE_CODING_MEMBERS.map((member) => ({ ...member })),
  chases: {},
  notes: {},
};

const buildHeaders = (token, tenant) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(tenant ? { 'X-Tenant-Key': tenant } : {}),
});

const toQuery = (params = {}) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((v) => qs.append(key, v));
    } else {
      qs.append(key, value);
    }
  });
  const query = qs.toString();
  return query ? `?${query}` : '';
};

const handleResponse = async (res) => {
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
};

const filterSampleMembers = ({ search, status = [], lob = [] }) => {
  let results = [...sampleState.members];
  const term = search?.trim().toLowerCase();
  if (term) {
    results = results.filter((member) => {
      const haystack = [
        member.first_name,
        member.last_name,
        member.member_key,
        member.pcp_name,
        member.pcp_npi,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }
  if (status && status.length) {
    const set = new Set(status.map((value) => value.toLowerCase()));
    results = results.filter((member) => set.has((member.status || '').toLowerCase()));
  }
  if (lob && lob.length) {
    const set = new Set(lob.map((value) => value.toLowerCase()));
    results = results.filter((member) => set.has((member.line_of_business || '').toLowerCase()));
  }
  return results;
};

const paginate = (items, page = 1, pageSize = 25) => {
  const start = Math.max(0, (page - 1) * pageSize);
  return items.slice(start, start + pageSize);
};

export const fetchCodingMembers = async (
  token,
  tenant,
  { search, status = [], lob = [], page = 1, pageSize = 25 } = {}
) => {
  if (shouldUseSample(token)) {
    const filtered = filterSampleMembers({ search, status, lob });
    const pageItems = paginate(filtered, page, pageSize);
    return {
      items: pageItems,
      total: filtered.length,
      page,
      page_size: pageSize,
      __sample: true,
    };
  }

  const query = toQuery({ search, status, lob, page, page_size: pageSize });
  const res = await fetch(`${API_BASE}/api/coding/members${query}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const fetchCodingMemberDetail = async (token, tenant, memberId) => {
  if (shouldUseSample(token)) {
    const member = sampleState.members.find((item) => item.id === memberId);
    if (!member) {
      throw new Error('Member not found');
    }
    const chases = Object.values(sampleState.chases)
      .flat()
      .filter((chase) => chase.member_id === memberId);
    const notes = sampleState.notes[memberId] || [];
    return { ...member, chases, notes, __sample: true };
  }

  const res = await fetch(`${API_BASE}/api/coding/members/${memberId}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const createCodingMember = async (token, tenant, payload) => {
  if (shouldUseSample(token)) {
    const now = Date.now().toString(36);
    const member = {
      id: `sample-member-${now}${Math.random().toString(36).slice(2, 6)}`,
      first_name: payload.first_name || 'New',
      last_name: payload.last_name || 'Member',
      member_key: payload.member_key || `DEMO${now.toUpperCase()}`,
      status: payload.status || 'active',
      line_of_business: payload.line_of_business || 'Commercial',
      pcp_name: payload.pcp_name || null,
      pcp_npi: payload.pcp_npi || null,
      ...payload,
    };
    sampleState.members.push(member);
    return member;
  }

  const res = await fetch(`${API_BASE}/api/coding/members`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
};

export const createCodingChase = async (token, tenant, memberId, payload) => {
  if (shouldUseSample(token)) {
    const chase = {
      id: `sample-chase-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      member_id: memberId,
      status: payload?.status || 'open',
      created_at: new Date().toISOString(),
      ...payload,
      __sample: true,
    };
    sampleState.chases[memberId] = [...(sampleState.chases[memberId] || []), chase];
    return chase;
  }

  const res = await fetch(`${API_BASE}/api/coding/members/${memberId}/chases`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
};

export const updateCodingChase = async (token, tenant, chaseId, payload) => {
  if (shouldUseSample(token)) {
    for (const [memberId, chases] of Object.entries(sampleState.chases)) {
      const index = chases.findIndex((item) => item.id === chaseId);
      if (index >= 0) {
        const updated = { ...chases[index], ...payload, __sample: true };
        sampleState.chases[memberId] = [
          ...chases.slice(0, index),
          updated,
          ...chases.slice(index + 1),
        ];
        return updated;
      }
    }
    throw new Error('Chase not found');
  }

  const res = await fetch(`${API_BASE}/api/coding/chases/${chaseId}`, {
    method: 'PATCH',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
};

export const createCodingNote = async (token, tenant, memberId, payload) => {
  if (shouldUseSample(token)) {
    const note = {
      id: `sample-note-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      member_id: memberId,
      created_at: new Date().toISOString(),
      body: payload?.body || '',
      author: payload?.author || 'Sandbox User',
      __sample: true,
    };
    sampleState.notes[memberId] = [...(sampleState.notes[memberId] || []), note];
    return note;
  }

  const res = await fetch(`${API_BASE}/api/coding/members/${memberId}/notes`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
};

export const fetchCodingProviders = async (token, tenant, { search, page = 1, pageSize = 25 } = {}) => {
  if (shouldUseSample(token)) {
    return {
      items: [],
      total: 0,
      page,
      page_size: pageSize,
      __sample: true,
    };
  }

  const query = toQuery({ search, page, page_size: pageSize });
  const res = await fetch(`${API_BASE}/api/coding/providers${query}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const fetchCodingProviderDetail = async (token, tenant, providerId) => {
  if (shouldUseSample(token)) {
    throw new Error('Provider details unavailable in sandbox mode');
  }

  const res = await fetch(`${API_BASE}/api/coding/providers/${providerId}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};
