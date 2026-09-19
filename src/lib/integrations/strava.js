/**
 * Strava integration (OAuth stub).
 *
 * ACTIVATION CHECKLIST (when going live):
 *  1. Set VITE_STRAVA_CLIENT_ID in .env (from strava.com/settings/api).
 *  2. Add a backend token-exchange endpoint (the client_secret must NOT live
 *     in the browser) — e.g. a Supabase Edge Function at /strava-callback.
 *  3. Store tokens in a `user_integrations` table.
 *  4. Implement syncActivities() to pull runs into `workouts` with source='strava'.
 */

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize'

export const strava = {
  id: 'strava',
  name: 'Strava',
  description: 'Auto-import your runs from Strava.',
  status: 'stub', // OAuth redirect works once VITE_STRAVA_CLIENT_ID is set

  isConfigured() {
    return Boolean(import.meta.env.VITE_STRAVA_CLIENT_ID)
  },

  /** Builds the real OAuth URL. Without a client id this is a no-op stub. */
  connect() {
    if (!this.isConfigured()) {
      return { ok: false, reason: 'coming_soon' }
    }
    const params = new URLSearchParams({
      client_id: import.meta.env.VITE_STRAVA_CLIENT_ID,
      redirect_uri: `${window.location.origin}/settings`,
      response_type: 'code',
      scope: 'activity:read_all',
      approval_prompt: 'auto',
    })
    window.location.href = `${STRAVA_AUTH_URL}?${params}`
    return { ok: true }
  },

  disconnect() {
    // INTEGRATION POINT: revoke token via https://www.strava.com/oauth/deauthorize
    return { ok: true }
  },

  /** INTEGRATION POINT: fetch activities and insert into `workouts`. */
  async syncActivities() {
    throw new Error('Strava sync not yet activated.')
  },
}
