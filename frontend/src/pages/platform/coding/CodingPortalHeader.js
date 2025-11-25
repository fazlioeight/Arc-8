import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const NAV_GROUPS = [
  {
    label: 'admin',
    items: [
      { label: 'Assignments', href: '/admin/coding-assignments', match: (path) => path.startsWith('/admin/coding-assignments') },
      { label: 'Dashboards', href: '/dashboard', match: (path) => path.startsWith('/dashboard') },
    ],
  },
  {
    label: 'coders',
    items: [
      { label: 'Overview', href: '/coding', match: (path) => path === '/coding' },
      { label: 'Coder platform', href: '/coding/platform', match: (path) => path.startsWith('/coding/platform') },
      { label: 'Review dashboard', href: '/coding/review-dashboard', match: (path) => path.startsWith('/coding/review-dashboard') },
      { label: 'Group dashboard', href: '/coding/group-dashboard', match: (path) => path.startsWith('/coding/group-dashboard') },
    ],
  },
  {
    label: 'members',
    items: [
      {
        label: 'Members',
        href: '/coding/members',
        match: (path) => path === '/coding/members' || path.startsWith('/coding/members/') || path.startsWith('/coding/member/'),
      },
      { label: 'Member details', href: '/coding/member-details', match: (path) => path.startsWith('/coding/member-details') },
    ],
  },
  {
    label: 'providers',
    items: [
      {
        label: 'Providers',
        href: '/coding/providers',
        match: (path) => path === '/coding/providers' || path.startsWith('/coding/providers/'),
      },
      { label: 'Provider management', href: '/coding/provider-management', match: (path) => path.startsWith('/coding/provider-management') },
    ],
  },
];

const tabClasses = (isActive) =>
  [
    "rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition",
    isActive
      ? "bg-white text-slate-900 shadow-sm ring-1 ring-white/70"
      : "bg-white/5 text-slate-200 ring-1 ring-white/10 hover:bg-white/10",
  ].join(" ");

const itemClasses = (isActive) =>
  [
    "flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition text-center",
    "mx-auto w-full",
    isActive
      ? "border-sky-400/70 bg-sky-500/20 text-white shadow-md shadow-sky-900/40"
      : "border-white/10 bg-white/5 text-slate-100 hover:border-sky-300/40 hover:bg-sky-500/10",
  ].join(" ");

const actionButton =
  "inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:border-sky-300/60 hover:bg-sky-500/20 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-slate-900";

const CodingPortalHeader = ({
  title,
  subtitle,
  align = 'center',
  additionalActions = null,
  showViewChart = false,
  onViewChart,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const matchedGroup = React.useMemo(() => {
    const group = NAV_GROUPS.find((candidate) =>
      candidate.items.some((item) =>
        item.match ? item.match(location.pathname) : location.pathname === item.href
      )
    );
    return group ? group.label : null;
  }, [location.pathname]);

  const matchedGroupRef = React.useRef(matchedGroup);

  const [activeGroup, setActiveGroup] = React.useState(() => matchedGroup || NAV_GROUPS[0].label);
  const textAlignment = 'text-center';

  React.useEffect(() => {
    if (matchedGroup !== matchedGroupRef.current) {
      matchedGroupRef.current = matchedGroup;
      if (matchedGroup) {
        setActiveGroup(matchedGroup);
      }
    }
  }, [matchedGroup]);

  const activeGroupConfig =
    NAV_GROUPS.find((group) => group.label === activeGroup) ?? NAV_GROUPS[0];

  const gridLayoutClasses = React.useMemo(() => {
    const count = activeGroupConfig.items.length;
    if (count === 1) return "grid-cols-1 max-w-xs";
    if (count === 2) return "grid-cols-1 sm:grid-cols-2 max-w-2xl";
    if (count === 3) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl";
    if (count === 4) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 max-w-6xl";
    return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl";
  }, [activeGroupConfig.items.length]);

  return (
    <section className="mb-6 rounded-3xl border border-slate-800/60 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 py-7 text-white shadow-2xl shadow-slate-950/50 ring-1 ring-slate-900/40">
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-sky-400/80">Coding Workspace</p>
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{title}</h1>
        {subtitle ? <p className="max-w-3xl text-sm text-slate-300">{subtitle}</p> : null}
        {(showViewChart || additionalActions) && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {showViewChart ? (
              <button
                type="button"
                className={actionButton}
                onClick={onViewChart}
                disabled={typeof onViewChart !== 'function'}
              >
                View chart
              </button>
            ) : null}
            {additionalActions}
          </div>
        )}
      </div>

      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-center gap-1" role="tablist" aria-label="Coding portal sections">
          {NAV_GROUPS.map((group) => {
            const isActiveTab = group.label === activeGroup;
            return (
              <button
                key={group.label}
                type="button"
                className={tabClasses(isActiveTab)}
                aria-selected={isActiveTab}
                role="tab"
                onClick={() => setActiveGroup(group.label)}
              >
                {group.label}
              </button>
            );
          })}
        </div>

        <div className={["mx-auto grid justify-items-center gap-2", gridLayoutClasses].join(" ")} role="group" aria-label={`${activeGroup} links`}>
          {activeGroupConfig.items.map((item) => {
            const isActiveItem = item.match ? item.match(location.pathname) : location.pathname === item.href;
            return (
              <button
                key={item.href}
                type="button"
                className={itemClasses(isActiveItem)}
                aria-current={isActiveItem ? 'page' : undefined}
                onClick={() => {
                  setActiveGroup(activeGroupConfig.label);
                  navigate(item.href, { state: { breadcrumb: item.label } });
                }}
              >
                <span>{item.label}</span>
                <span className="text-xs text-slate-300">{isActiveItem ? '•' : ''}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default CodingPortalHeader;
