import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const AuthContext = createContext();

const STORAGE_KEY = 'authState';
const STAFF_STORAGE_KEY = 'staffSession';
const DEFAULT_TIMEOUT = 15 * 60 * 1000;
const PERSIST_DEBOUNCE_MS = 200;
const TOUCH_THROTTLE_MS = 5000;
const MAX_PERSISTED_AUDIT_EVENTS = 20;

export const DEFAULT_TENANTS = [
  { key: 'prominencehealth', name: 'ProminenceHealth', region: 'National', timezone: 'America/Chicago' },
];

export const DEFAULT_APPLICATIONS = {
  portal: 'admin',
  dashboard: 'admin',
  member360: 'user',
  providers: 'user',
  docs: 'user',
  settings: 'user',
  job_center: 'admin',
  admin_console: 'admin',
  chat: 'user',
};

const toKeyList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => key);
  }
  return [];
};

const resolveTenantInfo = (tenants = [], key) => tenants.find((t) => t.key === key) || (key ? { key, name: key } : null);

const normalizeState = (raw) => {
  if (!raw) return null;
  const now = Date.now();
  const availableTenants = Array.isArray(raw.availableTenants) && raw.availableTenants.length
    ? raw.availableTenants
    : Array.isArray(raw.tenants) && raw.tenants.length
      ? raw.tenants
      : DEFAULT_TENANTS;
  const tenantKey = raw.tenant || raw.tenantKey || availableTenants[0]?.key || 'prominencehealth';
  const tenantInfo = resolveTenantInfo(availableTenants, tenantKey);
  const applications = raw.applications && Object.keys(raw.applications).length
    ? raw.applications
    : DEFAULT_APPLICATIONS;
  const applicationKeys = Object.keys(applications);
  let availableApplications = toKeyList(raw.available_applications ?? raw.availableApplications);
  if (!availableApplications.length) {
    availableApplications = applicationKeys;
  } else {
    availableApplications = Array.from(new Set(availableApplications.filter((key) => applicationKeys.includes(key))));
  }
  let purchasedApplications = toKeyList(raw.purchased_applications ?? raw.purchasedApplications);
  if (!purchasedApplications.length) {
    purchasedApplications = availableApplications.filter((key) =>
      key === 'admin_console' ? Boolean(applications[key]) : Boolean(applications[key] || DEFAULT_APPLICATIONS[key])
    );
  } else {
    purchasedApplications = Array.from(new Set(purchasedApplications.filter((key) => availableApplications.includes(key))));
  }
  const baseSession = raw.session || {};
  const session = {
    lastActiveAt: baseSession.lastActiveAt || now,
    locked: Boolean(baseSession.locked),
    lockedAt: baseSession.lockedAt || null,
    inactivityTimeoutMs: baseSession.inactivityTimeoutMs || DEFAULT_TIMEOUT,
  };

  // Rotating refresh token + absolute access-token expiry. ``expires_in`` is
  // seconds-from-now (login/refresh responses); ``expiresAt`` is the persisted
  // absolute timestamp (rehydrated state). Impersonation/staff tokens carry
  // neither, so refresh is simply skipped for them.
  const refreshToken = raw.refresh_token ?? raw.refreshToken ?? null;
  let expiresAt = null;
  if (raw.expires_in != null) {
    expiresAt = now + Number(raw.expires_in) * 1000;
  } else if (raw.expiresAt != null) {
    expiresAt = raw.expiresAt;
  }

  let impersonation = null;
  if (raw.impersonation) {
    const impersonationTenantKey = raw.impersonation.tenant || tenantKey;
    impersonation = {
      email: raw.impersonation.email,
      name: raw.impersonation.name || raw.impersonation.email,
      role: raw.impersonation.role || raw.role || 'user',
      tenant: impersonationTenantKey,
      tenantInfo: resolveTenantInfo(availableTenants, impersonationTenantKey),
      applications: raw.impersonation.applications || applications,
      startedAt: raw.impersonation.startedAt || new Date().toISOString(),
      reason: raw.impersonation.reason || null,
    };
  }

  return {
    email: raw.email,
    token: raw.token,
    refreshToken,
    expiresAt,
    role: raw.role || 'user',
    tenant: tenantKey,
    tenantInfo,
    availableTenants,
    applications,
    availableApplications,
    purchasedApplications,
    // Surface backend's must_change_password flag (login response) so the
    // router can force /change-password on first login. Accept both
    // snake_case (server) and camelCase (rehydrated state) forms.
    mustChangePassword: Boolean(raw.must_change_password ?? raw.mustChangePassword),
    auditTrail: Array.isArray(raw.auditTrail) ? raw.auditTrail : [],
    impersonation,
    staffActor: raw.staffActor || null,
    session,
  };
};

