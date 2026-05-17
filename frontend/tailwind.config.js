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
          400: '#5da3ec',
          500: '#2b7cd3',
          600: '#0a66c2',
          700: '#0a52a0',
          800: '#084080',
          900: '#082e60',
          950: '#051d3f',
        },
        canvas: {
          bg:     '#f5f8fa',
          panel:  '#ffffff',
          border: '#dfe3eb',
          rule:   '#eaf0f6',
          ink:    '#33475b',
          muted:  '#516f90',
          soft:   '#7c98b6',
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
        card: '0 1px 2px rgba(33, 51, 67, 0.04), 0 1px 3px rgba(33, 51, 67, 0.06)',
        'card-hover': '0 2px 6px rgba(33, 51, 67, 0.08), 0 4px 12px rgba(33, 51, 67, 0.08)',
        dropdown: '0 4px 16px rgba(33, 51, 67, 0.12)',
      },
      borderRadius: {
        card: '8px',
      },
      maxWidth: {
        content: '1120px',
      },
    },
  },
  plugins: [],
}
