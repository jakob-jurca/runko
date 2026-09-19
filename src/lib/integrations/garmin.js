/**
 * Garmin Connect integration (skeleton).
 *
 * Garmin uses OAuth 1.0a and requires an approved developer program account,
 * so this stays "coming soon" until API access is granted.
 * ACTIVATION: implement the OAuth dance server-side, then set status: 'stub'
 * and wire connect() like strava.js.
 */
export const garmin = {
  id: 'garmin',
  name: 'Garmin Connect',
  description: 'Sync runs from your Garmin watch.',
  status: 'coming_soon',

  isConfigured() {
    return false
  },

  connect() {
    return { ok: false, reason: 'coming_soon' }
  },

  disconnect() {
    return { ok: true }
  },

  /** INTEGRATION POINT: pull activities via Garmin Health API. */
  async syncActivities() {
    throw new Error('Garmin sync not yet activated.')
  },
}
