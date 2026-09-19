/**
 * env.js — the ONLY place in src/core that touches bundler-specific config.
 *
 * Everything else in core imports its configuration from here, so porting to
 * React Native means rewriting this one file (to read from expo-constants,
 * react-native-config, or whatever the app uses) and nothing else.
 *
 * `import.meta.env.*` is replaced by Vite with literals at build time, which
 * is also what lets the dev-only branches elsewhere be dead-code-eliminated
 * from production bundles.
 */

const clean = (v) => (v || '').trim().replace(/^["']|["']$/g, '')

export const IS_DEV = import.meta.env.DEV

export const SUPABASE_URL = clean(import.meta.env.VITE_SUPABASE_URL)
export const SUPABASE_ANON_KEY = clean(import.meta.env.VITE_SUPABASE_ANON_KEY)
export const GROQ_API_KEY = clean(import.meta.env.VITE_GROQ_API_KEY)
