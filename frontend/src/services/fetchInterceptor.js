// Global fetch interceptor.
// On 401 for an *authenticated* request (one that carried Authorization),
// dispatch `auth:unauthorized` so AuthContext can clear the session and the
// router can send the user back to /login. Unauthenticated requests (e.g.
// the login form itself) are left alone so the user can retry on the page.

const installed = Symbol.for('nexora.fetchInterceptor.installed');

const carriesAuthHeader = (init) => {
  if (!init || !init.headers) return false;
  const headers = init.headers;
  if (headers instanceof Headers) return headers.has('Authorization');
  if (Array.isArray(headers)) {
    return headers.some(([key]) => typeof key === 'string' && key.toLowerCase() === 'authorization');
  }
  if (typeof headers === 'object') {
    return Object.keys(headers).some((key) => key.toLowerCase() === 'authorization');
  }
  return false;
};

export const installFetchInterceptor = () => {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  if (window[installed]) return;
  window[installed] = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    if (response.status === 401 && carriesAuthHeader(init)) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    return response;
  };
};
