import React, { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

const STORAGE_KEY = 'authState';

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
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
    });
  };

  const logout = () => {
    setAuthState(null);
  };

  const value = {
    user: authState,
    token: authState?.token,
    tenant: authState?.tenant,
    role: authState?.role,
    isAuthenticated: !!authState?.token,
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
