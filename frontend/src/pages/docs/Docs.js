import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import PortalUtilityBar from '../../components/PortalUtilityBar';
import SearchInput from '../../components/ui/SearchInput';
import AlertShell from '../../components/ui/AlertShell';
import { AuthContext } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';
import { searchDocsArticles } from '../../services/docsService';
import '../../styles/memberWorkspace.css';

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

      <div className="mx-auto w-full max-w-4xl px-4 pt-8 pb-12 space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] coding-text-muted">Docs</p>
            <h1 className="text-3xl font-semibold coding-text-strong">Nexora Lab documentation</h1>
            <p className="text-sm coding-text-soft max-w-2xl">
              Search knowledge articles and implementation guides.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(isAuthenticated ? ROUTES.PORTAL.LANDING : '/')}
            className="rounded-md ring-1 coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)] px-3 py-1.5 text-xs font-semibold shrink-0"
          >
            Back to portal
          </button>
        </header>

        <section className="coding-surface rounded-2xl shadow-sm">
          <form onSubmit={onSubmit} className="p-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchInput
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search documentation"
            />
            <button
              type="submit"
              className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Search
            </button>
          </form>
        </section>

        {qParam ? (
          <section className="coding-surface rounded-2xl shadow-sm overflow-hidden">
            <header className="px-5 py-3 border-b coding-border">
              <p className="text-xs coding-text-soft">
                Showing results for <span className="coding-text-strong font-medium">{qParam}</span>
              </p>
            </header>
            <div className="p-5 space-y-3">
              {isLoading && (
                <p className="text-sm coding-text-soft">Searching documentation...</p>
              )}
              {!isLoading && searchError && (
                <AlertShell tone="danger" title="Search failed" description={searchError} />
              )}
              {!isLoading && !searchError && articles.length > 0 && (
                <div className="space-y-3">
                  {articles.map((article) => (
                    <article
                      key={article.id}
                      className="coding-surface-subtle rounded-md px-4 py-3"
                    >
                      <h2 className="text-base font-semibold coding-text-strong">{article.title}</h2>
                      {article.summary && (
                        <p className="mt-1 text-sm coding-text-soft">{article.summary}</p>
                      )}
                      {Array.isArray(article.tags) && article.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {article.tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium coding-text-muted"
                            >
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
                <p className="text-sm coding-text-soft italic">
                  No indexed docs match this search yet.
                </p>
              )}
            </div>
          </section>
        ) : (
          <p className="text-sm coding-text-soft">
            Try a query above to search the docs library.
          </p>
        )}
      </div>
    </div>
  );
};

export default Docs;
