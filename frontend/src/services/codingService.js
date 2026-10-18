import { createMemberDetail, createMemberSummary } from '../viewModels/common';
import {
  fetchMember360Members,
  fetchMember360MemberDetail,
} from './member360LabService';

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

// Member360-backed search. The /api/member360/members endpoint uses
// limit/offset instead of page/page_size, so we translate here.
const fetchMember360MembersAdapter = (token, tenant, { search, page = 1, pageSize = 25 } = {}) =>
  fetchMember360Members(token, tenant, {
    search,
    limit: pageSize,
    offset: Math.max(0, (page - 1) * pageSize),
  });

export class Member360MemberSearchService extends MemberSearchService {
  constructor({ token, tenant } = {}) {
    super({
      token,
      tenant,
      fetchMembers: fetchMember360MembersAdapter,
      fetchMemberDetail: fetchMember360MemberDetail,
    });
  }
}

// Searches member360 first; if it errors out (e.g. tenant doesn't have the
// app), falls back to the coding members directory. Used by the portal page
// so the quick search can find members regardless of which app the user
// primarily works in.
export class PortalMemberSearchService {
  constructor({ token, tenant } = {}) {
    this.token = token;
    this.tenant = tenant;
    this.primary = new Member360MemberSearchService({ token, tenant });
    this.fallback = new MemberSearchService({ token, tenant });
  }

  async search(params) {
    try {
      return await this.primary.search(params);
    } catch (error) {
      const message = (error && error.message) || "";
      if (message === "Unauthorized" || /not enabled|access/i.test(message)) {
        return this.fallback.search(params);
      }
      throw error;
    }
  }

  async getMember(memberId) {
    try {
      return await this.primary.getMember(memberId);
    } catch (error) {
      const message = (error && error.message) || "";
      if (message === "Unauthorized" || /not enabled|access/i.test(message)) {
        return this.fallback.getMember(memberId);
      }
      throw error;
    }
  }
}
