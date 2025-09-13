// Optional: extend Jest with @testing-library/jest-dom if available
try {
  require('@testing-library/jest-dom');
} catch (_) {
  // It's fine if not installed; tests should avoid relying on custom matchers
}

