/**
 * Resolves the backend API base URL dynamically across all environments:
 * - Custom HTTPS / HTTP domains behind Nginx (`https://arc8-mvp.site`,
 *   `https://dev.arc8-mvp.site`, `https://test.arc8-mvp.site`): resolves to
 *   `window.location.origin` (same-origin) so `/api/*` routes cleanly via Nginx
 *   with zero Mixed Content or CORS errors.
 * - Direct container port access (`:3000`, `:7777`, `:7778`, `:7779`) or local
 *   development (`localhost`, `127.0.0.1`): resolves to
 *   `${protocol}//${hostname}:8989` unless overridden locally.
 */
const DIRECT_CONTAINER_PORTS = new Set(['3000', '7777', '7778', '7779']);

export function resolveApiBase(): string {
  const configured = (
    process.env.REACT_APP_API_BASE ||
    process.env.REACT_APP_API_URL ||
    ''
  )
    .trim()
    .replace(/\/$/, '');

  if (process.env.NODE_ENV === 'test') {
    return configured || 'http://localhost:8000';
  }

  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname, port, origin } = window.location;
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isDirectContainerPort = DIRECT_CONTAINER_PORTS.has(port);

    if (isLocalHost) {
      return configured || `${protocol}//${hostname}:8989`;
    }

    if (isDirectContainerPort) {
      if (
        configured &&
        !configured.includes('localhost') &&
        !configured.includes('127.0.0.1')
      ) {
        return configured;
      }
      return `${protocol}//${hostname}:8989`;
    }

    // Standard HTTP/HTTPS domain (e.g., https://arc8-mvp.site, dev.arc8-mvp.site, test.arc8-mvp.site):
    // Ignore any baked localhost build arg so HTTPS never triggers Mixed Content errors.
    if (
      configured &&
      !configured.includes('localhost') &&
      !configured.includes('127.0.0.1')
    ) {
      return configured;
    }

    return (
      origin || `${protocol}//${hostname}${port ? `:${port}` : ''}`
    ).replace(/\/$/, '');
  }

  return configured || 'http://localhost:8989';
}

export const API_BASE: string = resolveApiBase();
export default API_BASE;
