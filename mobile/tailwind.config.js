// Same design language as the web app's tailwind.config.js.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#F97316', dark: '#EA580C', light: '#FB923C', faint: 'rgba(249, 115, 22, 0.12)' },
        canvas: '#0B0B0D',
        surface: { DEFAULT: '#141417', raised: '#1B1B1F', line: 'rgba(255, 255, 255, 0.07)' },
      },
      fontFamily: {
        sans: ['Geist_400Regular'],
        medium: ['Geist_500Medium'],
        semibold: ['Geist_600SemiBold'],
        bold: ['Geist_700Bold'],
      },
      borderRadius: { card: 20 },
    },
  },
  plugins: [],
}
