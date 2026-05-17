import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Legacy civic palette (kept for components not yet migrated)
        civic: {
          blue: '#1A4A6B',
          'blue-dark': '#123550',
          'blue-light': '#2C6A9A',
          amber: '#C8861A',
          'amber-light': '#F0A830',
          gray: '#F4F6F8',
          'gray-mid': '#9CA5B0',
          'gray-dark': '#4A5568',
        },
        // Editorial palette — Cincinnati-rooted
        ink: '#1a1410',
        limestone: '#f6f1ea',
        paper: '#fbf8f3',
        rule: '#e4ddd2',
        muted: '#6b5f55',
        river: '#2f5d62',
        'river-deep': '#1f3f43',
        'river-light': '#e6efef',
        brick: '#b34728',
        'brick-light': '#f5e8e1',
        hill: '#5a7a3e',
        'hill-light': '#ecefdf',
        ochre: '#c8861a',
      },
      fontFamily: {
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
        serif: ['Newsreader', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Public Sans"', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        editorial: '1400px',
      },
    },
  },
  plugins: [],
} satisfies Config
