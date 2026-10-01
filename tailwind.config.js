/** @type {import('tailwindcss').Config} */
// Design system from Team Taraazu's deck (spec section 3).
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
      },
      fontFamily: {
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        card: '1rem',
      },
    },
  },
  plugins: [],
}
