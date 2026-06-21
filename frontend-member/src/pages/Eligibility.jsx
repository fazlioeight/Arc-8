import React, { useCallback } from 'react';

import { Card, EmptyState, ErrorState, Spinner, StatusBadge } from '../components/ui';
import useApi from '../hooks/useApi';
import * as api from '../services/memberApi';
import { useI18n } from '../i18n/I18nContext';
import { formatDate, titleCase } from '../utils/format';

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-canvas-rule last:border-0">
      <dt className="text-sm text-canvas-muted">{label}</dt>
      <dd className="text-sm font-medium text-canvas-ink text-right">{value || '—'}</dd>
    </div>
  );
}

export default function Eligibility() {
  const { t, lang } = useI18n();
  const { data, loading, error, reload } = useApi(useCallback(() => api.getEligibility(), []));

  if (loading) return <Spinner />;
  if (error) return <ErrorState onRetry={reload} />;

  const primary = (data.coverages || [])[0];
  const statusKey = primary?.coverage_status;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('coverage.title')}</h1>

      <Card title={data.plan_name || t('coverage.plan')}>
        <dl>
          <Row label={t('coverage.lineOfBusiness')} value={data.line_of_business} />
          <Row
            label={t('coverage.status')}
            value={statusKey ? <StatusBadge status={statusKey} label={t(`coverage.${statusKey}`)} /> : '—'}
          />
          <Row label={t('coverage.effective')} value={primary ? formatDate(primary.effective_date, lang) : '—'} />
          <Row label={t('coverage.term')} value={primary?.term_date ? formatDate(primary.term_date, lang) : '—'} />
          <Row label={t('coverage.tier')} value={primary?.coverage_tier ? titleCase(primary.coverage_tier) : '—'} />
          <Row label={t('coverage.pcp')} value={data.primary_care_provider} />
          {primary?.as_of_date && (
            <Row label={t('coverage.asOf')} value={formatDate(primary.as_of_date, lang)} />
          )}
        </dl>
      </Card>

      <Card title={t('coverage.dependents')}>
        {(data.dependents || []).length === 0 ? (
          <EmptyState message={t('coverage.noDependents')} />
        ) : (
          <ul className="divide-y divide-canvas-rule">
            {data.dependents.map((d, i) => (
              <li key={i} className="py-3 flex justify-between gap-4">
                <span className="text-sm font-medium">
                  {[d.first_name, d.last_name].filter(Boolean).join(' ') || '—'}
                </span>
                <span className="text-sm text-canvas-muted">
                  {titleCase(d.relationship_type)} · {formatDate(d.date_of_birth, lang)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
