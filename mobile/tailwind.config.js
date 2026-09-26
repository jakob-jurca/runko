// Same design language as the web app's tailwind.config.js.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.js'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#F97316', dark: '#EA580C', light: '#FB923C', faint: 'rgba(249, 115, 22, 0.12)' },
        canvas: '#0B0B0D',
        surface: { DEFAULT: '#141417', raised: '#1B1B1F', line: 'rgba(255, 255, 255, 0.07)' },
      },
      fontFamily: {
        g4: ['Geist_400Regular'],
        g5: ['Geist_500Medium'],
        g6: ['Geist_600SemiBold'],
        g7: ['Geist_700Bold'],
        g8: ['Geist_800ExtraBold'],
      },
      borderRadius: { card: 20 },
    },
  },
  plugins: [],
}
