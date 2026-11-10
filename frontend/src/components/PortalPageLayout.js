import React, { useContext, useMemo, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import PortalUtilityBar from './PortalUtilityBar';
import PortalSidebar from './PortalSidebar';
import PortalNav from './PortalNav';

const getRouteAccessRequirement = (pathname, hash = '') => {
  const p = (pathname || '').toLowerCase();
  const h = (hash || '').toLowerCase();
  if (p.startsWith('/member360/plan-performance')) {
    return {
      permissions: ['menu:executive_dashboards', 'sub:exec_financial'],
      mode: 'all',
      title: 'Executive Financial Access Required',
      reason: 'Commercial & Payer Plan Performance Console requires Executive Dashboards (sub:exec_financial) authority.',
    };
  }
  if (p === '/member360' || p === '/member360/' || p === '/member360landingpage') {
    return {
      permissions: ['menu:care_intelligence'],
      denyRoles: ['payer_executive'],
      title: 'Patient-Level Care Intelligence Restricted',
      reason: 'HIPAA Minimum Necessary Policy: Your role is scoped to aggregated analytics and is not permitted to access patient-level Care Intelligence.',
    };
  }
  if (p.startsWith('/member360/members')) {
    return {
      permissions: ['menu:patient_roster'],
      denyRoles: ['payer_executive'],
      title: 'Patient-Level PHI Roster & Chart Restricted',
      reason: 'HIPAA Minimum Necessary Policy: Your role is not permitted to view patient rosters or individual member clinical charts.',
    };
  }
  if (p.startsWith('/member360/tasks')) {
    return {
      permissions: ['menu:tasks'],
      denyRoles: ['payer_executive'],
      title: 'Clinical Tasks Access Restricted',
      reason: 'Your role does not have clinical task queue authority (menu:tasks).',
    };
  }
  if (p.startsWith('/member360/care-journeys')) {
    return {
      permissions: ['menu:care_journeys'],
      denyRoles: ['payer_executive'],
      title: 'Care Journeys Access Restricted',
      reason: 'Your role does not have care journey management authority (menu:care_journeys).',
    };
  }
  if (p.startsWith('/member360/risk-intelligence')) {
    return {
      permissions: ['menu:risk_intelligence'],
      denyRoles: ['payer_executive'],
      title: 'Patient Risk Intelligence Restricted',
      reason: 'Your role does not have patient-level risk intelligence authority (menu:risk_intelligence).',
    };
  }
  if (p.startsWith('/member360/care-options')) {
    return {
      permissions: ['menu:care_options'],
      denyRoles: ['payer_executive'],
      title: 'Care Options Access Restricted',
      reason: 'Your role does not have care options authority (menu:care_options).',
    };
  }
  if (p.startsWith('/member360/messages')) {
    return {
      permissions: ['menu:messages'],
      denyRoles: ['payer_executive'],
      title: 'Patient Messaging Access Restricted',
      reason: 'Your role does not have patient messaging authority (menu:messages).',
    };
  }
  if (p.startsWith('/member360/documents')) {
    return {
      permissions: ['menu:documents'],
      denyRoles: ['payer_executive'],
      title: 'Patient Documents Access Restricted',
      reason: 'HIPAA Minimum Necessary Policy: Your role does not have patient document vault authority (menu:documents).',
    };
  }
  if (p.startsWith('/coding/workbench')) {
    return {
      permissions: ['menu:coding_worklist', 'sub:coding_chases'],
      mode: 'all',
      denyRoles: ['payer_executive'],
      title: 'Suspect Workbench Access Restricted',
      reason: 'Your role does not have Suspect & Chase Workbench authority (sub:coding_chases).',
    };
  }
  if (p.startsWith('/coding')) {
    return {
      permissions: ['menu:coding_worklist', ...(h === '#workbench' ? ['sub:coding_chases'] : ['sub:coding_worklist'])],
      mode: 'all',
      denyRoles: ['payer_executive'],
      title: 'Coding Worklist Access Restricted',
      reason: 'Your role does not have HCC Coding Worklist authority (menu:coding_worklist).',
    };
  }
  if (p.startsWith('/dashboard')) {
    return {
      permissions: ['menu:executive_dashboards', 'sub:exec_hedis'],
      mode: 'all',
      title: 'HEDIS & Star Ratings Dashboard Restricted',
      reason: 'Your role does not have HEDIS & Star Ratings dashboard authority (sub:exec_hedis).',
    };
  }
  if (p.startsWith('/providers')) {
    return {
      permissions: ['menu:provider_directory'],
      title: 'Provider Directory Access Restricted',
      reason: 'Your role does not have Provider Directory authority (menu:provider_directory).',
    };
  }
  if (p.startsWith('/ride-booking')) {
    return {
      permissions: ['menu:ride_booking'],
      title: 'Ride Booking (NEMT) Access Restricted',
      reason: 'Your role does not have Ride Booking authority (menu:ride_booking).',
    };
  }
  if (p.startsWith('/admin/master')) {
    return {
      permissions: ['menu:master_admin'],
      title: 'Master Admin Console Restricted',
      reason: 'Your role does not have Master Admin authority (menu:master_admin).',
    };
  }
  return null;
};

const ALIGNMENT = {
  left: { stack: 'items-start text-left', text: 'text-left', actions: 'justify-start' },
  center: { stack: 'items-center text-center', text: 'text-center', actions: 'justify-center' },
  right: { stack: 'items-end text-right', text: 'text-right', actions: 'justify-end' },
};

const PortalPageLayout = ({
  title,
  subtitle,
  eyebrow,
  actions,
  navItems = [],
  currentNav,
  navProps = {},
  align = 'left',
  headerTone = 'default',
  backgroundClassName = '',
  maxWidthClassName = 'max-w-7xl',
  paddingClassName = 'px-6',
  headerContent = null,
  mainClassName = 'space-y-6',
  utilityBar = true,
  hideHeader = false,
  showTopNav = false, // Primary navigation now lives in the left sidebar menu
  children,
}) => {
  const auth = useContext(AuthContext);
  const location = useLocation();
  const { can, currentRole } = usePermissions();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('arc8_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('arc8_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const alignment = useMemo(() => ALIGNMENT[align] || ALIGNMENT.left, [align]);
  const { className: navClassName = '', ...restNavProps } = navProps || {};
  const isInvertedHeader = headerTone === 'inverted';
  const eyebrowClass = isInvertedHeader ? 'text-slate-300' : 'text-sky-600 dark:text-sky-400 font-semibold';
  const titleClass = isInvertedHeader
    ? 'text-2xl md:text-3xl font-bold tracking-tight text-white'
    : 'text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100';
  const subtitleClass = isInvertedHeader
    ? 'text-sm text-slate-300'
    : 'text-sm text-slate-600 dark:text-slate-400';

  const header = headerContent ?? (
    <div className={['flex flex-col gap-2', alignment.stack].join(' ')}>
      {eyebrow ? (
        <p className={['text-[11px] font-bold uppercase tracking-[0.2em]', eyebrowClass].join(' ')}>
          {eyebrow}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-4 w-full">
        <div>
          {title ? (
            <h1 className={[titleClass, alignment.text].join(' ')}>
              {title}
            </h1>
          ) : null}
          {subtitle ? (
            <p className={[subtitleClass, 'mt-1', alignment.text].join(' ')}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className={['flex flex-wrap items-center gap-2', alignment.actions].join(' ')}>
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (auth && auth.isAuthenticated === false) {
    return (
      <Navigate
        to="/login"
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
        replace
      />
    );
  }

  const routeReq = getRouteAccessRequirement(location.pathname, location.hash);
  const isRouteDenied = Boolean(
    routeReq &&
      ((routeReq.denyRoles && routeReq.denyRoles.includes(currentRole)) ||
        (routeReq.permissions &&
          (routeReq.mode === 'all'
            ? !routeReq.permissions.every((perm) => can(perm))
            : !routeReq.permissions.some((perm) => can(perm)))))
  );

  const fallbackHome =
    currentRole === 'payer_executive'
      ? '/member360/plan-performance'
      : currentRole === 'patient'
      ? '/portal'
      : can('menu:care_intelligence')
      ? '/member360'
      : can('menu:executive_dashboards') && can('sub:exec_financial')
      ? '/member360/plan-performance'
      : '/portal';

  return (
    <div className="portal-theme flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#070b14] dark:text-slate-100 font-sans antialiased">
      {/* ── Professional Left Sidebar Menu ────────────────── */}
      <PortalSidebar collapsed={collapsed} onToggle={toggleCollapsed} />

      {/* ── Main Workspace Viewport ───────────────────────── */}
      <div className="flex flex-1 flex-col h-full min-h-0 overflow-hidden bg-slate-50 dark:bg-[#0a0f1d]">
        {/* Top Utility Bar */}
        {utilityBar ? (
          <PortalUtilityBar
            onToggleSidebar={toggleCollapsed}
            sidebarCollapsed={collapsed}
          />
        ) : null}

        {/* Scrollable Content Viewport */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <div className={['mx-auto w-full py-6', maxWidthClassName, paddingClassName, 'pb-16'].join(' ')}>
            {isRouteDenied ? (
              <div className="mx-auto max-w-xl mt-8 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 p-8 text-center shadow-sm space-y-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 dark:bg-rose-950/60 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                    HIPAA RBAC Enforcement · Access Denied
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    {routeReq.title || 'Access Restricted'}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                    {routeReq.reason}
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 pt-1">
                    Active Role: {(currentRole || 'user').replace(/_/g, ' ').toUpperCase()} · Required: {(routeReq.permissions || []).join(', ')}
                  </p>
                </div>
                <div className="pt-2">
                  <Link
                    to={fallbackHome}
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition"
                  >
                    Return to Authorized Workspace →
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {!hideHeader && (
                  <header className="mb-6 space-y-4">
                    {header}
                    {showTopNav && navItems.length ? (
                      <PortalNav
                        items={navItems}
                        currentKey={currentNav}
                        className={['mt-2', navClassName].join(' ')}
                        {...restNavProps}
                      />
                    ) : null}
                  </header>
                )}

                <main className={mainClassName}>
                  {children}
                </main>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortalPageLayout;
