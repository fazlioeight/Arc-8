import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card, EmptyState, ErrorState, Pagination, Spinner, StatusBadge } from '../components/ui';
import useApi from '../hooks/useApi';
import * as api from '../services/memberApi';
import { useI18n } from '../i18n/I18nContext';
import { formatCurrency, formatDate, titleCase } from '../utils/format';

const LIMIT = 10;
const STATUSES = ['', 'paid', 'denied', 'pending'];

export default function Claims() {
  const { t, lang } = useI18n();
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState('');

  const fetcher = useCallback(
    () => api.getClaims({ limit: LIMIT, offset, ...(status ? { status } : {}) }),
    [offset, status]
  );
  const { data, loading, error, reload } = useApi(fetcher, [offset, status]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t('claims.title')}</h1>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-canvas-muted">{t('claims.status')}</span>
          <select
            className="mp-input w-auto py-1"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s ? titleCase(s) : t('claims.filterAll')}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Card>
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState onRetry={reload} />
        ) : data.items.length === 0 ? (
          <EmptyState message={t('claims.none')} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('claims.title')}</caption>
                <thead>
                  <tr className="text-left text-canvas-muted border-b border-canvas-border">
                    <th scope="col" className="py-2 pr-3 font-medium">{t('claims.date')}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t('claims.provider')}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t('claims.type')}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t('claims.status')}</th>
                    <th scope="col" className="py-2 pr-3 font-medium text-right">{t('claims.yourCost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((c) => (
                    <tr key={c.id} className="border-b border-canvas-rule last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <Link className="mp-link" to={`/claims/${c.id}`}>
                          {formatDate(c.service_date, lang)}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">{c.provider || '—'}</td>
                      <td className="py-2 pr-3">{titleCase(c.category)}</td>
                      <td className="py-2 pr-3">
                        <StatusBadge status={c.status} label={titleCase(c.status)} />
                      </td>
                      <td className="py-2 pr-3 text-right font-medium">
                        {formatCurrency(c.member_responsibility, lang)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
    </div>
  );
}
