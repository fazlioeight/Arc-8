import { useEffect, useMemo, useReducer, useRef } from "react";

const DEFAULT_CACHE_TIME = 5 * 60 * 1000;
const cacheStore = new Map();

const initialState = {
  loading: false,
  data: null,
  error: null,
  partial: false,
  meta: null,
  refreshedAt: null,
};

const ACTIONS = {
  START: "start",
  SUCCESS: "success",
  ERROR: "error",
  RESET: "reset",
};

const reducer = (state, action) => {
  switch (action.type) {
    case ACTIONS.START:
      return {
        ...state,
        loading: true,
        error: null,
        partial: false,
      };
    case ACTIONS.SUCCESS:
      return {
        ...state,
        loading: false,
        data: action.data,
        partial: Boolean(action.partial),
        meta: action.meta || null,
        refreshedAt: action.refreshedAt || new Date(),
      };
    case ACTIONS.ERROR:
      return {
        ...state,
        loading: false,
        error: action.error,
        partial: false,
      };
    case ACTIONS.RESET:
      return { ...initialState };
    default:
      return state;
  }
};

const stableStringify = (value) => {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `"${key}":${stableStringify(value[key])}`);
  return `{${entries.join(",")}}`;
};

export default function useChartData(fetcher, params, options = {}) {
  const {
    enabled = true,
    cacheKey: explicitKey,
    cacheTime = DEFAULT_CACHE_TIME,
    keepPrevious = true,
    onSuccess,
    onError,
    onStart,
  } = options;

  const [{ loading, data, error, partial, meta, refreshedAt }, dispatch] = useReducer(reducer, initialState);
  const args = useMemo(() => params || {}, [params]);
  const cacheKey = useMemo(() => explicitKey || `${fetcher?.name || "fetcher"}::${stableStringify(args)}`, [explicitKey, fetcher, args]);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || typeof fetcher !== "function") {
      if (!keepPrevious) dispatch({ type: ACTIONS.RESET });
      return;
    }

    const now = Date.now();
    const cached = cacheStore.get(cacheKey);
    if (cached && now - cached.timestamp < cacheTime) {
      dispatch({
        type: ACTIONS.SUCCESS,
        data: cached.data,
        partial: cached.partial,
        meta: cached.meta,
        refreshedAt: cached.refreshedAt,
      });
      return;
    }

    let abortController = new AbortController();
    let active = true;
    if (typeof onStart === "function") onStart();
    dispatch({ type: ACTIONS.START });

    const fetchData = async () => {
      const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      try {
        const result = await fetcher({
          params: args,
          signal: abortController.signal,
        });
        if (!mountedRef.current || !active || abortController.signal.aborted) return;
        const normalized = normalizeFetcherResult(result);
        const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
        const payload = {
          type: ACTIONS.SUCCESS,
          data: normalized.data,
          partial: normalized.partial,
          meta: normalized.meta,
          refreshedAt: normalized.refreshedAt || new Date(),
          duration,
        };
        cacheStore.set(cacheKey, {
          ...payload,
          timestamp: Date.now(),
        });
        dispatch(payload);
        if (typeof onSuccess === "function") {
          onSuccess({ ...normalized, duration });
        }
      } catch (err) {
        if (!mountedRef.current || !active || abortController.signal.aborted) return;
        const error = err?.name === "CanceledError" || err?.name === "AbortError" ? null : err;
        if (!error) return;
        dispatch({ type: ACTIONS.ERROR, error });
        if (typeof onError === "function") onError(error);
      }
    };

    fetchData();

    return () => {
      active = false;
      if (abortController) {
        abortController.abort();
      }
    };
  }, [cacheKey, cacheTime, enabled, fetcher, args, keepPrevious, onSuccess, onError]);

  return {
    loading,
    data,
    error,
    partial,
    meta,
    refreshedAt,
    refetch: () => {
      cacheStore.delete(cacheKey);
    },
  };
}

const normalizeFetcherResult = (result) => {
  if (!result) {
    return {
      data: null,
      partial: false,
      meta: null,
      refreshedAt: new Date(),
    };
  }
  if (result.data !== undefined) return result;
  return {
    data: result,
    partial: false,
    meta: null,
    refreshedAt: new Date(),
  };
};

export const __cache = cacheStore;
