// components/PortalUtilityBar.js
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { useCommandPalette } from '../context/CommandPaletteContext';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { usePermissions } from '../hooks/usePermissions';
import { ROUTES } from '../constants/routes';
import { performUnifiedSiteSearch } from '../services/docsService';
import Icon from './ui/Icon';
import ThemeToggleButton from './ThemeToggleButton';

const ROUTE_LABELS = {
  '/': 'Home',
  [ROUTES.PROVIDERS.LANDING]: 'Providers',
  [ROUTES.JOBS.STATUS_CENTER]: 'Operations Center',
  [ROUTES.JOBS.IMPORT_DATA]: 'Data Imports',
  [ROUTES.DOCS]: 'Documentation',
  [ROUTES.PORTAL.LANDING]: 'Portal Home',
  [ROUTES.MEMBER_360.LANDING]: 'Member 360',
  [ROUTES.SETTINGS]: 'Settings',
};

/* ─── Icon buttons ─────────────────────────────────────────────────────── */
const iconBtn =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300/90 bg-white/95 px-2 py-1.5 text-slate-700 shadow-xs transition cursor-pointer hover:bg-white hover:border-slate-400 hover:text-slate-950 dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white coding-ghost-button';

/* ─── Dropdown shell ───────────────────────────────────────────────────── */
const DropdownShell = ({ children, alignRight = false, className = '' }) => (
  <div
    className={[
      'absolute top-full z-50 mt-1.5 min-w-[260px] rounded-xl py-2 shadow-dropdown coding-surface',
      alignRight ? 'right-0' : 'left-0',
      className,
    ].join(' ')}
  >
    {children}
  </div>
);

const DropdownHeader = ({ children }) => (
  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest coding-text-muted">
    {children}
  </div>
);

