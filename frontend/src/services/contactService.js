// Public marketing contact form. Posts to the tenant-exempt /api/contact
// endpoint, which emails the submission to the Nexora contact inbox. No auth
// or tenant header — visitors here are unauthenticated.

const API_BASE = (typeof window !== 'undefined' && window.location && (window.location.port === '7777' || window.location.port === '7778' || window.location.port === '3000' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) ? (window.location.protocol + '//' + window.location.hostname + ':8989') : (process.env.REACT_APP_API_BASE || 'http://localhost:8989');

export async function submitContactForm({ name, email, subject, message }) {
  const res = await fetch(`${API_BASE}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, subject, message }),
  });
  if (!res.ok) {
    let detail = 'Something went wrong. Please try again later.';
    try {
      const body = await res.json();
      if (body && body.detail) detail = body.detail;
    } catch (e) {
      // non-JSON error body; keep the default message
    }
    throw new Error(detail);
  }
  return res.json();
}
