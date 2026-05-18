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

const seedFromValue = (value, editValue) => {
  if (editValue != null) return editValue;
  if (value == null || value === '—') return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
};

const renderEditor = ({ type, draft, setDraft, options, placeholder, busy, inputRef, onKey }) => {
  const base = 'coding-input w-full rounded-md px-2 py-1 text-sm';

  if (type === 'select') {
    return (
      <select
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        disabled={busy}
        className={base}
      >
        {(options || []).map((opt) => {
          const value = typeof opt === 'string' ? opt : opt.value;
          const label = typeof opt === 'string' ? opt : opt.label;
          return (
            <option key={value} value={value}>{label}</option>
          );
        })}
      </select>
    );
  }

  if (type === 'textarea') {
    return (
      <textarea
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        disabled={busy}
        placeholder={placeholder}
        rows={3}
        className={base}
      />
    );
  }

  const inputType = (
    type === 'email' ? 'email' :
    type === 'tel' ? 'tel' :
    type === 'number' ? 'number' :
    type === 'date' ? 'date' :
    'text'
  );

  return (
    <input
      ref={inputRef}
      type={inputType}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKey}
      disabled={busy}
      placeholder={placeholder}
      className={base}
    />
  );
};

/**
 * Single row in a HubSpot-style property panel.
 *
 * Props:
 *   label            — caption
 *   value            — current display value (string or ReactNode)
 *   editable         — show the pencil affordance even without onEdit
 *   onEdit           — async handler receiving the new value. Reject (throw)
 *                      to surface an error and keep the editor open
 *   type             — 'text' (default) | 'email' | 'tel' | 'number' |
 *                      'date' | 'select' | 'textarea'
 *   options          — array of strings or { value, label } for select
 *   placeholder      — placeholder text for the input
 *   editValue        — seed the input when value is a JSX node (otherwise we
 *                      use the stringified value)
 *   validate         — optional (draft) => string | null; non-null = error
 *   labelWidthClass  — tailwind class for the label column width
 */
export function PropertyRow({
  label,
  value,
  onEdit,
  editable = false,
  type = 'text',
  options,
  placeholder,
  editValue,
  validate,
  labelWidthClass = 'w-24',
}) {
  const canEdit = typeof onEdit === 'function';
  const showEdit = editable || canEdit;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (typeof inputRef.current.select === 'function') inputRef.current.select();
    }
  }, [editing]);

  const isEmpty = value == null || value === '' || value === '—';

  const startEdit = () => {
    if (!canEdit) return;
    setDraft(seedFromValue(value, editValue));
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
    if (typeof validate === 'function') {
      const validationError = validate(draft);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      // For number inputs, pass through as Number (or undefined for blank)
      const normalized = type === 'number'
        ? (draft === '' ? null : Number(draft))
        : draft;
      await onEdit(normalized);
      setEditing(false);
    } catch (err) {
      setError(err?.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && type !== 'textarea') {
      e.preventDefault();
      void commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === 'Enter' && type === 'textarea' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void commitEdit();
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
          {renderEditor({ type, draft, setDraft, options, placeholder, busy, inputRef, onKey: handleKey })}
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="text-[11px] coding-text-muted">
              {busy ? 'Saving…' : error ? (
                <span className="text-rose-600 dark:text-rose-300">{error}</span>
              ) : type === 'textarea' ? (
                'Ctrl+Enter to save · Esc to cancel'
              ) : (
                'Enter to save · Esc to cancel'
              )}
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
