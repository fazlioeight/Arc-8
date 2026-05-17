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
