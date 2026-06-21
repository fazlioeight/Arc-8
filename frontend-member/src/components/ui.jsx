import React from 'react';

import { useI18n } from '../i18n/I18nContext';

export function Card({ title, action, children, className = '' }) {
  return (
    <section className={`mp-card p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h2 className="text-base font-semibold text-canvas-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Spinner({ label }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 text-canvas-muted py-8 justify-center" role="status" aria-live="polite">
      <span
        className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"
        aria-hidden="true"
      />
      <span>{label || t('common.loading')}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  const { t } = useI18n();
  return (
    <div className="text-center py-8" role="alert">
      <p className="text-canvas-ink mb-3">{message || t('common.error')}</p>
      {onRetry && (
        <button type="button" className="mp-btn-secondary" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message }) {
  return <p className="text-canvas-muted text-sm py-6 text-center">{message}</p>;
}

const STATUS_STYLES = {
  active: 'bg-green-100 text-green-800',
  paid: 'bg-green-100 text-green-800',
  in_network: 'bg-green-100 text-green-800',
  pending: 'bg-amber-100 text-amber-800',
  denied: 'bg-red-100 text-red-800',
  termed: 'bg-red-100 text-red-800',
  inactive: 'bg-gray-200 text-gray-700',
};

export function StatusBadge({ status, label }) {
  const cls = STATUS_STYLES[status] || 'bg-gray-100 text-gray-700';
  return <span className={`mp-badge ${cls}`}>{label || status}</span>;
}

export function Field({ id, label, error, hint, children }) {
  return (
    <div className="mb-4">
      <label className="mp-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-canvas-muted mt-1">{hint}</p>}
      {error && (
        <p className="text-xs text-red-600 mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Alert({ kind = 'info', children }) {
  const styles = {
    info: 'bg-brand-50 text-brand-800 border-brand-200',
    success: 'bg-green-50 text-green-800 border-green-200',
    error: 'bg-red-50 text-red-800 border-red-200',
  };
  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${styles[kind]}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Pagination({ total, limit, offset, onChange }) {
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between mt-4" aria-label="Pagination">
      <button
        type="button"
        className="mp-btn-secondary"
        disabled={page <= 1}
        onClick={() => onChange(Math.max(0, offset - limit))}
      >
        ‹
      </button>
      <span className="text-sm text-canvas-muted">
        {page} / {pages}
      </span>
      <button
        type="button"
        className="mp-btn-secondary"
        disabled={page >= pages}
        onClick={() => onChange(offset + limit)}
      >
        ›
      </button>
    </nav>
  );
}

export function ProgressBar({ value, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="h-2 w-full rounded-full bg-canvas-border overflow-hidden"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full bg-brand-600" style={{ width: `${pct}%` }} />
    </div>
  );
}
