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
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        subtle: 'var(--bg-subtle)',
        ink: {
          primary: 'var(--ink-primary)',
          secondary: 'var(--ink-secondary)',
          muted: 'var(--ink-muted)',
        },
        rule: {
          DEFAULT: 'var(--border-rule)',
          strong: 'var(--border-rule-strong)',
        },
        editorial: {
          DEFAULT: 'var(--accent-editorial)',
          soft: 'var(--accent-editorial-soft)',
        },
        verified: {
          DEFAULT: 'var(--accent-verified)',
          soft: 'var(--accent-verified-soft)',
        },
        rumor: {
          DEFAULT: 'var(--accent-rumor)',
          soft: 'var(--accent-rumor-soft)',
          surface: 'var(--bg-rumor-surface)',
          border: 'var(--border-rumor)',
        },
      },
    },
  },
  plugins: [],
};
