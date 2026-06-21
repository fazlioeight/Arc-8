import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import AuthLayout from '../components/AuthLayout';
import { Alert, Field } from '../components/ui';
import { useAuth } from '../context/MemberAuthContext';
import { useI18n } from '../i18n/I18nContext';

export default function Login() {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password, mfaRequired ? mfaCode : undefined);
      navigate(from, { replace: true });
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      if (status === 401 && detail === 'mfa_required') {
        setMfaRequired(true);
      } else if (status === 401 && detail === 'Invalid MFA code') {
        setError(t('auth.mfaPrompt'));
      } else if (status === 401) {
        setError(t('auth.invalidCredentials'));
      } else if (status === 403) {
        setError(t('auth.verifyFirst'));
      } else if (status === 429) {
        setError(t('auth.lockedOut'));
      } else {
        setError(t('common.error'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title={t('auth.signIn')}
      subtitle={t('auth.signInSubtitle')}
      footer={
        <span>
          {t('auth.needAccount')} <Link className="mp-link" to="/register">{t('auth.createAccount')}</Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        {error && (
          <div className="mb-4">
            <Alert kind="error">{error}</Alert>
          </div>
        )}
        {!mfaRequired ? (
          <>
            <Field id="email" label={t('auth.email')}>
              <input
                id="email"
                type="email"
                autoComplete="username"
                className="mp-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field id="password" label={t('auth.password')}>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="mp-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <div className="text-right mb-4">
              <Link className="mp-link text-sm" to="/forgot-password">
                {t('auth.forgotPassword')}
              </Link>
            </div>
          </>
        ) : (
          <Field id="mfa" label={t('auth.mfaCode')} hint={t('auth.mfaPrompt')}>
            <input
              id="mfa"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="mp-input tracking-widest"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              required
            />
          </Field>
        )}
        <button type="submit" className="mp-btn-primary w-full" disabled={submitting}>
          {t('auth.signIn')}
        </button>
      </form>
    </AuthLayout>
  );
}
