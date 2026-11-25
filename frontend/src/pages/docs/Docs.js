import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

import PortalPageLayout from '../../components/PortalPageLayout';
import SearchInput from '../../components/ui/SearchInput';
import AlertShell from '../../components/ui/AlertShell';
import { AuthContext } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';
import { ROLE_DEFINITIONS, ROLES } from '../../constants/permissions';
import { usePermissions } from '../../hooks/usePermissions';
import { PORTAL_NAV_ITEMS } from '../platform/portal_page/portalNavItems';
import { resolveApiBase } from '../../utils/apiBase';
import {
  DEFAULT_MANUAL_ARTICLES,
  KNOWLEDGE_BASE_FAQS,
  KNOWLEDGE_BASE_GLOSSARY,
  KNOWLEDGE_BASE_SOP_PLAYBOOKS,
  filterManualArticlesLocally,
  performUnifiedSiteSearch,
  searchDocsArticles,
} from '../../services/docsService';
import '../../styles/memberWorkspace.css';

const useQuery = () => {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
};

const PRIVILEGED_PREVIEW_ROLES = new Set([
  ROLES.PLATFORM_ADMIN,
  ROLES.ADMIN,
]);

const RESULT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'manual', label: 'User Manual' },
  { key: 'site', label: 'Live Site Data (Patients, Providers & Screens)' },
  { key: 'playbooks', label: 'SOP Playbooks' },
  { key: 'glossary', label: 'Glossary & FAQs' },
];

const escapeRegExp = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightText = (text = '', highlightTerm = '') => {
  const clean = DOMPurify.sanitize(String(text || ''));
  const term = (highlightTerm || '').trim();
  if (term.length < 2) return clean;
  try {
    const pattern = new RegExp(`(${escapeRegExp(term)})`, 'gi');
    return clean.replace(
      pattern,
      '<mark class="rounded bg-amber-200/80 dark:bg-amber-500/30 px-1 font-semibold text-slate-900 dark:text-amber-100">$1</mark>'
    );
  } catch {
    return clean;
  }
};

const renderSanitizedMarkdown = (markdownText = '', highlightTerm = '') => {
  try {
    const rawHtml = marked.parse(String(markdownText || ''));
    let cleanHtml = DOMPurify.sanitize(rawHtml);
    const term = (highlightTerm || '').trim();
    if (term.length >= 2) {
      const pattern = new RegExp(`(?![^<]*>)(${escapeRegExp(term)})`, 'gi');
      cleanHtml = cleanHtml.replace(
        pattern,
        '<mark class="rounded bg-amber-200/80 dark:bg-amber-500/30 px-1 font-semibold text-slate-900 dark:text-amber-100">$1</mark>'
      );
    }
    return cleanHtml;
  } catch (_err) {
    return DOMPurify.sanitize(String(markdownText || ''));
  }
};

