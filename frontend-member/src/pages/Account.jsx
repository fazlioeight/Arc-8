import React, { useState } from 'react';

import { Alert, Card, Field } from '../components/ui';
import * as api from '../services/memberApi';
import { useAuth } from '../context/MemberAuthContext';
import { useI18n } from '../i18n/I18nContext';

function ChangePassword() {
  const { t } = useI18n();
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg(null);
    setErr('');
    setBusy(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      setMsg(t('account.passwordChanged'));
      setOld('');
      setNew('');
    } catch (error) {
      setErr(error.response?.status === 400 ? t('auth.invalidCredentials') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('account.changePassword')}>
      <form onSubmit={onSubmit} noValidate className="max-w-sm">
        {msg && <div className="mb-4"><Alert kind="success">{msg}</Alert></div>}
        {err && <div className="mb-4"><Alert kind="error">{err}</Alert></div>}
        <Field id="old" label={t('account.currentPassword')}>
          <input id="old" type="password" autoComplete="current-password" className="mp-input" value={oldPassword} onChange={(e) => setOld(e.target.value)} required />
        </Field>
        <Field id="new" label={t('account.newPassword')} hint={t('auth.passwordHint')}>
          <input id="new" type="password" autoComplete="new-password" className="mp-input" value={newPassword} onChange={(e) => setNew(e.target.value)} minLength={12} required />
        </Field>
        <button type="submit" className="mp-btn-primary" disabled={busy}>
          {t('common.save')}
        </button>
      </form>
    </Card>
  );
}

function MfaSettings() {
  const { t } = useI18n();
  const { mfaEnrolled, setMfaEnrolled } = useAuth();
  const [enroll, setEnroll] = useState(null); // { otpauth_url, secret }
  const [code, setCode] = useState('');
  const [disablePw, setDisablePw] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState('');

  const startEnroll = async () => {
    setErr('');
    try {
      setEnroll(await api.mfaEnroll());
    } catch {
      setErr(t('common.error'));
    }
  };

  const confirmEnroll = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api.mfaVerify(code);
      setMfaEnrolled(true);
      setEnroll(null);
      setCode('');
      setMsg(t('account.mfaEnabled'));
    } catch {
      setErr(t('auth.mfaPrompt'));
    }
  };

  const disable = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api.mfaDisable(disablePw, disableCode);
      setMfaEnrolled(false);
      setDisablePw('');
      setDisableCode('');
      setMsg(t('account.mfaDisabled'));
    } catch {
      setErr(t('common.error'));
    }
  };

  return (
    <Card title={t('account.mfa')}>
      {msg && <div className="mb-4"><Alert kind="success">{msg}</Alert></div>}
      {err && <div className="mb-4"><Alert kind="error">{err}</Alert></div>}

      <p className="text-sm mb-4">{mfaEnrolled ? t('account.mfaOn') : t('account.mfaOff')}</p>

      {!mfaEnrolled && !enroll && (
        <button type="button" className="mp-btn-primary" onClick={startEnroll}>
          {t('account.enableMfa')}
        </button>
      )}

      {!mfaEnrolled && enroll && (
        <form onSubmit={confirmEnroll} className="max-w-sm space-y-3">
          <p className="text-sm text-canvas-muted">{t('account.mfaScan')}</p>
          <code className="block text-xs break-all bg-canvas-bg p-2 rounded border border-canvas-border">
            {enroll.secret}
          </code>
          <Field id="mfa-code" label={t('auth.mfaCode')}>
            <input id="mfa-code" inputMode="numeric" className="mp-input tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} required />
          </Field>
          <button type="submit" className="mp-btn-primary">{t('account.verify')}</button>
        </form>
      )}

      {mfaEnrolled && (
        <form onSubmit={disable} className="max-w-sm space-y-3">
          <Field id="dis-pw" label={t('account.currentPassword')}>
            <input id="dis-pw" type="password" className="mp-input" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} required />
          </Field>
          <Field id="dis-code" label={t('auth.mfaCode')}>
            <input id="dis-code" inputMode="numeric" className="mp-input tracking-widest" value={disableCode} onChange={(e) => setDisableCode(e.target.value)} required />
          </Field>
          <button type="submit" className="mp-btn-secondary">{t('account.disableMfa')}</button>
        </form>
      )}
    </Card>
  );
}

export default function Account() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('account.title')}</h1>
      <ChangePassword />
      <MfaSettings />
    </div>
  );
}
