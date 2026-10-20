/** @type {import('tailwindcss').Config} */
// Design tokens: MVP spec v2 section 13 (palette shared with the prototype deck).
// Breakpoints are Tailwind's defaults: phone < md (768), tablet md–lg, laptop ≥ lg (1024).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        plum: '#5B1A46',
        'plum-deep': '#3E0F2E',
        orange: '#F58220',
        magenta: '#E5006D',
        lilac: '#F7EDF4',
        peach: '#FDF0E3',
        body: '#3D3D3D',
        profit: '#1B8A5A',
        // MVP status colours: the deck's magenta / amber / green, one shade darker so
        // small text passes WCAG AA (≥ 4.5:1) on white and on their own 10% tints.
        loss: '#C8005F',
        thin: '#9A5A00',
        healthy: '#17794F',
        ink: '#3E0F2E',
        // Secondary text: solid, 6.5:1 on white (body/70 was 4.47:1).
        muted: '#5E5E5E',
      },
      fontFamily: {
        sans: [
          'Poppins',
          'Noto Sans Devanagari',
          'Poppins Fallback',
          'ui-sans-serif',
          'system-ui',
          'Segoe UI',
          'Arial',
          'sans-serif',
        ],
      },
      borderRadius: {
        card: '1rem',
      },
      maxWidth: {
        content: '75rem', // 1200 px at the default text size
      },
      minHeight: {
        tap: '3rem', // 48 px tap targets
      },
      minWidth: {
        tap: '3rem',
      },
      spacing: {
        nav: '4rem', // bottom nav height, before the safe-area inset
      },
    },
  },
  plugins: [],
}
