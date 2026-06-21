// Axios instance for the member realm.
//
// - Attaches X-Tenant-Key (white-label tenant) and the member Bearer token.
// - On 401, performs a single-flight refresh against /api/member/auth/refresh
//   and retries the original request once; on refresh failure the session is
//   cleared and the app routes back to login.

import axios from 'axios';

import { API_BASE, TENANT_KEY } from '../config';
import { clearSession, getAccessToken, getRefreshToken, setSession } from './tokenStore';

const client = axios.create({ baseURL: API_BASE, timeout: 20000 });

client.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  config.headers['X-Tenant-Key'] = TENANT_KEY;
  const token = getAccessToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshInFlight = null;

async function refreshTokens() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post(
        `${API_BASE}/api/member/auth/refresh`,
        { refresh_token: refreshToken },
        { headers: { 'X-Tenant-Key': TENANT_KEY } }
      )
      .then((res) => {
        const d = res.data || {};
        setSession({
          token: d.token,
          refreshToken: d.refresh_token,
          email: d.email,
          memberKey: d.member_key,
          mfaEnrolled: d.mfa_enrolled,
          expiresAt: Date.now() + (d.expires_in || 0) * 1000,
        });
        return true;
      })
      .catch(() => {
        clearSession();
        return false;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;
    // Don't try to refresh the refresh/login calls themselves.
    const isAuthCall = (original.url || '').includes('/api/member/auth/refresh') ||
      (original.url || '').includes('/api/member/auth/login');
    if (status === 401 && !original.__retried && !isAuthCall && getRefreshToken()) {
      original.__retried = true;
      const ok = await refreshTokens();
      if (ok) {
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${getAccessToken()}`;
        return client(original);
      }
    }
    return Promise.reject(error);
  }
);

export default client;
