import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PortalNav from '../../../components/PortalNav';

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

const ALIGNMENT_PRESETS = {
  left: {
    stack: "items-start text-left",
    actions: "justify-start text-left",
    grid: "justify-items-start mr-auto",
  },
  center: {
    stack: "items-center text-center",
    actions: "justify-center text-center",
    grid: "justify-items-center mx-auto",
  },
  right: {
    stack: "items-end text-right",
    actions: "justify-end text-right",
    grid: "justify-items-end ml-auto",
  },
};

const DEFAULT_ALIGNMENT = "center";

const CodingPortalHeader = ({
  title,
  subtitle,
  align = DEFAULT_ALIGNMENT,
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

  const resolvedAlign = React.useMemo(() => {
    if (ALIGNMENT_PRESETS[align]) {
      return align;
    }
    console.warn(`[CodingPortalHeader] Unsupported align value "${align}". Try one of: ${Object.keys(ALIGNMENT_PRESETS).join(', ')}`);
    return DEFAULT_ALIGNMENT;
  }, [align]);

  const alignment = ALIGNMENT_PRESETS[resolvedAlign];

  const [activeGroup, setActiveGroup] = React.useState(() => matchedGroup || NAV_GROUPS[0].label);

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
  const navAlign = resolvedAlign === 'right' ? 'end' : resolvedAlign === 'center' ? 'center' : 'start';

  return (
    <section className="mb-6 rounded-3xl border border-slate-800/60 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 py-7 text-white shadow-2xl shadow-slate-950/50 ring-1 ring-slate-900/40">
      <div className={["flex flex-col gap-3", alignment.stack].join(" ")}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-sky-400/80">Coding Workspace</p>
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{title}</h1>
        {subtitle ? <p className="max-w-3xl text-sm text-slate-300">{subtitle}</p> : null}
        {(showViewChart || additionalActions) && (
          <div className={["flex flex-wrap items-center gap-2", alignment.actions].join(" ")}>
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
        <PortalNav
          items={NAV_GROUPS}
          currentKey={activeGroup}
          onSelect={(item) => setActiveGroup(item.label)}
          align={navAlign}
          size="sm"
          tone="inverted"
        />

        <div className={["grid gap-2", alignment.grid, gridLayoutClasses].join(" ")} role="group" aria-label={`${activeGroup} links`}>
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
                <span className="text-xs text-slate-300">{isActiveItem ? '>' : ''}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default CodingPortalHeader;
