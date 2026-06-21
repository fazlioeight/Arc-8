import React, { useCallback } from 'react';
import { Link } from 'react-router-dom';

import { Card, EmptyState, ErrorState, ProgressBar, Spinner, StatusBadge } from '../components/ui';
import useApi from '../hooks/useApi';
import * as api from '../services/memberApi';
import { useAuth } from '../context/MemberAuthContext';
import { useI18n } from '../i18n/I18nContext';
import { formatCurrency, formatDate, titleCase } from '../utils/format';

export default function Dashboard() {
  const { t, lang } = useI18n();
  const { email } = useAuth();

  const fetcher = useCallback(
    () =>
      Promise.allSettled([
        api.getEligibility(),
        api.getClaims({ limit: 3, offset: 0 }),
        api.getAccumulators(),
      ]).then(([elig, claims, acc]) => ({
        eligibility: elig.status === 'fulfilled' ? elig.value : null,
        claims: claims.status === 'fulfilled' ? claims.value : null,
        accumulators: acc.status === 'fulfilled' ? acc.value : null,
      })),
    []
  );
  const { data, loading, error, reload } = useApi(fetcher);

  if (loading) return <Spinner />;
  if (error) return <ErrorState onRetry={reload} />;

  const coverage = (data.eligibility?.coverages || [])[0];
  const individual = (data.accumulators?.scopes || []).find((s) => s.scope === 'individual') ||
    (data.accumulators?.scopes || [])[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t('dashboard.welcome')}</h1>
        <p className="text-sm text-canvas-muted">{email}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card
          title={t('nav.coverage')}
          action={<Link className="mp-link text-sm" to="/coverage">{t('dashboard.viewCoverage')}</Link>}
        >
          {data.eligibility ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-canvas-muted">{data.eligibility.plan_name || t('coverage.plan')}</dt>
                <dd>{coverage ? <StatusBadge status={coverage.coverage_status} label={t(`coverage.${coverage.coverage_status}`)} /> : null}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-canvas-muted">{t('coverage.lineOfBusiness')}</dt>
                <dd className="font-medium">{data.eligibility.line_of_business || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-canvas-muted">{t('coverage.pcp')}</dt>
                <dd className="font-medium">{data.eligibility.primary_care_provider || '—'}</dd>
              </div>
            </dl>
          ) : (
            <EmptyState message={t('common.error')} />
          )}
        </Card>

        <Card
          title={t('dashboard.spending')}
          action={<Link className="mp-link text-sm" to="/spending">{t('dashboard.viewAll')}</Link>}
        >
          {individual ? (
            <div className="space-y-3 text-sm">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-canvas-muted">{t('accumulators.deductible')}</span>
                  <span>{formatCurrency(individual.deductible_met, lang)} / {formatCurrency(individual.deductible, lang)}</span>
                </div>
                <ProgressBar value={Number(individual.deductible_met) || 0} max={Number(individual.deductible) || 0} />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-canvas-muted">{t('accumulators.outOfPocket')}</span>
                  <span>{formatCurrency(individual.out_of_pocket_met, lang)} / {formatCurrency(individual.out_of_pocket_max, lang)}</span>
                </div>
                <ProgressBar value={Number(individual.out_of_pocket_met) || 0} max={Number(individual.out_of_pocket_max) || 0} />
              </div>
            </div>
          ) : (
            <EmptyState message={t('accumulators.none')} />
          )}
        </Card>

        <Card
          title={t('dashboard.recentClaims')}
          action={<Link className="mp-link text-sm" to="/claims">{t('dashboard.viewAll')}</Link>}
        >
          {data.claims?.items?.length ? (
            <ul className="divide-y divide-canvas-rule text-sm">
              {data.claims.items.map((c) => (
                <li key={c.id} className="py-2 flex justify-between gap-2">
                  <Link className="mp-link" to={`/claims/${c.id}`}>
                    {formatDate(c.service_date, lang)}
                  </Link>
                  <span className="text-canvas-muted truncate">{c.provider || titleCase(c.category)}</span>
                  <span className="font-medium whitespace-nowrap">{formatCurrency(c.member_responsibility, lang)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message={t('claims.none')} />
          )}
        </Card>
      </div>
    </div>
  );
}
