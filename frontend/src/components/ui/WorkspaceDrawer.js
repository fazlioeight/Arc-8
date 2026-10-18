import React, { useEffect } from 'react';

const joinClassNames = (...parts) => parts.filter(Boolean).join(' ');

/**
 * HubSpot-style right-side drawer. Used for "create" and "edit" workflows that
 * shouldn't take the user away from the underlying record. Locks body scroll
 * and closes on Escape.
 */
export default function WorkspaceDrawer({
  title,
  subtitle,
  onClose,
  width = 'md',
  children,
  footer,
  className = '',
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const widthClass = {
    sm: 'sm:w-[360px]',
    md: 'sm:w-[480px]',
    lg: 'sm:w-[640px]',
    xl: 'sm:w-[800px]',
  }[width] || 'sm:w-[480px]';

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-slate-900/40 dark:bg-black/60"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        className={joinClassNames(
          'absolute inset-y-0 right-0 w-full coding-surface shadow-xl flex flex-col',
          widthClass,
          'animate-[slideInRight_var(--dur-med)_var(--easing-standard)]',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b coding-border">
          <div>
            {title && <h3 className="text-base font-semibold coding-text-strong">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs coding-text-soft">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 coding-text-muted hover:bg-[var(--coding-hover)] hover:coding-text-strong transition"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">{children}</div>
        {footer && (
          <footer className="px-5 py-3 border-t coding-border flex items-center justify-end gap-2">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}
