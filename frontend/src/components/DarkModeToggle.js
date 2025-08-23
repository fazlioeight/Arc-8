import React from 'react';

function DarkModeToggle({ darkMode, setDarkMode }) {
  return (
    <button
      className="btn btn-outline-secondary ms-2"
      onClick={() => setDarkMode(!darkMode)}
      aria-label="Toggle dark mode"
    >
      {darkMode ? 'Light Mode' : 'Dark Mode'}
    </button>
  );
}

export default DarkModeToggle;