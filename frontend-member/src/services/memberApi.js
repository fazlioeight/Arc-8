// Thin wrappers over the member-portal backend endpoints. Components call these
// instead of axios directly so the URL surface lives in one place.

import client from '../api/client';

// ---- Auth (Features 1 & 2) ----
export const register = (payload) => client.post('/api/member/auth/register', payload).then((r) => r.data);
export const verifyEmail = (token) => client.post('/api/member/auth/verify-email', { token }).then((r) => r.data);
export const resendVerification = (email) =>
  client.post('/api/member/auth/resend-verification', { email }).then((r) => r.data);
export const login = (email, password, mfaCode) =>
  client
    .post('/api/member/auth/login', { email, password, ...(mfaCode ? { mfa_code: mfaCode } : {}) })
    .then((r) => r.data);
export const logout = () => client.post('/api/member/auth/logout').then((r) => r.data);
export const getMe = () => client.get('/api/member/auth/me').then((r) => r.data);
export const requestPasswordReset = (email) =>
  client.post('/api/member/auth/password-reset/request', { email }).then((r) => r.data);
export const confirmPasswordReset = (token, newPassword) =>
  client.post('/api/member/auth/password-reset/confirm', { token, new_password: newPassword }).then((r) => r.data);
export const changePassword = (oldPassword, newPassword) =>
  client
    .post('/api/member/auth/change-password', { old_password: oldPassword, new_password: newPassword })
    .then((r) => r.data);
export const mfaEnroll = () => client.post('/api/member/auth/mfa/enroll').then((r) => r.data);
export const mfaVerify = (code) => client.post('/api/member/auth/mfa/verify', { code }).then((r) => r.data);
export const mfaDisable = (password, code) =>
  client.post('/api/member/auth/mfa/disable', { password, code }).then((r) => r.data);

// ---- Dashboard (Feature 3) ----
export const getEligibility = () => client.get('/api/member/eligibility').then((r) => r.data);
export const getClaims = (params) => client.get('/api/member/claims', { params }).then((r) => r.data);
export const getClaim = (id) => client.get(`/api/member/claims/${id}`).then((r) => r.data);
export const getAccumulators = () => client.get('/api/member/accumulators').then((r) => r.data);

// ---- Documents (Feature 4) ----
export const getDocuments = () => client.get('/api/member/documents').then((r) => r.data);
export const grantDocument = (id) => client.post(`/api/member/documents/${id}/grant`).then((r) => r.data);
// Streams bytes via the short-lived signed grant; returned as a Blob for download.
export async function downloadDocument(id) {
  const grant = await grantDocument(id);
  const res = await client.get(grant.download_url, { responseType: 'blob' });
  return res.data;
}

// ---- Providers (Feature 6) ----
export const searchProviders = (params) => client.get('/api/member/providers', { params }).then((r) => r.data);
export const getMapConfig = () => client.get('/api/member/providers/map-config').then((r) => r.data);
