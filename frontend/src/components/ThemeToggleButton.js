import React from 'react';
import { useTheme } from '../context/ThemeContext';

const SunIcon = () => (
  <svg
    className="h-4 w-4 text-amber-500 dark:text-amber-400"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

const MoonIcon = () => (
  <svg
    className="h-4 w-4 text-slate-600 dark:text-slate-300"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
);

/**
 * Reusable header theme toggle icon button.
 * Renders a sun icon when dark (click to switch to bright/light) and a moon icon
 * when light (click to switch to dark).
 */
const ThemeToggleButton = ({ className = '', showLabel = false }) => {
  const { isDark, toggleTheme } = useTheme();
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  const baseClass =
    className ||
    'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggleTheme();
      }}
      title={label}
      aria-label={label}
      data-testid="header-theme-toggle"
      className={baseClass}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
      {showLabel && <span>{isDark ? 'Light' : 'Dark'}</span>}
    </button>
  );
};

export default ThemeToggleButton;
