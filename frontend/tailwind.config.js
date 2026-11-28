// Resolve semantic colors for both ordinary utilities and Tailwind opacity modifiers.
const token = name => ({ opacityValue }) => {
  const color = `var(--${name})`;
  return opacityValue === undefined
    ? color
    : `color-mix(in srgb, ${color} calc(${opacityValue} * 100%), transparent)`;
};

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
        canvas: token('bg-canvas'),
        surface: {
          DEFAULT: token('bg-surface'),
          elevated: token('bg-surface-elevated'),
          subtle: token('bg-subtle'),
          muted: token('bg-muted'),
        },
        border: {
          subtle: token('border-subtle'),
          DEFAULT: token('border-default'),
          default: token('border-default'),
          strong: token('border-strong'),
        },
        txt: {
          primary: token('text-primary'),
          secondary: token('text-secondary'),
          muted: token('text-muted'),
          inverse: token('text-inverse'),
        },
        primary: {
          DEFAULT: token('primary'),
          hover: token('primary-hover'),
          active: token('primary-active'),
          surface: token('primary-surface'),
          border: token('primary-border'),
          text: token('primary-text'),
        },
        accent: {
          DEFAULT: token('accent'),
          hover: token('accent-hover'),
          surface: token('accent-surface'),
          border: token('accent-border'),
        },
        status: {
          success: token('status-success'),
          'success-surface': token('status-success-surface'),
          'success-border': token('status-success-border'),
          warning: token('status-warning'),
          'warning-surface': token('status-warning-surface'),
          'warning-border': token('status-warning-border'),
          danger: token('status-danger'),
          'danger-surface': token('status-danger-surface'),
          'danger-border': token('status-danger-border'),
        },

        lavender: token('lavender'),
        info: token('blue'),
        'info-surface': token('blue-soft'),
        online: token('online'),

        // Legacy Token Aliases for existing components
        ink: {
          950: token('bg-canvas'),
          900: token('bg-surface'),
          850: token('bg-surface-elevated'),
          800: token('bg-subtle'),
          700: token('bg-muted'),
        },
        rind: {
          100: token('text-primary'),
          200: token('text-primary'),
          300: token('text-secondary'),
          500: token('text-muted'),
          600: token('border-strong'),
        },
        melon: {
          DEFAULT: token('status-danger'),
          500: token('status-danger'),
          600: token('status-danger'),
          700: token('status-danger'),
          d: token('status-danger-surface'),
          dd: token('status-danger-surface'),
          glow: 'rgba(185, 28, 28, 0.15)',
        },
        leaf: {
          DEFAULT: token('status-success'),
          500: token('status-success'),
          600: token('status-success'),
          900: token('status-success-surface'),
          d: token('status-success-surface'),
          dd: token('status-success-surface'),
          glow: 'rgba(21, 128, 61, 0.15)',
        },
        instrument: {
          DEFAULT: token('primary'),
          400: token('primary'),
          500: token('primary'),
          d: token('primary-surface'),
          dd: token('primary-surface'),
          glow: token('primary-surface'),
        },
        warning: {
          DEFAULT: token('status-warning'),
          400: token('status-warning'),
          500: token('status-warning'),
          d: token('status-warning-surface'),
          glow: 'rgba(180, 83, 9, 0.15)',
        },
      },
      fontFamily: {
        sans: ['var(--font-body)'],
        display: ['var(--font-heading)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        rad: '10px',
        rad2: '8px',
        rad3: '6px',
      },
      boxShadow: {
        xs: 'var(--shadow-sm)',
        card: 'var(--glass-shadow)',
        elevated: 'var(--glass-shadow-elevated)',
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
