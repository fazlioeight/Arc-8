const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

const shouldUseSample = (token) => {
  if (!token) return true;
  return String(token).toLowerCase().startsWith('sample');
};

const buildHeaders = (token, tenant) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(tenant ? { 'X-Tenant-Key': tenant } : {}),
});

const handleResponse = async (response) => {
  const raw = await response.text();
  const body = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    const detail = body?.detail || response.statusText || 'Request failed';
    throw new Error(detail);
  }
  return body;
};

const SAMPLE_WORKBENCH = {
  member: {
    id: 'M123',
    name: 'Jane Doe',
    dob: '1958-04-22',
    lob: 'MA',
  },
  encounter: {
    id: 'EN987',
    dos: '2025-10-03',
    provider: { id: 'P45', name: 'C. Lee', type: 'NP' },
    pos: '11',
  },
  suspects: [
    {
      suspect_id: 'S1',
      condition: 'Type 2 diabetes with polyneuropathy',
      icd_suggestions: [{ code: 'E11.42', label: 'Type 2 DM with diabetic polyneuropathy' }],
      evidence: [
        {
          snippet_id: 'SN1',
          source_type: 'progress_note',
          dos: '2025-10-03',
          provider: { id: 'P45', name: 'C. Lee', type: 'NP' },
          text: 'Assessment: Diabetic neuropathy with numbness in feet. Plan: increase duloxetine...',
          meat: { M: true, E: true, A: true, T: true },
          confidence: 0.91,
          qualifying: true,
          location: { page: 2, offset_start: 341, offset_end: 412 },
        },
        {
          snippet_id: 'SN2',
          source_type: 'lab_result',
          dos: '2025-08-14',
          provider: { id: 'LAB12', name: 'Quest Diagnostics', type: 'Lab' },
          text: 'Microalbumin ratio elevated at 45 mg/g creatinine.',
          meat: { M: false, E: true, A: false, T: false },
          confidence: 0.73,
          qualifying: false,
          location: { page: 1, offset_start: 110, offset_end: 180 },
        },
      ],
      contradictions: [],
      priority: 0.87,
    },
    {
      suspect_id: 'S2',
      condition: 'Chronic kidney disease, stage 3',
      icd_suggestions: [{ code: 'N18.30', label: 'CKD stage 3 unspecified' }],
      evidence: [
        {
          snippet_id: 'SN3',
          source_type: 'progress_note',
          dos: '2025-10-03',
          provider: { id: 'P45', name: 'C. Lee', type: 'NP' },
          text: 'Problem list: CKD stage 3b. Creatinine stable at 1.7.',
          meat: { M: true, E: false, A: false, T: true },
          confidence: 0.84,
          qualifying: true,
          location: { page: 3, offset_start: 220, offset_end: 290 },
        },
      ],
      contradictions: [],
      priority: 0.64,
    },
  ],
  documents: [
    {
      id: 'D1',
      source_type: 'progress_note',
      dos: '2025-10-03',
      provider: { name: 'C. Lee' },
      preview: '...Assessment: Diabetic neuropathy...CKD stage 3b noted...',
    },
    {
      id: 'D2',
      source_type: 'lab_result',
      dos: '2025-08-14',
      provider: { name: 'Quest Diagnostics' },
      preview: 'Microalbumin ratio 45 mg/g creatinine (high)',
    },
  ],
  model_year: 2025,
};

export const fetchWorkbenchSuspects = async (token, tenant, memberId) => {
  if (shouldUseSample(token)) {
    const overrides = memberId
      ? {
          ...SAMPLE_WORKBENCH,
          member: {
            ...SAMPLE_WORKBENCH.member,
            id: String(memberId),
            name: `Sample Member ${memberId}`,
          },
        }
      : SAMPLE_WORKBENCH;
    return Promise.resolve(overrides);
  }

  const params = new URLSearchParams({ member_id: String(memberId) });
  const response = await fetch(`${API_BASE}/api/workbench/suspects?${params.toString()}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(response);
};

export const finalizeCode = async (token, tenant, payload) => {
  if (shouldUseSample(token)) {
    return Promise.resolve({
      status: 'accepted',
      hcc: { id: '18', label: 'Diabetes with chronic complications', weight: 0.318 },
      submission_intent: 'add',
      audit_id: `sample-${Date.now()}`,
      __sample: true,
    });
  }

  const response = await fetch(`${API_BASE}/api/workbench/code`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

export const getICDMap = async (token, tenant, { code, modelYear, lob }) => {
  if (!code) throw new Error('ICD code is required');

  if (shouldUseSample(token)) {
    const normalized = String(code).toUpperCase();
    if (normalized === 'E11.9') {
      return Promise.resolve({
        code: 'E11.9',
        hcc: 'NA',
        alternatives: ['E11.42', 'E11.21', 'E11.51'],
        notes: ['Unspecified — select a code with complication if documented.'],
        __sample: true,
      });
    }
    return Promise.resolve({
      code: normalized,
      hcc: '18',
      alternatives: normalized === 'E11.42' ? ['E11.40', 'E11.49'] : [],
      notes: ['Requires documentation of neuropathy.'],
      __sample: true,
    });
  }

  const params = new URLSearchParams({
    code,
    model_year: String(modelYear ?? ''),
    lob: lob ?? '',
  });
  const response = await fetch(`${API_BASE}/api/terminology/icd-map?${params.toString()}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(response);
};
