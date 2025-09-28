import React, { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

const STORAGE_KEY = 'authState';

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    try {
      const parsed = JSON.parse(stored);
      return { applications: {}, ...parsed };
    } catch (error) {
      console.warn('Failed to parse stored auth state', error);
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authState) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authState));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [authState]);

  const login = (sessionData) => {
    setAuthState({
      email: sessionData.email,
      tenant: sessionData.tenant,
      token: sessionData.token,
      role: sessionData.role || 'user',
      applications: sessionData.applications || {},
    });
  };

  const logout = () => {
    setAuthState(null);
  };

  const hasApplicationAccess = (appKey, requiredLevel = 'user') => {
    const level = authState?.applications?.[appKey];
    if (!level) return false;
    if (requiredLevel === 'admin') return level === 'admin';
    return level === 'admin' || level === 'user';
  };

  const value = {
    user: authState,
    token: authState?.token,
    tenant: authState?.tenant,
    role: authState?.role,
    applications: authState?.applications || {},
    isAuthenticated: !!authState?.token,
    hasApplicationAccess,
    login,
    logout,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

