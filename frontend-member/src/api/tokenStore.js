// Session token store shared by the axios client and the auth context.
//
// Kept outside React so the axios interceptors can read/refresh tokens without
// importing the context (avoids a circular dependency). The context subscribes
// to changes to keep its render state in sync.

import { SESSION_STORAGE_KEY } from '../config';

let session = null; // { token, refreshToken, email, memberKey, mfaEnrolled, expiresAt }
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

session = load();

function persist() {
  try {
    if (session) localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore quota/availability errors */
  }
}

export function getSession() {
  return session;
}

export function getAccessToken() {
  return session?.token || null;
}

export function getRefreshToken() {
  return session?.refreshToken || null;
}

export function setSession(next) {
  session = next;
  persist();
  listeners.forEach((fn) => fn(session));
}

export function clearSession() {
  setSession(null);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
