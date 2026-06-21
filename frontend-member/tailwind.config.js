/** @type {import('tailwindcss').Config} */
// Brand colors are driven by CSS variables (see ThemeContext) so each tenant can
// white-label without a rebuild. The numeric scale falls back to a neutral blue.
module.exports = {
  content: ['./public/index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: 'var(--brand-50, #eff6ff)',
          100: 'var(--brand-100, #dbeafe)',
          200: 'var(--brand-200, #bfdbfe)',
          300: 'var(--brand-300, #93c5fd)',
          400: 'var(--brand-400, #5da3ec)',
          500: 'var(--brand-500, #2b7cd3)',
          600: 'var(--brand-600, #0a66c2)',
          700: 'var(--brand-700, #0a52a0)',
          800: 'var(--brand-800, #084080)',
          900: 'var(--brand-900, #082e60)',
        },
        canvas: {
          bg: '#f5f8fa',
          panel: '#ffffff',
          border: '#dfe3eb',
          rule: '#eaf0f6',
          ink: '#1f2d3d',
          muted: '#516f90',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(33,51,67,0.04), 0 1px 3px rgba(33,51,67,0.06)',
      },
      borderRadius: { card: '10px' },
      maxWidth: { content: '1080px' },
    },
  },
  plugins: [],
};
