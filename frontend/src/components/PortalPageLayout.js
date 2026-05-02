import React, { useMemo } from 'react';
import PortalUtilityBar from './PortalUtilityBar';
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
  maxWidthClassName = 'max-w-6xl',
  paddingClassName = 'px-4',
  headerContent = null,
  mainClassName = 'space-y-6',
  utilityBar = true,
  children,
}) => {
  const alignment = useMemo(() => ALIGNMENT[align] || ALIGNMENT.left, [align]);
  const { className: navClassName = '', ...restNavProps } = navProps || {};
  const isInvertedHeader = headerTone === 'inverted';
  const eyebrowClass = isInvertedHeader ? 'text-slate-200' : 'coding-text-muted';
  const titleClass = isInvertedHeader
    ? 'text-3xl font-semibold leading-tight text-white'
    : 'text-3xl font-semibold leading-tight coding-text-strong';
  const subtitleClass = isInvertedHeader
    ? 'text-base text-slate-200'
    : 'text-base coding-text-soft';

  const header = headerContent ?? (
    <div className={['flex flex-col gap-3', alignment.stack].join(' ')}>
      {eyebrow ? (
        <p className={['text-[11px] font-semibold uppercase tracking-[0.28em]', eyebrowClass].join(' ')}>
          {eyebrow}
        </p>
      ) : null}
      {title ? (
        <h1 className={[titleClass, alignment.text].join(' ')}>
          {title}
        </h1>
      ) : null}
      {subtitle ? (
        <p className={[subtitleClass, alignment.text].join(' ')}>
          {subtitle}
        </p>
      ) : null}
      {actions ? (
        <div className={['flex flex-wrap items-center gap-2', alignment.actions].join(' ')}>
          {actions}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className={['coding-member-workspace portal-theme min-h-screen', backgroundClassName].filter(Boolean).join(' ')}>
      {utilityBar ? <PortalUtilityBar /> : null}
      <div className={['mx-auto w-full', maxWidthClassName, paddingClassName, 'pb-10'].join(' ')}>
        <header className="pt-6 space-y-4">
          {header}
          {navItems.length ? (
            <PortalNav
              items={navItems}
              currentKey={currentNav}
              className={['mt-1', navClassName].join(' ')}
              {...restNavProps}
            />
          ) : null}
        </header>
        <main className={['pt-6', mainClassName].join(' ')}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default PortalPageLayout;
