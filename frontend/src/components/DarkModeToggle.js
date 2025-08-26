import React from 'react';

function DarkModeToggle({ darkMode, setDarkMode }) {
  return (
    <button
      className="btn btn-outline-secondary ms-2"
      onClick={() => setDarkMode(!darkMode)}
      aria-label="Toggle dark mode"
    >
      {darkMode ? (
        <i className="bi bi-sun-fill"></i>
      ) : (
        <i className="bi bi-moon-stars-fill"></i>
      )}
    </button>
  );
}

export default DarkModeToggle;