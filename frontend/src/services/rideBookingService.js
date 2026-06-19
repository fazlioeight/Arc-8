// Ride Booking API client. Mirrors the codingService convention: stateless
// named functions that take (token, tenant, ...) and hit /api/ride-booking/*.

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

const buildHeaders = (token, tenant) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(tenant ? { 'X-Tenant-Key': tenant } : {}),
});

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

export const fetchRides = async (token, tenant, { limit = 50 } = {}) => {
  const res = await fetch(`${API_BASE}/api/ride-booking/rides?limit=${limit}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const createRide = async (token, tenant, payload) => {
  const res = await fetch(`${API_BASE}/api/ride-booking/rides`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
};

export const fetchPartners = async (token, tenant) => {
  const res = await fetch(`${API_BASE}/api/ride-booking/partners`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const createPartner = async (token, tenant, payload) => {
  const res = await fetch(`${API_BASE}/api/ride-booking/partners`, {
    method: 'POST',
    headers: buildHeaders(token, tenant),
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
};

export const fetchRideOptions = async (token, tenant, { date } = {}) => {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  const res = await fetch(`${API_BASE}/api/ride-booking/ride-options${query}`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};

export const fetchPayments = async (token, tenant) => {
  const res = await fetch(`${API_BASE}/api/ride-booking/payments`, {
    headers: buildHeaders(token, tenant),
  });
  return handleResponse(res);
};
