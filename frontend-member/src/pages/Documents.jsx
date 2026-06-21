import React, { useCallback, useState } from 'react';

import { Card, EmptyState, ErrorState, Spinner } from '../components/ui';
import useApi from '../hooks/useApi';
import * as api from '../services/memberApi';
import { useI18n } from '../i18n/I18nContext';
import { formatDate, titleCase } from '../utils/format';

export default function Documents() {
  const { t, lang } = useI18n();
  const { data, loading, error, reload } = useApi(useCallback(() => api.getDocuments(), []));
  const [busyId, setBusyId] = useState(null);
  const [dlError, setDlError] = useState('');

  const onDownload = async (doc) => {
    setDlError('');
    setBusyId(doc.id);
    try {
      const blob = await api.downloadDocument(doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name || 'document';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDlError(t('documents.downloadError'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('documents.title')}</h1>
      <Card>
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState onRetry={reload} />
        ) : data.items.length === 0 ? (
          <EmptyState message={t('documents.none')} />
        ) : (
          <>
            {dlError && <p className="text-sm text-red-600 mb-3" role="alert">{dlError}</p>}
            <ul className="divide-y divide-canvas-rule">
              {data.items.map((doc) => (
                <li key={doc.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{doc.file_name}</p>
                    <p className="text-xs text-canvas-muted">
                      {titleCase(doc.document_type) || '—'} · {formatDate(doc.uploaded_at, lang)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="mp-btn-secondary shrink-0"
                    onClick={() => onDownload(doc)}
                    disabled={busyId === doc.id}
                  >
                    {t('documents.download')}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
