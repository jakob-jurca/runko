/** @type {import('tailwindcss').Config} */
export default {
  // The landing page has its own build (tailwind.landing.config.js) so its
  // classes never ship in the app's CSS.
  content: ['./index.html', './src/**/*.{js,jsx}', '!./src/landing/**'],
  theme: {
    extend: {
      colors: {
        // Runko brand: athletic orange on a near-black canvas. Orange is the
        // only accent; workout types keep their own muted semantic tints.
        primary: {
          DEFAULT: '#F97316',
          dark: '#EA580C',
          light: '#FB923C',
          faint: 'rgba(249, 115, 22, 0.12)',
        },
        // One neutral family (zinc), with a slightly lifted canvas so cards
        // read as surfaces rather than holes.
        canvas: '#0B0B0D',
        surface: {
          DEFAULT: '#141417',
          raised: '#1B1B1F',
          line: 'rgba(255, 255, 255, 0.07)',
        },
      },
      fontFamily: {
        sans: ['"Geist Variable"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Geist Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        // Radius scale: controls 12px, cards 20px, pills full.
        card: '1.25rem',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.45s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 0.3s ease-out both',
        'pulse-dot': 'pulse-dot 1.2s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
}
