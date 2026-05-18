const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

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

export const fetchWorkbenchSuspects = async (token, tenant, memberId) => {
  if (!memberId) throw new Error('memberId is required');
  const params = new URLSearchParams({ member_id: String(memberId) });
  const response = await fetch(`${API_BASE}/api/workbench/suspects?${params.toString()}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(response);
};

export const finalizeCode = async (token, tenant, payload) => {
  const response = await fetch(`${API_BASE}/api/workbench/code`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

export const getICDMap = async (token, tenant, { code, modelYear, lob }) => {
  if (!code) throw new Error('ICD code is required');
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

export const fetchDocumentPdf = async (token, tenant, documentId) => {
  if (!documentId) throw new Error('Document id is required');
  const response = await fetch(
    `${API_BASE}/api/workbench/documents/${encodeURIComponent(documentId)}/pdf`,
    { headers: buildHeaders(token, tenant) },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || 'Unable to retrieve document');
  }
  return response.blob();
};

export default {
  fetchWorkbenchSuspects,
  finalizeCode,
  getICDMap,
  fetchDocumentPdf,
};
