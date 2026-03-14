/** @type {import('tailwindcss').Config} */
const defaultTheme = require('tailwindcss/defaultTheme')

module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', ...defaultTheme.fontFamily.sans]
      },
      colors: {
        ruby: {
          DEFAULT: '#C14420',
          lt: '#d4374b',
          dk: '#7b1c2a',
          sub: 'rgba(193,68,32,0.07)',
          glow: 'rgba(193,68,32,0.12)'
        },
        status: {
          ok: '#1B7A3D',
          'ok-bg': 'rgba(27,122,61,0.07)',
          err: '#C62828',
          'err-bg': 'rgba(198,40,40,0.07)'
        },
        neutral: {
          dark: '#1A1A1A',
          dk: '#4A4A4A',
          mid: '#8A8A8A',
          lt: '#F6F6F6',
          bdr: '#E5E5E5',
          wh: '#FFFFFF'
        },
        accent: {
          gold: '#d4a017',
          salmon: '#DA917B'
        }
      },
      borderRadius: {
        sm: '8px',
        md: '10px',
        lg: '16px',
        xl: '20px'
      },
      boxShadow: {
        card: '0 1px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 16px rgba(193,68,32,0.10), 0 2px 6px rgba(0,0,0,0.06)',
        elevated: '0 8px 30px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.05)',
        nav: '0 1px 3px rgba(0,0,0,0.05)'
      },
      keyframes: {
        'page-enter': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        'page-enter': 'page-enter 0.25s ease-out'
      }
    }
  },
  plugins: []
}
