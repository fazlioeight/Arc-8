import axios from "axios";
import {
  transformRafDelta,
  transformSuspectsFunnel,
  transformDeadlineRadar,
  transformProviderHeatmap,
  __private,
} from "./dashboardTransforms";

const EXPORT_ALLOWED_ROLES = new Set(["risk_ops", "coding_mgr", "admin"]);

const API_BASE = (() => {
  if (typeof window !== "undefined" && window.location) {
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.port === "7777" ||
      window.location.port === "7778" ||
      window.location.port === "3000"
    ) {
      return `${window.location.protocol}//${window.location.hostname}:8989`;
    }
  }
  return (process.env.REACT_APP_API_BASE || "").replace(/\/$/, "");
})();

const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

// Dashboard endpoints require auth + tenant; callers pass token/tenant from
// AuthContext and we attach the standard headers.
const buildHeaders = (token, tenant) => ({
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(tenant ? { "X-Tenant-Key": tenant } : {}),
});

const isAbortError = (error) => error?.name === "CanceledError" || error?.name === "AbortError";

const buildResult = (transformed, meta = {}) => ({
  data: transformed,
  partial: Boolean(transformed?.partial),
  meta,
  refreshedAt: new Date(),
});

export async function fetchRafDelta({ params, signal, token, tenant }) {
  const { modelYear, lob, providerGroup, forecastEnabled } = params;
  const response = await apiClient.get("/api/raf/delta", {
    params: {
      model_year: modelYear,
      lob,
      provider_group: providerGroup !== "All" ? providerGroup : undefined,
      forecast: forecastEnabled ? "1" : "0",
    },
    headers: buildHeaders(token, tenant),
    signal,
  });
  const transformed = transformRafDelta(response.data);
  return buildResult(transformed, { cutoffDate: response.data?.cutoff_date || null });
}

export async function fetchSuspectsFunnel({ params, signal, token, tenant }) {
  const { from, to } = params;
  const response = await apiClient.get("/api/suspects/funnel", {
    params: { from, to },
    headers: buildHeaders(token, tenant),
    signal,
  });
  const transformed = transformSuspectsFunnel(response.data, { from, to });
  return buildResult(transformed, { asOf: response.data?.as_of || null });
}

export async function fetchDeadlineRadar({ params, signal, token, tenant }) {
  const { cutoff, stage } = params;
  const response = await apiClient.get("/api/deadlines/radar", {
    params: { cutoff, stage },
    headers: buildHeaders(token, tenant),
    signal,
  });
  const transformed = transformDeadlineRadar(response.data, cutoff);
  return buildResult(transformed, { cutoff });
}

export async function fetchProviderHeatmap({ params, signal, token, tenant }) {
  const { metric, lob, providerGroup, normalize } = params;
  const response = await apiClient.get("/api/providers/heatmap", {
    params: {
      metric,
      lob,
      provider_group: providerGroup === "All" ? undefined : providerGroup,
    },
    headers: buildHeaders(token, tenant),
    signal,
  });
  const transformed = transformProviderHeatmap(response.data, { normalize });
  return buildResult(transformed, { metric, normalize });
}

export async function exportDeadlinesCsv({ params, signal, token, tenant }) {
  const response = await apiClient.get("/api/deadlines/radar/export", {
    params,
    headers: buildHeaders(token, tenant),
    signal,
    responseType: "blob",
  });
  return response.data;
}

export const canExport = (user) => {
  if (!user) return false;
  return EXPORT_ALLOWED_ROLES.has(user.role) || EXPORT_ALLOWED_ROLES.has(user?.impersonation?.role);
};

export { isAbortError };

export {
  transformRafDelta,
  transformSuspectsFunnel,
  transformDeadlineRadar,
  transformProviderHeatmap,
  __private,
} from "./dashboardTransforms";
