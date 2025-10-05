import { SAMPLE_CODING_MEMBERS } from '../utils/sampleData';

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
  chases: new Map(),
  notes: new Map(),
  eligibility: new Map(),
  claims: new Map(),
  maoRecords: new Map(),
  assessments: new Map(),
  priorities: new Map(),
  coders: null,
  assignments: null,
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

const getSampleChasesArray = (store, memberId) => {
  const memberChases = store.chases.get(memberId);
  if (!memberChases) return [];
  return Array.from(memberChases.values()).map((chase) => deepClone(chase));
};

const getSampleNotesArray = (store, memberId) => {
  const memberNotes = store.notes.get(memberId);
  if (!memberNotes) return [];
  return Array.from(memberNotes.values()).map((note) => deepClone(note));
};

const ensureSampleEligibility = (store, member) => {
  const existing = store.eligibility.get(member.id);
  if (existing) return existing;
  const today = new Date();
  const planStart = new Date(today.getFullYear(), 0, 1);
  const eligibility = {
    plan_start: planStart.toISOString().slice(0, 10),
    plan_end: null,
    medicare_effective_date: planStart.toISOString().slice(0, 10),
    joined_at: planStart.toISOString().slice(0, 10),
    is_new_to_medicare: true,
    is_dual_eligible: false,
    risk_tier: member.risk_score && member.risk_score > 2 ? 'high' : 'standard',
    last_synced_at: new Date().toISOString(),
  };
  store.eligibility.set(member.id, eligibility);
  return eligibility;
};

const ensureSampleClaims = (store, member) => {
  let claims = store.claims.get(member.id);
  if (!claims) {
    const today = new Date();
    claims = [
      {
        id: `sample-claim-${member.id}-1`,
        claim_number: `CLM-${member.member_key}`,
        claim_type: 'professional',
        service_date: today.toISOString().slice(0, 10),
        provider_id: null,
        diagnosis_codes: { E119: { description: 'Type 2 diabetes mellitus' } },
        hcc_codes: { HCC18: { icd10: 'E11.9' } },
        total_paid: 275.5,
        chart_required: true,
      },
    ];
    store.claims.set(member.id, claims);
  }
  return claims.map((claim) => deepClone(claim));
};

const ensureSampleMaoRecords = (store, member, submissionYear) => {
  const key = `${member.id}-${submissionYear}`;
  let records = store.maoRecords.get(key);
  if (!records) {
    records = [
      {
        id: `sample-mao-${key}`,
        submission_year: submissionYear,
        hcc_code: 'HCC18',
        icd10_code: 'E11.9',
        service_start: `${submissionYear - 1}-01-01`,
        service_end: `${submissionYear - 1}-12-31`,
        status: 'open',
      },
    ];
    store.maoRecords.set(key, records);
  }
  return records.map((record) => deepClone(record));
};

const ensureSampleAssessments = (store, member) => {
  let assessments = store.assessments.get(member.id);
  if (!assessments) {
    const today = new Date();
    assessments = [
      {
        id: `sample-assessment-${member.id}`,
        assessment_date: today.toISOString().slice(0, 10),
        assessment_type: 'initial',
        provider_id: null,
        icd10_codes: ['Z00.00'],
        hcc_codes: [],
        completion_status: 'pending_submission',
        notes: 'Auto-generated sandbox assessment',
      },
    ];
    store.assessments.set(member.id, assessments);
  }
  return assessments.map((assessment) => deepClone(assessment));
};

