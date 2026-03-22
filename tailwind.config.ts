import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
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
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'Source Sans Pro', 'system-ui', 'sans-serif'],
        display: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
