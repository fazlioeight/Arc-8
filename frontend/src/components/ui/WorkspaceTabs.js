import React from 'react';

const joinClassNames = (...parts) => parts.filter(Boolean).join(' ');

/**
 * HubSpot-style underline tab strip. Pure presentation — the parent owns
 * which tab is active and what content renders.
 */
export default function WorkspaceTabs({
  tabs,
  activeKey,
  onChange,
  className = '',
  ariaLabel = 'Workspace tabs',
}) {
  return (
    <nav
      className={joinClassNames(
        'relative border-b coding-border overflow-x-auto',
        className
      )}
      role="tablist"
      aria-label={ariaLabel}
    >
      <div className="flex items-center gap-1 px-1">
        {tabs.map((t) => {
          const active = t.key === activeKey;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={t.disabled}
              onClick={() => !t.disabled && onChange?.(t.key)}
              className={joinClassNames(
                'whitespace-nowrap px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition inline-flex items-center gap-1.5',
                active
                  ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                  : 'border-transparent coding-text-soft hover:coding-text-strong hover:border-slate-200 dark:hover:border-slate-700',
                t.disabled && 'opacity-60 cursor-not-allowed'
              )}
            >
              {t.icon && <span aria-hidden>{t.icon}</span>}
              <span>{t.label}</span>
              {t.badge != null && (
                <span
                  className={joinClassNames(
                    'inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded-full text-[10px] font-semibold',
                    active
                      ? 'bg-[var(--brand-primary)] text-white'
                      : 'coding-surface-subtle coding-text-soft'
                  )}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
