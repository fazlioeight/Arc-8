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
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else qs.append(key, value);
  });
  const q = qs.toString();
  return q ? `?${q}` : '';
};

const handleResponse = async (res) => {
  if (res.status === 401 || res.status === 403) throw new Error('Unauthorized');
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = body?.detail || res.statusText;
    throw new Error(detail);
  }
  return body;
};

const get = (token, tenant, path) =>
  fetch(`${API_BASE}${path}`, { headers: buildHeaders(token, tenant) }).then(handleResponse);

const post = (token, tenant, path, payload) =>
  fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  }).then(handleResponse);

const patch = (token, tenant, path, payload) =>
  fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  }).then(handleResponse);

// ------------------- Public API -------------------

export const fetchMember360Dashboard = (token, tenant) =>
  get(token, tenant, '/api/member360/dashboard');

export const fetchMember360Members = (token, tenant, filters = {}) => {
  const query = toQuery({
    search: filters.search,
    risk_tier: filters.risk_tier,
    has_active_journey: filters.has_active_journey,
    has_open_task: filters.has_open_task,
    limit: filters.limit,
    offset: filters.offset,
  });
  return get(token, tenant, `/api/member360/members${query}`);
};

export const fetchMember360MemberDetail = (token, tenant, memberId) =>
  get(token, tenant, `/api/member360/members/${memberId}`);

export const createMember360Task = (token, tenant, payload) =>
  post(token, tenant, '/api/member360/tasks', payload);

export const updateMember360Task = (token, tenant, taskId, payload) =>
  patch(token, tenant, `/api/member360/tasks/${taskId}`, payload);

export const updateMember360Member = (token, tenant, memberId, payload) =>
  patch(token, tenant, `/api/member360/members/${memberId}`, payload);

export const createMember360Note = (token, tenant, memberId, payload) =>
  post(token, tenant, `/api/member360/members/${memberId}/notes`, payload);

export const createMember360Message = (token, tenant, memberId, payload) =>
  post(token, tenant, `/api/member360/members/${memberId}/messages`, payload);

export const createMember360CareOption = (token, tenant, payload) =>
  post(token, tenant, '/api/member360/care-options', payload);

export const fetchMember360JourneyTemplates = (token, tenant) =>
  get(token, tenant, '/api/member360/care-journey-templates');

// ------------------- Aggregate (multi-member) helpers -------------------
// These fan out across the member list and per-member detail endpoints since
// there is no aggregate endpoint server-side yet. Fine for a lab-scale
// tenant; switch to a dedicated endpoint when row counts grow.

const memberLookup = (members) => {
  const map = new Map();
  members.forEach((m) => map.set(m.id, m));
  return map;
};

const attachMemberSummary = (row, member) => ({
  ...row,
  member_id: row.member_id ?? member?.id,
  member_name: member ? `${member.first_name || ''} ${member.last_name || ''}`.trim() : row.member_name,
  member_key: member?.member_key || null,
  risk_tier: member?.risk_tier || row.risk_tier || null,
  plan_name: member?.plan_name || null,
  preferred_channel: member?.preferred_channel || null,
});

const fanOutDetails = async (token, tenant) => {
  const list = await fetchMember360Members(token, tenant, { limit: 500 });
  const members = list.items || [];
  const details = await Promise.all(
    members.map((m) =>
      fetchMember360MemberDetail(token, tenant, m.id).catch(() => null),
    ),
  );
  return { members, details: details.filter(Boolean) };
};

export const fetchMember360AllTasks = async (token, tenant) => {
  const { details } = await fanOutDetails(token, tenant);
  const rows = [];
  details.forEach((d) => {
    (d.tasks || []).forEach((t) => rows.push(attachMemberSummary(t, d.member)));
  });
  return rows;
};

export const fetchMember360AllMessages = async (token, tenant) => {
  const { details } = await fanOutDetails(token, tenant);
  const rows = [];
  details.forEach((d) => {
    (d.messages || []).forEach((m) => rows.push(attachMemberSummary(m, d.member)));
  });
  return rows;
};

export const fetchMember360AllCareOptions = async (token, tenant) => {
  const { details } = await fanOutDetails(token, tenant);
  const rows = [];
  details.forEach((d) => {
    (d.care_options || []).forEach((o) => rows.push(attachMemberSummary(o, d.member)));
  });
  return rows;
};

export const fetchMember360AllDocuments = async (token, tenant) => {
  const { details } = await fanOutDetails(token, tenant);
  const rows = [];
  details.forEach((d) => {
    (d.documents || []).forEach((doc) => rows.push(attachMemberSummary(doc, d.member)));
  });
  return rows;
};

export const fetchMember360AllJourneys = async (token, tenant) => {
  const { details } = await fanOutDetails(token, tenant);
  const rows = [];
  details.forEach((d) => {
    (d.care_journeys || []).forEach((j) => rows.push(attachMemberSummary(j, d.member)));
  });
  return rows;
};

export const fetchMember360AllRiskInsights = async (token, tenant) => {
  const { details } = await fanOutDetails(token, tenant);
  const rows = [];
  details.forEach((d) => {
    (d.risk_insights || []).forEach((i) => rows.push(attachMemberSummary(i, d.member)));
  });
  return rows;
};

// ------------------- Gap analysis & submission export -------------------

export const fetchMember360GapAnalysis = (token, tenant, memberId, submissionYear) => {
  const query = toQuery({ submission_year: submissionYear || new Date().getFullYear() });
  return get(token, tenant, `/api/member360/members/${memberId}/gaps${query}`);
};

export const generateMember360SubmissionExport = (token, tenant, submissionYear, memberIds) =>
  post(token, tenant, '/api/member360/submissions/export', {
    submission_year: submissionYear,
    member_ids: memberIds,
  });
