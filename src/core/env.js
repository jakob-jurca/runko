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
// NOTE: there is deliberately NO AI key here. Vite inlines every
// import.meta.env value into the browser bundle, so a Groq key in this file
// would be readable by anyone. It lives as a Supabase secret and is used
// only by supabase/functions/ai-proxy.

// Extra supabase-js auth options for this platform. On the web the SDK reads
// the emailed link from the URL; a native port swaps in its own storage.
export const AUTH_OPTIONS = { detectSessionInUrl: true }
