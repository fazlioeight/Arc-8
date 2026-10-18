import React, { useEffect, useRef, useState } from 'react';

const joinClassNames = (...parts) => parts.filter(Boolean).join(' ');

const ChevronDown = () => (
  <svg viewBox="0 0 24 24" className="h-3 w-3 opacity-60" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * HubSpot-style filter chip with a popover. Generic — caller renders whatever
 * controls (checkboxes, radios, date pickers) inside the dropdown.
 *
 * Pass `count` to show a brand-colored badge when filters are active. Pass
 * `display` to show a short summary in the chip label (e.g. "· Open").
 */
export default function FilterDropdown({
  label,
  count = 0,
  display,
  align = 'start',
  className = '',
  buttonClassName = '',
  children,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = count > 0;
  const alignClass = align === 'end' ? 'right-0' : 'left-0';

  return (
    <div className={joinClassNames('relative', className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={joinClassNames(
          'inline-flex items-center gap-1.5 rounded-md ring-1 px-2.5 py-1.5 text-xs font-medium transition',
          active
            ? 'ring-[var(--brand-primary)] text-[var(--brand-primary)] bg-brand-50 dark:bg-brand-900/20'
            : 'coding-border coding-text-strong bg-transparent hover:bg-[var(--coding-hover)]',
          buttonClassName
        )}
      >
        <span>{label}</span>
        {display && <span className="coding-text-muted">· {display}</span>}
        {count > 0 && !display && (
          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded-full bg-[var(--brand-primary)] text-white text-[10px]">
            {count}
          </span>
        )}
        <ChevronDown />
      </button>
      {open && (
        <div
          className={joinClassNames(
            'absolute top-full z-10 mt-1 min-w-[200px] coding-surface rounded-md shadow-md ring-1 coding-border p-1.5',
            alignClass
          )}
          role="menu"
        >
          {typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}
        </div>
      )}
    </div>
  );
}
