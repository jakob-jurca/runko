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
import { breakCategory, returnStartFactor, easyOnlyWeeks } from './returning.js'
import { SAFE, WEEKLY_FLOOR_KM, longRunMaxMinutes, WALK_BASE_30, WALK_BASE_35 } from './rules.js'

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
const GAP_KEYS = new Set(['hardGapHours', 'hardGapHoursZ56', 'noIntensityWeeks', 'walkBaseWeeks'])

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
 * The load limits for this runner (runko-research b04, b06, p04 and the
 * product decisions). Later phases add the remaining population rules.
 *
 * Unknown optional data counts at the conservative end: no years of running
 * or injury history means no masters exception, no marathon count means no
 * "experienced marathoner" exception.
 *
 * @param {object} inputs - from collectInputs()
 * @param {object} assessment - from assessFitness()
 * @returns {{values: object, sources: object}}
 */
export function computeLimits(inputs, assessment) {
  const set = createLimits()
  const distance = inputs.goal?.distanceKm ?? 0
  const age = inputs.age ?? null
  const level = assessment.experience_level || 'beginner'
  const years = (inputs.experienceMonths ?? 0) / 12
  const injuryFree = inputs.safety?.injuryLast12m === false
  const marathons = inputs.health?.marathonsCompleted ?? 0

  // --- weekly progression (b04 r8-12, p04 r6-8) -------------------------------
  addLimit(set, 'weeklyIncreasePct', SAFE.weeklyIncrease, { rule: 'b04 r8', level: LEVEL.DEFAULT })
  addLimit(set, 'weeklyIncreasePct', SAFE.weeklyCeiling, { rule: 'b04 r12', level: LEVEL.SAFETY })
  addLimit(set, 'weeklyCeilingPct', SAFE.weeklyCeiling, { rule: 'b04 r12', level: LEVEL.SAFETY })
  if (age !== null && age >= 60) {
    const seasoned = years >= 10 && injuryFree
    addLimit(set, 'weeklyIncreasePct', seasoned ? 0.07 : 0.05, { rule: 'p04 r8', level: LEVEL.AGE })
  } else if (age !== null && age >= 50) {
    addLimit(set, 'weeklyIncreasePct', 0.08, { rule: 'p04 r7', level: LEVEL.AGE })
  } else if (age !== null && age >= 40) {
    // The 40-49 tier: the ordinary 10% and a 48 h gap, recorded so
    // the rule behind each value is the masters one (p04 r6, r9, r14).
    addLimit(set, 'weeklyIncreasePct', 0.1, { rule: 'p04 r6', level: LEVEL.AGE })
    addLimit(set, 'hardGapHours', 48, { rule: 'p04 r9', level: LEVEL.AGE })
    addLimit(set, 'recoveryFactor', 0.75, { rule: 'p04 r14', level: LEVEL.AGE })
  }
  if (age !== null && age >= 50 && age < 60) addLimit(set, 'recoveryFactor', 0.75, { rule: 'p04 r14', level: LEVEL.AGE })
  // p04 r27: a beginner from 60 runs three days a week, never on consecutive days.
  if (age !== null && age >= 60 && (level === 'none' || level === 'beginner')) {
    addLimit(set, 'maxRunDays', 3, { rule: 'p04 r27', level: LEVEL.AGE })
  }
  addLimit(set, 'weeklyFloorKm', WEEKLY_FLOOR_KM[level] ?? WEEKLY_FLOOR_KM.novice, { rule: 'b04 r9', level: LEVEL.PLAN })
  if (age !== null && age >= 50) {
    // An age cap would be meaningless under a +2/+3/+5 km floor: masters
    // step by the smallest whole kilometre instead.
    addLimit(set, 'weeklyFloorKm', 1, { rule: 'p04 r7-8 (whole-km step)', level: LEVEL.AGE })
  }
  // b04 r2: a stated (not logged) weekly volume is started at 90%.
  addLimit(set, 'startVolumeFactor', assessment.weekly_source === 'stated' ? SAFE.statedVolumeFactor : 1, {
    rule: 'b04 r2', level: LEVEL.PLAN,
  })

  // --- coming back (b07 r11-15, p06 r27-28) ----------------------------------------
  const breakDays = assessment.break_days ?? null
  const comingBack = (inputs.signals?.returning || (breakDays ?? 0) > 28) && breakCategory(breakDays) !== 'I'
  if (comingBack) {
    addLimit(set, 'startVolumeFactor', returnStartFactor(breakDays), { rule: 'b07 r11-13', level: LEVEL.PLAN })
  }
  if (inputs.signals?.returning && (comingBack || inputs.signals.injury)) {
    // Z1-Z2 only, strides at most, until the return period is over (b07 r15) or
    // the volume is back to 50% of before an injury (p06 r28).
    addLimit(set, 'noIntensityWeeks', easyOnlyWeeks(breakDays, { injury: Boolean(inputs.signals.injury) }), {
      rule: inputs.signals.injury ? 'p06 r28' : 'b07 r15', level: LEVEL.PLAN,
    })
  }

  // --- time-crunched, 1-3 days a week (p07 r1, r15, r17) ---------------------------
  const daysOffered = inputs.constraints?.maxRunDays ?? inputs.daysPerWeek ?? null
  if (daysOffered !== null && daysOffered <= 3) {
    if (daysOffered <= 1) addLimit(set, 'maxGoalKm', 5, { rule: 'p07 r1', level: LEVEL.POPULATION })
    else if (daysOffered <= 2) {
      // r15: no marathon on two days. r17: a half needs a strong base (the
      // "previous half completed" it also asks for is not known here).
      addLimit(set, 'maxGoalKm', levelAtLeast(level, 'intermediate') ? 21.1 : 10, { rule: 'p07 r15-17', level: LEVEL.POPULATION })
    }
  }

  // --- long run duration (decision 1, b04 r20, p04 r21) --------------------------
  addLimit(set, 'longRunMaxMin', longRunMaxMinutes(distance), { rule: 'b04 r20', level: LEVEL.PLAN })
  if (age !== null && age >= 60 && marathons < 2) {
    addLimit(set, 'longRunMaxMin', age >= 70 ? 120 : 150, { rule: 'p04 r21', level: LEVEL.AGE })
  }

  // --- recovery weeks (b06 r1-3, p04 r14) ------------------------------------------
  addLimit(set, 'recoveryEvery', SAFE.recoveryEvery, { rule: 'b06 r1', level: LEVEL.DEFAULT })
  if (level === 'none' || level === 'beginner') {
    // 2:1 for beginners on kilometre plans; walk-run weeks follow their ladder.
    addLimit(set, 'recoveryEvery', 3, { rule: 'b06 r1 (beginner)', level: LEVEL.PLAN })
  }
  if (age !== null && age >= 50) addLimit(set, 'recoveryEvery', 3, { rule: 'p04 r14', level: LEVEL.AGE })
  addLimit(set, 'recoveryFactor', SAFE.recoveryFactor, { rule: 'b06 r2', level: LEVEL.PLAN })
  if (age !== null && age >= 60) addLimit(set, 'recoveryFactor', 0.7, { rule: 'p04 r14', level: LEVEL.AGE })
  addLimit(set, 'recoveryLongFactor', SAFE.recoveryLongFactor, { rule: 'b06 r3', level: LEVEL.PLAN })

  addLimit(set, 'hardGapHours', 48, { rule: 'b05 r3', level: LEVEL.DEFAULT })
  // b05 r4 (p04 r9-11): older runners recover slower between hard sessions.
  if (age !== null && age >= 60) addLimit(set, 'hardGapHours', 72, { rule: 'b05 r4 / p04', level: LEVEL.AGE })
  else if (age !== null && age >= 50) addLimit(set, 'hardGapHours', 60, { rule: 'b05 r4 / p04', level: LEVEL.AGE })

  // --- teenagers, 15-17 (p08 r8-11, r14-16, r19) ---------------------------------
  // Under 15 never reaches here (the gate). Volumes, run days, long run and
  // the goal ceiling are all caps; a marathon is refused, not squeezed.
  if (age !== null && age >= 15 && age < 18) {
    const seventeen = age >= 17
    addLimit(set, 'weeklyMaxKm', seventeen ? 60 : 45, { rule: seventeen ? 'p08 r10' : 'p08 r9', level: LEVEL.MEDICAL })
    addLimit(set, 'maxRunDays', seventeen ? 6 : 5, { rule: seventeen ? 'p08 r10' : 'p08 r9', level: LEVEL.MEDICAL })
    addLimit(set, 'longRunMaxMin', seventeen ? 90 : 75, { rule: seventeen ? 'p08 r10' : 'p08 r9', level: LEVEL.MEDICAL })
    addLimit(set, 'maxGoalKm', age < 16 ? 10 : 21.1, { rule: age < 16 ? 'p08 r14' : 'p08 r15-16', level: LEVEL.MEDICAL })
    // r11: at most two build weeks in a row, then a lighter one.
    addLimit(set, 'recoveryEvery', 3, { rule: 'p08 r11', level: LEVEL.MEDICAL })
    addLimit(set, 'weeklyIncreasePct', 0.1, { rule: 'p08 r11', level: LEVEL.MEDICAL })
    // r12: a growth spurt (2 cm or more in three months) caps the week at 5%.
    if ((inputs.health?.heightGain3moCm ?? 0) >= 2) {
      addLimit(set, 'weeklyIncreasePct', 0.05, { rule: 'p08 r12', level: LEVEL.MEDICAL })
    }
  }

  // --- heavier beginners, BMI 30+ (p05 r12, r15, r17, r29) -------------------------
  // For someone who does not run yet; a runner already at level keeps the
  // ordinary rules. Unknown BMI adds nothing.
  const bmi = inputs.health?.bmi ?? null
  if (bmi !== null && bmi >= 30 && (level === 'none' || level === 'beginner')) {
    addLimit(set, 'weeklyIncreasePct', 0.1, { rule: 'p05 r12', level: LEVEL.POPULATION })
    addLimit(set, 'maxRunDays', 3, { rule: 'p05 r15', level: LEVEL.POPULATION })
    addLimit(set, 'noIntensityWeeks', 26, { rule: 'p05 r17', level: LEVEL.POPULATION })
    addLimit(set, 'raceFloor', true, { rule: 'p05 r29', level: LEVEL.POPULATION })
    // r8-9: walk first — 2-4 weeks at BMI 30-34.9, 4-8 at 35-39.9 — before any run-walk.
    if (level === 'none') {
      addLimit(set, 'walkBaseWeeks', bmi >= 35 ? WALK_BASE_35.minutes.length : WALK_BASE_30.minutes.length, {
        rule: bmi >= 35 ? 'p05 r9' : 'p05 r8', level: LEVEL.POPULATION,
      })
    }
  }

  return resolveLimits(set)
}

/** Ordinal scale for `experience_level` (_RULE-PRECEDENCE section 3). */
export const EXPERIENCE_LEVELS = ['none', 'beginner', 'novice', 'intermediate', 'advanced', 'elite']

/** a >= b on the experience scale. */
export function levelAtLeast(a, b) {
  return EXPERIENCE_LEVELS.indexOf(a) >= EXPERIENCE_LEVELS.indexOf(b)
}
