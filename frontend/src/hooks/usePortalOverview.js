import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { DEFAULT_APPLICATIONS } from "../context/AuthContext";
import { createPortalOverview } from "../viewModels/common";

const DEFAULT_ERROR_MESSAGE =
  "We could not reach the portal services. Showing the latest synced data.";
const PORTAL_OVERVIEW_TIMEOUT_MS = 8000;
const PORTAL_FALLBACK_DELAY_MS = 1200;

const buildFilteredCatalog = (catalog = [], available = [], purchased = []) => {
  const sourceKeys = available && available.length
    ? available
    : purchased && purchased.length
    ? purchased
    : catalog.map((app) => app.key);
  const enabled = new Set(sourceKeys);
  return catalog.filter((app) => enabled.has(app.key));
};

const resolveAccessMap = ({
  accessMap = {},
  availableApplications = [],
  purchasedApplications = [],
  hasAccessInfo,
}) => {
  if (hasAccessInfo) {
    return accessMap;
  }
  const enabledKeys = availableApplications && availableApplications.length
    ? availableApplications
    : purchasedApplications && purchasedApplications.length
    ? purchasedApplications
    : [];
  const inferred = enabledKeys.reduce((result, key) => {
    result[key] = DEFAULT_APPLICATIONS[key] || "user";
    return result;
  }, {});
  if (!inferred.portal) {
    inferred.portal = DEFAULT_APPLICATIONS.portal || "user";
  }
  return inferred;
};

const applyAccessRules = (catalog = [], accessMap = {}, hasResolvedAccess) =>
  catalog.map((app) => {
    const level = accessMap?.[app.key];
    const allowed = hasResolvedAccess
      ? app.key === "portal"
        ? true
        : app.requiredLevel === "admin"
        ? level === "admin"
        : Boolean(level)
      : true;
    return { ...app, level, allowed };
  });

export const buildFallbackOverview = (apps, user) => {
  const accessible = apps.filter((app) => app.allowed);
  const source = accessible.length ? accessible : apps;
  const now = Date.now();

  const lastSaved = source.slice(0, 4).map((app, idx) => ({
    id: `saved-${idx}`,
    title: `${app.label} snapshot ${idx % 2 ? "(draft)" : "(published)"}`,
    appKey: app.key,
    summary:
      app.key === "providers"
        ? "Provider directory filters saved"
        : app.key === "portal"
        ? "Personal overview preferences cached"
        : "Latest workspace preferences stored",
    savedAt: new Date(now - (idx + 1) * 45 * 60 * 1000).toISOString(),
    path: app.path,
  }));

  const todos = source.slice(0, 5).map((app, idx) => ({
    id: `todo-${idx}`,
    title:
      app.key === "dashboard"
        ? "Review metrics variance for Q3 close"
        : app.key === "providers"
        ? "Reconcile provider directory updates"
        : app.key === "portal"
        ? "Publish weekly updates on your overview"
        : "Follow up on configuration updates",
    appKey: app.key,
    assignedBy: "Manager",
    dueAt: new Date(now + (idx + 1) * 24 * 60 * 60 * 1000).toISOString(),
    priority: idx === 0 ? "high" : idx === 1 ? "medium" : "low",
    path: app.path,
  }));

  return {
    applications: apps,
    profile: {
      email: user?.email || "guest@nexoralab.test",
      tenant: user?.tenant || "Nexora Lab Tenant",
      role: user?.role || "user",
      lastLogin: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
    },
    lastSaved,
    todos,
  };
};

