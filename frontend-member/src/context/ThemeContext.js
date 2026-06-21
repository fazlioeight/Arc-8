import React, { createContext, useContext, useEffect, useMemo } from 'react';

// White-label theming. A tenant's primary color + logo + name come from build-time
// env (REACT_APP_BRAND_*); absent those, a neutral default is used. The primary
// color is pushed into the --brand-* CSS variables the Tailwind config reads, so
// no rebuild of the design system is needed per tenant.

const ThemeContext = createContext(null);

function shade(hex, amount) {
  // Lighten (amount>0) or darken (amount<0) a #rrggbb hex by a fraction.
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((num >> 16) & 255) + 255 * amount);
  const g = clamp(((num >> 8) & 255) + 255 * amount);
  const b = clamp((num & 255) + 255 * amount);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function ThemeProvider({ children }) {
  const brandName = process.env.REACT_APP_BRAND_NAME || '';
  const logoUrl = process.env.REACT_APP_BRAND_LOGO_URL || '';
  const primary = process.env.REACT_APP_BRAND_PRIMARY || '';

  useEffect(() => {
    if (!primary) return;
    const root = document.documentElement;
    root.style.setProperty('--brand-500', shade(primary, 0.08));
    root.style.setProperty('--brand-600', primary);
    root.style.setProperty('--brand-700', shade(primary, -0.1));
    root.style.setProperty('--brand-800', shade(primary, -0.2));
  }, [primary]);

  const value = useMemo(() => ({ brandName, logoUrl }), [brandName, logoUrl]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext) || { brandName: '', logoUrl: '' };
}
