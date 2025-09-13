import React from 'react';

// themePreference: 'system' | 'light' | 'dark'
function DarkModeToggle({ themePreference, setThemePreference }) {
  return (
    <div className="btn-group" role="group" aria-label="Theme preference">
      <button
        type="button"
        className={`btn btn-outline-secondary ${themePreference === 'system' ? 'active' : ''}`}
        onClick={() => setThemePreference('system')}
      >
        <i className="bi bi-circle-half"></i>
        <span className="ms-1 d-none d-md-inline">System</span>
      </button>
      <button
        type="button"
        className={`btn btn-outline-secondary ${themePreference === 'light' ? 'active' : ''}`}
        onClick={() => setThemePreference('light')}
      >
        <i className="bi bi-sun"></i>
        <span className="ms-1 d-none d-md-inline">Light</span>
      </button>
      <button
        type="button"
        className={`btn btn-outline-secondary ${themePreference === 'dark' ? 'active' : ''}`}
        onClick={() => setThemePreference('dark')}
      >
        <i className="bi bi-moon-stars"></i>
        <span className="ms-1 d-none d-md-inline">Dark</span>
      </button>
    </div>
  );
}

export default DarkModeToggle;
