import { SAMPLE_CODING_MEMBERS } from '../utils/sampleData';
import { createMemberDetail, createMemberSummary } from '../viewModels/common';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';
const SAMPLE_STORE_LIMIT = 5;

const shouldUseSample = (token) => {
  if (!token) return true;
  const value = String(token).toLowerCase();
  return value.startsWith('sample');
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const sampleStores = new Map();

const trimSampleStores = () => {
  if (sampleStores.size <= SAMPLE_STORE_LIMIT) {
    return;
  }
  const entries = Array.from(sampleStores.entries()).sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
  while (entries.length > SAMPLE_STORE_LIMIT) {
    const [keyToRemove] = entries.shift();
    sampleStores.delete(keyToRemove);
  }
};

const initializeSampleStore = () => ({
  members: new Map(SAMPLE_CODING_MEMBERS.map((member) => [member.id, deepClone(member)])),
  lastAccessed: Date.now(),
});

const getSampleStore = (tenant) => {
  const key = (tenant || 'default').toLowerCase();
  let store = sampleStores.get(key);
  if (!store) {
    store = initializeSampleStore();
    sampleStores.set(key, store);
    trimSampleStores();
  }
  store.lastAccessed = Date.now();
  return store;
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

const filterSampleMembers = (members, { search, status = [], lob = [] }) => {
  let results = members;
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

const getSampleMembersArray = (store) => Array.from(store.members.values()).map((member) => deepClone(member));

export const fetchCodingMembers = async (
  token,
  tenant,
  { search, status = [], lob = [], page = 1, pageSize = 25 } = {}
) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
    const filtered = filterSampleMembers(getSampleMembersArray(store), { search, status, lob });
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
    const store = getSampleStore(tenant);
    const member = store.members.get(memberId);
    if (!member) {
      throw new Error('Member not found');
    }
    return {
      member: deepClone(member),
      __sample: true,
    };
  }

  const res = await fetch(`${API_BASE}/api/coding/members/${memberId}`, {
    headers: buildHeaders(token, tenant),
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

const SAMPLE_WORKLIST = [
  {
    chase_id: 9001,
    member_id: 'mem-001',
    member_key: 'M00001',
    member_name: 'Maria Hernandez',
    status: 'in_progress',
    priority: 'urgent',
    assigned_coder_email: 'coder.a@nexora.test',
    hcc_code: 'HCC18',
    service_date_from: '2026-01-04',
    service_date_to: '2026-01-04',
    due_date: '2026-05-22',
    updated_at: '2026-05-15T14:30:00Z',
  },
  {
    chase_id: 9002,
    member_id: 'mem-002',
    member_key: 'M00002',
    member_name: 'James Patel',
    status: 'pending_review',
    priority: 'high',
    assigned_coder_email: 'coder.b@nexora.test',
    hcc_code: 'HCC85',
    service_date_from: '2026-02-12',
    service_date_to: '2026-02-12',
    due_date: '2026-05-26',
    updated_at: '2026-05-14T08:12:00Z',
  },
  {
    chase_id: 9003,
    member_id: 'mem-003',
    member_key: 'M00003',
    member_name: 'Aiyana Whitehorse',
    status: 'open',
    priority: 'medium',
    assigned_coder_email: null,
    hcc_code: 'HCC22',
    service_date_from: '2026-03-08',
    service_date_to: '2026-03-08',
    due_date: '2026-06-04',
    updated_at: '2026-05-13T17:55:00Z',
  },
  {
    chase_id: 9004,
    member_id: 'mem-004',
    member_key: 'M00004',
    member_name: 'Diego Romero',
    status: 'audit_feedback',
    priority: 'medium',
    assigned_coder_email: 'coder.a@nexora.test',
    hcc_code: 'HCC108',
    service_date_from: '2026-01-22',
    service_date_to: '2026-01-22',
    due_date: '2026-05-19',
    updated_at: '2026-05-15T10:01:00Z',
  },
  {
    chase_id: 9005,
    member_id: 'mem-005',
    member_key: 'M00005',
    member_name: 'Lin Zhao',
    status: 'completed',
    priority: 'low',
    assigned_coder_email: 'coder.c@nexora.test',
    hcc_code: 'HCC55',
    service_date_from: '2026-04-02',
    service_date_to: '2026-04-02',
    due_date: '2026-05-30',
    updated_at: '2026-05-11T16:45:00Z',
  },
  {
    chase_id: 9006,
    member_id: 'mem-006',
    member_key: 'M00006',
    member_name: 'Priya Singh',
    status: 'query_pending',
    priority: 'high',
    assigned_coder_email: 'coder.b@nexora.test',
    hcc_code: 'HCC161',
    service_date_from: '2026-02-25',
    service_date_to: '2026-02-25',
    due_date: '2026-05-21',
    updated_at: '2026-05-15T09:30:00Z',
  },
];

const filterSampleWorklist = (items, { search, statuses, priorities, assigned }) => {
  let results = items;
  const term = search?.trim().toLowerCase();
  if (term) {
    results = results.filter((i) =>
      [i.member_key, i.member_name, i.hcc_code, i.assigned_coder_email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }
  if (statuses?.length) {
    const set = new Set(statuses.map((s) => s.toLowerCase()));
    results = results.filter((i) => set.has((i.status || '').toLowerCase()));
  }
  if (priorities?.length) {
    const set = new Set(priorities.map((p) => p.toLowerCase()));
    results = results.filter((i) => set.has((i.priority || '').toLowerCase()));
  }
  if (assigned) {
    if (assigned === '__unassigned__') {
      results = results.filter((i) => !i.assigned_coder_email);
    } else {
      const lower = assigned.toLowerCase();
      results = results.filter((i) => (i.assigned_coder_email || '').toLowerCase().includes(lower));
    }
  }
  return results;
};

const summarizeSampleWorklist = (items) => {
  const today = new Date();
  const due_soon = items.filter((i) => {
    if (!i.due_date) return false;
    const d = new Date(i.due_date);
    const diff = (d - today) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  }).length;
  const overdue = items.filter((i) => i.due_date && new Date(i.due_date) < today).length;
  const counts = (key) =>
    items.reduce((acc, i) => {
      const v = (i[key] || '').toLowerCase();
      if (!v) return acc;
      acc[v] = (acc[v] || 0) + 1;
      return acc;
    }, {});
  return {
    status_counts: counts('status'),
    priority_counts: counts('priority'),
    due_soon,
    overdue,
  };
};

export const fetchCodingWorklist = async (
  token,
  tenant,
  { search, statuses = [], priorities = [], assigned, page = 1, pageSize = 25 } = {}
) => {
  if (shouldUseSample(token)) {
    const filtered = filterSampleWorklist(SAMPLE_WORKLIST, { search, statuses, priorities, assigned });
    const summary = summarizeSampleWorklist(filtered);
    const pageItems = paginate(filtered, page, pageSize);
    return {
      items: pageItems,
      total: filtered.length,
      summary,
      __sample: true,
    };
  }

  const query = toQuery({
    status: statuses,
    priority: priorities,
    assigned,
    search,
    page,
    page_size: pageSize,
  });
  const res = await fetch(`${API_BASE}/api/coding/worklist${query}`, {
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

export class MemberSearchService {
  constructor({ token, tenant, fetchMembers = fetchCodingMembers, fetchMemberDetail = fetchCodingMemberDetail } = {}) {
    this.token = token;
    this.tenant = tenant;
    this.fetchMembers = fetchMembers;
    this.fetchMemberDetail = fetchMemberDetail;
  }

  async search({ search = "", status = [], lob = [], page = 1, pageSize = 25 } = {}) {
    const response = await this.fetchMembers(this.token, this.tenant, { search, status, lob, page, pageSize });
    const items = (response?.items || []).map((item) => createMemberSummary(item)).filter(Boolean);
    return {
      items,
      total: response?.total ?? items.length,
      page: response?.page ?? page,
      pageSize: response?.page_size ?? pageSize,
      isSample: Boolean(response?.__sample),
    };
  }

  async getMember(memberId) {
    if (!memberId) {
      throw new Error("memberId is required");
    }
    const response = await this.fetchMemberDetail(this.token, this.tenant, memberId);
    return {
      member: createMemberDetail(response?.member ? response : { member: response }),
      raw: response,
      isSample: Boolean(response?.__sample),
    };
  }
}
