import React from 'react';

const joinClassNames = (...parts) => parts.filter(Boolean).join(' ');

/**
 * HubSpot-style saved-views tab strip. Renders a horizontal row of underline
 * tabs across an index page. The parent owns the list of views and active key.
 *
 * `views` items: { key, label }
 */
export default function SavedViewsBar({
  views = [],
  activeKey,
  onChange,
  className = '',
  ariaLabel = 'Saved views',
}) {
  return (
    <nav
      className={joinClassNames('border-b coding-border overflow-x-auto', className)}
      aria-label={ariaLabel}
    >
      <div className="flex items-center gap-1">
        {views.map((v) => {
          const active = v.key === activeKey;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => onChange?.(v.key)}
              className={joinClassNames(
                'whitespace-nowrap px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition',
                active
                  ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
                  : 'border-transparent coding-text-soft hover:coding-text-strong hover:border-slate-200 dark:hover:border-slate-700'
              )}
            >
              {v.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
