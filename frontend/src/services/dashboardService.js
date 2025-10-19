import axios from "axios";
import {
  transformRafDelta,
  transformSuspectsFunnel,
  transformDeadlineRadar,
  transformProviderHeatmap,
  __private,
} from "./dashboardTransforms";
import {
  seedRafDelta,
  seedSuspectsFunnel,
  seedDeadlineRadar,
  seedProviderHeatmap,
  seedDeadlineCsv,
} from "./dashboardSeedData";

const EXPORT_ALLOWED_ROLES = new Set(["risk_ops", "coding_mgr", "admin"]);

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_BASE || "",
  timeout: 15000,
});

const parseBooleanFlag = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return null;
};

const envSeedFlag = parseBooleanFlag(process.env.REACT_APP_DASHBOARD_SEED);
const inferredSeedDefault =
  envSeedFlag !== null
    ? envSeedFlag
    : (!process.env.REACT_APP_API_BASE || process.env.REACT_APP_API_BASE === "/") &&
      process.env.NODE_ENV !== "production";

const isAbortError = (error) => error?.name === "CanceledError" || error?.name === "AbortError";

const readRuntimeSeedFlag = () => {
  if (typeof window !== "undefined") {
    const scriptFlag = parseBooleanFlag(window.__NEXORA_SEED_DASHBOARD);
    if (scriptFlag !== null) return scriptFlag;
    const storageValue =
      window.localStorage?.getItem("nx-dashboard-seed") ??
      window.sessionStorage?.getItem("nx-dashboard-seed");
    const stored = parseBooleanFlag(storageValue);
    if (stored !== null) return stored;
  }
  return inferredSeedDefault;
};

const shouldFallbackToSeed = () => readRuntimeSeedFlag() || process.env.NODE_ENV !== "production";

const logSeedUsage = (channel, reason) => {
  if (process.env.NODE_ENV === "production") return;
  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.info(`[dashboard:seed] ${channel} using seeded data (${reason}).`);
  }
};

const buildSeedResult = (transformed, meta = {}, seeded = false) => ({
  data: transformed,
  partial: Boolean(transformed?.partial),
  meta: seeded ? { ...meta, seed: true } : meta,
  refreshedAt: new Date(),
});

export async function fetchRafDelta({ params, signal }) {
  const { modelYear, lob, providerGroup, forecastEnabled } = params;
  const metaFromRaw = (raw) => ({
    cutoffDate: raw?.cutoff_date || null,
  });
  if (readRuntimeSeedFlag()) {
    logSeedUsage("raf_delta", "seed flag");
    const raw = seedRafDelta({ modelYear, providerGroup });
    const transformed = transformRafDelta(raw);
    return buildSeedResult(transformed, metaFromRaw(raw), true);
  }
  try {
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
    return buildSeedResult(transformed, metaFromRaw(response.data));
  } catch (error) {
    if (isAbortError(error) || !shouldFallbackToSeed()) throw error;
    logSeedUsage("raf_delta", "fallback after error");
    const raw = seedRafDelta({ modelYear, providerGroup });
    const transformed = transformRafDelta(raw);
    return buildSeedResult(transformed, metaFromRaw(raw), true);
  }
}

export async function fetchSuspectsFunnel({ params, signal }) {
  const { from, to } = params;
  const metaFromRaw = (raw) => ({
    asOf: raw?.as_of || null,
  });
  if (readRuntimeSeedFlag()) {
    logSeedUsage("suspects_funnel", "seed flag");
    const raw = seedSuspectsFunnel();
    const transformed = transformSuspectsFunnel(raw, { from, to });
    return buildSeedResult(transformed, metaFromRaw(raw), true);
  }
  try {
    const response = await apiClient.get("/api/suspects/funnel", {
      params: {
        from,
        to,
      },
      signal,
    });
    const transformed = transformSuspectsFunnel(response.data, { from, to });
    return buildSeedResult(transformed, metaFromRaw(response.data));
  } catch (error) {
    if (isAbortError(error) || !shouldFallbackToSeed()) throw error;
    logSeedUsage("suspects_funnel", "fallback after error");
    const raw = seedSuspectsFunnel();
    const transformed = transformSuspectsFunnel(raw, { from, to });
    return buildSeedResult(transformed, metaFromRaw(raw), true);
  }
}

export async function fetchDeadlineRadar({ params, signal }) {
  const { cutoff, stage } = params;
  const meta = {
    cutoff,
  };
  if (readRuntimeSeedFlag()) {
    logSeedUsage("deadline_radar", "seed flag");
    const raw = seedDeadlineRadar({ cutoff, stage });
    const transformed = transformDeadlineRadar(raw, cutoff);
    return buildSeedResult(transformed, meta, true);
  }
  try {
    const response = await apiClient.get("/api/deadlines/radar", {
      params: {
        cutoff,
        stage,
      },
      signal,
    });
    const transformed = transformDeadlineRadar(response.data, cutoff);
    return buildSeedResult(transformed, meta);
  } catch (error) {
    if (isAbortError(error) || !shouldFallbackToSeed()) throw error;
    logSeedUsage("deadline_radar", "fallback after error");
    const raw = seedDeadlineRadar({ cutoff, stage });
    const transformed = transformDeadlineRadar(raw, cutoff);
    return buildSeedResult(transformed, meta, true);
  }
}

export async function fetchProviderHeatmap({ params, signal }) {
  const { metric, lob, providerGroup, normalize } = params;
  const meta = {
    metric,
    normalize,
  };
  if (readRuntimeSeedFlag()) {
    logSeedUsage("provider_heatmap", "seed flag");
    const raw = seedProviderHeatmap({ metric, lob, providerGroup, normalize });
    const transformed = transformProviderHeatmap(raw, { normalize });
    return buildSeedResult(transformed, meta, true);
  }
  try {
    const response = await apiClient.get("/api/providers/heatmap", {
      params: {
        metric,
        lob,
        provider_group: providerGroup === "All" ? undefined : providerGroup,
      },
      signal,
    });
    const transformed = transformProviderHeatmap(response.data, { normalize });
    return buildSeedResult(transformed, meta);
  } catch (error) {
    if (isAbortError(error) || !shouldFallbackToSeed()) throw error;
    logSeedUsage("provider_heatmap", "fallback after error");
    const raw = seedProviderHeatmap({ metric, lob, providerGroup, normalize });
    const transformed = transformProviderHeatmap(raw, { normalize });
    return buildSeedResult(transformed, meta, true);
  }
}

export async function exportDeadlinesCsv({ params, signal }) {
  if (readRuntimeSeedFlag()) {
    logSeedUsage("deadline_csv", "seed flag");
    const radarData = transformDeadlineRadar(seedDeadlineRadar(params), params.cutoff);
    const csv = seedDeadlineCsv(radarData, params, null);
    return new Blob([csv], { type: "text/csv;charset=utf-8" });
  }
  try {
    const response = await apiClient.get("/api/deadlines/radar/export", {
      params,
      signal,
      responseType: "blob",
    });
    return response.data;
  } catch (error) {
    if (isAbortError(error) || !shouldFallbackToSeed()) throw error;
    logSeedUsage("deadline_csv", "fallback after error");
    const radarData = transformDeadlineRadar(seedDeadlineRadar(params), params.cutoff);
    const csv = seedDeadlineCsv(radarData, params, null);
    return new Blob([csv], { type: "text/csv;charset=utf-8" });
  }
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
