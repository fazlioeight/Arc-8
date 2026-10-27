// API base URL.
//
// In development (`npm start`, `npm test`) we fall back to localhost:8000 so
// engineers don't need to set the env var. In production builds, a missing
// REACT_APP_API_BASE is a deploy-time misconfiguration — the previous silent
// fallback to localhost would result in every API call going to the user's
// own machine and looking like a CORS error or a hung request. Fail loudly
// at module load instead so the misconfiguration is obvious in the browser
// console rather than buried as a per-request failure.
const API_BASE = (() => {
  if (typeof window !== "undefined" && window.location) {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.port === "7777" || window.location.port === "7778" || window.location.port === "3000") {
      return `${window.location.protocol}//${window.location.hostname}:8989`;
    }
  }
  if (process.env.REACT_APP_API_BASE) return process.env.REACT_APP_API_BASE;
  return "http://localhost:8989";
})();

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

export const fetchMember360MemberAudit = (token, tenant, memberId, filters = {}) => {
  const query = toQuery({
    event_type_prefix: filters.event_type_prefix,
    limit: filters.limit,
    offset: filters.offset,
  });
  return get(token, tenant, `/api/member360/members/${memberId}/audit${query}`);
};

export const createMember360CareJourney = (token, tenant, payload) =>
  post(token, tenant, '/api/member360/care-journeys', payload);

export const updateMember360CareJourney = (token, tenant, journeyId, payload) =>
  patch(token, tenant, `/api/member360/care-journeys/${journeyId}`, payload);

export const updateMember360CareJourneyStage = (token, tenant, journeyId, stageId, payload) =>
  patch(token, tenant, `/api/member360/care-journeys/${journeyId}/stages/${stageId}`, payload);

// ------------------- Batch ingest -------------------
// These are tenant-admin level surfaces. Each accepts up to a few hundred
// rows per call (see backend route docs); large imports should chunk on the
// caller side.

export const importMember360Members = (token, tenant, members) =>
  post(token, tenant, '/api/member360/import/members', { members });

export const importMember360Claims = (token, tenant, claims) =>
  post(token, tenant, '/api/member360/import/claims', { claims });

export const importMember360RiskInsights = (token, tenant, insights) =>
  post(token, tenant, '/api/member360/import/risk-insights', { insights });

export const importMember360Problems = (token, tenant, problems) =>
  post(token, tenant, '/api/member360/import/problems', { problems });

export const importMember360Medications = (token, tenant, medications) =>
  post(token, tenant, '/api/member360/import/medications', { medications });

export const importMember360Labs = (token, tenant, labs) =>
  post(token, tenant, '/api/member360/import/labs', { labs });

// ------------------- Document upload / download -------------------
// Uploads use multipart/form-data so they bypass the JSON `post` helper.
// Downloads stream binary content; we return a Blob the caller turns into
// a download URL (see DocumentsPage for the click handler).

export const uploadMember360Document = async (token, tenant, memberId, file, { documentType } = {}) => {
  const form = new FormData();
  form.append('file', file);
  if (documentType) form.append('document_type', documentType);
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(tenant ? { 'X-Tenant-Key': tenant } : {}),
  };
  // Do NOT set Content-Type — the browser sets the multipart boundary.
  const res = await fetch(`${API_BASE}/api/member360/members/${memberId}/documents`, {
    method: 'POST',
    headers,
    body: form,
  });
  return handleResponse(res);
};

export const downloadMember360Document = async (token, tenant, documentId) => {
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(tenant ? { 'X-Tenant-Key': tenant } : {}),
  };
  const res = await fetch(`${API_BASE}/api/member360/documents/${documentId}/download`, {
    headers,
  });
  if (res.status === 401 || res.status === 403) throw new Error('Unauthorized');
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return {
    blob: await res.blob(),
    filename: parseContentDispositionFilename(res.headers.get('Content-Disposition')),
  };
};

// `attachment; filename="foo.pdf"` → `foo.pdf`. Returns null when absent so
// the caller can fall back to a default name.
function parseContentDispositionFilename(header) {
  if (!header) return null;
  const match = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return match ? match[1] : null;
}

// ------------------- Aggregate (multi-member) endpoints -------------------
//
// Population-level list endpoints. Each returns { items, total } where every
// item is already enriched with the denormalized member fields the UI needs
// (member_name, member_key, risk_tier, plan_name, preferred_channel) — so
// the list pages don't have to fan out per-member detail requests like the
// previous client-side helpers did (which capped silently at 500 members).
//
// All accept `limit` (default 50, max 500), `offset` (default 0), plus
// optional `member_id` and per-collection filters. See routes/member360.py
// for the full filter list per endpoint.

const buildListParams = (filters = {}) => {
  const out = { limit: filters.limit, offset: filters.offset };
  if (filters.member_id != null) out.member_id = filters.member_id;
  if (filters.status) out.status = filters.status;
  if (filters.priority) out.priority = filters.priority;
  if (filters.channel) out.channel = filters.channel;
  if (filters.direction) out.direction = filters.direction;
  if (filters.document_type) out.document_type = filters.document_type;
  if (filters.domain) out.domain = filters.domain;
  return out;
};

export const fetchMember360Tasks = (token, tenant, filters = {}) =>
  get(token, tenant, `/api/member360/tasks${toQuery(buildListParams(filters))}`);

export const fetchMember360Messages = (token, tenant, filters = {}) =>
  get(token, tenant, `/api/member360/messages${toQuery(buildListParams(filters))}`);

export const fetchMember360CareOptions = (token, tenant, filters = {}) =>
  get(token, tenant, `/api/member360/care-options${toQuery(buildListParams(filters))}`);

export const fetchMember360Documents = (token, tenant, filters = {}) =>
  get(token, tenant, `/api/member360/documents${toQuery(buildListParams(filters))}`);

export const fetchMember360CareJourneys = (token, tenant, filters = {}) =>
  get(token, tenant, `/api/member360/care-journeys${toQuery(buildListParams(filters))}`);

export const fetchMember360RiskInsights = (token, tenant, filters = {}) =>
  get(token, tenant, `/api/member360/risk-insights${toQuery(buildListParams(filters))}`);

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
