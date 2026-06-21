import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import AuthLayout from '../components/AuthLayout';
import { Alert, Field } from '../components/ui';
import * as api from '../services/memberApi';
import { useI18n } from '../i18n/I18nContext';

export default function ResendVerification() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.resendVerification(email);
    } catch {
      /* non-enumerating */
    } finally {
      setSubmitting(false);
      setDone(true);
    }
  };

  return (
    <AuthLayout title={t('auth.resend')} footer={<Link className="mp-link" to="/login">{t('auth.signIn')}</Link>}>
      {done ? (
        <Alert kind="success">{t('auth.resendDone')}</Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <Field id="email" label={t('auth.email')}>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="mp-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <button type="submit" className="mp-btn-primary w-full" disabled={submitting}>
            {t('common.submit')}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
