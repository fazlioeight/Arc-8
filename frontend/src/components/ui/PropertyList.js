import React from 'react';

const joinClassNames = (...parts) => parts.filter(Boolean).join(' ');

const PencilIcon = ({ className = '' }) => (
  <svg
    viewBox="0 0 24 24"
    className={joinClassNames('h-3.5 w-3.5', className)}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path
      d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Single row in a HubSpot-style property panel. The pencil icon is a visual
 * affordance only — wire `onEdit` if the parent wants click-to-edit.
 */
export function PropertyRow({
  label,
  value,
  onEdit,
  editable = false,
  labelWidthClass = 'w-24',
}) {
  const isEmpty = value == null || value === '' || value === '—';
  const showEdit = editable || typeof onEdit === 'function';
  return (
    <div className="group flex items-start gap-3 px-4 py-2 transition hover:bg-[var(--coding-hover)]">
      <dt
        className={joinClassNames(
          'text-[11px] font-medium coding-text-muted shrink-0 pt-0.5',
          labelWidthClass
        )}
      >
        {label}
      </dt>
      <dd className="flex-1 min-w-0 text-sm coding-text-strong break-words">
        {isEmpty ? <span className="coding-text-soft italic">Empty</span> : value}
      </dd>
      {showEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${label}`}
          className="opacity-0 group-hover:opacity-100 transition coding-text-muted hover:text-[var(--brand-primary)]"
        >
          <PencilIcon />
        </button>
      )}
    </div>
  );
}

/**
 * Section in a HubSpot-style property panel. Render PropertyRow children or
 * arbitrary content inside.
 */
export function PropertySection({ title, action, children, className = '' }) {
  return (
    <>
      <header className="px-4 py-2.5 border-y coding-border flex items-center justify-between first:border-t-0">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] coding-text-muted">
          {title}
        </h3>
        {action}
      </header>
      <div className={className}>{children}</div>
    </>
  );
}

/**
 * Wrapping container that pairs a title bar with stacked PropertySection /
 * PropertyRow children. Equivalent to HubSpot's "About this record" panel.
 */
export default function PropertyList({
  title = 'Properties',
  headerAction,
  children,
  className = '',
}) {
  return (
    <section
      className={joinClassNames(
        'coding-surface rounded-2xl shadow-sm overflow-hidden',
        className
      )}
    >
      <header className="px-4 py-2.5 border-b coding-border flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] coding-text-muted">
          {title}
        </h3>
        {headerAction}
      </header>
      <dl>{children}</dl>
    </section>
  );
}
