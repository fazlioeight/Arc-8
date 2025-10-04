// Optional: extend Jest with @testing-library/jest-dom if available
try {
  require('@testing-library/jest-dom');
} catch (_) {
  // It's fine if not installed; tests should avoid relying on custom matchers
}

// Polyfill TextEncoder / TextDecoder for environments where they're missing (node)
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Ensure URLSearchParams exists (some libs expect it)
if (typeof global.URLSearchParams === 'undefined') {
  global.URLSearchParams = require('url').URLSearchParams;
}

