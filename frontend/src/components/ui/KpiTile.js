import React from 'react';

const joinClassNames = (...parts) => parts.filter(Boolean).join(' ');

const TONE_CLASSES = {
  neutral: 'coding-text-strong',
  info: 'text-sky-700 dark:text-sky-300',
  success: 'text-emerald-700 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  critical: 'text-rose-600 dark:text-rose-300',
  violet: 'text-violet-700 dark:text-violet-300',
  brand: 'text-[var(--brand-primary)]',
  // Risk-tier aliases (used by RiskIntelligence)
  Critical: 'text-rose-600 dark:text-rose-300',
  High: 'text-amber-600 dark:text-amber-300',
  Moderate: 'text-sky-600 dark:text-sky-300',
  Low: 'text-emerald-600 dark:text-emerald-300',
};

/**
 * HubSpot-style stat tile. Used in KPI strips above index tables, dashboards,
 * and record detail pages.
 *
 * Props:
 *   label   — small uppercase caption
 *   value   — large number/string
 *   hint    — optional small secondary text
 *   tone    — color of the value (see TONE_CLASSES above)
 *   small   — render the value at base font size instead of 2xl
 */
export default function KpiTile({ label, value, hint, tone = 'neutral', small = false, className = '' }) {
  const valueClass = TONE_CLASSES[tone] || TONE_CLASSES.neutral;
  return (
    <div className={joinClassNames('coding-surface rounded-2xl shadow-sm p-3.5', className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] coding-text-muted">{label}</p>
      <p
        className={joinClassNames(
          'mt-1.5 font-semibold tabular-nums',
          small ? 'text-base' : 'text-2xl',
          valueClass
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] coding-text-soft">{hint}</p>}
    </div>
  );
}
