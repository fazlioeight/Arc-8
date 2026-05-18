import React, { useEffect, useRef, useState } from 'react';

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
 * Single row in a HubSpot-style property panel.
 *
 * Props:
 *   label            — caption
 *   value            — current display value (string or ReactNode)
 *   editable         — show the pencil affordance
 *   onEdit           — async (or sync) handler that receives the new string
 *                      value and commits it. Returning a rejected promise
 *                      reverts the row.
 *   editValue        — optional override of the value used to seed the input
 *                      (useful when `value` is a JSX node, not a raw string)
 *   labelWidthClass  — tailwind class controlling the label column width
 */
export function PropertyRow({
  label,
  value,
  onEdit,
  editable = false,
  editValue,
  labelWidthClass = 'w-24',
}) {
  const showEdit = editable || typeof onEdit === 'function';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const isEmpty = value == null || value === '' || value === '—';
  const canEdit = showEdit && typeof onEdit === 'function';

  const startEdit = () => {
    if (!canEdit) return;
    const seed = editValue != null
      ? editValue
      : typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : '';
    setDraft(seed);
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setError(null);
    setBusy(false);
  };

  const commitEdit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onEdit(draft);
      setEditing(false);
    } catch (err) {
      setError(err?.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  return (
    <div
      className={joinClassNames(
        'group flex items-start gap-3 px-4 py-2 transition',
        !editing && 'hover:bg-[var(--coding-hover)]'
      )}
    >
      <dt
        className={joinClassNames(
          'text-[11px] font-medium coding-text-muted shrink-0 pt-0.5',
          labelWidthClass
        )}
      >
        {label}
      </dt>
      {editing ? (
        <dd className="flex-1 min-w-0">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            disabled={busy}
            className="coding-input w-full rounded-md px-2 py-1 text-sm"
          />
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="text-[11px] coding-text-muted">
              {busy ? 'Saving…' : error ? <span className="text-rose-600 dark:text-rose-300">{error}</span> : 'Enter to save · Esc to cancel'}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={busy}
                className="rounded-md ring-1 coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)] px-2 py-0.5 text-[11px] font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commitEdit}
                disabled={busy}
                className="rounded-md bg-[var(--brand-primary)] text-white px-2 py-0.5 text-[11px] font-semibold hover:bg-brand-700 disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </div>
        </dd>
      ) : (
        <>
          <dd
            className={joinClassNames(
              'flex-1 min-w-0 text-sm coding-text-strong break-words',
              canEdit && 'cursor-text'
            )}
            onClick={canEdit ? startEdit : undefined}
          >
            {isEmpty ? <span className="coding-text-soft italic">Empty</span> : value}
          </dd>
          {showEdit && (
            <button
              type="button"
              onClick={startEdit}
              disabled={!canEdit}
              aria-label={`Edit ${label}`}
              className={joinClassNames(
                'opacity-0 group-hover:opacity-100 transition coding-text-muted hover:text-[var(--brand-primary)]',
                !canEdit && 'cursor-not-allowed'
              )}
            >
              <PencilIcon />
            </button>
          )}
        </>
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
