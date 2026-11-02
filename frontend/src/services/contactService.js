// Public marketing contact form. Posts to the tenant-exempt /api/contact
// endpoint, which emails the submission to the Arc-8 contact inbox. No auth
// or tenant header — visitors here are unauthenticated.

import { API_BASE } from '../utils/apiBase';

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
