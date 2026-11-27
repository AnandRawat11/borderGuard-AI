/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Design System Semantic Tokens
        canvas: 'var(--bg-canvas)',
        surface: {
          DEFAULT: 'var(--bg-surface)',
          elevated: 'var(--bg-surface-elevated)',
          subtle: 'var(--bg-subtle)',
          muted: 'var(--bg-muted)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
        },
        txt: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          inverse: 'var(--text-inverse)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          active: 'var(--primary-active)',
          surface: 'var(--primary-surface)',
          border: 'var(--primary-border)',
          text: 'var(--primary-text)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          surface: 'var(--accent-surface)',
          border: 'var(--accent-border)',
        },
        status: {
          success: 'var(--status-success)',
          'success-surface': 'var(--status-success-surface)',
          'success-border': 'var(--status-success-border)',
          warning: 'var(--status-warning)',
          'warning-surface': 'var(--status-warning-surface)',
          'warning-border': 'var(--status-warning-border)',
          danger: 'var(--status-danger)',
          'danger-surface': 'var(--status-danger-surface)',
          'danger-border': 'var(--status-danger-border)',
        },

        // Legacy Token Aliases for existing components
        ink: {
          950: 'var(--bg-canvas)',
          900: 'var(--bg-surface)',
          850: 'var(--bg-surface-elevated)',
          800: 'var(--bg-subtle)',
          700: 'var(--bg-muted)',
        },
        rind: {
          100: 'var(--text-primary)',
          200: 'var(--text-primary)',
          300: 'var(--text-secondary)',
          500: 'var(--text-muted)',
          600: 'var(--border-strong)',
        },
        melon: {
          DEFAULT: 'var(--status-danger)',
          500: 'var(--status-danger)',
          600: 'var(--status-danger)',
          700: 'var(--status-danger)',
          d: 'var(--status-danger-surface)',
          dd: 'var(--status-danger-surface)',
          glow: 'rgba(185, 28, 28, 0.15)',
        },
        leaf: {
          DEFAULT: 'var(--status-success)',
          500: 'var(--status-success)',
          600: 'var(--status-success)',
          900: 'var(--status-success-surface)',
          d: 'var(--status-success-surface)',
          dd: 'var(--status-success-surface)',
          glow: 'rgba(21, 128, 61, 0.15)',
        },
        instrument: {
          DEFAULT: 'var(--primary)',
          400: 'var(--primary)',
          500: 'var(--primary)',
          d: 'var(--primary-surface)',
          dd: 'var(--primary-surface)',
          glow: 'rgba(15, 89, 83, 0.15)',
        },
        warning: {
          DEFAULT: 'var(--status-warning)',
          400: 'var(--status-warning)',
          500: 'var(--status-warning)',
          d: 'var(--status-warning-surface)',
          glow: 'rgba(180, 83, 9, 0.15)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        rad: '8px',
        rad2: '6px',
        rad3: '4px',
      },
      boxShadow: {
        card: 'var(--shadow-sm)',
        elevated: 'var(--shadow-md)',
      }
    },
  },
  plugins: [
    require('daisyui')
  ],
  daisyui: {
    themes: false,
    darkTheme: "dark",
    base: false,
  }
}
