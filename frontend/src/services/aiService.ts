/**
 * Typed fetch wrapper for the AI assistant endpoints.
 *
 * Mirrors the conventions used by member360LabService.js (token + tenant
 * headers, REACT_APP_API_BASE resolution) so the existing fetchInterceptor
 * picks up 401s and the auth-context logout path still works.
 */
import type { AskRequest, AskResponse } from '../types/ai';
import { API_BASE } from '../utils/apiBase';

/**
 * Surface for callers — the panel uses this directly, no React Query yet.
 *
 * Throws an `Error` with the backend's `detail` on non-2xx. The hook below
 * catches and stores it in component state.
 */
export async function askAi(
  token: string,
  tenant: string,
  body: AskRequest,
  signal?: AbortSignal,
): Promise<AskResponse> {
  const response = await fetch(`${API_BASE}/api/v1/ai/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenant ? { 'X-Tenant-Key': tenant } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (response.status === 401 || response.status === 403) {
    // fetchInterceptor.js dispatches a custom event on these statuses that
    // AuthContext listens for; raising here lets the panel show "session
    // expired" while the global handler clears the token.
    throw new Error('Unauthorized');
  }

  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail =
      (parsed && typeof parsed === 'object' && 'detail' in parsed && typeof (parsed as { detail: unknown }).detail === 'string'
        ? (parsed as { detail: string }).detail
        : null) || response.statusText;
    throw new Error(detail);
  }

  return parsed as AskResponse;
}
