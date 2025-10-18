import axios from "axios";
import {
  transformRafDelta,
  transformSuspectsFunnel,
  transformDeadlineRadar,
  transformProviderHeatmap,
  __private,
} from "./dashboardTransforms";

const EXPORT_ALLOWED_ROLES = new Set(["risk_ops", "coding_mgr", "admin"]);

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_BASE || "",
  timeout: 15000,
});

export async function fetchRafDelta({ params, signal }) {
  const { modelYear, lob, providerGroup, forecastEnabled } = params;
  const response = await apiClient.get("/api/raf/delta", {
    params: {
      model_year: modelYear,
      lob,
      provider_group: providerGroup !== "All" ? providerGroup : undefined,
      forecast: forecastEnabled ? "1" : "0",
    },
    signal,
  });
  const transformed = transformRafDelta(response.data);
  return {
    data: transformed,
    partial: transformed.partial,
    meta: {
      cutoffDate: response.data?.cutoff_date || null,
    },
    refreshedAt: new Date(),
  };
}

export async function fetchSuspectsFunnel({ params, signal }) {
  const { from, to } = params;
  const response = await apiClient.get("/api/suspects/funnel", {
    params: {
      from,
      to,
    },
    signal,
  });
  const transformed = transformSuspectsFunnel(response.data, { from, to });
  return {
    data: transformed,
    partial: transformed.partial,
    meta: {
      asOf: response.data?.as_of || null,
    },
    refreshedAt: new Date(),
  };
}

export async function fetchDeadlineRadar({ params, signal }) {
  const { cutoff, stage } = params;
  const response = await apiClient.get("/api/deadlines/radar", {
    params: {
      cutoff,
      stage,
    },
    signal,
  });
  const transformed = transformDeadlineRadar(response.data, cutoff);
  return {
    data: transformed,
    partial: false,
    meta: {
      cutoff,
    },
    refreshedAt: new Date(),
  };
}

export async function fetchProviderHeatmap({ params, signal }) {
  const { metric, lob, providerGroup, normalize } = params;
  const response = await apiClient.get("/api/providers/heatmap", {
    params: {
      metric,
      lob,
      provider_group: providerGroup === "All" ? undefined : providerGroup,
    },
    signal,
  });
  const transformed = transformProviderHeatmap(response.data, { normalize });
  return {
    data: transformed,
    partial: false,
    meta: {
      metric,
      normalize,
    },
    refreshedAt: new Date(),
  };
}

export async function exportDeadlinesCsv({ params, signal }) {
  const response = await apiClient.get("/api/deadlines/radar/export", {
    params,
    signal,
    responseType: "blob",
  });
  return response.data;
}

export const canExport = (user) => {
  if (!user) return false;
  return EXPORT_ALLOWED_ROLES.has(user.role) || EXPORT_ALLOWED_ROLES.has(user?.impersonation?.role);
};

export {
  transformRafDelta,
  transformSuspectsFunnel,
  transformDeadlineRadar,
  transformProviderHeatmap,
  __private,
} from "./dashboardTransforms";
