import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const THEME_STORAGE_KEY = 'themePreference';
const THEME_MIGRATION_KEY = 'arc8_theme_v2_bright_default';

const syncLiSettingsTheme = (pref) => {
  try {
    const raw = localStorage.getItem('liSettings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.theme !== pref) {
        localStorage.setItem('liSettings', JSON.stringify({ ...parsed, theme: pref }));
      }
    }
  } catch {
    // Ignore storage parse errors
  }
};

export const applyDomTheme = (useDark) => {
  if (typeof document === 'undefined') return;
  const resolved = useDark ? 'dark' : 'light';
  const root = document.documentElement;
  if (root) {
    root.classList.toggle('dark-mode', useDark);
    root.classList.toggle('light-mode', !useDark);
    root.classList.toggle('dark', useDark);
    root.dataset.theme = resolved;
    root.setAttribute('data-bs-theme', resolved);
  }
  if (document.body) {
    document.body.classList.toggle('dark-mode', useDark);
    document.body.classList.toggle('light-mode', !useDark);
    document.body.classList.toggle('dark', useDark);
    document.body.dataset.theme = resolved;
  }
};

const getInitialThemePreference = () => {
  try {
    if (!localStorage.getItem(THEME_MIGRATION_KEY)) {
      localStorage.setItem(THEME_MIGRATION_KEY, '1');
      localStorage.setItem(THEME_STORAGE_KEY, 'light');
      syncLiSettingsTheme('light');
      return 'light';
    }
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }
  return 'light';
};

const resolveEffectiveDark = (pref) => {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
};

export const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const [themePreference, setThemePreferenceState] = useState(getInitialThemePreference);
  const [systemDark, setSystemDark] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  const setThemePreference = useCallback((nextOrUpdater) => {
    setThemePreferenceState((prev) => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater;
      const valid = next === 'dark' || next === 'system' ? next : 'light';
      try {
        localStorage.setItem(THEME_STORAGE_KEY, valid);
        localStorage.setItem(THEME_MIGRATION_KEY, '1');
      } catch {
        // Ignore storage errors
      }
      syncLiSettingsTheme(valid);
      return valid;
    });
  }, []);

  const isDark = themePreference === 'dark' || (themePreference === 'system' && systemDark);
  const resolvedTheme = isDark ? 'dark' : 'light';

  const toggleTheme = useCallback(() => {
    setThemePreference(isDark ? 'light' : 'dark');
  }, [isDark, setThemePreference]);

  useEffect(() => {
    applyDomTheme(isDark);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    } catch {
      // Ignore storage errors
    }
  }, [isDark, themePreference]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event) => {
      setSystemDark(Boolean(event?.matches ?? mql.matches));
    };
    if (mql.addEventListener) mql.addEventListener('change', handler);
    else if (mql.addListener) mql.addListener(handler);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', handler);
      else if (mql.removeListener) mql.removeListener(handler);
    };
  }, []);

  const value = useMemo(
    () => ({
      themePreference,
      setThemePreference,
      resolvedTheme,
      isDark,
      toggleTheme,
    }),
    [themePreference, setThemePreference, resolvedTheme, isDark, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  const [fallbackPref, setFallbackPref] = useState(() => {
    if (typeof document !== 'undefined' && document.documentElement?.classList.contains('dark')) {
      return 'dark';
    }
    return 'light';
  });

  const setFallback = useCallback((nextOrUpdater) => {
    setFallbackPref((prev) => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater;
      const valid = next === 'dark' || next === 'system' ? next : 'light';
      const dark = resolveEffectiveDark(valid);
      applyDomTheme(dark);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, valid);
      } catch {
        // Ignore storage errors
      }
      return valid;
    });
  }, []);

  if (ctx) return ctx;

  const isDark = resolveEffectiveDark(fallbackPref);
  return {
    themePreference: fallbackPref,
    setThemePreference: setFallback,
    resolvedTheme: isDark ? 'dark' : 'light',
    isDark,
    toggleTheme: () => setFallback(isDark ? 'light' : 'dark'),
  };
};