const ensureSamplePriority = (store, member) => {
  let priority = store.priorities.get(member.id);
  if (!priority) {
    priority = {
      member_id: member.id,
      member_key: member.member_key,
      priority_score: Number(member.risk_score || 50) + 10,
      priority_tier: 'high',
      hcc_opportunity_count: 2,
      next_action: 'schedule_assessment',
      next_action_due: new Date().toISOString().slice(0, 10),
      justification: 'Sandbox prioritization result',
    };
const ensureSampleCoders = (store) => {
  if (!store.coders) {
    store.coders = [
      { id: 1, email: 'coder.one@nexora.test', role: 'coder', applications: { coding: 'user' } },
      { id: 2, email: 'coder.two@nexora.test', role: 'coder', applications: { coding: 'user' } },
      { id: 3, email: 'lead.coder@nexora.test', role: 'lead', applications: { coding: 'admin' } },
    ];
  }
  return store.coders.map((coder) => deepClone(coder));
};

const ensureSampleAssignments = (store) => {
  if (!store.assignments) {
    const members = SAMPLE_CODING_MEMBERS.slice(0, 5);
    store.assignments = members.map((member, index) => ({
      chase_id: index + 1000,
      member_id: member.id,
      member_key: member.member_key,
      member_name: [member.first_name, member.last_name].filter(Boolean).join(' '),
      status: index % 3 === 0 ? 'in_review' : 'open',
      priority: ['high', 'medium', 'low'][index % 3],
      assigned_coder_email: index % 2 === 0 ? 'coder.one@nexora.test' : null,
      hcc_code: index % 2 === 0 ? 'HCC18' : 'HCC54',
      icd10_code: index % 2 === 0 ? 'E11.9' : 'I10',
      updated_at: new Date(Date.now() - index * 3600000).toISOString(),
    }));
  }
  return store.assignments.map((item) => deepClone(item));
};


    store.priorities.set(member.id, priority);
  }
  return deepClone(priority);
};

