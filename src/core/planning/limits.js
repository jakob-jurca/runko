/**
 * limits.js — every active cap and minimum gap for ONE runner, combined the
 * way runko-research/_RULE-PRECEDENCE.md prescribes.
 *
 * Rules from many research files fire on the same decision (a 62-year-old
 * with a BMI of 31 on three days a week has an age cap, a BMI cap and a
 * frequency cap on weekly progression). Each rule adds a CANDIDATE with the
 * research rule that set it and its precedence level; resolving picks one
 * value per key:
 *
 *   1. SAFETY candidates always apply (hard ceilings and floors).
 *   2. Of the rest, only the highest precedence level present counts: a
 *      population file may replace a generic b-file number, even with a
 *      looser one (p07 r20 replaces b04 r18 for runners on <= 3 days).
 *   3. Within that level, and against SAFETY, the conservative value wins:
 *      the minimum for caps, the maximum for gaps and waiting periods.
 *
 * The winning rule is kept next to every value, so a plan can always say why
 * a number is what it is (b02 r29).
 *
 * Pure data. See ../README.md for the core rules.
 */
import { SAFE } from './rules.js'

/** Precedence levels, highest first (_RULE-PRECEDENCE section 1). */
export const LEVEL = {
  SAFETY: 1,
  MEDICAL: 2, // p02, p03, p06, p08 and the b01 safety gate
  AGE: 3, // p04
  POPULATION: 4, // p01, p05, p07
  PLAN: 5, // b01-b08
  SUPPORT: 6, // s01-s08
  METHOD: 7, // m01-m11
  DEFAULT: 8, // [DEFAULT] rules
}

/** Keys whose conservative value is the MAXIMUM (gaps, waits); all others are caps. */
const GAP_KEYS = new Set(['hardGapHours', 'hardGapHoursZ56', 'noIntensityWeeks'])

export const isGapKey = (key) => GAP_KEYS.has(key)

/** An empty set of candidates. */
export function createLimits() {
  return { candidates: {} }
}

/**
 * Add a candidate value for `key`.
 * @param {object} set
 * @param {string} key
 * @param {number|boolean} value
 * @param {{rule: string, level: number, note?: string}} source
 */
export function addLimit(set, key, value, { rule, level, note = null }) {
  if (value === null || value === undefined || Number.isNaN(value)) return set
  if (!Number.isInteger(level) || level < LEVEL.SAFETY || level > LEVEL.DEFAULT) {
    throw new Error(`addLimit(${key}): unknown precedence level ${level}`)
  }
  ;(set.candidates[key] ||= []).push({ value, rule, level, note })
  return set
}

function conservative(key, a, b) {
  if (typeof a.value === 'boolean') {
    // Booleans are restrictions ("no back-to-back days"): true is conservative.
    return a.value === true ? a : b.value === true ? b : a
  }
  if (isGapKey(key)) return b.value > a.value ? b : a
  return b.value < a.value ? b : a
}

/** One resolved entry: { value, rule, level, candidates }. */
export function resolveKey(key, candidates) {
  if (!candidates?.length) return null
  const safety = candidates.filter((c) => c.level === LEVEL.SAFETY)
  const rest = candidates.filter((c) => c.level !== LEVEL.SAFETY)
  const top = rest.length ? Math.min(...rest.map((c) => c.level)) : null
  const pool = [...safety, ...rest.filter((c) => c.level === top)]
  const winner = pool.reduce((best, c) => conservative(key, best, c))
  return { value: winner.value, rule: winner.rule, level: winner.level, candidates }
}

/**
 * Resolve every key.
 * @returns {{values: object, sources: object}} values: {key: value};
 *   sources: {key: {rule, level, candidates}} for the record.
 */
export function resolveLimits(set) {
  const values = {}
  const sources = {}
  for (const [key, candidates] of Object.entries(set.candidates)) {
    const r = resolveKey(key, candidates)
    if (!r) continue
    values[key] = r.value
    sources[key] = { rule: r.rule, level: r.level, candidates: r.candidates }
  }
  return { values, sources }
}

/**
 * The limits for this runner.
 *
 * The rules added here reproduce the engine as it stands; later phases add
 * the age, population and medical rules. Builders still read rules.js
 * directly — this record is stored with the plan and is what they will read
 * once the research rules replace the old constants.
 *
 * @param {object} inputs - from collectInputs()
 * @param {object} assessment - from assessFitness()
 * @returns {{values: object, sources: object}}
 */
export function computeLimits(inputs, assessment) {
  const set = createLimits()
  const distance = inputs.goal?.distanceKm ?? 0

  addLimit(set, 'weeklyIncreasePct', SAFE.weeklyIncrease, { rule: 'b04 r8', level: LEVEL.DEFAULT })
  addLimit(set, 'weeklyIncreasePct', 0.2, { rule: 'b04 r12', level: LEVEL.SAFETY })

  addLimit(set, 'longRunMaxMin', distance >= 42.2 ? SAFE.marathonLongRunMaxMinutes : SAFE.longRunMaxMinutes, {
    rule: 'b04 r20', level: LEVEL.PLAN,
  })

  addLimit(set, 'recoveryEvery', SAFE.recoveryEvery, { rule: 'b06 r1', level: LEVEL.DEFAULT })
  addLimit(set, 'recoveryFactor', SAFE.recoveryFactor, { rule: 'b06 r2', level: LEVEL.PLAN })

  addLimit(set, 'hardGapHours', 48, { rule: 'b05 r3', level: LEVEL.DEFAULT })

  return resolveLimits(set)
}

/** Ordinal scale for `experience_level` (_RULE-PRECEDENCE section 3). */
export const EXPERIENCE_LEVELS = ['none', 'beginner', 'novice', 'intermediate', 'advanced', 'elite']

/** a >= b on the experience scale. */
export function levelAtLeast(a, b) {
  return EXPERIENCE_LEVELS.indexOf(a) >= EXPERIENCE_LEVELS.indexOf(b)
}
