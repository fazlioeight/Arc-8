import React from 'react';

import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../context/ThemeContext';

export default function Brand({ className = '' }) {
  const { brandName, logoUrl } = useTheme();
  const { t } = useI18n();
  const name = brandName || t('common.appName');
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {logoUrl ? (
        <img src={logoUrl} alt={name} className="h-8 w-auto" />
      ) : (
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-white font-bold">
          {name.slice(0, 1)}
        </span>
      )}
      <span className="font-semibold text-canvas-ink">{name}</span>
    </div>
  );
}
