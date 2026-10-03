import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { trialCopy } from './src/core/pricing.js'

export default defineConfig(({ mode }) => {
  // The same payments switch the app bundle reads (VITE_PAYMENTS_ENABLED).
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const trial = trialCopy(env.VITE_PAYMENTS_ENABLED === 'true')
  return {
    plugins: [
      react(),
      {
        // index.html is static, for crawlers and link previews: its share
        // description gets the trial wording from src/core/pricing.js too.
        name: 'runko-trial-copy',
        transformIndexHtml: (html) => html.replaceAll('%RUNKO_OG_DESCRIPTION%', trial.ogDescription),
      },
    ],
  }
})