const buildAuditEvent = (action, payload = {}) => ({
  id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  timestamp: new Date().toISOString(),
  action,
  ...payload,
});

const appendAudit = (state, event) => {
  if (!state || !event) return state;
  const history = Array.isArray(state.auditTrail) ? state.auditTrail : [];
  return {
    ...state,
    auditTrail: [event, ...history].slice(0, 50),
  };
};

const serializeAuthState = (state) => {
  if (!state) return null;
  const { auditTrail = [], ...rest } = state;
  return {
    ...rest,
    auditTrail: auditTrail.slice(0, MAX_PERSISTED_AUDIT_EVENTS),
  };
};

const normalizeStaffSession = (raw) => {
  if (!raw || !raw.token || !raw.email) return null;
  return {
    token: raw.token,
    email: raw.email,
    name: raw.name || null,
    isSuperuser: Boolean(raw.isSuperuser ?? raw.is_superuser),
    mfaEnrolled: Boolean(raw.mfaEnrolled ?? raw.mfa_enrolled),
    mfaEnrollmentRequired: Boolean(raw.mfaEnrollmentRequired ?? raw.mfa_enrollment_required),
    mustChangePassword: Boolean(raw.mustChangePassword ?? raw.must_change_password),
  };
};

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    try {
      return normalizeState(JSON.parse(stored));
    } catch (error) {
      console.warn('Failed to parse stored auth state', error);
      return null;
    }
  });
  const [staffSession, setStaffSession] = useState(() => {
    const stored = localStorage.getItem(STAFF_STORAGE_KEY);
    if (!stored) return null;
    try {
      return normalizeStaffSession(JSON.parse(stored));
    } catch (error) {
      console.warn('Failed to parse stored staff session', error);
      return null;
    }
  });
  const persistTimerRef = useRef(null);
  const lastSerializedRef = useRef(null);
  const lastTouchRef = useRef(0);
  const authStateRef = useRef(authState);
  const refreshInFlightRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!staffSession) {
      localStorage.removeItem(STAFF_STORAGE_KEY);
      return undefined;
    }
    try {
      localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(staffSession));
    } catch (error) {
      console.warn('Failed to persist staff session', error);
    }
    return undefined;
  }, [staffSession]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (!authState) {
      localStorage.removeItem(STORAGE_KEY);
      lastSerializedRef.current = null;
      return undefined;
    }
    const serialized = JSON.stringify(serializeAuthState(authState));
    if (serialized === lastSerializedRef.current) {
      return undefined;
    }
    persistTimerRef.current = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, serialized);
      lastSerializedRef.current = serialized;
      persistTimerRef.current = null;
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [authState]);

  useEffect(() => {
    lastTouchRef.current = authState?.session?.lastActiveAt || 0;
  }, [authState?.session?.lastActiveAt]);

  useEffect(() => {
    if (!authState) {
      localStorage.removeItem('companyName');
      return;
    }
    const effectiveTenantInfo = authState.impersonation?.tenantInfo || authState.tenantInfo;
    if (effectiveTenantInfo?.name) {
      localStorage.setItem('companyName', effectiveTenantInfo.name);
    } else if (effectiveTenantInfo?.key) {
      localStorage.setItem('companyName', effectiveTenantInfo.key);
    }
  }, [authState?.tenantInfo, authState?.impersonation]);

  const coreApps = useMemo(() => new Set(['portal', 'settings', 'admin_console']), []);

  const hasApplicationAccess = useCallback((appKey, requiredLevel = 'user') => {
    if (!authState) return false;
    const apps = authState.impersonation?.applications || authState.applications || {};
    const available = authState.impersonation?.availableApplications || authState.availableApplications || [];
    const purchased = authState.impersonation?.purchasedApplications || authState.purchasedApplications || [];
    if (Array.isArray(available) && available.length && !available.includes(appKey) && !coreApps.has(appKey)) {
      return false;
    }
    if (Array.isArray(purchased) && purchased.length && !purchased.includes(appKey) && !coreApps.has(appKey)) {
      return false;
    }
    const level = apps[appKey];
    if (!level) return false;
    if (requiredLevel === 'admin') {
      return level === 'admin';
    }
    if (requiredLevel === 'manager') {
      return level === 'admin' || level === 'manager';
    }
    return ['user', 'manager', 'admin'].includes(level);
  }, [authState]);

  const login = useCallback((sessionData) => {
    if (!sessionData) return;
    const effectiveToken = sessionData.token || authStateRef.current?.token;
    const base = normalizeState({
      ...sessionData,
      token: effectiveToken,
      availableTenants: sessionData.tenants || sessionData.availableTenants,
    });
    if (!base) return;
    const next = appendAudit(base, buildAuditEvent('session.login', {
      actor: base.email,
      tenant: base.tenant,
    }));
    setAuthState(next);
  }, []);

  const resolveApiBase = () => {
    if (typeof window !== 'undefined' && window.location) {
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.port === '7777' || window.location.port === '7778' || window.location.port === '3000') {
        return `${window.location.protocol}//${window.location.hostname}:8989`;
      }
    }
    if (process.env.REACT_APP_API_BASE) {
      return process.env.REACT_APP_API_BASE.replace(/\/$/, '');
    }
    return '';
  };

  const logout = useCallback(() => {
    const token = authState?.token;
    const tenant = authState?.tenant;
    if (token) {
      const apiBase = resolveApiBase();
      // Best-effort revocation; ignore failures so logout is never blocked.
      fetch(`${apiBase}/api/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(tenant ? { 'X-Tenant-Key': tenant } : {}),
        },
      }).catch(() => {});
    }
    setAuthState(null);
  }, [authState]);

  useEffect(() => {
    authStateRef.current = authState;
  }, [authState]);

  // Rotate the access token via the refresh endpoint. Single-flight: concurrent
  // callers share one in-flight request so the rotating refresh token is spent
  // exactly once (replaying a consumed token revokes the whole session chain).
  // Returns true on success, false otherwise. A hard auth failure (invalid /
  // expired refresh token → non-2xx) clears the session; a transient network
  // error leaves the session intact so the user can retry.
  const refreshAccessToken = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    const current = authStateRef.current;
    const refreshToken = current?.refreshToken;
    const tenant = current?.tenant;
    if (!refreshToken) return false;

    const run = (async () => {
      const apiBase = resolveApiBase();
      let res;
      try {
        res = await fetch(`${apiBase}/api/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(tenant ? { 'X-Tenant-Key': tenant } : {}),
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch (error) {
        // Network/transient failure — keep the session; a later call can retry.
        return false;
      }
      if (!res.ok) {
        setAuthState(null);
        return false;
      }
      const data = await res.json();
      setAuthState((prev) => {
        if (!prev) return prev;
        // Re-normalize the fresh login envelope while preserving local-only
        // state (session activity, audit trail, impersonation, staff actor).
        return normalizeState({
          ...data,
          availableTenants: prev.availableTenants,
          session: prev.session,
          auditTrail: prev.auditTrail,
          impersonation: prev.impersonation,
          staffActor: prev.staffActor,
        });
      });
      return true;
    })();
    refreshInFlightRef.current = run;
    try {
      return await run;
    } finally {
      refreshInFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    // On a 401 for an authenticated request: try to rotate the token before
    // giving up. If there's no refresh token (impersonation/staff sessions) or
    // the refresh fails, fall back to clearing the session.
    const handler = () => {
      if (authStateRef.current?.refreshToken) {
        void refreshAccessToken();
      } else {
        setAuthState(null);
      }
    };
    window.addEventListener('auth:unauthorized', handler);
    return () => window.removeEventListener('auth:unauthorized', handler);
  }, [refreshAccessToken]);

  const setTenant = useCallback((tenantKey) => {
    if (!tenantKey) return;
    setAuthState((prev) => {
      if (!prev) return prev;
      const tenantInfo = resolveTenantInfo(prev.availableTenants, tenantKey);
      if (prev.impersonation) {
        if (prev.impersonation.tenant === tenantKey) return prev;
        const next = {
          ...prev,
          impersonation: {
            ...prev.impersonation,
            tenant: tenantKey,
            tenantInfo,
          },
        };
        return appendAudit(next, buildAuditEvent('tenant.switch', {
          actor: prev.email,
          tenant: tenantKey,
          impersonating: true,
        }));
      }
      if (prev.tenant === tenantKey) return prev;
      const next = {
        ...prev,
        tenant: tenantKey,
        tenantInfo,
      };
      return appendAudit(next, buildAuditEvent('tenant.switch', {
        actor: prev.email,
        tenant: tenantKey,
        impersonating: false,
      }));
    });
  }, []);

  const recordAuditEvent = useCallback((action, metadata) => {
    if (!action) return;
    setAuthState((prev) => {
      if (!prev) return prev;
      return appendAudit(prev, buildAuditEvent(action, {
        actor: prev.email,
        tenant: prev.impersonation?.tenant || prev.tenant,
        ...metadata,
      }));
    });
  }, []);

  const startImpersonation = useCallback((target) => {
    if (!target) return;
    setAuthState((prev) => {
      if (!prev) return prev;
      const tenantKey = target.tenant || prev.tenant;
      const tenantInfo = resolveTenantInfo(prev.availableTenants, tenantKey);
      const applications = target.applications || prev.applications;
      const impersonation = {
        email: target.email,
        name: target.name || target.email,
        role: target.role || 'user',
        tenant: tenantKey,
        tenantInfo,
        applications,
        startedAt: new Date().toISOString(),
        reason: target.reason || 'admin_action',
      };
      const next = {
        ...prev,
        impersonation,
      };
      return appendAudit(next, buildAuditEvent('impersonation.start', {
        actor: prev.email,
        tenant: tenantKey,
        target: target.email || target.name,
        reason: impersonation.reason,
      }));
    });
  }, []);

  const loginAsStaff = useCallback((response) => {
    const normalized = normalizeStaffSession({
      token: response?.token,
      email: response?.email,
      name: response?.name,
      isSuperuser: response?.is_superuser,
      mfaEnrolled: response?.mfa_enrolled,
      mfaEnrollmentRequired: response?.mfa_enrollment_required,
      mustChangePassword: response?.must_change_password,
    });
    if (!normalized) return;
    setStaffSession(normalized);
  }, []);

  const updateStaffSession = useCallback((patch) => {
    setStaffSession((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const staffSignOut = useCallback(() => {
    setStaffSession(null);
    setAuthState(null);
  }, []);

  // Build a tenant session from the staff impersonation response. The
  // returned token is a tenant-scoped JWT with role=platform_admin, so all
  // existing /api/admin/* fetches that read `token` + `tenant` from this
  // context work unchanged.
  const enterTenantAsStaff = useCallback((impersonation) => {
    if (!impersonation?.token || !impersonation?.tenant) return;
    setStaffSession((prevStaff) => {
      const tenantInfo = {
        key: impersonation.tenant.key,
        name: impersonation.tenant.name,
        region: impersonation.tenant.region || null,
      };
      const baseApps = (impersonation.tenant.purchased_applications || []).reduce(
        (acc, key) => ({ ...acc, [key]: 'admin' }),
        {}
      );
      const tenantState = normalizeState({
        token: impersonation.token,
        email: prevStaff?.email,
        role: 'platform_admin',
        tenant: tenantInfo.key,
        availableTenants: [tenantInfo],
        applications: { ...baseApps, portal: 'admin', settings: 'admin', admin_console: 'admin' },
        available_applications: impersonation.tenant.purchased_applications || [],
        purchased_applications: impersonation.tenant.purchased_applications || [],
      });
      if (tenantState) {
        const withActor = {
          ...tenantState,
          staffActor: {
            email: prevStaff?.email,
            name: prevStaff?.name,
          },
        };
        setAuthState(appendAudit(withActor, buildAuditEvent('staff.impersonation.start', {
          actor: prevStaff?.email,
          tenant: tenantInfo.key,
        })));
      }
      return prevStaff;
    });
  }, []);

  const exitStaffImpersonation = useCallback(() => {
    setAuthState(null);
  }, []);

  const endImpersonation = useCallback(() => {
    setAuthState((prev) => {
      if (!prev?.impersonation) return prev;
      const next = {
        ...prev,
        impersonation: null,
      };
      return appendAudit(next, buildAuditEvent('impersonation.end', {
        actor: prev.email,
        tenant: prev.tenant,
      }));
    });
  }, []);

  const clearMustChangePassword = useCallback(() => {
    setAuthState((prev) => {
      if (!prev || !prev.mustChangePassword) return prev;
      return appendAudit({ ...prev, mustChangePassword: false }, buildAuditEvent('password.rotation_completed', {
        actor: prev.email,
        tenant: prev.tenant,
      }));
    });
  }, []);

  const unlockSession = useCallback((method = 'sso') => {
    setAuthState((prev) => {
      if (!prev?.session?.locked) return prev;
      const next = {
        ...prev,
        session: {
          ...(prev.session || {}),
          locked: false,
          lockedAt: null,
          lastActiveAt: Date.now(),
        },
      };
      return appendAudit(next, buildAuditEvent('session.unlock', {
        actor: prev.email,
        tenant: prev.impersonation?.tenant || prev.tenant,
        method,
      }));
    });
  }, []);

  const touchSession = useCallback(() => {
    setAuthState((prev) => {
      if (!prev || prev.session?.locked) {
        return prev;
      }
      const now = Date.now();
      if (now - lastTouchRef.current < TOUCH_THROTTLE_MS) {
        return prev;
      }
      lastTouchRef.current = now;
      if (!prev.session) {
        return {
          ...prev,
          session: {
            lastActiveAt: now,
            locked: false,
            lockedAt: null,
            inactivityTimeoutMs: DEFAULT_TIMEOUT,
          },
        };
      }
      return {
        ...prev,
        session: {
          ...prev.session,
          lastActiveAt: now,
        },
      };
    });
  }, []);

  useEffect(() => {
    if (!authState?.token || typeof window === 'undefined') return undefined;
    const activityHandler = () => touchSession();
    const events = ['pointerdown', 'keydown'];
    events.forEach((event) => window.addEventListener(event, activityHandler, { passive: true }));
    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        touchSession();
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);
    return () => {
      events.forEach((event) => window.removeEventListener(event, activityHandler));
      document.removeEventListener('visibilitychange', visibilityHandler);
    };
  }, [authState?.token, touchSession]);

  useEffect(() => {
    if (!authState?.token) return undefined;
    const timeoutMs = authState.session?.inactivityTimeoutMs || DEFAULT_TIMEOUT;
    const lastActive = authState.session?.lastActiveAt || Date.now();
    const remaining = timeoutMs - (Date.now() - lastActive);
    if (remaining <= 0) {
      setAuthState((prev) => {
        if (!prev || prev.session?.locked) return prev;
        const next = {
          ...prev,
          session: {
            ...(prev.session || {}),
            locked: true,
            lockedAt: Date.now(),
          },
        };
        return appendAudit(next, buildAuditEvent('session.lock', {
          actor: prev.email,
          tenant: prev.impersonation?.tenant || prev.tenant,
          reason: 'inactivity',
        }));
      });
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setAuthState((prev) => {
        if (!prev || prev.session?.locked) return prev;
        const next = {
          ...prev,
          session: {
            ...(prev.session || {}),
            locked: true,
            lockedAt: Date.now(),
          },
        };
        return appendAudit(next, buildAuditEvent('session.lock', {
          actor: prev.email,
          tenant: prev.impersonation?.tenant || prev.tenant,
          reason: 'inactivity',
        }));
      });
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [authState?.token, authState?.session?.lastActiveAt, authState?.session?.inactivityTimeoutMs]);

  // Proactively rotate the access token shortly before it expires, so most
  // requests never see a 401. No-op for sessions without a refresh token
  // (impersonation / staff-entered tenants).
  useEffect(() => {
    if (!authState?.token || !authState?.refreshToken || !authState?.expiresAt) {
      return undefined;
    }
    const LEAD_MS = 60 * 1000;
    const delay = Math.max(1000, authState.expiresAt - Date.now() - LEAD_MS);
    const timer = window.setTimeout(() => {
      void refreshAccessToken();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [authState?.token, authState?.refreshToken, authState?.expiresAt, refreshAccessToken]);

  const effectiveApplications = authState?.impersonation?.applications || authState?.applications || {};
  const effectiveAvailableApplications = authState?.impersonation?.availableApplications || authState?.availableApplications || [];
  const effectivePurchasedApplications = authState?.impersonation?.purchasedApplications || authState?.purchasedApplications || effectiveAvailableApplications;
  const effectiveTenant = authState?.impersonation?.tenant || authState?.tenant;
  const effectiveTenantInfo = authState?.impersonation?.tenantInfo || authState?.tenantInfo;
  const effectiveRole = authState?.impersonation?.role || authState?.role;
  const effectiveEmail = authState?.impersonation?.email || authState?.email;

  const contextValue = useMemo(() => ({
    user: authState
      ? {
          ...authState,
          email: effectiveEmail,
          tenant: effectiveTenant,
          tenantInfo: effectiveTenantInfo,
          role: effectiveRole,
          applications: effectiveApplications,
    availableApplications: effectiveAvailableApplications,
    purchasedApplications: effectivePurchasedApplications,
          availableApplications: effectiveAvailableApplications,
          purchasedApplications: effectivePurchasedApplications,
        }
      : null,
    primaryUser: authState,
    token: authState?.token,
    tenant: effectiveTenant,
    tenantInfo: effectiveTenantInfo,
    role: effectiveRole,
    applications: effectiveApplications,
    availableApplications: effectiveAvailableApplications,
    purchasedApplications: effectivePurchasedApplications,
    availableTenants: authState?.availableTenants || DEFAULT_TENANTS,
    impersonation: authState?.impersonation,
    isImpersonating: Boolean(authState?.impersonation),
    auditTrail: authState?.auditTrail || [],
    session: authState?.session || null,
    sessionLocked: Boolean(authState?.token && authState?.session?.locked),
    mustChangePassword: Boolean(authState?.token && authState?.mustChangePassword),
    isAuthenticated: Boolean(authState?.token),
    hasApplicationAccess,
    login,
    logout,
    refreshAccessToken,
    setTenant,
    startImpersonation,
    endImpersonation,
    recordAuditEvent,
    touchSession,
    unlockSession,
    clearMustChangePassword,
    // Arc-8 platform-staff surface
    staffSession,
    isStaffAuthenticated: Boolean(staffSession?.token),
    isStaffActor: Boolean(staffSession?.token && authState?.staffActor),
    staffActor: authState?.staffActor || null,
    loginAsStaff,
    updateStaffSession,
    staffSignOut,
    enterTenantAsStaff,
    exitStaffImpersonation,
  }), [
    authState,
    effectiveApplications,
    effectiveAvailableApplications,
    effectivePurchasedApplications,
    effectiveEmail,
    effectiveRole,
    effectiveTenant,
    effectiveTenantInfo,
    hasApplicationAccess,
    login,
    logout,
    refreshAccessToken,
    setTenant,
    startImpersonation,
    endImpersonation,
    recordAuditEvent,
    touchSession,
    unlockSession,
    clearMustChangePassword,
    staffSession,
    loginAsStaff,
    updateStaffSession,
    staffSignOut,
    enterTenantAsStaff,
    exitStaffImpersonation,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};







