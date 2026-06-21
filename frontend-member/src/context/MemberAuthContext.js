import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import * as api from '../services/memberApi';
import { clearSession, getSession, setSession, subscribe } from '../api/tokenStore';

const MemberAuthContext = createContext(null);

function sessionFromLogin(data) {
  return {
    token: data.token,
    refreshToken: data.refresh_token,
    email: data.email,
    memberKey: data.member_key,
    mfaEnrolled: data.mfa_enrolled,
    expiresAt: Date.now() + (data.expires_in || 0) * 1000,
  };
}

export function MemberAuthProvider({ children }) {
  const [session, setLocal] = useState(getSession());

  // Keep React state in sync with the token store (the axios refresh path
  // updates the store directly).
  useEffect(() => subscribe(setLocal), []);

  const login = useCallback(async (email, password, mfaCode) => {
    const data = await api.login(email, password, mfaCode);
    setSession(sessionFromLogin(data));
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* best-effort; clear locally regardless */
    }
    clearSession();
  }, []);

  // Reflect an MFA enable/disable into the cached session flag.
  const setMfaEnrolled = useCallback((enrolled) => {
    const s = getSession();
    if (s) setSession({ ...s, mfaEnrolled: enrolled });
  }, []);

  const value = useMemo(
    () => ({
      session,
      isAuthenticated: !!session?.token,
      email: session?.email || null,
      memberKey: session?.memberKey || null,
      mfaEnrolled: !!session?.mfaEnrolled,
      login,
      logout,
      setMfaEnrolled,
    }),
    [session, login, logout, setMfaEnrolled]
  );

  return <MemberAuthContext.Provider value={value}>{children}</MemberAuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(MemberAuthContext);
  if (!ctx) throw new Error('useAuth must be used within MemberAuthProvider');
  return ctx;
}
