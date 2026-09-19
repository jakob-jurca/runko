/**
 * integrations/index.js — provider registry (skeleton).
 *
 * Each provider implements the same interface:
 *   { id, name, description, status: 'stub' | 'coming_soon',
 *     isConnected(), connect(), disconnect() }
 *
 * Activating a provider later = flesh out its connect()/sync logic and set
 * status. The Settings UI and the workouts `source` column already support
 * every provider, so no UI or schema changes are needed.
 */
import { strava } from './strava'
import { garmin } from './garmin'
import { healthkit } from './healthkit'

export const providers = [strava, garmin, healthkit]

export function getProvider(id) {
  return providers.find((p) => p.id === id)
}

// Stub connection state lives in localStorage until real OAuth tokens exist.
// INTEGRATION POINT: replace with a `user_integrations` table in Supabase
// (user_id, provider, access_token, refresh_token, expires_at).
const KEY = (id) => `runko_integration_${id}`

export function markConnected(id, payload = {}) {
  localStorage.setItem(KEY(id), JSON.stringify({ connectedAt: Date.now(), ...payload }))
}

export function markDisconnected(id) {
  localStorage.removeItem(KEY(id))
}

export function isConnectedLocally(id) {
  return Boolean(localStorage.getItem(KEY(id)))
}
