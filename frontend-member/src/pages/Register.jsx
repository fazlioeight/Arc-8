import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import AuthLayout from '../components/AuthLayout';
import { Alert, Field } from '../components/ui';
import * as api from '../services/memberApi';
import { useI18n } from '../i18n/I18nContext';

export default function Register() {
  const { t } = useI18n();
  const [form, setForm] = useState({
    member_id: '',
    date_of_birth: '',
    last_name: '',
    zip_code: '',
    email: '',
    password: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.register(form);
      // Anti-enumeration: backend always returns the same message; show it.
      setSubmitted(true);
    } catch (err) {
      if (err.response?.status === 429) setError(t('auth.lockedOut'));
      else setError(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <AuthLayout title={t('auth.register')} footer={<Link className="mp-link" to="/login">{t('auth.signIn')}</Link>}>
        <Alert kind="success">{t('auth.registerSubmitted')}</Alert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('auth.register')}
      subtitle={t('auth.registerSubtitle')}
      footer={
        <span>
          {t('auth.haveAccount')} <Link className="mp-link" to="/login">{t('auth.signIn')}</Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        {error && (
          <div className="mb-4">
            <Alert kind="error">{error}</Alert>
          </div>
        )}
        <Field id="member_id" label={t('auth.memberId')}>
          <input id="member_id" className="mp-input" value={form.member_id} onChange={set('member_id')} required />
        </Field>
        <Field id="date_of_birth" label={t('auth.dateOfBirth')}>
          <input
            id="date_of_birth"
            type="date"
            className="mp-input"
            value={form.date_of_birth}
            onChange={set('date_of_birth')}
            required
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <Field id="last_name" label={t('auth.lastName')}>
            <input id="last_name" className="mp-input" value={form.last_name} onChange={set('last_name')} required />
          </Field>
          <Field id="zip_code" label={t('auth.zip')}>
            <input id="zip_code" className="mp-input" value={form.zip_code} onChange={set('zip_code')} required />
          </Field>
        </div>
        <Field id="email" label={t('auth.email')}>
          <input id="email" type="email" autoComplete="email" className="mp-input" value={form.email} onChange={set('email')} required />
        </Field>
        <Field id="password" label={t('auth.password')} hint={t('auth.passwordHint')}>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className="mp-input"
            value={form.password}
            onChange={set('password')}
            minLength={12}
            required
          />
        </Field>
        <button type="submit" className="mp-btn-primary w-full" disabled={submitting}>
          {t('auth.createAccount')}
        </button>
      </form>
    </AuthLayout>
  );
}
