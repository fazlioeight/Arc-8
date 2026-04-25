import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import PortalUtilityBar from '../../components/PortalUtilityBar';
import PortalHero from '../../components/PortalHero';
import { AuthContext } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';
import { searchDocsArticles } from '../../services/docsService';
import '../platform/coding/member/memberWorkspace.css';

const useQuery = () => {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
};

const Docs = () => {
  const navigate = useNavigate();
  const { isAuthenticated, token, tenant } = useContext(AuthContext) || {};
  const query = useQuery();
  const qParam = query.get('q') || '';
  const [q, setQ] = useState(qParam);
  const [articles, setArticles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);

  useEffect(() => {
    setQ(qParam);
    if (!qParam) {
      setArticles([]);
      setSearchError(null);
      return undefined;
    }
    let active = true;
    setIsLoading(true);
    setSearchError(null);
    searchDocsArticles({ token, tenant, query: qParam })
      .then((payload) => {
        if (!active) return;
        setArticles(payload?.articles || []);
      })
      .catch((error) => {
        if (!active) return;
        setArticles([]);
        setSearchError(error?.message || 'Unable to search documentation.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [qParam, tenant, token]);

  const onSubmit = (event) => {
    event.preventDefault();
    navigate(`${ROUTES.DOCS}?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="coding-member-workspace min-h-screen">
      {isAuthenticated && <PortalUtilityBar />}
      <PortalHero
        align="left"
        title="Nexora documentation"
        subtitle="Search knowledge articles and implementation guides (coming soon)."
        actions={(
          <button
            type="button"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            onClick={() => navigate(isAuthenticated ? ROUTES.PORTAL.LANDING : '/')}
          >
            Back to portal
          </button>
        )}
        wave={false}
      />

      <div className="mx-auto mt-6 w-full max-w-4xl px-4">
        <form
          onSubmit={onSubmit}
          className="mb-4 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:gap-3 dark:border-slate-700 dark:bg-slate-900/80"
        >
          <input
            type="text"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search documentation"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-inner outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Search
          </button>
        </form>

        {qParam ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-2 text-sm text-slate-600 dark:text-slate-300">
              Showing results for: <strong>{qParam}</strong>
            </div>
            {isLoading && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                Searching documentation...
              </div>
            )}
            {!isLoading && searchError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                {searchError}
              </div>
            )}
            {!isLoading && !searchError && articles.length > 0 && (
              <div className="space-y-3">
                {articles.map((article) => (
                  <article
                    key={article.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{article.title}</h2>
                    {article.summary && <p className="mt-1">{article.summary}</p>}
                    {Array.isArray(article.tags) && article.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {article.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-white px-2 py-1 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
            {!isLoading && !searchError && articles.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                <em>No indexed docs match this search yet.</em>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Try a query above to search future docs.
          </div>
        )}
      </div>
    </div>
  );
};

export default Docs;