const getSampleAssessmentsArray = (store, memberId) => ensureSampleAssessments(store, { id: memberId });

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
    const chases = getSampleChasesArray(store, memberId);
    const notes = getSampleNotesArray(store, memberId);
    const eligibility = ensureSampleEligibility(store, member);
    const claims = ensureSampleClaims(store, member);
    const submissionYear = new Date().getFullYear();
    const maoRecords = ensureSampleMaoRecords(store, member, submissionYear);
    const assessments = ensureSampleAssessments(store, member);
    const priority = ensureSamplePriority(store, member);
    return {
      member: deepClone(member),
      eligibility: deepClone(eligibility),
      chases,
      notes,
      attachments: [],
      claims,
      mao_records: maoRecords,
      health_assessments: assessments,
      priority,
      __sample: true,
    };
  }

  const res = await fetch(`${API_BASE}/api/coding/members/${memberId}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const createCodingMember = async (token, tenant, payload) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
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
    store.members.set(member.id, deepClone(member));
    return deepClone(member);
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
    const store = getSampleStore(tenant);
    const chase = {
      id: `sample-chase-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      member_id: memberId,
      status: payload?.status || 'open',
      created_at: new Date().toISOString(),
      ...payload,
      __sample: true,
    };
    let memberChases = store.chases.get(memberId);
    if (!memberChases) {
      memberChases = new Map();
      store.chases.set(memberId, memberChases);
    }
    memberChases.set(chase.id, deepClone(chase));
    return deepClone(chase);
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
    const store = getSampleStore(tenant);
    for (const memberChases of store.chases.values()) {
      const chase = memberChases.get(chaseId);
      if (chase) {
        const updated = { ...chase, ...payload, __sample: true };
        memberChases.set(chaseId, deepClone(updated));
        return deepClone(updated);
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
    const store = getSampleStore(tenant);
    const note = {
      id: `sample-note-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      member_id: memberId,
      created_at: new Date().toISOString(),
      body: payload?.body || '',
      author_email: payload?.author_email || payload?.author || 'sandbox@nexora.test',
      author_name: payload?.author_name || payload?.author || 'Sandbox User',
      __sample: true,
    };
    let memberNotes = store.notes.get(memberId);
    if (!memberNotes) {
      memberNotes = new Map();
      store.notes.set(memberId, memberNotes);
    }
    memberNotes.set(note.id, deepClone(note));
    return deepClone(note);
  }

  const res = await fetch(`${API_BASE}/api/coding/members/${memberId}/notes`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
};

export const fetchPrioritizedMembers = async (token, tenant, { submissionYear, search, limit = 50, offset = 0 } = {}) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
    const members = getSampleMembersArray(store);
    const items = members
      .map((member) => ensureSamplePriority(store, member))
      .sort((a, b) => b.priority_score - a.priority_score);
    return {
      items,
      total: items.length,
      submission_year: submissionYear || new Date().getFullYear(),
      __sample: true,
    };
  }

  const query = toQuery({
    submission_year: submissionYear || new Date().getFullYear(),
    search,
    limit,
    offset,
  });
  const res = await fetch(`${API_BASE}/api/coding/members/prioritized${query}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const fetchMemberGapAnalysis = async (token, tenant, memberId, submissionYear) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
    const member = store.members.get(memberId);
    if (!member) {
      throw new Error('Member not found');
    }
    const submission_year = submissionYear || new Date().getFullYear();
    const maoRecords = ensureSampleMaoRecords(store, member, submission_year);
    const claims = ensureSampleClaims(store, member);
    const assessments = ensureSampleAssessments(store, member);
    const missing_hcc = claims
      .flatMap((claim) => Object.keys(claim.hcc_codes || {}))
      .filter((code) => !maoRecords.some((record) => record.hcc_code === code))
      .map((hcc_code) => ({
        hcc_code,
        icd10_candidates: assessments.flatMap((assessment) => assessment.icd10_codes),
        reason: 'Present in claims but not MAO-004',
      }));

    return {
      member: {
        id: member.id,
        member_key: member.member_key,
        risk_score: member.risk_score,
        eligibility: ensureSampleEligibility(store, member),
      },
      mao_records: maoRecords,
      missing_hcc,
      stale_records: [],
      immediate_actions: ['health_assessment_required'],
      __sample: true,
    };
  }

  const query = toQuery({ submission_year: submissionYear || new Date().getFullYear() });
  const res = await fetch(`${API_BASE}/api/coding/members/${memberId}/gaps${query}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const createHealthAssessment = async (token, tenant, memberId, payload) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
    const member = store.members.get(memberId);
    if (!member) {
      throw new Error('Member not found');
    }
    const assessments = ensureSampleAssessments(store, member);
    const assessment = {
      id: `sample-assessment-${Date.now().toString(36)}`,
      assessment_date: payload.assessment_date || new Date().toISOString().slice(0, 10),
      assessment_type: payload.assessment_type || 'initial',
      provider_id: payload.provider_id || null,
      icd10_codes: payload.icd10_codes || [],
      hcc_codes: payload.hcc_codes || [],
      completion_status: 'pending_submission',
      notes: payload.notes || null,
    };
    assessments.unshift(assessment);
    store.assessments.set(member.id, assessments);
    ensureSamplePriority(store, member);
    return deepClone(assessment);
  }

  const res = await fetch(`${API_BASE}/api/coding/members/${memberId}/assessments`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
};

export const fetchCodingAdminAssignments = async (token, tenant) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
    return {
      coders: ensureSampleCoders(store),
      items: ensureSampleAssignments(store),
      __sample: true,
    };
  }

  const res = await fetch(`${API_BASE}/api/coding/admin/assignments`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const assignCodingAdminWork = async (token, tenant, payload) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
    const coders = ensureSampleCoders(store);
    const assignments = ensureSampleAssignments(store).map((item) => ({ ...item }));
    const selected = new Set(payload?.chase_ids || []);
    const coderEmail = payload?.coder_email || (coders[0] && coders[0].email);
    if (coderEmail) {
      assignments.forEach((item) => {
        if (selected.has(item.chase_id)) {
          item.assigned_coder_email = coderEmail;
        }
      });
    }
    store.assignments = assignments.map((item) => deepClone(item));
    return {
      coders,
      items: assignments,
      __sample: true,
    };
  }

  const res = await fetch(`${API_BASE}/api/coding/admin/assignments`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
};

export const generateSubmissionExport = async (token, tenant, submissionYear, memberIds) => {
  if (shouldUseSample(token)) {
    const store = getSampleStore(tenant);
    const members = memberIds
      ? memberIds.map((id) => store.members.get(id)).filter(Boolean)
      : getSampleMembersArray(store);
    const rows = members.map((member) => {
      const claims = ensureSampleClaims(store, member);
      const claim = claims[0];
      return [
        member.id,
        member.member_key,
        submissionYear || new Date().getFullYear(),
        'HCC18',
        'E11.9',
        claim?.service_date || new Date().toISOString().slice(0, 10),
        claim?.service_date || new Date().toISOString().slice(0, 10),
        'claim',
      ];
    });
    const header = ['MemberID', 'MemberKey', 'SubmissionYear', 'HCCCode', 'ICD10', 'ServiceFrom', 'ServiceTo', 'Source'];
    const csv = [header.join(','), ...rows.map((row) => row.join(','))].join('\n');
    return {
      batch_id: Date.now(),
      submission_year: submissionYear || new Date().getFullYear(),
      record_count: rows.length,
      csv,
      __sample: true,
    };
  }

  const res = await fetch(`${API_BASE}/api/coding/submissions/export`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify({ submission_year: submissionYear, member_ids: memberIds }),
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
