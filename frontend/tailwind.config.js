/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#020617', // Slate-950
          surface: '#0f172a', // Slate-900
          surface2: '#1e293b', // Slate-800
          border: '#1e293b',
          borderHover: '#334155', // Slate-700
          text: '#f8fafc', // Slate-100
          muted: '#94a3b8', // Slate-400
          accent: '#0ea5e9', // Sky-500
          accentHover: '#0284c7', // Sky-600
        },
        status: {
          ok: '#10b981', // Emerald-500
          warn: '#f59e0b', // Amber-500
          error: '#f43f5e', // Rose-500
          info: '#818cf8', // Indigo-400
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
