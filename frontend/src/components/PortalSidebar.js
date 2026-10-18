import React, { useContext, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { ROUTES } from '../constants/routes';

/* ─── SVG Icons ────────────────────────────────────────────────────────── */
const SvgPulse = () => (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const SvgUsers = () => (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const SvgTasks = () => (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

const SvgJourney = () => (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
  </svg>
);

const SvgRisk = () => (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const SvgCareOptions = () => (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
  </svg>
);

const SvgMessages = () => (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const SvgDocs = () => (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const SvgCoding = () => (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
  </svg>
);

const SvgDashboard = () => (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-4a1 1 0 011-1h4a1 1 0 011 1v8a1 1 0 01-1 1h-4a1 1 0 01-1-1v-8z" />
  </svg>
);

const SvgProviders = () => (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);

const SvgTransport = () => (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
  </svg>
);

const SvgChat = () => (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const SvgPrivileges = () => (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const SvgAdmin = () => (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
  </svg>
);

const SvgSettings = () => (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const DEMO_PERSONAS = [
  { email: 'dr.chen@prominencehealth.com', name: 'Dr. Sarah Chen', role: 'clinician', title: 'Physician (MD/DO)', color: 'from-sky-500 to-indigo-600' },
  { email: 'admin@admin.com', name: 'Alexander Cross', role: 'admin', title: 'Platform Admin', color: 'from-indigo-600 to-purple-600' },
  { email: 'elena.nurse@prominencehealth.com', name: 'Elena Rostova, RN', role: 'nurse', title: 'Care Coordinator', color: 'from-emerald-500 to-teal-700' },
  { email: 'marcus.coder@prominencehealth.com', name: 'Marcus Vance, CPC', role: 'coder', title: 'Risk Adjustment Coder', color: 'from-purple-500 to-pink-600' },
  { email: 'rachel.billing@prominencehealth.com', name: 'Rachel Adams', role: 'billing', title: 'Capitation Specialist', color: 'from-blue-600 to-cyan-600' },
  { email: 'james.member@prominencehealth.com', name: 'James Wilson', role: 'patient', title: 'Member / Patient', color: 'from-teal-500 to-emerald-600' },
];

export default function PortalSidebar({ collapsed = false, onToggle }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, tenant, tenantInfo, logout, login } = useContext(AuthContext) || {};
  const { activeRoleConfig, can } = usePermissions();
  const [showPersonaModal, setShowPersonaModal] = useState(false);

  const currentPath = location.pathname;
  const currentHash = location.hash;

  const memberMatch = location.pathname.match(/\/member360\/members\/(\d+)/);
  const activeMemberId = memberMatch ? memberMatch[1] : '48';

  const [expandedMenuKeys, setExpandedMenuKeys] = useState({
    [ROUTES.MEMBER360_LAB.MEMBERS]: true,
    [ROUTES.SETTINGS]: false,
  });

  const toggleExpand = (href, e) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedMenuKeys((prev) => ({
      ...prev,
      [href]: !prev[href],
    }));
  };

  const isActive = (href, matchExact = false) => {
    if (href.includes('#')) {
      const [pathPart, hashPart] = href.split('#');
      return currentPath === pathPart && currentHash === `#${hashPart}`;
    }
    if (matchExact) return currentPath === href;
    return currentPath === href || currentPath.startsWith(`${href}/`);
  };

  const isSubActive = (href, exact = false) => {
    if (href.includes('?')) {
      const [pathPart, queryPart] = href.split('?');
      const params = new URLSearchParams(queryPart);
      const tabParam = params.get('tab');
      const isPathMatch = currentPath === pathPart || currentPath.startsWith(`${pathPart}/`);
      return isPathMatch && (location.search.includes(`tab=${tabParam}`) || (!location.search && tabParam === 'timeline'));
    }
    if (href.includes('#')) {
      const [pathPart, hashPart] = href.split('#');
      return currentPath === pathPart && currentHash === `#${hashPart}`;
    }
    if (exact) return currentPath === href;
    return currentPath === href || currentPath.startsWith(`${href}/`);
  };

  const handleSwitchPersona = async (persona) => {
    try {
      setShowPersonaModal(false);
      const apiBase = process.env.REACT_APP_API_BASE
        ? process.env.REACT_APP_API_BASE.replace(/\/$/, '')
        : (typeof window !== 'undefined' && window.location.port === '3000' ? 'http://localhost:8989' : '');
      const tenantKey = tenant || 'prominencehealth';
      const res = await fetch(`${apiBase}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Key': tenantKey,
        },
        body: JSON.stringify({
          email: persona.email,
          password: 'admin',
          tenant: tenantKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Authentication failed');
      if (typeof login === 'function') {
        login(data);
      }
      setTimeout(() => {
        navigate(ROUTES.MEMBER360_LAB.DASHBOARD);
      }, 50);
    } catch (e) {
      console.error('Failed to switch persona via real auth', e);
      navigate('/login');
    }
  };

  const navGroups = [
    {
      title: 'Clinical Operations',
      items: [
        { label: 'Care Intelligence', href: ROUTES.MEMBER360_LAB.DASHBOARD, icon: SvgPulse, exact: true, permission: 'menu:care_intelligence' },
        {
          label: 'Patient Roster',
          href: ROUTES.MEMBER360_LAB.MEMBERS,
          icon: SvgUsers,
          badge: '50',
          permission: 'menu:patient_roster',
          subItems: [
            { label: 'All Patients Roster', href: ROUTES.MEMBER360_LAB.MEMBERS, exact: true },
            { label: 'Timeline', href: `/member360/members/${activeMemberId}?tab=timeline`, permission: 'tab:timeline' },
            { label: 'Clinical Notes', href: `/member360/members/${activeMemberId}?tab=notes`, permission: 'tab:notes' },
            { label: 'Care Journey', href: `/member360/members/${activeMemberId}?tab=care_journey`, permission: 'tab:care_journey' },
            { label: 'Clinical & Gaps', href: `/member360/members/${activeMemberId}?tab=clinical_gaps`, permission: 'tab:clinical_gaps' },
            { label: 'Medications & Labs', href: `/member360/members/${activeMemberId}?tab=medications_labs`, permission: 'tab:medications_labs' },
            { label: 'Claims & Benefits', href: `/member360/members/${activeMemberId}?tab=claims_benefits`, permission: 'tab:claims_benefits' },
            { label: 'Patient Documents', href: `/member360/members/${activeMemberId}?tab=documents`, permission: 'tab:documents' },
            { label: 'Audit Log', href: `/member360/members/${activeMemberId}?tab=audit_log`, permission: 'tab:audit_log', supervisorOnly: true },
            { label: 'Member Settings', href: `/member360/members/${activeMemberId}?tab=settings`, permission: 'tab:settings', supervisorOnly: true },
          ],
        },
        { label: 'Clinical Tasks', href: ROUTES.MEMBER360_LAB.TASKS, icon: SvgTasks, badge: '36', badgeTone: 'critical', permission: 'menu:tasks' },
        { label: 'Care Journeys', href: ROUTES.MEMBER360_LAB.CARE_JOURNEYS, icon: SvgJourney, badge: '18', permission: 'menu:care_journeys' },
        { label: 'Risk Intelligence', href: ROUTES.MEMBER360_LAB.RISK_INTELLIGENCE, icon: SvgRisk, permission: 'menu:risk_intelligence' },
        { label: 'Care Options', href: ROUTES.MEMBER360_LAB.CARE_OPTIONS, icon: SvgCareOptions, permission: 'menu:care_options' },
        { label: 'Messages', href: ROUTES.MEMBER360_LAB.MESSAGES, icon: SvgMessages, permission: 'menu:messages' },
        { label: 'Documents', href: ROUTES.MEMBER360_LAB.DOCUMENTS, icon: SvgDocs, permission: 'menu:documents' },
      ],
    },
    {
      title: 'Value-Based Care & Ops',
      items: [
        {
          label: 'Coding Worklist',
          href: ROUTES.CODING.WORKLIST,
          icon: SvgCoding,
          badge: 'v28',
          permission: 'menu:coding_worklist',
          subItems: [
            { label: 'Worklist Queue', href: ROUTES.CODING.WORKLIST, exact: true, permission: 'sub:coding_worklist' },
            { label: 'Suspect Workbench', href: `${ROUTES.CODING.WORKLIST}#workbench`, permission: 'sub:coding_chases' },
          ],
        },
        {
          label: 'Executive Dashboards',
          href: ROUTES.DASHBOARD,
          icon: SvgDashboard,
          permission: 'menu:executive_dashboards',
          subItems: [
            { label: 'PMPM Financials', href: `${ROUTES.DASHBOARD}#pmpm`, permission: 'sub:exec_financial' },
            { label: 'Quality & Star Ratings', href: `${ROUTES.DASHBOARD}#hedis`, permission: 'sub:exec_hedis' },
          ],
        },
        { label: 'Provider Directory', href: ROUTES.PROVIDERS.LANDING, icon: SvgProviders, permission: 'menu:provider_directory' },
        { label: 'Ride Booking (NEMT)', href: ROUTES.RIDE_BOOKING, icon: SvgTransport, permission: 'menu:ride_booking' },
        { label: 'Nexora AI Chat', href: ROUTES.CHAT, icon: SvgChat, permission: 'menu:ai_chat' },
      ],
    },
    {
      title: 'Governance & Admin',
      items: [
        { label: 'Role & Privileges', href: `${ROUTES.SETTINGS}#privileges`, icon: SvgPrivileges, badge: 'HIPAA', badgeTone: 'success', permission: 'menu:role_privileges' },
        { label: 'Master Admin', href: ROUTES.ADMIN.MASTER, icon: SvgAdmin, permission: 'menu:master_admin' },
        {
          label: 'Platform Settings',
          href: ROUTES.SETTINGS,
          icon: SvgSettings,
          exact: true,
          permission: 'menu:platform_settings',
          subItems: [
            { label: 'General Profile', href: `${ROUTES.SETTINGS}#general`, permission: 'sub:settings_general' },
            { label: 'Security & HIPAA', href: `${ROUTES.SETTINGS}#audit`, permission: 'sub:settings_security' },
            { label: 'FHIR Integrations', href: `${ROUTES.SETTINGS}#integrations`, permission: 'sub:settings_integrations' },
          ],
        },
      ],
    },
  ];

  // Dynamic role-based filtering: hide modules and sub-menus that current role is not authorized to see
  const filteredNavGroups = navGroups
    .map((g) => ({
      ...g,
      items: g.items
        .filter((item) => !item.permission || can(item.permission))
        .map((item) => ({
          ...item,
          subItems: item.subItems
            ? item.subItems.filter((sub) => !sub.permission || can(sub.permission))
            : undefined,
        })),
    }))
    .filter((g) => g.items.length > 0);

  const currentPersona = DEMO_PERSONAS.find((p) => p.email === user?.email) || {
    name: user?.email ? user.email.split('@')[0] : 'Dr. Sarah Chen',
    role: role || 'clinician',
    title: activeRoleConfig?.label || 'Clinical Staff',
    color: 'from-sky-500 to-indigo-600',
  };

  return (
    <aside
      className={[
        'flex flex-col h-full bg-[#0a0f1d] border-r border-slate-800/80 select-none z-30 transition-all duration-300',
        collapsed ? 'w-20' : 'w-64',
      ].join(' ')}
    >
      {/* ── Brand Header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800/70">
        <Link to={ROUTES.MEMBER360_LAB.DASHBOARD} className="flex items-center gap-3 overflow-hidden">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 text-white font-black text-sm tracking-wider">
            NL
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                NEXORA <span className="text-[10px] font-semibold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-400/20">OS</span>
              </span>
              <span className="text-[11px] text-slate-400 truncate">
                {tenantInfo?.name || tenant || 'Prominence Health'}
              </span>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? 'Expand menu' : 'Collapse menu'}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition"
        >
          <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
            {collapsed ? (
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
            ) : (
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            )}
          </svg>
        </button>
      </div>

      {/* ── Organization / Security strip ────────────────────────── */}
      {!collapsed && (
        <div className="px-4 py-2 bg-slate-900/60 border-b border-slate-800/40 flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            HIPAA Compliant
          </span>
          <span className="text-slate-500 font-mono text-[10px]">SOC-2 TYPE II</span>
        </div>
      )}

      {/* ── Navigation List ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 no-scrollbar">
        {filteredNavGroups.map((group, gIdx) => (
          <div key={gIdx} className="space-y-1">
            {!collapsed ? (
              <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400/80">
                {group.title}
              </div>
            ) : (
              <div className="h-px bg-slate-800/60 my-2 mx-2" />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href, item.exact);
                const IconComponent = item.icon;
                const hasSubs = item.subItems && item.subItems.length > 0;
                const isExpanded = !!expandedMenuKeys[item.href];

                return (
                  <div key={item.href} className="space-y-0.5">
                    <div
                      className={[
                        'group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all relative',
                        active
                          ? 'bg-sky-500/15 text-sky-300 font-semibold shadow-sm shadow-sky-500/5'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/50',
                        collapsed ? 'justify-center px-0' : '',
                      ].join(' ')}
                    >
                      {active && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-sky-400 shadow-sm shadow-sky-400" />
                      )}
                      <Link
                        to={item.href}
                        title={collapsed ? item.label : undefined}
                        className="flex items-center gap-3 flex-1 min-w-0"
                      >
                        <span
                          className={[
                            'transition-colors',
                            active ? 'text-sky-400' : 'text-slate-400 group-hover:text-slate-200',
                          ].join(' ')}
                        >
                          <IconComponent />
                        </span>
                        {!collapsed && (
                          <span className="flex-1 truncate tracking-tight">{item.label}</span>
                        )}
                      </Link>

                      {!collapsed && item.badge && (
                        <span
                          className={[
                            'text-[10px] px-1.5 py-0.2 rounded-full font-semibold tabular-nums shrink-0',
                            item.badgeTone === 'critical'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : item.badgeTone === 'success'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-300 border border-slate-700/60',
                          ].join(' ')}
                        >
                          {item.badge}
                        </span>
                      )}

                      {!collapsed && hasSubs && (
                        <button
                          type="button"
                          onClick={(e) => toggleExpand(item.href, e)}
                          title={isExpanded ? 'Collapse sub-menus' : 'Expand sub-menus'}
                          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700/50 transition shrink-0"
                        >
                          <svg
                            className={`h-3 w-3 transition-transform duration-200 ${
                              isExpanded ? 'rotate-90 text-sky-400' : ''
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Sub-Items Tree */}
                    {!collapsed && hasSubs && isExpanded && (
                      <div className="ml-5 pl-2.5 border-l border-slate-800/80 my-1 space-y-0.5 animate-fadeIn">
                        {item.subItems.map((sub) => {
                          const subActive = isSubActive(sub.href, sub.exact);
                          return (
                            <Link
                              key={sub.href}
                              to={sub.href}
                              className={[
                                'flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] transition-all',
                                subActive
                                  ? 'bg-sky-500/15 text-sky-300 font-semibold shadow-xs'
                                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40',
                              ].join(' ')}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span
                                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                    subActive ? 'bg-sky-400 ring-2 ring-sky-400/30' : 'bg-slate-600'
                                  }`}
                                />
                                <span className="truncate">{sub.label}</span>
                              </div>
                              {sub.supervisorOnly && (
                                <span className="text-[9px] font-bold text-amber-400/90 bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/20 shrink-0">
                                  Admin
                                </span>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Active User / Persona Footer ─────────────────────────── */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-900/40">
        {!collapsed ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl bg-slate-800/40 border border-slate-800/80">
              <div
                className={`h-8 w-8 shrink-0 rounded-full bg-gradient-to-tr ${currentPersona.color} flex items-center justify-center text-xs font-bold text-white shadow-sm`}
              >
                {currentPersona.name
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white truncate">{currentPersona.name}</div>
                <div className="text-[10px] text-sky-400 font-medium truncate flex items-center gap-1">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" />
                  {currentPersona.title}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setShowPersonaModal(true)}
                className="flex-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/20 hover:bg-sky-500/20 transition text-center"
              >
                Switch Role ▾
              </button>
              <button
                type="button"
                onClick={() => {
                  logout?.();
                  navigate('/login');
                }}
                title="Log out"
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPersonaModal(true)}
              title={`Switch from ${currentPersona.name}`}
              className={`h-9 w-9 rounded-full bg-gradient-to-tr ${currentPersona.color} flex items-center justify-center text-xs font-bold text-white shadow-sm ring-2 ring-sky-500/30 hover:scale-105 transition`}
            >
              {currentPersona.name
                .split(' ')
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </button>
          </div>
        )}
      </div>

      {/* ── Quick Persona Switcher Modal ─────────────────────────── */}
      {showPersonaModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowPersonaModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Switch Clinical Persona</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select a persona to immediately preview role-specific clinical permissions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPersonaModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 max-h-[60vh] overflow-y-auto">
              {DEMO_PERSONAS.map((p) => {
                const isSelected = p.email === user?.email;
                return (
                  <button
                    key={p.email}
                    type="button"
                    onClick={() => handleSwitchPersona(p)}
                    className={[
                      'flex items-center gap-3 p-3 rounded-xl border text-left transition',
                      isSelected
                        ? 'border-sky-500/60 bg-sky-500/10 ring-1 ring-sky-500/30'
                        : 'border-slate-800 bg-slate-800/40 hover:bg-slate-800 hover:border-slate-700',
                    ].join(' ')}
                  >
                    <div
                      className={`h-9 w-9 shrink-0 rounded-full bg-gradient-to-tr ${p.color} flex items-center justify-center text-xs font-bold text-white shadow-sm`}
                    >
                      {p.name
                        .split(' ')
                        .map((w) => w[0])
                        .join('')
                        .slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white truncate">{p.name}</span>
                        {isSelected && (
                          <span className="text-[10px] text-sky-400 font-bold uppercase tracking-wider">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">{p.title}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPersonaModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