const DropdownItem = ({ onClick, children, className = '', statusVariant = '' }) => {
  const variantMap = {
    error:   'bg-red-50/60 dark:bg-red-950/30',
    warning: 'bg-amber-50/60 dark:bg-amber-950/30',
    info:    'bg-sky-50/60 dark:bg-sky-950/30',
    '':      '',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition coding-text-strong coding-nav-link',
        variantMap[statusVariant] || '',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
};

/* ─── SVGs ─────────────────────────────────────────────────────────────── */
const WaffleIcon  = () => <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/></svg>;
const HomeIcon    = () => <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M12 3l9 7h-2v9h-5v-6H10v6H5v-9H3l9-7z"/></svg>;
const CmdIcon     = () => <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M5 4h14a1 1 0 011 1v3H4V5a1 1 0 011-1zm-1 7h16a1 1 0 011 1v7H3v-7a1 1 0 011-1zm4 2v2h2v-2H8zm4 0v2h2v-2h-2z"/></svg>;
const BellIcon    = () => <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M12 22a2 2 0 002-2H10a2 2 0 002 2zm6-6V9a6 6 0 10-12 0v7L4 18v1h16v-1l-2-2z"/></svg>;
const JobsIcon    = () => <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M5 4h14l1 4H4l1-4zm-1 6h16v9H4v-9zm4 2v5h2v-5H8zm4 0v5h2v-5h-2z"/></svg>;
const ChevronDown = () => <svg className="h-3.5 w-3.5 fill-current opacity-60" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5H7z"/></svg>;

/* ─── Component ────────────────────────────────────────────────────────── */
const PortalUtilityBar = ({ onToggleSidebar, sidebarCollapsed = false }) => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const {
    user, token, logout, hasApplicationAccess, role,
    availableApplications = [], availableTenants = [],
    tenant, tenantInfo, setTenant,
    isImpersonating, impersonation, endImpersonation, startImpersonation,
    auditTrail = [], recordAuditEvent,
  } = useContext(AuthContext) || {};

  const { openPalette } = useCommandPalette();
  const { favorites, toggleFavorite, isFavorite, isNavItemEnabled, t: rawT } = useUserPreferences();
  const t = typeof rawT === 'function' ? rawT : (_key, fallback) => fallback ?? _key;
  const { currentRole, can } = usePermissions();
  const effectiveRoleLabel = (currentRole || role || 'user').replace(/_/g, ' ');

  const [showWaffle,     setShowWaffle]     = useState(false);
  const [showNotif,      setShowNotif]      = useState(false);
  const [showUser,       setShowUser]       = useState(false);
  const [showTenantMenu, setShowTenantMenu] = useState(false);
  const [siteQuery,      setSiteQuery]      = useState('');
  const [showSiteSearch, setShowSiteSearch] = useState(false);
  const [siteResults,    setSiteResults]    = useState(null);
  const [isSearchingSite, setIsSearchingSite] = useState(false);
  const barRef = useRef(null);

  const openKnowledgeBaseInNewWindow = (queryText = '', tab = '') => {
    const trimmed = String(queryText || '').trim();
    const params = new URLSearchParams();
    if (trimmed) params.set('q', trimmed);
    if (tab) params.set('tab', tab);
    const qs = params.toString();
    const targetUrl = qs ? `${ROUTES.DOCS}?${qs}` : ROUTES.DOCS;
    recordAuditEvent?.('docs.manual.open_window', {
      query: trimmed,
      tab: tab || 'hub',
      role: currentRole || role || 'user',
    });
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    } else {
      navigate(targetUrl);
    }
  };

  useEffect(() => {
    const term = siteQuery.trim();
    if (!showSiteSearch && !term) {
      return undefined;
    }
    let cancelled = false;
    setIsSearchingSite(true);
    const timer = setTimeout(() => {
      performUnifiedSiteSearch({
        query: term,
        token,
        tenant: tenant || 'prominencehealth',
        role: currentRole || role || 'coordinator',
        can,
        limitPerGroup: 3,
      })
        .then((res) => {
          if (!cancelled) setSiteResults(res);
        })
        .finally(() => {
          if (!cancelled) setIsSearchingSite(false);
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [siteQuery, showSiteSearch, token, tenant, currentRole, role, can]);

  const handleSiteSearchSubmit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowSiteSearch(false);
    openKnowledgeBaseInNewWindow(siteQuery);
  };

  const closeAll = () => {
    setShowWaffle(false);
    setShowNotif(false);
    setShowUser(false);
    setShowTenantMenu(false);
    setShowSiteSearch(false);
  };

  useEffect(() => {
    const onDocClick = (e) => {
      if (barRef.current && !barRef.current.contains(e.target)) closeAll();
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const applicationTiles = useMemo(() => [
    { key: 'portal',       label: 'Arc-8',                desc: 'Metrics & insights',     icon: 'A8', color: '#0176d3', path: ROUTES.PORTAL.LANDING },
    { key: 'member360',    label: 'Member 360',          desc: 'Chart launchpad',        icon: 'M3', color: '#0891b2', path: ROUTES.MEMBER360_LAB.DASHBOARD },
    { key: 'coding',       label: 'Coding Worklists',    desc: 'Member reviews',         icon: 'CD', color: '#0f172a', path: ROUTES.CODING.WORKLIST },
    { key: 'providers',    label: 'Providers',           desc: 'Directory search',       icon: 'PR', color: '#1f2937', path: ROUTES.PROVIDERS.LANDING },
    { key: 'ride_booking', label: 'Ride Booking',        desc: 'Transportation',         icon: 'RB', color: '#2563eb', path: '/ride-booking' },
    { key: 'dashboard',    label: 'Dashboard',           desc: 'Analytics view',         icon: 'DB', color: '#4f46e5', path: '/dashboard' },
    { key: 'chat',         label: 'Arc-8 Chat',           desc: 'Claude assistant',       icon: 'AI', color: '#7c3aed', path: ROUTES.CHAT },
    { key: 'docs',         label: 'Docs Library',        desc: 'Knowledge base',         icon: 'DL', color: '#6366f1', path: ROUTES.DOCS },
    { key: 'job_center',   label: 'Job Center',          desc: 'Logs & retry',           icon: 'JC', color: '#0f766e', path: ROUTES.JOBS.STATUS_CENTER },
    { key: 'settings',     label: 'Settings',            desc: 'Preferences',            icon: 'ST', color: '#64748b', path: ROUTES.SETTINGS },
    { key: 'admin_console',label: 'Master Admin',        desc: 'Roles & access',         icon: 'MA', color: '#dc2626', path: ROUTES.ADMIN.MASTER, requiredLevel: 'admin' },
  ], []);

  const accessibleApps = useMemo(() => {
    if (!hasApplicationAccess) return [];
    const enabledKeys = new Set(
      availableApplications?.length ? availableApplications : applicationTiles.map((a) => a.key)
    );
    return applicationTiles.filter((app) => {
      if (!enabledKeys.has(app.key)) return false;
      if (!hasApplicationAccess(app.key, app.requiredLevel || 'user')) return false;
      if (app.key !== 'portal' && !isNavItemEnabled(app.key)) return false;
      return true;
    });
  }, [applicationTiles, availableApplications, hasApplicationAccess, isNavItemEnabled]);

  const recentEvents = useMemo(() => (auditTrail || []).slice(0, 4), [auditTrail]);

  const jobAlerts = useMemo(() => {
    const items = [];
    const failedJob = recentEvents.find((e) => e.action === 'job.failed');
    if (failedJob) items.push({ id: failedJob.id, title: 'A job needs attention', hint: failedJob.metadata?.jobName || 'Review in Job Center', status: 'error' });
    else if (hasApplicationAccess?.('job_center')) items.push({ id: 'job-center', title: 'Monitor long-running jobs', hint: 'Check progress or download logs', status: 'info' });
    if (isImpersonating) items.unshift({ id: 'impersonation', title: `Impersonating ${impersonation?.name || impersonation?.email}`, hint: 'All actions are audit logged.', status: 'warning' });
    return items;
  }, [recentEvents, hasApplicationAccess, isImpersonating, impersonation]);

  const handleTenantSelect = (key) => {
    setTenant?.(key);
    setShowTenantMenu(false);
    recordAuditEvent?.('tenant.switch.via_utility', { tenant: key });
  };

  const handleCommandPalette = () => {
    closeAll();
    recordAuditEvent?.('command_palette.open', { source: 'utility_bar' });
    openPalette();
  };

  const initials = (user?.email || '?')[0].toUpperCase();
  const currentPath = location.pathname;
  const resolvedFavoriteLabel = useMemo(() => {
    if (ROUTE_LABELS[currentPath]) return ROUTE_LABELS[currentPath];
    const tile = applicationTiles.find((a) => currentPath.startsWith(a.path));
    return tile ? tile.label : document.title || currentPath;
  }, [currentPath, applicationTiles]);

  const isCurrentFavorite = isFavorite(currentPath);
  const handleFavoriteToggle = () => {
    toggleFavorite({ path: currentPath, label: resolvedFavoriteLabel });
    recordAuditEvent?.('navigation.favorite.toggle', { path: currentPath, label: resolvedFavoriteLabel, pinned: !isCurrentFavorite });
  };

  return (
    <>
      {/* Impersonation banner */}
      {isImpersonating && (
        <div className="flex items-center justify-between gap-3 border-b border-sky-200/60 bg-sky-50/80 px-4 py-1.5 text-sm text-sky-800 dark:border-sky-700/40 dark:bg-sky-950/40 dark:text-sky-200">
          <span>
            Acting as <strong>{impersonation?.name || impersonation?.email}</strong>
            {' '}&mdash; all actions are recorded.
          </span>
          <button
            type="button"
            className="rounded-md bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-200 dark:bg-sky-900/50 dark:text-sky-100 dark:hover:bg-sky-800/60"
            onClick={() => { recordAuditEvent?.('impersonation.banner_exit'); endImpersonation?.(); }}
          >
            Return to self
          </button>
        </div>
      )}

      {/* Bar */}
      <div
        ref={barRef}
        className="relative z-40 border-b border-slate-300 bg-[#e6ecf4]/95 shadow-[0_2px_6px_rgba(15,23,42,0.05)] dark:border-slate-800/80 dark:bg-[#0a0f1d]/90 dark:shadow-none backdrop-blur-md"
      >
        <div className="flex w-full items-center justify-between gap-3 px-6 py-2.5">

          {/* ── Left cluster ────────────────────────── */}
          <div className="flex items-center gap-2">
            {onToggleSidebar && (
              <button
                type="button"
                className={iconBtn}
                title={sidebarCollapsed ? 'Expand sidebar menu' : 'Collapse sidebar menu'}
                onClick={onToggleSidebar}
              >
                <svg className="h-4 w-4 fill-current text-slate-600 dark:text-slate-300" viewBox="0 0 24 24">
                  <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
                </svg>
              </button>
            )}

            {/* Waffle */}
            <div className="relative">
              <button
                className={iconBtn}
                title="App launcher"
                aria-haspopup="true"
                aria-expanded={showWaffle}
                onClick={(e) => { e.stopPropagation(); setShowWaffle((v) => !v); setShowNotif(false); setShowUser(false); setShowTenantMenu(false); }}
              >
                <WaffleIcon />
              </button>
              {showWaffle && (
                <div
                  className="absolute left-0 top-full z-50 mt-1.5 w-[min(90vw,560px)] rounded-xl p-3 shadow-dropdown coding-surface"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DropdownHeader>{t('utility.quick_links', 'Quick links')}</DropdownHeader>
                  <div className="mt-1.5 grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-2">
                    {accessibleApps.map((app) => (
                      <button
                        key={app.key}
                        type="button"
                        className="flex items-center gap-2.5 rounded-xl p-2.5 text-left transition coding-surface-subtle coding-hoverable"
                        onClick={() => { closeAll(); navigate(app.path); }}
                      >
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm"
                          style={{ background: app.color }}
                        >
                          {app.icon}
                        </span>
                        <span>
                          <span className="block text-sm font-semibold coding-text-strong">{app.label}</span>
                          <span className="block text-xs coding-text-muted">{app.desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Home */}
            <button
              className={iconBtn}
              title="Portal home"
              onClick={(e) => { e.stopPropagation(); closeAll(); navigate(ROUTES.PORTAL.LANDING); }}
            >
              <HomeIcon />
            </button>

            {/* Command palette */}
            <button
              className={iconBtn}
              title="Command palette"
              onClick={(e) => { e.stopPropagation(); handleCommandPalette(); }}
            >
              <CmdIcon />
              <span className="ml-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold coding-surface-subtle coding-text-muted">
                Ctrl+K
              </span>
            </button>

            {/* Favorite toggle */}
            <button
              className={[iconBtn, isCurrentFavorite ? 'text-amber-500 dark:text-amber-400' : ''].join(' ')}
              aria-pressed={isCurrentFavorite}
              title={isCurrentFavorite ? 'Unpin from favorites' : 'Pin this page'}
              onClick={(e) => { e.stopPropagation(); handleFavoriteToggle(); }}
            >
              <Icon name={isCurrentFavorite ? 'starFilled' : 'star'} size={16} aria-hidden="true" />
            </button>

            {/* Tenant switcher */}
            <div className="relative">
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300/90 bg-white/95 px-2.5 py-1.5 text-sm font-semibold text-slate-800 shadow-xs transition hover:bg-white hover:border-slate-400 dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800 coding-ghost-button"
                aria-haspopup="true"
                aria-expanded={showTenantMenu}
                onClick={(e) => { e.stopPropagation(); setShowTenantMenu((v) => !v); setShowWaffle(false); setShowNotif(false); setShowUser(false); }}
              >
                <span>{tenantInfo?.name || tenant}</span>
                <ChevronDown />
              </button>
              {showTenantMenu && (
                <DropdownShell className="min-w-[320px]" onClick={(e) => e.stopPropagation()}>
                  <DropdownHeader>Switch tenant</DropdownHeader>
                  <div className="mt-1 space-y-1 px-2">
                    {availableTenants.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        className={[
                          'w-full rounded-lg border px-3 py-2.5 text-left text-sm transition',
                          opt.key === tenant
                            ? 'border-sky-400/60 bg-sky-500/10 dark:border-sky-400/40 dark:bg-sky-500/15'
                            : 'coding-ghost-button',
                        ].join(' ')}
                        onClick={() => handleTenantSelect(opt.key)}
                      >
                        <div className="font-semibold coding-text-strong">{opt.name}</div>
                        <div className="mt-0.5 text-xs coding-text-muted">
                          {opt.region || 'Unknown region'} &middot; {opt.timezone || 'Timezone TBD'}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 border-t coding-divider px-3 pt-2 pb-1 text-xs coding-text-muted">
                    Need a sandbox reset? Contact support.
                  </div>
                </DropdownShell>
              )}
            </div>
          </div>

          {/* ── Right cluster ───────────────────────── */}
          <div className="flex items-center gap-2">
            {/* 1. Unified Global Site Search Omnibox (Single clean input, no double-box focus outline) */}
            <div className="relative hidden sm:block" onClick={(e) => e.stopPropagation()}>
              <form
                onSubmit={handleSiteSearchSubmit}
                className="relative flex items-center"
                title="Global Site Search across Patients, Providers, Tasks, Screens & Knowledge Base"
              >
                <svg
                  className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-400 dark:text-slate-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  aria-label="Search User Manual"
                  value={siteQuery}
                  onFocus={() => {
                    setShowSiteSearch(true);
                    setShowWaffle(false);
                    setShowNotif(false);
                    setShowUser(false);
                    setShowTenantMenu(false);
                  }}
                  onChange={(e) => {
                    setSiteQuery(e.target.value);
                    setShowSiteSearch(true);
                  }}
                  placeholder={t('utility.global_site_search', 'Search site, patients, providers, docs...')}
                  style={{ boxShadow: 'none', outline: 'none' }}
                  className="w-52 lg:w-64 rounded-full border border-slate-300/90 bg-white/95 pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 transition focus:border-sky-500 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder-slate-400"
                />
                {siteQuery && (
                  <button
                    type="button"
                    onClick={() => setSiteQuery('')}
                    className="absolute right-2.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </form>

              {/* Live Global Site Search Results Dropdown */}
              {showSiteSearch && (
                <div className="absolute right-0 top-full z-50 mt-1.5 w-[min(92vw,440px)] rounded-xl border border-slate-200 dark:border-slate-700/80 p-3 shadow-dropdown coding-surface max-h-[75vh] overflow-y-auto space-y-3">
                  <div className="flex items-center justify-between border-b coding-divider pb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      HIPAA Role-Scoped Site Search ({effectiveRoleLabel.toUpperCase()})
                    </span>
                    {isSearchingSite && (
                      <span className="text-[10px] coding-text-muted">Searching...</span>
                    )}
                  </div>

                  {/* Live Patients / Members */}
                  {siteResults?.members?.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider coding-text-muted">
                        Patients / Member 360 ({siteResults.members.length})
                      </div>
                      <div className="space-y-1">
                        {siteResults.members.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              closeAll();
                              navigate(m.path);
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition hover:bg-[var(--coding-hover)]"
                          >
                            <div>
                              <span className="font-semibold coding-text-strong">{m.name}</span>
                              <span className="ml-1.5 font-mono text-[11px] coding-text-muted">({m.memberKey})</span>
                              <div className="text-[11px] coding-text-soft">PCP: {m.pcp}</div>
                            </div>
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                              {m.riskTier}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Live Contracted Providers */}
                  {siteResults?.providers?.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider coding-text-muted">
                        Contracted Providers ({siteResults.providers.length})
                      </div>
                      <div className="space-y-1">
                        {siteResults.providers.map((p) => (
                          <button
                            key={p.id || p.npi}
                            type="button"
                            onClick={() => {
                              closeAll();
                              navigate(p.path);
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition hover:bg-[var(--coding-hover)]"
                          >
                            <div>
                              <span className="font-semibold coding-text-strong">{p.name}</span>
                              <div className="text-[11px] coding-text-soft">
                                {p.specialty} &middot; NPI: {p.npi}
                              </div>
                            </div>
                            <span className="text-[10px] coding-text-muted">
                              {p.memberCount} members
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Live Clinical Tasks */}
                  {siteResults?.tasks?.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider coding-text-muted">
                        Clinical Tasks ({siteResults.tasks.length})
                      </div>
                      <div className="space-y-1">
                        {siteResults.tasks.map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => {
                              closeAll();
                              navigate(task.path);
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition hover:bg-[var(--coding-hover)]"
                          >
                            <div>
                              <div className="font-semibold coding-text-strong">{task.title}</div>
                              <div className="text-[11px] coding-text-soft">{task.memberName}</div>
                            </div>
                            <span className="rounded bg-slate-200/70 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase coding-text-muted">
                              {task.priority}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Authorized System Screens */}
                  {siteResults?.screens?.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider coding-text-muted">
                        System Modules &amp; Screens ({siteResults.screens.length})
                      </div>
                      <div className="space-y-1">
                        {siteResults.screens.map((scr) => (
                          <button
                            key={scr.id}
                            type="button"
                            onClick={() => {
                              closeAll();
                              navigate(scr.path);
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition hover:bg-[var(--coding-hover)]"
                          >
                            <div>
                              <div className="font-semibold coding-text-strong">{scr.title}</div>
                              <div className="text-[11px] coding-text-soft line-clamp-1">{scr.summary}</div>
                            </div>
                            <span className="rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ml-2">
                              {scr.badge}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Knowledge Base & User Manual Matches */}
                  {siteResults?.manuals?.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider coding-text-muted">
                        Knowledge Base &amp; User Manual ({siteResults.manuals.length})
                      </div>
                      <div className="space-y-1">
                        {siteResults.manuals.map((art) => (
                          <button
                            key={art.id}
                            type="button"
                            onClick={() => {
                              closeAll();
                              openKnowledgeBaseInNewWindow(siteQuery || art.title, 'manual');
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition hover:bg-[var(--coding-hover)]"
                          >
                            <div>
                              <div className="font-semibold coding-text-strong">{art.title}</div>
                              <div className="text-[11px] coding-text-soft line-clamp-1">{art.summary}</div>
                            </div>
                            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0 ml-2">
                              Guide ↗
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Footer CTA: Launch Full Knowledge Base & Site Search Hub in Separate Window */}
                  <div className="border-t coding-divider pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        closeAll();
                        openKnowledgeBaseInNewWindow(siteQuery);
                      }}
                      className="flex w-full items-center justify-between rounded-lg bg-sky-600 hover:bg-sky-700 px-3 py-2 text-xs font-semibold text-white transition"
                    >
                      <span>
                        {siteQuery
                          ? `Open "${siteQuery}" in Full Knowledge Base & Site Search`
                          : 'Open Full Knowledge Base & User Manual Hub'}
                      </span>
                      <span>New Window ↗</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Dedicated Knowledge Base & User Manual Button (Opens in a Separate Window) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeAll();
                openKnowledgeBaseInNewWindow(siteQuery);
              }}
              title="Open Arc-8 Knowledge Base, Site Search & User Manual in a separate window"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/40 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 shadow-xs transition cursor-pointer"
            >
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span className="hidden md:inline">Knowledge Base</span>
              <svg className="h-3 w-3 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>

            {/* Theme toggle icon */}
            <ThemeToggleButton className={iconBtn} />

            {/* Jobs */}
            {hasApplicationAccess?.('job_center') && (
              <button
                className={iconBtn}
                title="Job & Status Center"
                onClick={(e) => { e.stopPropagation(); closeAll(); navigate(ROUTES.JOBS.STATUS_CENTER); }}
              >
                <JobsIcon />
              </button>
            )}

            {/* Notifications */}
            <div className="relative">
              <button
                className={iconBtn}
                title="Notifications"
                aria-haspopup="true"
                aria-expanded={showNotif}
                onClick={(e) => { e.stopPropagation(); setShowNotif((v) => !v); setShowWaffle(false); setShowUser(false); setShowTenantMenu(false); }}
              >
                <BellIcon />
              </button>
              {showNotif && (
                <DropdownShell alignRight onClick={(e) => e.stopPropagation()}>
                  <DropdownHeader>Notifications</DropdownHeader>
                  {jobAlerts.length === 0 && (
                    <p className="px-3 py-2 text-sm coding-text-muted">
                      No alerts &mdash; you&rsquo;re all caught up!
                    </p>
                  )}
                  {jobAlerts.map((alert) => (
                    <DropdownItem key={alert.id} statusVariant={alert.status}>
                      <div>
                        <div className="text-sm font-medium">{alert.title}</div>
                        <div className="text-xs coding-text-muted">{alert.hint}</div>
                      </div>
                    </DropdownItem>
                  ))}
                  {recentEvents.length > 0 && (
                    <>
                      <div className="my-1.5 border-t coding-divider" />
                      <DropdownHeader>Recent activity</DropdownHeader>
                      {recentEvents.map((evt) => (
                        <DropdownItem key={evt.id}>
                          <div>
                            <div className="text-sm font-medium">{evt.action}</div>
                            <div className="text-xs coding-text-muted">{new Date(evt.timestamp).toLocaleString()}</div>
                          </div>
                        </DropdownItem>
                      ))}
                    </>
                  )}
                </DropdownShell>
              )}
            </div>

            {/* Role Badge */}
            <div className="hidden md:flex items-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {effectiveRoleLabel.toUpperCase()}
              </span>
            </div>

            {/* Avatar / User menu */}
            <div className="relative">
              <button
                className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-sky-600 to-sky-800 text-[13px] font-bold text-white shadow-sm transition hover:brightness-110"
                title="Account"
                aria-haspopup="true"
                aria-expanded={showUser}
                onClick={(e) => { e.stopPropagation(); setShowUser((v) => !v); setShowWaffle(false); setShowNotif(false); setShowTenantMenu(false); }}
              >
                {initials}
              </button>
              {showUser && (
                <DropdownShell alignRight onClick={(e) => e.stopPropagation()}>
                  <div className="px-3 py-2 border-b coding-divider">
                    <div className="text-xs font-bold coding-text-strong">{user?.email}</div>
                    <div className="text-[11px] text-sky-600 dark:text-sky-400 font-semibold uppercase tracking-wider">
                      {t('utility.role', 'Role')}: {effectiveRoleLabel}
                    </div>
                  </div>
                  {can('menu:role_privileges') && (
                    <DropdownItem onClick={() => { closeAll(); navigate(`${ROUTES.SETTINGS}#privileges`); }}>
                      <div className="flex items-center justify-between w-full">
                        <span className="text-sm font-medium">{t('utility.roles_privileges', 'Roles & Privileges')}</span>
                        <span className="rounded bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-300 px-1.5 py-0.2 text-[10px] font-bold uppercase">
                          Config
                        </span>
                      </div>
                    </DropdownItem>
                  )}
                  <DropdownItem onClick={() => { closeAll(); navigate(`${ROUTES.SETTINGS}#general`); }}>
                    <span className="text-sm font-medium">{t('utility.profile_preferences', 'Profile & preferences')}</span>
                  </DropdownItem>
                  <DropdownItem onClick={() => { closeAll(); openKnowledgeBaseInNewWindow(siteQuery); }}>
                    <span className="flex-1 text-sm font-medium">{t('utility.knowledge_base', 'Knowledge Base & Manual (New Window)')}</span>
                    <span className="text-xs coding-text-muted">↗</span>
                  </DropdownItem>
                  <DropdownItem onClick={() => { closeAll(); handleCommandPalette(); }}>
                    <span className="flex-1 text-sm font-medium">{t('utility.open_command_palette', 'Open command palette')}</span>
                    <span className="text-xs coding-text-muted">⌘K</span>
                  </DropdownItem>
                  <div className="my-1 border-t coding-divider" />
                  <DropdownItem onClick={() => { closeAll(); logout?.(); navigate('/login'); }}>
                    <span className="text-sm font-medium text-red-600 dark:text-red-400">{t('utility.log_out', 'Log out')}</span>
                  </DropdownItem>
                </DropdownShell>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PortalUtilityBar;
