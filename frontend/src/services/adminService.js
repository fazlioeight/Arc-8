const API_BASE = (typeof window !== 'undefined' && window.location && (window.location.port === '7777' || window.location.port === '7778' || window.location.port === '3000' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) ? (window.location.protocol + '//' + window.location.hostname + ':8989') : (process.env.REACT_APP_API_BASE || 'http://localhost:8989');

const buildHeaders = (token, tenant) => {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenant) headers['X-Tenant-Key'] = tenant;
  return headers;
};

const handleResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.detail || data.error || 'Request failed';
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
};

export const fetchAdminApplications = async ({ token, tenant }) => {
  const response = await fetch(`${API_BASE}/api/admin/applications`, {
    method: 'GET',
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(response);
};

export const fetchAdminUsers = async ({ token, tenant }) => {
  const response = await fetch(`${API_BASE}/api/admin/users`, {
    method: 'GET',
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(response);
};

export const createAdminUser = async ({ token, tenant, payload = {} }) => {
  const { __fullApplications, ...apiPayload } = payload;
  const response = await fetch(`${API_BASE}/api/admin/users`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(apiPayload),
  });
  return handleResponse(response);
};

export const updateAdminUser = async ({ token, tenant, userId, payload = {} }) => {
  const { __fullApplications, ...apiPayload } = payload;
  const response = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
    method: 'PATCH',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(apiPayload),
  });
  return handleResponse(response);
};

export const deleteAdminUser = async ({ token, tenant, userId }) => {
  const response = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
    method: 'DELETE',
    headers: buildHeaders(token, tenant),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.detail || data.error || 'Request failed');
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return { id: userId };
};

export const updatePurchasedApplications = async ({ token, tenant, purchased = [] }) => {
  const response = await fetch(`${API_BASE}/api/admin/applications`, {
    method: 'PATCH',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify({ purchased }),
  });
  return handleResponse(response);
};

class ApplicationAccessViewModel {
  constructor({ key, label, description, purchased, core, accessLevel }) {
    this.key = key;
    this.label = label;
    this.description = description || "";
    this.core = Boolean(core);
    this.purchased = Boolean(purchased || core);
    this.accessLevel = accessLevel || (this.purchased ? "user" : "none");
  }

  static fromApi(raw) {
    if (!raw) return null;
    return new ApplicationAccessViewModel({
      key: raw.key,
      label: raw.label,
      description: raw.description,
      core: raw.core,
      purchased: raw.purchased,
      accessLevel: raw.access_level || raw.accessLevel,
    });
  }
}

export class ApplicationAccessService {
  constructor({ token, tenant } = {}) {
    this.token = token;
    this.tenant = tenant;
  }

  async fetchApplications() {
    const response = await fetchAdminApplications({ token: this.token, tenant: this.tenant });
    const items = (response?.applications || [])
      .map((app) => ApplicationAccessViewModel.fromApi(app))
      .filter(Boolean)
      .sort((a, b) => a.label.localeCompare(b.label));
    return { items, isSample: false };
  }

  async updatePurchases(purchasedKeys = []) {
    const response = await updatePurchasedApplications({
      token: this.token,
      tenant: this.tenant,
      purchased: purchasedKeys,
    });
    const items = (response?.applications || [])
      .map((app) => ApplicationAccessViewModel.fromApi(app))
      .filter(Boolean)
      .sort((a, b) => a.label.localeCompare(b.label));
    return { items, isSample: false };
  }
}
