// Public marketing contact form. Posts to the tenant-exempt /api/contact
// endpoint, which emails the submission to the Nexora contact inbox. No auth
// or tenant header — visitors here are unauthenticated.

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

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