const Docs = () => {
  const navigate = useNavigate();
  const { isAuthenticated, token, tenant } = useContext(AuthContext) || {};
  const { currentRole, activeRoleConfig, can } = usePermissions();
  const query = useQuery();
  const qParam = query.get('q') || '';
  const tabParam = query.get('tab') || 'all';

  const resolvedUserRole = currentRole || ROLES.COORDINATOR;
  const canPreviewOtherRoles = PRIVILEGED_PREVIEW_ROLES.has(resolvedUserRole);

  const [q, setQ] = useState(qParam);
  const [activeFilter, setActiveFilter] = useState(
    RESULT_FILTERS.some((f) => f.key === tabParam) ? tabParam : 'all'
  );
  const [selectedRole, setSelectedRole] = useState(resolvedUserRole);
  const [articles, setArticles] = useState([]);
  const [expandedIds, setExpandedIds] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const fetchManualPdfBlobUrl = async () => {
    const apiBase = resolveApiBase();
    const headers = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenant ? { 'X-Tenant-Key': tenant } : {}),
    };
    const res = await fetch(`${apiBase}/api/docs/manual.pdf`, { headers });
    if (!res.ok) throw new Error('Unable to load User Manual PDF');
    const blob = await res.blob();
    return URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
  };

  const handlePreviewManualPdf = async () => {
    setPdfBusy(true);
    try {
      const url = await fetchManualPdfBlobUrl();
      setPdfPreviewUrl(url);
    } catch (err) {
      setSearchError(err.message || String(err));
    } finally {
      setPdfBusy(false);
    }
  };

  const handleDownloadManualPdf = async () => {
    setPdfBusy(true);
    try {
      const url = await fetchManualPdfBlobUrl();
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Arc-8_User_Manual_v2.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      setSearchError(err.message || String(err));
    } finally {
      setPdfBusy(false);
    }
  };

  // Live site-wide search results
  const [siteResults, setSiteResults] = useState({
    members: [],
    providers: [],
    tasks: [],
    screens: [],
  });

  useEffect(() => {
    setSelectedRole(resolvedUserRole);
  }, [resolvedUserRole]);

  useEffect(() => {
    if (RESULT_FILTERS.some((f) => f.key === tabParam)) {
      setActiveFilter(tabParam);
    }
  }, [tabParam]);

  const effectiveRoleFilter = canPreviewOtherRoles ? selectedRole : resolvedUserRole;

  // 1. Fetch Role-Scoped Manual Chapters
  useEffect(() => {
    setQ(qParam);
    let active = true;
    setIsLoading(true);
    setSearchError(null);

    searchDocsArticles({
      token,
      tenant,
      query: qParam || undefined,
      role: effectiveRoleFilter,
    })
      .then((payload) => {
        if (!active) return;
        const incoming = Array.isArray(payload?.articles)
          ? payload.articles
          : filterManualArticlesLocally({
              articles: DEFAULT_MANUAL_ARTICLES,
              query: qParam,
              role: effectiveRoleFilter,
            });
        setArticles(incoming);
      })
      .catch((error) => {
        if (!active) return;
        const fallback = filterManualArticlesLocally({
          articles: DEFAULT_MANUAL_ARTICLES,
          query: qParam,
          role: effectiveRoleFilter,
        });
        setArticles(fallback);
        if (fallback.length === 0) {
          setSearchError(error?.message || 'Unable to search documentation.');
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [qParam, tenant, token, effectiveRoleFilter]);

  // 2. Fetch Live Site-Wide Records (Patients, Providers, Tasks, Screens)
  useEffect(() => {
    let cancelled = false;
    const term = (q || qParam || '').trim();
    const timer = setTimeout(() => {
      performUnifiedSiteSearch({
        query: term,
        token,
        tenant: tenant || 'prominencehealth',
        role: effectiveRoleFilter === 'all' ? 'admin' : effectiveRoleFilter,
        can,
        limitPerGroup: 5,
      }).then((res) => {
        if (!cancelled) {
          setSiteResults({
            members: res.members || [],
            providers: res.providers || [],
            tasks: res.tasks || [],
            screens: res.screens || [],
          });
        }
      });
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, qParam, token, tenant, effectiveRoleFilter, can]);

  const activeTerm = (q || qParam || '').trim();
  const activeTermLower = activeTerm.toLowerCase();

  // Build unified Google-style flat results stream
  const unifiedResults = useMemo(() => {
    const items = [];

    // A. User Manual Chapters
    if (activeFilter === 'all' || activeFilter === 'manual') {
      const matchedArticles = articles.filter((art) => {
        if (!activeTermLower || activeTermLower === (qParam || '').trim().toLowerCase()) {
          return true;
        }
        return [art.title, art.summary, art.content, art.category, ...(art.tags || [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(activeTermLower);
      });

      matchedArticles.forEach((art) => {
        items.push({
          uid: `manual-${art.id}`,
          type: 'User Manual',
          breadcrumb: `Arc-8 Knowledge Base › User Manual › ${art.category || art.app_key || 'Guide'}`,
          title: art.title,
          snippet: art.summary,
          fullMarkdown: art.content,
          tags: art.tags || [],
          rolesCount: art.allowed_roles?.length || 12,
        });
      });
    }

    // B. Live Site Records (Patients, Providers, Tasks, Screens)
    if (activeFilter === 'all' || activeFilter === 'site') {
      siteResults.members.forEach((m) => {
        items.push({
          uid: `member-${m.id}`,
          type: 'Patient Record',
          breadcrumb: `Arc-8 Live Site › Member 360 › ${m.memberKey}`,
          title: `${m.name} (${m.memberKey}) — ${m.riskTier} Risk`,
          snippet: `Assigned PCP: ${m.pcp} · Open HEDIS/HCC Care Gaps: ${m.openGaps}. Click to open full Member 360 Clinical Chart.`,
          path: m.path,
        });
      });

      siteResults.providers.forEach((p) => {
        items.push({
          uid: `provider-${p.id || p.npi}`,
          type: 'Provider Directory',
          breadcrumb: `Arc-8 Live Site › Providers › NPI ${p.npi}`,
          title: `${p.name} — ${p.specialty}`,
          snippet: `NPI: ${p.npi} · Attributed Members: ${p.memberCount} · Open Care Gaps: ${p.openGaps}. Click to view provider profile.`,
          path: p.path,
        });
      });

      siteResults.tasks.forEach((tItem) => {
        items.push({
          uid: `task-${tItem.id}`,
          type: 'Clinical Task',
          breadcrumb: `Arc-8 Live Site › Clinical Tasks › ${tItem.priority.toUpperCase()}`,
          title: `${tItem.title} (${tItem.memberName})`,
          snippet: `Task Status: ${tItem.status} · Priority: ${tItem.priority}. Click to open member task workflow.`,
          path: tItem.path,
        });
      });

      // Only include screens in 'all' when there is an active search term (or always in 'site' filter)
      if (activeFilter === 'site' || activeTermLower) {
        siteResults.screens.forEach((scr) => {
          items.push({
            uid: `screen-${scr.id}`,
            type: 'System Screen',
            breadcrumb: `Arc-8 Application › ${scr.badge} › ${scr.path}`,
            title: scr.title,
            snippet: scr.summary,
            path: scr.path,
          });
        });
      }
    }

    // C. Daily SOP Playbooks
    if (activeFilter === 'all' || activeFilter === 'playbooks') {
      KNOWLEDGE_BASE_SOP_PLAYBOOKS.forEach((sop) => {
        if (effectiveRoleFilter !== 'all' && !sop.allowed_roles.includes(effectiveRoleFilter)) {
          return;
        }
        if (
          activeTermLower &&
          !`${sop.title} ${sop.category} ${sop.steps.join(' ')}`
            .toLowerCase()
            .includes(activeTermLower)
        ) {
          return;
        }
        items.push({
          uid: `sop-${sop.id}`,
          type: 'SOP Playbook',
          breadcrumb: `Arc-8 Knowledge Base › SOP Playbooks › ${sop.category}`,
          title: sop.title,
          snippet: `${sop.steps[0]} (${sop.steps.length} steps · Est. ${sop.duration})`,
          fullMarkdown: sop.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
          path: sop.route,
          actionLabel: sop.routeLabel,
        });
      });
    }

    // D. Glossary & FAQs
    if (activeFilter === 'all' || activeFilter === 'glossary') {
      KNOWLEDGE_BASE_GLOSSARY.forEach((g) => {
        if (effectiveRoleFilter !== 'all' && !g.allowed_roles.includes(effectiveRoleFilter)) {
          return;
        }
        if (
          activeTermLower &&
          !`${g.term} ${g.category} ${g.definition}`.toLowerCase().includes(activeTermLower)
        ) {
          return;
        }
        items.push({
          uid: `glossary-${g.term}`,
          type: 'Glossary',
          breadcrumb: `Arc-8 Knowledge Base › Clinical & VBC Glossary › ${g.category}`,
          title: `${g.term} (${g.category})`,
          snippet: g.definition,
        });
      });

      KNOWLEDGE_BASE_FAQS.forEach((faq) => {
        if (effectiveRoleFilter !== 'all' && !faq.allowed_roles.includes(effectiveRoleFilter)) {
          return;
        }
        if (
          activeTermLower &&
          !`${faq.question} ${faq.answer}`.toLowerCase().includes(activeTermLower)
        ) {
          return;
        }
        items.push({
          uid: `faq-${faq.id}`,
          type: 'HIPAA FAQ',
          breadcrumb: `Arc-8 Knowledge Base › Troubleshooting & HIPAA FAQs`,
          title: faq.question,
          snippet: faq.answer,
        });
      });
    }

    return items;
  }, [articles, siteResults, activeFilter, activeTermLower, qParam, effectiveRoleFilter]);

  const onSubmit = (event) => {
    event.preventDefault();
    navigate(`${ROUTES.DOCS}${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  };

  const toggleExpand = (uid) => {
    setExpandedIds((prev) => ({ ...prev, [uid]: !prev[uid] }));
  };

  const activeRoleName = useMemo(() => {
    const roleKey = selectedRole === 'all' ? resolvedUserRole : selectedRole;
    const def = ROLE_DEFINITIONS.find((r) => r.key === roleKey);
    return def?.name || activeRoleConfig?.name || 'Care Coordinator';
  }, [selectedRole, resolvedUserRole, activeRoleConfig]);

  const googleStyleBody = (
    <div className="mx-auto w-full max-w-4xl space-y-6 pt-2 pb-16">
      {/* Clean Google-Style Search Header */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold coding-text-strong">
              Arc-8 documentation
            </h1>
            <p className="text-xs coding-text-soft">
              Search the User Manual, SOP Playbooks, Glossary, and live site data scoped to your HIPAA role.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Compact Role Selector Badge */}
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                HIPAA Role:
              </span>
              {canPreviewOtherRoles ? (
                <select
                  aria-label="Show Manual Data for Role"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  style={{ boxShadow: 'none', outline: 'none' }}
                  className="bg-transparent font-semibold text-slate-900 dark:text-white cursor-pointer border-0 p-0 text-xs focus:ring-0"
                >
                  <option value="all">All 12 Roles</option>
                  {ROLE_DEFINITIONS.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-semibold coding-text-strong">{activeRoleName}</span>
              )}
            </div>

            <button
              type="button"
              onClick={handlePreviewManualPdf}
              disabled={pdfBusy}
              className="rounded-full ring-1 coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)] px-3 py-1 text-xs font-semibold"
            >
              Preview Manual PDF
            </button>

            <button
              type="button"
              onClick={handleDownloadManualPdf}
              disabled={pdfBusy}
              className="rounded-full bg-[var(--brand-primary)] text-white hover:opacity-90 px-3 py-1 text-xs font-semibold"
            >
              Download PDF
            </button>

            <button
              type="button"
              onClick={() => navigate(isAuthenticated ? ROUTES.PORTAL.LANDING : '/')}
              className="rounded-full ring-1 coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)] px-3 py-1 text-xs font-semibold"
            >
              Back to portal
            </button>
          </div>
        </div>

        {/* Google-Style Search Bar */}
        <form
          onSubmit={onSubmit}
          className="flex items-center gap-2 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-1.5 shadow-sm focus-within:border-sky-500 transition"
        >
          <SearchInput
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search documentation, workflows, patients, providers, or HIPAA rules..."
            style={{ boxShadow: 'none', outline: 'none', border: 'none', background: 'transparent' }}
            className="!border-0 !bg-transparent !shadow-none focus:!ring-0 text-sm"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ('');
                navigate(ROUTES.DOCS);
              }}
              className="px-2 text-xs coding-text-muted hover:coding-text-strong"
            >
              Clear
            </button>
          )}
          <button
            type="submit"
            className="rounded-full bg-[var(--brand-primary)] px-5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 shrink-0"
          >
            Search
          </button>
        </form>

        {/* Minimal Google-Style Filter Tabs (All | User Manual | Live Site Data | SOP Playbooks | Glossary & FAQs) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b coding-border pb-2">
          <div className="flex flex-wrap items-center gap-4">
            {RESULT_FILTERS.map((f) => {
              const active = activeFilter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setActiveFilter(f.key)}
                  className={`pb-1.5 text-xs font-semibold border-b-2 transition ${
                    active
                      ? 'border-[var(--brand-primary)] text-[var(--brand-primary)] dark:text-sky-400 dark:border-sky-400'
                      : 'border-transparent coding-text-soft hover:coding-text-strong'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <span className="text-xs coding-text-muted">
            {activeTerm ? (
              <>
                Showing {unifiedResults.length} results for{' '}
                <strong className="coding-text-strong">&ldquo;{activeTerm}&rdquo;</strong>
              </>
            ) : (
              <span>
                Published User Manuals &amp; Clinical Implementation Guides ({unifiedResults.length} results)
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Google-Style Clean Vertical Search Results Feed */}
      <div className="space-y-4">
        {isLoading && (
          <p className="text-sm coding-text-soft">Loading documentation...</p>
        )}
        {!isLoading && searchError && (
          <AlertShell tone="danger" title="Search failed" description={searchError} />
        )}

        {!isLoading && !searchError && unifiedResults.length > 0 && (
          <div className="space-y-3">
            {unifiedResults.map((item) => {
              const isExpanded = Boolean(expandedIds[item.uid]) || (Boolean(activeTerm) && item.type === 'User Manual');
              return (
                <article
                  key={item.uid}
                  className="coding-surface rounded-xl px-5 py-4 shadow-xs ring-1 coding-border transition hover:shadow-sm"
                >
                  {/* Google-style breadcrumb line */}
                  <div className="flex items-center justify-between gap-2 text-xs coding-text-muted">
                    <span className="truncate">{item.breadcrumb}</span>
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-semibold coding-text-soft shrink-0">
                      {item.type}
                    </span>
                  </div>

                  {/* Google-style clickable Title */}
                  <h2 className="mt-1 text-base font-semibold text-sky-700 dark:text-sky-400 hover:underline">
                    <button
                      type="button"
                      onClick={() => {
                        if (item.path && !item.fullMarkdown) {
                          navigate(item.path);
                        } else {
                          toggleExpand(item.uid);
                        }
                      }}
                      className="text-left"
                      dangerouslySetInnerHTML={{
                        __html: highlightText(item.title, activeTerm),
                      }}
                    />
                  </h2>

                  {/* Google-style 2-line Snippet */}
                  {item.snippet && (
                    <p
                      className="mt-1 text-sm coding-text-soft leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: highlightText(item.snippet, activeTerm),
                      }}
                    />
                  )}

                  {/* Expandable Full Manual Content (only shown when clicked or matched by search) */}
                  {item.fullMarkdown && isExpanded && (
                    <div
                      className="mt-3 pt-3 border-t coding-border prose prose-sm dark:prose-invert max-w-none text-xs coding-text-soft space-y-2 leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: renderSanitizedMarkdown(item.fullMarkdown, activeTerm),
                      }}
                    />
                  )}

                  {/* Subtle Footer Actions */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs">
                    {item.fullMarkdown && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.uid)}
                        className="font-semibold text-sky-700 dark:text-sky-400 hover:underline"
                      >
                        {isExpanded ? 'Hide full guide ▲' : 'Read full guide ▼'}
                      </button>
                    )}
                    {item.type === 'User Manual' && (
                      <>
                        <button
                          type="button"
                          onClick={handlePreviewManualPdf}
                          className="rounded-md ring-1 coding-border coding-text-strong px-2 py-0.5 font-semibold hover:bg-[var(--coding-hover)]"
                        >
                          Preview PDF
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadManualPdf}
                          className="rounded-md bg-[var(--brand-primary)] text-white px-2 py-0.5 font-semibold hover:opacity-90"
                        >
                          Download PDF
                        </button>
                      </>
                    )}
                    {item.path && (
                      <button
                        type="button"
                        onClick={() => navigate(item.path)}
                        className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        {item.actionLabel || `Open in Arc-8 (${item.path})`} →
                      </button>
                    )}
                    {Array.isArray(item.tags) &&
                      item.tags.slice(0, 4).map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            setQ(tag);
                            navigate(`${ROUTES.DOCS}?q=${encodeURIComponent(tag)}`);
                          }}
                          className="text-[11px] coding-text-muted hover:coding-text-strong"
                        >
                          #{tag}
                        </button>
                      ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!isLoading && !searchError && unifiedResults.length === 0 && (
          <p className="text-sm coding-text-soft italic">
            No indexed docs match this search yet.
          </p>
        )}
      </div>
      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="coding-surface rounded-2xl shadow-2xl max-w-5xl w-full p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold coding-text-strong">
                Arc-8 Enterprise User Manual (v2.0) — PDF Preview
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadManualPdf}
                  className="rounded-md bg-[var(--brand-primary)] text-white px-3 py-1 text-xs font-semibold hover:opacity-90"
                >
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(pdfPreviewUrl);
                    setPdfPreviewUrl(null);
                  }}
                  className="rounded-md ring-1 coding-border coding-text-strong px-2.5 py-1 text-xs font-semibold"
                >
                  Close ✕
                </button>
              </div>
            </div>
            <iframe
              src={pdfPreviewUrl}
              title="Arc-8 User Manual PDF Preview"
              className="w-full h-[75vh] rounded-lg border coding-border bg-white"
            />
          </div>
        </div>
      )}
    </div>
  );

  if (isAuthenticated || token) {
    return (
      <PortalPageLayout
        hideHeader
        navItems={PORTAL_NAV_ITEMS}
        currentNav="docs"
        maxWidthClassName="max-w-5xl"
      >
        {googleStyleBody}
      </PortalPageLayout>
    );
  }

  return (
    <div className="coding-member-workspace min-h-screen">
      <div className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16">
        {googleStyleBody}
      </div>
    </div>
  );
};

export default Docs;
