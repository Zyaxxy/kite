/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'surface-base': '#0D0F12',
        'surface-card': '#12151A',
        'surface-card-elevated': '#181C24',
        'surface-overlay': '#1E232E',
        'bull-green': '#00D09C',
        'bull-green-subtle': 'rgba(0, 208, 156, 0.12)',
        'bear-red': '#FF5252',
        'bear-red-subtle': 'rgba(255, 82, 82, 0.12)',
        'border-subtle': 'rgba(255, 255, 255, 0.08)',
        'border-interactive': '#2A3142',
        'text-primary': '#F8FAFC',
        'text-secondary': '#94A3B8',
        'text-muted': '#64748B',
        'accent-cyan': '#38BDF8',
        'accent-warning': '#F59E0B',
        // Legacy fallbacks mapped cleanly to Stitch palette
        bg: '#0D0F12',
        raised: '#12151A',
        ink: '#F8FAFC',
        muted: '#94A3B8',
        line: 'rgba(255, 255, 255, 0.08)',
        accent: '#00D09C',
        'accent-ink': '#0D0F12',
        up: '#00D09C',
        down: '#FF5252',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        body: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '8px',
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        full: '9999px',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
