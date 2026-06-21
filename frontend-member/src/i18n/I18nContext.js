import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { LANG_STORAGE_KEY } from '../config';
import en from './locales/en';
import es from './locales/es';

const DICTS = { en, es };
const SUPPORTED = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

const I18nContext = createContext(null);

function resolveInitialLang() {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved && DICTS[saved]) return saved;
  } catch {
    /* ignore */
  }
  const nav = (typeof navigator !== 'undefined' && navigator.language) || 'en';
  return nav.toLowerCase().startsWith('es') ? 'es' : 'en';
}

function lookup(dict, key) {
  return key.split('.').reduce((acc, part) => (acc && acc[part] != null ? acc[part] : undefined), dict);
}

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(resolveInitialLang);

  const changeLang = useCallback((code) => {
    if (!DICTS[code]) return;
    setLang(code);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, code);
    } catch {
      /* ignore */
    }
    if (typeof document !== 'undefined') document.documentElement.lang = code;
  }, []);

  const t = useCallback(
    (key, vars) => {
      const value = lookup(DICTS[lang], key) ?? lookup(DICTS.en, key) ?? key;
      if (typeof value !== 'string' || !vars) return value;
      return value.replace(/\{(\w+)\}/g, (m, name) => (vars[name] != null ? String(vars[name]) : m));
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, changeLang, t, languages: SUPPORTED }), [lang, changeLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
