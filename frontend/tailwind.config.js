/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#0a66c2',
          700: '#1d4ed8',
          800: '#004182',
          900: '#1e3a5f',
          950: '#172554',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 3px rgba(15, 23, 42, 0.08)',
        'card-hover': '0 10px 30px rgba(15, 23, 42, 0.12)',
        dropdown: '0 8px 24px rgba(15, 23, 42, 0.12)',
      },
      borderRadius: {
        card: '12px',
      },
      maxWidth: {
        content: '1120px',
      },
    },
  },
  plugins: [],
}
