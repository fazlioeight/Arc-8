import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AuthContext } from './AuthContext';
import { translateText } from '../constants/translations';

const USER_PREF_PREFIX = 'arc8-user-pref-';
const ROLE_MENU_STORAGE_KEY = 'arc8-role-menus';

const DEFAULT_NAV_KEYS = [
  'home',
  'analytics',
  'providers',
  'care',
  'jobCenter',
  'importData',
  'resources',
  'admin',
  'adminConsole',
  'settings',
  'pricing',
  'login',
  'contact',
];

const DEFAULT_ROLE_MENU = {
  admin: DEFAULT_NAV_KEYS.reduce((acc, key) => ({ ...acc, [key]: true }), {}),
  manager: {
    home: true,
    analytics: true,
    providers: true,
    care: true,
    jobCenter: true,
    importData: true,
    resources: true,
    admin: false,
    adminConsole: false,
    settings: true,
    pricing: false,
    login: false,
    contact: true,
  },
  user: {
    home: true,
    analytics: false,
    providers: true,
    care: false,
    jobCenter: false,
    importData: false,
    resources: true,
    admin: false,
    adminConsole: false,
    settings: true,
    pricing: false,
    login: false,
    contact: true,
  },
};

const DEFAULT_FAVORITES = [
  { path: '/portal', label: 'Portal Overview' },
  { path: '/providers', label: 'Providers' },
];

const loadRoleMenuConfig = () => {
  try {
    const raw = localStorage.getItem(ROLE_MENU_STORAGE_KEY);
    if (!raw) return DEFAULT_ROLE_MENU;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_ROLE_MENU,
      ...parsed,
    };
  } catch (error) {
    console.warn('Failed to parse stored role menu config', error);
    return DEFAULT_ROLE_MENU;
  }
};

const persistRoleMenuConfig = (config) => {
  try {
    localStorage.setItem(ROLE_MENU_STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.warn('Failed to persist role menu config', error);
  }
};

const buildUserStorageKey = (email) => `${USER_PREF_PREFIX}${email || 'anonymous'}`;

const loadUserPrefs = (email) => {
  const key = buildUserStorageKey(email);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return {
        favorites: DEFAULT_FAVORITES,
        views: {},
        notifications: { dismissed: [], lastRead: null },
      };
    }
    const parsed = JSON.parse(raw);
    return {
      favorites: Array.isArray(parsed.favorites) && parsed.favorites.length
        ? parsed.favorites
        : DEFAULT_FAVORITES,
      views: parsed.views || {},
      notifications: parsed.notifications || { dismissed: [], lastRead: null },
    };
  } catch (error) {
    console.warn('Failed to parse stored user prefs', error);
    return {
      favorites: DEFAULT_FAVORITES,
      views: {},
      notifications: { dismissed: [], lastRead: null },
    };
  }
};