export const usePortalOverview = ({
  user,
  accessMap = {},
  availableApplications = [],
  purchasedApplications = [],
  appCatalog = [],
  apiBaseUrl = process.env.REACT_APP_API_BASE || process.env.REACT_APP_API_URL || "http://localhost:8000",
  token,
  tenant,
  fallbackBuilder = buildFallbackOverview,
  errorMessage = DEFAULT_ERROR_MESSAGE,
} = {}) => {
  const filteredCatalog = useMemo(
    () => buildFilteredCatalog(appCatalog, availableApplications, purchasedApplications),
    [appCatalog, availableApplications, purchasedApplications]
  );

  const hasAccessInfo = useMemo(
    () => Object.keys(accessMap || {}).length > 0,
    [accessMap]
  );

  const effectiveAccessMap = useMemo(
    () =>
      resolveAccessMap({
        accessMap,
        availableApplications,
        purchasedApplications,
        hasAccessInfo,
      }),
    [accessMap, availableApplications, hasAccessInfo, purchasedApplications]
  );

  const hasResolvedAccess = useMemo(
    () => Object.keys(effectiveAccessMap || {}).length > 0,
    [effectiveAccessMap]
  );

  const resolvedApps = useMemo(
    () => applyAccessRules(filteredCatalog, effectiveAccessMap, hasResolvedAccess),
    [filteredCatalog, effectiveAccessMap, hasResolvedAccess]
  );

  const buildLoadingView = useCallback(
    () =>
      createPortalOverview(
        { loading: true, applications: resolvedApps, lastSaved: [], todos: [] },
        { catalog: resolvedApps }
      ),
    [resolvedApps]
  );

  const [overview, setOverview] = useState(() => buildLoadingView());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);
  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    // React 18 StrictMode runs effects twice in dev; reset mounted flag on each run
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const accessibleApps = useMemo(
    () => resolvedApps.filter((app) => app.allowed),
    [resolvedApps]
  );

  const appsToRender = useMemo(
    () => (accessibleApps.length ? accessibleApps : resolvedApps),
    [accessibleApps, resolvedApps]
  );

  const refresh = useCallback(
    async (options) => {
      const opts =
        options && typeof options === "object" && "signal" in options
          ? options
          : options && typeof options === "object" && "aborted" in options
          ? { signal: options }
          : {};

      const externalSignal = opts.signal;
      const controller = externalSignal ? null : new AbortController();
      if (!externalSignal && controller) {
        abortControllerRef.current?.abort();
        abortControllerRef.current = controller;
      }

      const signal = externalSignal || controller?.signal || null;
      if (signal?.aborted) {
        return null;
      }

      const requestId = Date.now();
      requestIdRef.current = requestId;
      setIsLoading(true);
      setError(null);

      const fallbackData = fallbackBuilder(resolvedApps, user);
      const fallbackView = createPortalOverview(
        { ...fallbackData, loading: false, error: null },
        { catalog: resolvedApps }
      );

      const handleAbort = () => {
        if (requestIdRef.current === requestId && isMountedRef.current) {
          setIsLoading(false);
        }
        return null;
      };

      const applyResult = (nextOverview, nextError = null) => {
        if (
          requestIdRef.current !== requestId ||
          !isMountedRef.current
        ) {
          return nextOverview;
        }
        setOverview(nextOverview);
        setIsLoading(false);
        setError(nextError);
        return nextOverview;
      };

      const fallbackTimer =
        typeof window !== "undefined"
          ? window.setTimeout(() => {
              applyResult(fallbackView, errorMessage);
            }, PORTAL_FALLBACK_DELAY_MS)
          : null;

      const clearFallbackTimer = () => {
        if (fallbackTimer) {
          window.clearTimeout(fallbackTimer);
        }
      };

      if (!apiBaseUrl) {
        if (signal?.aborted) {
          clearFallbackTimer();
          return handleAbort();
        }
        clearFallbackTimer();
        return applyResult(fallbackView);
      }

      const authToken =
        token ||
        (typeof localStorage !== "undefined"
          ? localStorage.getItem("authToken") || localStorage.getItem("token")
          : null);
      const headers = {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(tenant ? { "X-Tenant-Key": tenant } : {}),
      };

      try {
        const response = await axios.get(
          `${apiBaseUrl}/api/portal/overview`,
          {
            headers,
            signal,
            timeout: PORTAL_OVERVIEW_TIMEOUT_MS,
          }
        );
        clearFallbackTimer();
        if (signal?.aborted) {
          return handleAbort();
        }
        const payload = response?.data || {};
        const nextOverview = createPortalOverview(
          { ...payload, loading: false, error: null },
          { catalog: resolvedApps, fallback: fallbackView }
        );
        return applyResult(nextOverview);
      } catch (err) {
        clearFallbackTimer();
        if (signal?.aborted || err?.code === "ERR_CANCELED") {
          return handleAbort();
        }
        console.warn("Falling back to mocked portal overview", err);
        const nextOverview = createPortalOverview(
          { ...fallbackData, loading: false, error: errorMessage },
          { catalog: resolvedApps, fallback: fallbackView }
        );
        return applyResult(nextOverview, errorMessage);
      }
    },
    [apiBaseUrl, errorMessage, fallbackBuilder, resolvedApps, tenant, token, user]
  );

  useEffect(() => {
    const controller = new AbortController();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = controller;
    setOverview(buildLoadingView());
    setIsLoading(true);
    setError(null);
    void refresh({ signal: controller.signal });
    return () => controller.abort();
  }, [buildLoadingView, refresh]);

  return {
    overview,
    isLoading,
    error,
    resolvedApps,
    accessibleApps,
    appsToRender,
    refresh,
  };
};
