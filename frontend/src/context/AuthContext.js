import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const AuthContext = createContext();

const STORAGE_KEY = 'authState';
const DEFAULT_TIMEOUT = 15 * 60 * 1000;
const PERSIST_DEBOUNCE_MS = 200;
const TOUCH_THROTTLE_MS = 5000;
const MAX_PERSISTED_AUDIT_EVENTS = 20;

export const DEFAULT_TENANTS = [
  { key: 'demo', name: 'Demo Health Plan', region: 'National', timezone: 'America/Chicago' },
  { key: 'sunrise', name: 'Sunrise Clinics', region: 'West', timezone: 'America/Los_Angeles' },
  { key: 'lakeside', name: 'Lakeside ACO', region: 'Midwest', timezone: 'America/Detroit' },
];

export const DEFAULT_APPLICATIONS = {
  portal: 'admin',
  dashboard: 'admin',
  coding: 'admin',
  ride_booking: 'manager',
  docs: 'user',
  settings: 'user',
  job_center: 'admin',
  admin_console: 'admin',
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
  const tenantKey = raw.tenant || raw.tenantKey || availableTenants[0]?.key || 'demo';
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
    role: raw.role || 'user',
    tenant: tenantKey,
    tenantInfo,
    availableTenants,
    applications,
    availableApplications,
    purchasedApplications,
    auditTrail: Array.isArray(raw.auditTrail) ? raw.auditTrail : [],
    impersonation,
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
  const persistTimerRef = useRef(null);
  const lastSerializedRef = useRef(null);
  const lastTouchRef = useRef(0);

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
    const base = normalizeState({
      ...sessionData,
      availableTenants: sessionData.tenants || sessionData.availableTenants,
    });
    if (!base) return;
    const next = appendAudit(base, buildAuditEvent('session.login', {
      actor: base.email,
      tenant: base.tenant,
    }));
    setAuthState(next);
  }, []);

  const logout = useCallback(() => {
    setAuthState(null);
  }, []);

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
    sessionLocked: Boolean(authState?.session?.locked),
    isAuthenticated: Boolean(authState?.token),
    hasApplicationAccess,
    login,
    logout,
    setTenant,
    startImpersonation,
    endImpersonation,
    recordAuditEvent,
    touchSession,
    unlockSession,
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
    setTenant,
    startImpersonation,
    endImpersonation,
    recordAuditEvent,
    touchSession,
    unlockSession,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};







