/**
 * heart-rate.js — training heart-rate zones, derived from age.
 *
 * The runner is never asked for their max HR. Almost nobody knows it, and a
 * guess is worse than a formula: we use Tanaka (208 - 0.7 x age), which fits
 * the population data considerably better than the old 220 - age, especially
 * for runners over 40 where 220 - age under-predicts by around 10 bpm.
 *
 * Pure calculation, zero cost. Every workout's HR range is computed here at
 * plan-build time and stored, so rendering a card never calls anything.
 *
 * Platform-agnostic (see ./README.md): no React, no DOM, no network.
 */

/** Ages outside this are almost certainly a data error. */
const MIN_AGE = 10
const MAX_AGE = 100

/**
 * Estimated maximum heart rate (bpm) for an age, via Tanaka et al. (2001).
 * @returns {number|null} null when the age is missing or implausible
 */
export function maxHeartRate(age) {
  const years = Number(age)
  if (!Number.isFinite(years) || years < MIN_AGE || years > MAX_AGE) return null
  return Math.round(208 - 0.7 * years)
}

/**
 * The five training zones, as a fraction of max HR.
 * `key` matches the pace keys in periodization.js where they correspond.
 */
export const ZONES = [
  { zone: 1, key: 'recovery',  min: 0.5, max: 0.6, label: 'Regeneracija',  labelEn: 'Recovery' },
  { zone: 2, key: 'easy',      min: 0.6, max: 0.7, label: 'Lahkotno',      labelEn: 'Easy / aerobic' },
  { zone: 3, key: 'moderate',  min: 0.7, max: 0.8, label: 'Zmerno',        labelEn: 'Moderate' },
  { zone: 4, key: 'threshold', min: 0.8, max: 0.9, label: 'Prag',          labelEn: 'Threshold' },
  { zone: 5, key: 'interval',  min: 0.9, max: 1.0, label: 'Intervali',     labelEn: 'Interval' },
]

/**
 * All five zones as bpm ranges for a given age.
 * @returns {Array|null} null when the age is unusable
 */
export function heartRateZones(age) {
  const hrMax = maxHeartRate(age)
  if (!hrMax) return null
  return ZONES.map((z) => ({
    ...z,
    hr_max_used: hrMax,
    bpm_min: Math.round(hrMax * z.min),
    bpm_max: Math.round(hrMax * z.max),
  }))
}

/**
 * Which zone a given training pace belongs to.
 *
 * The pace keys come from periodization.js.
 */
const PACE_KEY_TO_ZONE = {
  recovery: 1,
  // Warm-ups and cool-downs are prescribed AT easy pace, so they must show
  // the easy zone. Putting them in zone 1 contradicted the pace on the same
  // line of the card.
  warmup: 2,
  cooldown: 2,
  easy: 2,
  marathon: 3,
  goal: 3,
  threshold: 4,
  interval: 5,
  repetition: 5,
}

/** Which zone a workout INTENSITY maps to, when there is no pace key. */
const INTENSITY_TO_ZONE = { rest: 1, easy: 2, moderate: 3, hard: 4 }

/**
 * The target HR range for one workout or segment.
 *
 * @param {number|null} age
 * @param {object} opts
 * @param {string} [opts.paceKey] - 'easy' | 'threshold' | 'interval' | …
 * @param {string} [opts.intensity] - fallback when there is no pace key
 * @returns {{min: number, max: number, zone: number, label: string}|null}
 *          null when the age is unknown — callers must render without it
 */
export function heartRateFor(age, { paceKey = null, intensity = null } = {}) {
  const hrMax = maxHeartRate(age)
  if (!hrMax) return null

  const zoneNumber =
    PACE_KEY_TO_ZONE[paceKey] ?? INTENSITY_TO_ZONE[intensity] ?? 2
  const zone = ZONES.find((z) => z.zone === zoneNumber) || ZONES[1]

  return {
    min: Math.round(hrMax * zone.min),
    max: Math.round(hrMax * zone.max),
    zone: zone.zone,
    label: zone.label,
  }
}

/** "152-168 bpm", or null when there is no age to work from. */
export function formatHeartRate(hr) {
  if (!hr) return null
  return `${hr.min}-${hr.max} bpm`
}
