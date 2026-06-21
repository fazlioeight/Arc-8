import React, { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Alert, Card, ErrorState, Spinner, StatusBadge } from '../components/ui';
import useApi from '../hooks/useApi';
import * as api from '../services/memberApi';
import { useI18n } from '../i18n/I18nContext';
import { formatCurrency, formatDate, titleCase } from '../utils/format';

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-canvas-rule last:border-0">
      <dt className="text-sm text-canvas-muted">{label}</dt>
      <dd className="text-sm font-medium text-right">{value}</dd>
    </div>
  );
}

export default function ClaimDetail() {
  const { t, lang } = useI18n();
  const { id } = useParams();
  const { data: claim, loading, error, reload } = useApi(useCallback(() => api.getClaim(id), [id]), [id]);
  const [downloading, setDownloading] = useState(false);
  const [dlError, setDlError] = useState('');

  if (loading) return <Spinner />;
  if (error) return <ErrorState onRetry={reload} />;

  const onDownloadEob = async () => {
    setDlError('');
    setDownloading(true);
    try {
      const blob = await api.downloadDocument(claim.eob_document_id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `EOB-${claim.claim_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDlError(t('documents.downloadError'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/claims" className="mp-link text-sm">
          ‹ {t('common.back')}
        </Link>
      </div>
      <h1 className="text-xl font-semibold">{t('claims.detailTitle')}</h1>

      <Card>
        <dl>
          <Row label={t('claims.claimNumber')} value={claim.claim_number} />
          <Row label={t('claims.date')} value={formatDate(claim.service_date, lang)} />
          <Row label={t('claims.provider')} value={claim.provider || '—'} />
          <Row label={t('claims.type')} value={titleCase(claim.category)} />
          <Row label={t('claims.status')} value={<StatusBadge status={claim.status} label={titleCase(claim.status)} />} />
          <Row label={t('claims.billed')} value={formatCurrency(claim.billed_amount, lang)} />
          <Row label={t('claims.paid')} value={formatCurrency(claim.paid_amount, lang)} />
          <Row label={t('claims.yourCost')} value={formatCurrency(claim.member_responsibility, lang)} />
        </dl>
        {claim.denial_reason && (
          <div className="mt-4">
            <Alert kind="error">
              <strong>{t('claims.denialReason')}: </strong>
              {claim.denial_reason}
            </Alert>
          </div>
        )}
        {claim.eob_document_id && (
          <div className="mt-4">
            <button type="button" className="mp-btn-secondary" onClick={onDownloadEob} disabled={downloading}>
              {t('claims.viewEob')}
            </button>
            {dlError && <p className="text-xs text-red-600 mt-2">{dlError}</p>}
          </div>
        )}
      </Card>

      {claim.lines?.length > 0 && (
        <Card title={t('claims.lines')}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-canvas-muted border-b border-canvas-border">
                  <th scope="col" className="py-2 pr-3 font-medium">{t('claims.procedure')}</th>
                  <th scope="col" className="py-2 pr-3 font-medium">{t('claims.status')}</th>
                  <th scope="col" className="py-2 pr-3 font-medium text-right">{t('claims.billed')}</th>
                  <th scope="col" className="py-2 pr-3 font-medium text-right">{t('claims.yourCost')}</th>
                </tr>
              </thead>
              <tbody>
                {claim.lines.map((l, i) => (
                  <tr key={i} className="border-b border-canvas-rule last:border-0 align-top">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{l.procedure_description || l.procedure_code || '—'}</div>
                      {l.denial_reason && <div className="text-xs text-red-600">{l.denial_reason}</div>}
                    </td>
                    <td className="py-2 pr-3">
                      <StatusBadge status={l.status} label={titleCase(l.status)} />
                    </td>
                    <td className="py-2 pr-3 text-right">{formatCurrency(l.billed_amount, lang)}</td>
                    <td className="py-2 pr-3 text-right">{formatCurrency(l.member_responsibility, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
