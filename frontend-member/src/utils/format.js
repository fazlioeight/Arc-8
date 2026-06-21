// Locale-aware formatting helpers. Currency/date follow the active UI language.

export function formatCurrency(amount, lang = 'en') {
  if (amount == null || amount === '') return '—';
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (Number.isNaN(n)) return '—';
  try {
    return new Intl.NumberFormat(lang === 'es' ? 'es-US' : 'en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function formatDate(value, lang = 'en') {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  try {
    return new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function titleCase(value) {
  if (!value) return '';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