const persistUserPrefs = (email, prefs) => {
  const key = buildUserStorageKey(email);
  try {
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch (error) {
    console.warn('Failed to persist user preferences', error);
  }
};

const UserPreferencesContext = createContext(null);

export const UserPreferencesProvider = ({ children }) => {
  const { user } = useContext(AuthContext) || {};
  const email = user?.email || 'anonymous';
  const role = user?.role || 'user';

  const [roleMenus, setRoleMenus] = useState(() => loadRoleMenuConfig());
  const [preferences, setPreferences] = useState(() => loadUserPrefs(email));
  const [language, setLanguageState] = useState(() => {
    try {
      const saved = localStorage.getItem('liSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.language) return parsed.language;
      }
    } catch {}
    return 'English';
  });

  const setLanguage = useCallback((nextLang) => {
    const validLang = nextLang || 'English';
    setLanguageState(validLang);
    try {
      const saved = localStorage.getItem('liSettings');
      const parsed = saved ? JSON.parse(saved) : {};
      localStorage.setItem('liSettings', JSON.stringify({ ...parsed, language: validLang }));
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined' && document.documentElement) {
      const langCode = language === 'Spanish' ? 'es' : language === 'French' ? 'fr' : 'en';
      document.documentElement.lang = langCode;
    }
  }, [language]);

  const t = useCallback(
    (key, fallback = '') => translateText(language, key, fallback),
    [language]
  );

  useEffect(() => {
    setPreferences(loadUserPrefs(email));
  }, [email]);

  const persistCurrentPrefs = useCallback((updater) => {
    setPreferences((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persistUserPrefs(email, next);
      return next;
    });
  }, [email]);

  const updateRoleMenus = useCallback((roleKey, updater) => {
    setRoleMenus((prev) => {
      const base = prev[roleKey] || DEFAULT_ROLE_MENU[roleKey] || {};
      const updated = typeof updater === 'function' ? updater(base) : updater;
      const next = {
        ...prev,
        [roleKey]: {
          ...DEFAULT_ROLE_MENU[roleKey],
          ...updated,
        },
      };
      persistRoleMenuConfig(next);
      return next;
    });
  }, []);

  const navVisibility = roleMenus[role] || DEFAULT_ROLE_MENU[role] || DEFAULT_ROLE_MENU.user;

  const isNavItemEnabled = useCallback((key) => {
    if (!key) return true;
    const visibility = roleMenus[role] || DEFAULT_ROLE_MENU[role] || {};
    if (visibility[key] === undefined) return true;
    return Boolean(visibility[key]);
  }, [roleMenus, role]);

  const setNavVisibility = useCallback((roleKey, key, value) => {
    updateRoleMenus(roleKey, (prev) => ({
      ...prev,
      [key]: value,
    }));
  }, [updateRoleMenus]);

  const favorites = preferences.favorites || [];

  const isFavorite = useCallback((path) => favorites.some((fav) => fav.path === path), [favorites]);

  const toggleFavorite = useCallback((favorite) => {
    if (!favorite?.path) return;
    persistCurrentPrefs((prev) => {
      const existing = prev.favorites || [];
      const exists = existing.some((fav) => fav.path === favorite.path);
      const nextFavorites = exists
        ? existing.filter((fav) => fav.path !== favorite.path)
        : [...existing, { path: favorite.path, label: favorite.label || favorite.path }];
      return {
        ...prev,
        favorites: nextFavorites,
      };
    });
  }, [persistCurrentPrefs]);

  const recordViewPreference = useCallback((viewKey, data) => {
    if (!viewKey) return;
    persistCurrentPrefs((prev) => ({
      ...prev,
      views: {
        ...(prev.views || {}),
        [viewKey]: {
          ...data,
          updatedAt: Date.now(),
        },
      },
    }));
  }, [persistCurrentPrefs]);

  const getViewPreference = useCallback((viewKey, fallback = null) => {
    if (!viewKey) return fallback;
    return preferences.views?.[viewKey] || fallback;
  }, [preferences.views]);

  const markNotificationRead = useCallback((notificationId) => {
    if (!notificationId) return;
    persistCurrentPrefs((prev) => {
      const dismissed = new Set(prev.notifications?.dismissed || []);
      dismissed.add(notificationId);
      return {
        ...prev,
        notifications: {
          dismissed: Array.from(dismissed),
          lastRead: Date.now(),
        },
      };
    });
  }, [persistCurrentPrefs]);

  const contextValue = useMemo(() => ({
    roleMenus,
    navVisibility,
    setNavVisibility,
    updateRoleMenus,
    isNavItemEnabled,
    favorites,
    toggleFavorite,
    isFavorite,
    recordViewPreference,
    getViewPreference,
    markNotificationRead,
    viewPreferences: preferences.views || {},
    notificationPrefs: preferences.notifications || { dismissed: [], lastRead: null },
    language,
    setLanguage,
    t,
  }), [
    roleMenus,
    navVisibility,
    setNavVisibility,
    updateRoleMenus,
    isNavItemEnabled,
    favorites,
    toggleFavorite,
    isFavorite,
    recordViewPreference,
    getViewPreference,
    markNotificationRead,
    preferences.views,
    preferences.notifications,
    language,
    setLanguage,
    t,
  ]);

  return (
    <UserPreferencesContext.Provider value={contextValue}>
      {children}
    </UserPreferencesContext.Provider>
  );
};

export const useUserPreferences = () => {
  const context = useContext(UserPreferencesContext);
  if (!context) {
    throw new Error('useUserPreferences must be used within UserPreferencesProvider');
  }
  return context;
};
