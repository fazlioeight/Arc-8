import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import AuthLayout from '../components/AuthLayout';
import { Alert, Spinner } from '../components/ui';
import * as api from '../services/memberApi';
import { useI18n } from '../i18n/I18nContext';

export default function VerifyEmail() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState('loading'); // loading | ok | fail

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setState('fail');
      return undefined;
    }
    api
      .verifyEmail(token)
      .then(() => !cancelled && setState('ok'))
      .catch(() => !cancelled && setState('fail'));
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AuthLayout title={t('auth.verifyEmailTitle')} footer={<Link className="mp-link" to="/login">{t('auth.signIn')}</Link>}>
      {state === 'loading' && <Spinner />}
      {state === 'ok' && <Alert kind="success">{t('auth.verifyEmailOk')}</Alert>}
      {state === 'fail' && (
        <div className="space-y-3">
          <Alert kind="error">{t('auth.verifyEmailFail')}</Alert>
          <Link className="mp-btn-secondary w-full" to="/resend-verification">
            {t('auth.resend')}
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
