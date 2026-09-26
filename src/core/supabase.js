import { createClient } from '@supabase/supabase-js'
import { IS_DEV, SUPABASE_URL, SUPABASE_ANON_KEY, AUTH_OPTIONS } from './env'

// Placeholders keep the app booting (with a visible warning banner) before
// the developer has filled in .env — see isSupabaseConfigured below.
const url = SUPABASE_URL || 'https://placeholder.supabase.co'
const anonKey = SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Parses the emailed link (#access_token=…&type=recovery) into a session
    // and fires PASSWORD_RECOVERY; AuthContext turns that into the recovery
    // lock. Implicit, not PKCE: PKCE only works if the link is opened in the
    // same browser that requested it, and reset emails are often opened on a
    // phone.
    flowType: 'implicit',
    // Platform-specific: detectSessionInUrl (web) or a storage adapter (native).
    ...AUTH_OPTIONS,
  },
})

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

// Dev-only sanity check of the anon key. It is a JWT: its `role` must be
// "anon", its `ref` must match the project in VITE_SUPABASE_URL, and it must
// not be expired — any mismatch here is the classic cause of blanket 401/403s.
if (IS_DEV) {
  if (!isSupabaseConfigured) {
    console.error('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — fill in .env and restart `npm run dev`.')
  } else {
    try {
      if (typeof atob !== 'function') throw new Error('no base64 decoder')
      const payload = JSON.parse(atob(anonKey.split('.')[1]))
      const ref = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
      if (payload.role !== 'anon') {
        console.error(`[supabase] Key has role "${payload.role}" — use the anon public key, not the ${payload.role} key.`)
      }
      if (ref && payload.ref && payload.ref !== ref) {
        console.error(`[supabase] Key/project mismatch: key belongs to "${payload.ref}" but the URL points at "${ref}". Auth will fail with 401/403.`)
      }
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        console.error('[supabase] The anon key is EXPIRED — copy a fresh one from Settings → API.')
      }
    } catch {
      console.warn('[supabase] VITE_SUPABASE_ANON_KEY does not parse as a JWT — double-check the value in .env.')
    }
  }
}
