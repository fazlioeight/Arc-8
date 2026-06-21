import React from 'react';

import { useI18n } from '../i18n/I18nContext';

export default function LanguageSwitcher() {
  const { lang, changeLang, languages, t } = useI18n();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">{t('common.language')}</span>
      <select
        className="rounded-md border border-canvas-border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        value={lang}
        onChange={(e) => changeLang(e.target.value)}
        aria-label={t('common.language')}
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
