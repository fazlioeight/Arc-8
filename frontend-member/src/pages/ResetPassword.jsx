import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import AuthLayout from '../components/AuthLayout';
import { Alert, Field } from '../components/ui';
import * as api from '../services/memberApi';
import { useI18n } from '../i18n/I18nContext';

export default function ResetPassword() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.confirmPasswordReset(token, password);
      setDone(true);
    } catch (err) {
      setError(err.response?.status === 400 ? t('auth.verifyEmailFail') : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title={t('auth.resetTitle')} footer={<Link className="mp-link" to="/login">{t('auth.signIn')}</Link>}>
      {done ? (
        <Alert kind="success">{t('auth.resetDone')}</Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          {error && (
            <div className="mb-4">
              <Alert kind="error">{error}</Alert>
            </div>
          )}
          <Field id="password" label={t('auth.password')} hint={t('auth.passwordHint')}>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              className="mp-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={12}
              required
            />
          </Field>
          <button type="submit" className="mp-btn-primary w-full" disabled={submitting || !token}>
            {t('common.submit')}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
