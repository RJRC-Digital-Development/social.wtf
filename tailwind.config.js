/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cookie: {
          50: '#fbf7ee',
          100: '#f5ecd5',
          200: '#edd8aa',
          300: '#e1be75',
          400: '#d7a44a',
          500: '#ca8a2c',
          600: '#b06f23',
          700: '#8c511f',
          800: '#734220',
          900: '#60371f',
          accent: '#d97706',
          glow: '#f59e0b',
        },
        cyber: {
          dark: '#070b14',
          card: '#0d1527',
          cardBorder: '#1e293b',
          lightBorder: '#334155',
          brand: '#3b82f6',
          brandGlow: '#60a5fa',
          purple: '#8b5cf6',
        },
        // Goal-setting serene palette tokens
        focus: {
          slate: '#0f172a',
          cardNight: '#0d1527',
          cardDay: '#ffffff',
          bgNight: '#070b14',
          bgDay: '#f8fafc',
          borderNight: '#1e293b',
          borderDay: '#e2e8f0',
          subtleNight: '#151f33',
          subtleDay: '#f1f5f9',
          accentAmber: '#d97706',
          accentBlue: '#2563eb',
          accentEmerald: '#059669',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'cookie-glow': '0 0 20px -5px rgba(217, 119, 6, 0.25)',
        'blue-glow': '0 0 20px -5px rgba(59, 130, 246, 0.25)',
        'card-soft': '0 2px 8px -2px rgba(15, 23, 42, 0.08), 0 1px 4px -1px rgba(15, 23, 42, 0.04)',
      }
    },
  },
  plugins: [],
};
