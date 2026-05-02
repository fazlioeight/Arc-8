import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const ALIGN_CLASSES = {
  start: 'justify-start text-left',
  center: 'justify-center text-center',
  end: 'justify-end text-right',
};

const SIZE_CLASSES = {
  sm: 'text-[11px] px-3 py-1.5',
  md: 'text-xs px-3.5 py-2',
};

const TONE_STYLES = {
  surface: {
    container: 'rounded-2xl px-2 py-2 shadow-sm coding-surface backdrop-blur',
    active: 'border-sky-400/60 bg-sky-500/10 coding-text-strong shadow-sm dark:border-sky-400/40 dark:bg-sky-500/15',
    inactive: 'border-transparent coding-text-soft hover:border-[var(--coding-border)] hover:bg-[var(--coding-hover)]',
  },
  inverted: {
    container: 'rounded-2xl border border-white/12 bg-white/10 px-2 py-2 shadow-sm backdrop-blur text-white',
    active: 'border-white/70 bg-white text-slate-900 shadow-sm',
    inactive: 'border-white/10 text-white/80 hover:border-white/30 hover:bg-white/10',
  },
};

const PortalNav = ({
  items = [],
  currentKey,
  onSelect,
  align = 'start',
  size = 'md',
  tone = 'surface',
  className = '',
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const normalized = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        key: item.key || item.href || item.label,
      })),
    [items]
  );

  const activeKey = useMemo(() => {
    if (currentKey) return currentKey;
    const matched = normalized.find((item) => {
      if (typeof item.match === 'function') {
        return item.match(location.pathname);
      }
      if (item.href) {
        return location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
      }
      return false;
    });
    return matched ? matched.key : normalized[0]?.key;
  }, [currentKey, location.pathname, normalized]);

  const alignment = ALIGN_CLASSES[align] || ALIGN_CLASSES.start;
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const toneStyles = TONE_STYLES[tone] || TONE_STYLES.surface;
  const focusClasses =
    tone === 'inverted'
      ? 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-0'
      : 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900';

  const handleClick = (item, event) => {
    if (item.disabled) return;
    if (typeof item.onClick === 'function') {
      item.onClick(item, event);
    }
    if (typeof onSelect === 'function') {
      onSelect(item, event);
    }
    if (event?.defaultPrevented) return;
    if (item.href) {
      navigate(item.href);
    }
  };

  return (
    <nav
      className={[
        'flex flex-wrap items-center gap-2',
        toneStyles.container,
        alignment,
        className,
      ].join(' ')}
      aria-label="Portal navigation"
      role="tablist"
    >
      {normalized.map((item) => {
        const isActive = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={Boolean(item.disabled)}
            onClick={(event) => handleClick(item, event)}
            className={[
              'inline-flex items-center gap-2 rounded-xl border text-sm font-semibold transition',
              focusClasses,
              sizeClass,
              isActive ? toneStyles.active : toneStyles.inactive,
              item.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            ].join(' ')}
          >
            {item.icon ? <span className="text-base">{item.icon}</span> : null}
            <span>{item.label}</span>
            {item.badge ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700">
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
};

export default PortalNav;
