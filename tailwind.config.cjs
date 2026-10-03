/** @type {import('tailwindcss').Config} */
// FORGEDSA brand kit: Matte Carbon background, Gunmetal surfaces, Forged Gold primary,
// Brass Light highlight, Electric Orange used sparingly. `ink` is the main text colour.
module.exports = {
  // every file that writes class names (a class only used in a file outside these globs is dropped)
  content: ['./index.html', './*.tsx', './components/**/*.{ts,tsx}', './pages/**/*.{ts,tsx}', './services/**/*.{ts,tsx}', './config/**/*.{ts,tsx}', './data/**/*.{ts,tsx}'],

  darkMode: 'class',
  theme: {
    extend: {
      // Layout modes (see services/layout.ts, the same query drives the 3D camera):
      //   sheet: controls are a bottom sheet (narrower than 900 px and at least 520 px tall)
      //   short: a phone on its side (under 520 px tall): everything compacts
      screens: {
        sheet: { raw: '(max-width: 899px) and (min-height: 520px)' },
        short: { raw: '(max-height: 519px)' }
      },
      colors: {
        ink: '#F2EEE6',
        mute: '#9C978E',
        line: 'rgba(255,255,255,0.10)',
        bronze: '#CF9F52',
        gold: '#CF9F52',
        brass: '#E8C37D',
        carbon: '#121212',
        surface: '#1A1A1A',
        gunmetal: '#2A2A2A',
        ember: { DEFAULT: '#FF5A00', light: '#FF7A33' },
        studio: '#121212',
        neon: {
          orange: '#FF5500',
          glow: '#FF6600',
          bright: '#FF3D00',
          soft: '#FF7722',
          dark: '#CC4400'
        },
        vercel: {
          black: '#000000',
          dark: '#080808',
          card: '#0d0d0d',
          hover: '#141414',
          border: 'rgba(255, 255, 255, 0.09)',
          borderHover: 'rgba(255, 255, 255, 0.20)',
          textMuted: '#888888',
          textSecondary: '#A1A1A1',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Satoshi', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      transitionTimingFunction: {
        lux: 'cubic-bezier(0.16, 1, 0.3, 1)'
      },
      boxShadow: {
        panel: '0 0 0 1px rgba(255,255,255,0.06), 0 24px 60px -24px rgba(0,0,0,0.8)',
        float: '0 10px 30px -10px rgba(207,159,82,0.35)',
        ember: '0 10px 30px -10px rgba(255,90,0,0.45)',
        'neon-orange': '0 0 25px rgba(255, 85, 0, 0.35)',
        'neon-orange-sm': '0 0 12px rgba(255, 85, 0, 0.25)',
        'neon-orange-lg': '0 0 45px rgba(255, 85, 0, 0.50)',
        'vercel-card': '0 0 0 1px rgba(255, 255, 255, 0.08), 0 8px 32px -4px rgba(0, 0, 0, 0.7)',
      }
    }
  }
}
