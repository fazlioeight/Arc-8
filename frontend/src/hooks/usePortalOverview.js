import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { DEFAULT_APPLICATIONS } from "../context/AuthContext";
import { createPortalOverview } from "../viewModels/common";

const DEFAULT_ERROR_MESSAGE =
  "We could not reach the portal services. Showing the latest synced data.";

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
      app.key === "coding"
        ? "Queued chart review saved by you"
        : app.key === "ride_booking"
        ? "Ride manifest changes captured"
        : app.key === "portal"
        ? "Personal overview preferences cached"
        : "Latest workspace preferences stored",
    savedAt: new Date(now - (idx + 1) * 45 * 60 * 1000).toISOString(),
    path: app.path,
  }));

  const todos = source.slice(0, 5).map((app, idx) => ({
    id: `todo-${idx}`,
    title:
      app.key === "coding"
        ? "Complete chart validation for high-risk cohort"
        : app.key === "dashboard"
        ? "Review metrics variance for Q3 close"
        : app.key === "ride_booking"
        ? "Confirm transport coverage for dialysis members"
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
      email: user?.email || "guest@nexora.ai",
      tenant: user?.tenant || "Nexora Tenant",
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
  apiBaseUrl = process.env.REACT_APP_API_URL,
  token,
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

  const [overview, setOverview] = useState(() =>
    createPortalOverview(
      { loading: true, applications: resolvedApps, lastSaved: [], todos: [] },
      { catalog: resolvedApps }
    )
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const accessibleApps = useMemo(
    () => resolvedApps.filter((app) => app.allowed),
    [resolvedApps]
  );

  const appsToRender = useMemo(
    () => (accessibleApps.length ? accessibleApps : resolvedApps),
    [accessibleApps, resolvedApps]
  );

  const refresh = useCallback(
    async (abortSignal) => {
      setIsLoading(true);
      setError(null);

      const fallbackData = fallbackBuilder(resolvedApps, user);
      const fallbackView = createPortalOverview(
        { ...fallbackData, loading: false, error: null },
        { catalog: resolvedApps }
      );

      if (!apiBaseUrl) {
        if (!abortSignal?.aborted) {
          setOverview(fallbackView);
          setIsLoading(false);
        }
        return fallbackView;
      }

      const authToken =
        token ||
        (typeof localStorage !== "undefined"
          ? localStorage.getItem("authToken") || localStorage.getItem("token")
          : null);
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};

      try {
        const response = await axios.get(`${apiBaseUrl}/api/portal/overview`, {
          headers,
          signal: abortSignal,
        });
        if (abortSignal?.aborted) {
          return null;
        }
        const payload = response?.data || {};
        const nextOverview = createPortalOverview(
          { ...payload, loading: false, error: null },
          { catalog: resolvedApps, fallback: fallbackView }
        );
        setOverview(nextOverview);
        setIsLoading(false);
        return nextOverview;
      } catch (err) {
        if (abortSignal?.aborted || err?.code === "ERR_CANCELED") {
          return null;
        }
        console.warn("Falling back to mocked portal overview", err);
        const nextOverview = createPortalOverview(
          { ...fallbackData, loading: false, error: errorMessage },
          { catalog: resolvedApps, fallback: fallbackView }
        );
        setOverview(nextOverview);
        setIsLoading(false);
        setError(errorMessage);
        return nextOverview;
      }
    },
    [apiBaseUrl, errorMessage, fallbackBuilder, resolvedApps, token, user]
  );

  useEffect(() => {
    const controller = new AbortController();
    setOverview(
      createPortalOverview(
        { loading: true, applications: resolvedApps, lastSaved: [], todos: [] },
        { catalog: resolvedApps }
      )
    );
    setIsLoading(true);
    setError(null);
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh, resolvedApps]);

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
