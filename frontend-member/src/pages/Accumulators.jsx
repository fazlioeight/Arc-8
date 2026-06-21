import React, { useCallback } from 'react';

import { Card, EmptyState, ErrorState, ProgressBar, Spinner } from '../components/ui';
import useApi from '../hooks/useApi';
import * as api from '../services/memberApi';
import { useI18n } from '../i18n/I18nContext';
import { formatCurrency, formatDate } from '../utils/format';

function Meter({ label, met, max, remaining, lang, t }) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-canvas-muted">
          {formatCurrency(met, lang)} {t('accumulators.of')} {formatCurrency(max, lang)} {t('accumulators.met')}
        </span>
      </div>
      <ProgressBar value={Number(met) || 0} max={Number(max) || 0} />
      {remaining != null && (
        <p className="text-xs text-canvas-muted mt-1">{t('accumulators.remaining', { amount: formatCurrency(remaining, lang) })}</p>
      )}
    </div>
  );
}

export default function Accumulators() {
  const { t, lang } = useI18n();
  const { data, loading, error, reload } = useApi(useCallback(() => api.getAccumulators(), []));

  if (loading) return <Spinner />;
  if (error) return <ErrorState onRetry={reload} />;

  const scopes = data.scopes || [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('accumulators.title')}</h1>
      {scopes.length === 0 ? (
        <Card>
          <EmptyState message={t('accumulators.none')} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {scopes.map((s) => (
            <Card key={s.scope} title={t(`accumulators.${s.scope}`) || s.scope}>
              <Meter
                label={t('accumulators.deductible')}
                met={s.deductible_met}
                max={s.deductible}
                remaining={s.deductible_remaining}
                lang={lang}
                t={t}
              />
              <Meter
                label={t('accumulators.outOfPocket')}
                met={s.out_of_pocket_met}
                max={s.out_of_pocket_max}
                remaining={s.out_of_pocket_remaining}
                lang={lang}
                t={t}
              />
              {s.as_of_date && (
                <p className="text-xs text-canvas-muted mt-2">
                  {t('accumulators.asOf')} {formatDate(s.as_of_date, lang)}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
