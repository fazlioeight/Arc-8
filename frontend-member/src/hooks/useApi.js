import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal data-fetching hook with loading/error/reload. `fetcher` should be a
// stable function (wrap in useCallback when it closes over props/state).
export default function useApi(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mounted = useRef(true);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    setError(null);
    Promise.resolve()
      .then(fetcher)
      .then((res) => {
        if (mounted.current) setData(res);
      })
      .catch((err) => {
        if (mounted.current) setError(err);
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => {
      mounted.current = false;
    };
  }, [...deps, nonce]);

  return { data, loading, error, reload };
}
