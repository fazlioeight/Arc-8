import React, { useMemo, useState } from 'react';
import PortalUtilityBar from './PortalUtilityBar';
import PortalSidebar from './PortalSidebar';
import PortalNav from './PortalNav';

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
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('nexora_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('nexora_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const alignment = useMemo(() => ALIGNMENT[align] || ALIGNMENT.left, [align]);
  const { className: navClassName = '', ...restNavProps } = navProps || {};
  const isInvertedHeader = headerTone === 'inverted';
  const eyebrowClass = isInvertedHeader ? 'text-slate-300' : 'text-sky-400 font-semibold';
  const titleClass = isInvertedHeader
    ? 'text-2xl md:text-3xl font-bold tracking-tight text-white'
    : 'text-2xl md:text-3xl font-bold tracking-tight text-slate-100';
  const subtitleClass = isInvertedHeader
    ? 'text-sm text-slate-300'
    : 'text-sm text-slate-400';

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

  return (
    <div className="portal-theme dark dark-mode flex h-screen w-screen overflow-hidden bg-[#070b14] font-sans text-slate-100 antialiased">
      {/* ── Professional Left Sidebar Menu ────────────────── */}
      <PortalSidebar collapsed={collapsed} onToggle={toggleCollapsed} />

      {/* ── Main Workspace Viewport ───────────────────────── */}
      <div className="flex flex-1 flex-col h-full overflow-hidden bg-[#0a0f1d]">
        {/* Top Utility Bar */}
        {utilityBar ? (
          <PortalUtilityBar
            onToggleSidebar={toggleCollapsed}
            sidebarCollapsed={collapsed}
          />
        ) : null}

        {/* Scrollable Content Viewport */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className={['mx-auto w-full py-6', maxWidthClassName, paddingClassName, 'pb-12'].join(' ')}>
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortalPageLayout;
