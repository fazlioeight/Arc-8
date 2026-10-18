import React from 'react';

const joinClassNames = (...parts) => parts.filter(Boolean).join(' ');

function defaultInitials(text = '?') {
  const parts = String(text).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function RecordAvatar({ initials, src, alt, className = '' }) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt || ''}
        className={joinClassNames(
          'h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-brand-200 dark:ring-brand-800/60',
          className
        )}
      />
    );
  }
  return (
    <div
      className={joinClassNames(
        'h-14 w-14 shrink-0 rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200',
        'flex items-center justify-center text-base font-semibold ring-1 ring-brand-200 dark:ring-brand-800/60',
        className
      )}
      aria-hidden
    >
      {initials || '?'}
    </div>
  );
}

/**
 * HubSpot-style record header. Generic over the entity it represents.
 *
 * Props are intentionally flexible so this can wrap members, providers, charts,
 * partners, or any other "record" surface that needs an identity strip plus a
 * row of primary actions.
 */
export default function RecordHeader({
  avatar,
  avatarInitials,
  avatarFromTitle = true,
  title,
  titleSuffix,
  meta = [],
  badges,
  link,
  actions = [],
  onAction,
  rightSlot,
  className = '',
}) {
  const resolvedAvatar = avatar ?? (
    <RecordAvatar
      initials={
        avatarInitials || (avatarFromTitle && title ? defaultInitials(title) : '?')
      }
    />
  );

  return (
    <header
      className={joinClassNames(
        'coding-surface rounded-2xl shadow-sm overflow-hidden',
        className
      )}
    >
      <div className="flex items-start gap-4 p-5">
        {resolvedAvatar}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {title && (
              <h1 className="text-xl font-semibold coding-text-strong truncate">{title}</h1>
            )}
            {titleSuffix}
            {badges}
          </div>
          {(meta.length > 0 || link) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs coding-text-muted">
              {meta.filter(Boolean).map((m, i) => (
                <React.Fragment key={`${m}-${i}`}>
                  {i > 0 && <span aria-hidden className="opacity-50">·</span>}
                  <span>{m}</span>
                </React.Fragment>
              ))}
              {link && (
                <>
                  {meta.length > 0 && <span aria-hidden className="opacity-50">·</span>}
                  {link}
                </>
              )}
            </div>
          )}
        </div>
        {rightSlot && (
          <div className="hidden lg:flex items-center gap-1.5 shrink-0">{rightSlot}</div>
        )}
      </div>

      {actions.length > 0 && (
        <div className="border-t coding-border px-3 py-2 flex flex-wrap items-center gap-1">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => (a.onClick ? a.onClick(a) : onAction?.(a.key, a))}
              disabled={a.disabled}
              className={joinClassNames(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition',
                a.primary
                  ? 'bg-[var(--brand-primary)] text-white hover:bg-brand-700'
                  : 'coding-text-strong hover:bg-[var(--coding-hover)]',
                a.disabled && 'opacity-60 cursor-not-allowed'
              )}
            >
              {a.icon && <span aria-hidden>{a.icon}</span>}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
