import { createMemberDetail, createMemberSummary } from '../viewModels/common';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

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

export const fetchCodingMembers = async (
  token,
  tenant,
  { search, status = [], lob = [], page = 1, pageSize = 25 } = {},
) => {
  const query = toQuery({ search, status, lob, page, page_size: pageSize });
  const res = await fetch(`${API_BASE}/api/coding/members${query}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const fetchCodingMemberDetail = async (token, tenant, memberId) => {
  const res = await fetch(`${API_BASE}/api/coding/members/${memberId}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const fetchCodingProviders = async (token, tenant, { search, page = 1, pageSize = 25 } = {}) => {
  const query = toQuery({ search, page, page_size: pageSize });
  const res = await fetch(`${API_BASE}/api/coding/providers${query}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const fetchCodingWorklist = async (
  token,
  tenant,
  { search, statuses = [], priorities = [], assigned, page = 1, pageSize = 25 } = {},
) => {
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
  const res = await fetch(`${API_BASE}/api/coding/providers/${providerId}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const updateCodingProvider = async (token, tenant, providerId, payload) => {
  const res = await fetch(`${API_BASE}/api/coding/providers/${providerId}`, {
    method: 'PATCH',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
};

export const updateCodingChase = async (token, tenant, chaseId, payload) => {
  const res = await fetch(`${API_BASE}/api/coding/chases/${chaseId}`, {
    method: 'PATCH',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
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
      isSample: false,
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
      isSample: false,
    };
  }
}
