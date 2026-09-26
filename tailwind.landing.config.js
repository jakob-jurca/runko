import app from './tailwind.config.js'

/**
 * Tailwind build for the landing page only (src/landing/landing.css points
 * here with @config). Same brand tokens as the app, so moving from the page
 * into the app feels like one product; a few extras for the larger canvas.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/landing/**/*.{js,jsx}'],
  theme: {
    extend: {
      ...app.theme.extend,
      transitionTimingFunction: {
        // One easing for the whole page: a heavy, springy settle.
        out: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      maxWidth: {
        page: '1400px',
      },
    },
  },
  plugins: [],
}
