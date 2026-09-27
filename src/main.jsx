/**
 * Entry point: decides which bundle this visit needs, before loading either.
 *
 * A logged-out guest on "/" gets the landing page and nothing else: no
 * router, no Supabase client, no app screens. Everyone else gets the app,
 * exactly as before, and the app keeps owning "/" (the dashboard), so every
 * existing redirect keeps working:
 *   - Supabase's Site URL and the emailed recovery link land on "/" or
 *     /reset-password with tokens in the URL, which always boots the app;
 *   - a failed link (#error_code=…) boots the app, where routeFailedAuthLink
 *     moves it to /reset-password as before;
 *   - login, signup, onboarding and reset all navigate('/') into the app.
 *
 * The session check reads Supabase's own storage key without loading the
 * SDK. A stale token boots the app, which clears it and shows the landing
 * page from there (see Home in App.jsx), so the guess can only err toward
 * loading more, never toward hiding the app from a real user.
 */

/** URL keys Supabase auth puts in the hash or query of an emailed link. */
const AUTH_URL_KEYS = ['access_token', 'refresh_token', 'error', 'error_code', 'error_description', 'type', 'code', 'token_hash']

function hasAuthParams() {
  try {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const query = new URLSearchParams(window.location.search)
    return AUTH_URL_KEYS.some((k) => hash.has(k) || query.has(k))
  } catch {
    return true
  }
}

/** True if supabase-js has a session saved in this browser (key: sb-<ref>-auth-token). */
function hasStoredSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      if (/^sb-.+-auth-token$/.test(localStorage.key(i) ?? '')) return true
    }
    return false
  } catch {
    // Storage blocked: supabase-js cannot persist a session either.
    return false
  }
}

const isGuestOnHome = window.location.pathname === '/' && !hasAuthParams() && !hasStoredSession()

// Two separate loader functions on purpose. Written as an if/else of bare
// import() calls, the production minifier merges them into ONE call and Vite
// keeps only the app's preload list, so a guest got no landing CSS and
// downloaded the whole app. Distinct arrows keep each path's own preloads.
const loaders = {
  landing: () => import('./landing/entry.jsx'),
  app: () => import('./app-entry.jsx'),
}
loaders[isGuestOnHome ? 'landing' : 'app']()
