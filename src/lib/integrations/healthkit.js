/**
 * Apple Watch / HealthKit integration (skeleton).
 *
 * HealthKit has no web API — data can only be read by a native iOS app.
 * ACTIVATION PATH: ship a small iOS companion (or use Capacitor) that reads
 * HKWorkoutType.running and POSTs to Supabase with source='healthkit'.
 * This module exists so the Settings UI and provider registry are already
 * shaped for it.
 */
export const healthkit = {
  id: 'healthkit',
  name: 'Apple Watch',
  description: 'Import workouts from Apple Health.',
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

  async syncActivities() {
    throw new Error('HealthKit sync requires the iOS companion app.')
  },
}
