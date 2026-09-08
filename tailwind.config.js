/** @type {import('tailwindcss').Config} */
module.exports = {
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
          accent: '#f59e0b',
          glow: '#fbbf24',
        },
        cyber: {
          dark: '#070b14',
          card: '#0d1527',
          cardBorder: '#1e293b',
          lightBorder: '#334155',
          brand: '#3b82f6',
          brandGlow: '#60a5fa',
          purple: '#a855f7',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'cookie-glow': '0 0 25px -5px rgba(245, 158, 11, 0.3)',
        'blue-glow': '0 0 25px -5px rgba(59, 130, 246, 0.3)',
      }
    },
  },
  plugins: [],
};
