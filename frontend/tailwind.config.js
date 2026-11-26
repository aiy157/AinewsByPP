/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        masthead: ['"Newsreader"', '"Anuphan"', 'Georgia', 'serif'],
        heading: ['"Anuphan"', '"IBM Plex Sans Thai"', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans Thai"', '"Sarabun"', 'system-ui', '-apple-system', 'sans-serif'],
        body: ['"Sarabun"', '"IBM Plex Sans Thai"', 'system-ui', 'sans-serif'],
      },
      colors: {
        canvas: 'rgb(var(--bg-canvas) / <alpha-value>)',
        surface: 'rgb(var(--bg-surface) / <alpha-value>)',
        subtle: 'rgb(var(--bg-subtle) / <alpha-value>)',
        ink: {
          primary: 'rgb(var(--ink-primary) / <alpha-value>)',
          secondary: 'rgb(var(--ink-secondary) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
        },
        rule: {
          DEFAULT: 'rgb(var(--border-rule) / <alpha-value>)',
          strong: 'rgb(var(--border-rule-strong) / <alpha-value>)',
        },
        editorial: {
          DEFAULT: 'rgb(var(--accent-editorial) / <alpha-value>)',
          soft: 'var(--accent-editorial-soft)',
        },
        verified: {
          DEFAULT: 'rgb(var(--accent-verified) / <alpha-value>)',
          soft: 'var(--accent-verified-soft)',
        },
        rumor: {
          DEFAULT: 'rgb(var(--accent-rumor) / <alpha-value>)',
          soft: 'var(--accent-rumor-soft)',
          surface: 'rgb(var(--bg-rumor-surface) / <alpha-value>)',
          border: 'rgb(var(--border-rumor) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
