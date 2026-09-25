/**
 * periodization.js — the training-plan MATHS.
 *
 * This module decides the structure of a plan: how fit the runner is, what
 * paces follow from that, which phase each week belongs to, how much volume
 * it carries, and which session lands on which day. It is deterministic,
 * dependency-free and fully testable without an API call.
 *
 * The AI never invents structure. It receives the skeleton this file produces
 * and only writes the words (see core/plan.js).
 *
 * Platform-agnostic (see ./README.md): no React, no DOM, no network.
 */

import { heartRateFor, heartRateZones, maxHeartRate } from './heart-rate.js'

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// ---------------------------------------------------------------------------
// 1. VDOT — Jack Daniels' fitness number
// ---------------------------------------------------------------------------

/** Oxygen cost (ml/kg/min) of running at v metres per minute. */
export function vo2AtVelocity(v) {
  return -4.6 + 0.182258 * v + 0.000104 * v * v
}

/** Inverse of vo2AtVelocity: the velocity (m/min) that costs `vo2`. */
export function velocityForVo2(vo2) {
  const a = 0.000104
  const b = 0.182258
  const c = -(4.6 + vo2)
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
}

/** Fraction of VO2max sustainable for t minutes (Daniels' drop-off curve). */
export function percentMaxForDuration(t) {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t)
}

/**
 * VDOT implied by covering `distanceKm` in `durationMin` as a RACE effort.
 */
export function vdotFromRace(distanceKm, durationMin) {
  if (!(distanceKm > 0) || !(durationMin > 0)) return null
  const velocity = (distanceKm * 1000) / durationMin
  return vo2AtVelocity(velocity) / percentMaxForDuration(durationMin)
}

/**
 * Logged runs are training, not races, so the same pace at a lower perceived
 * effort implies MORE fitness. These divide the run's time down to the
 * race-equivalent time it corresponds to.
 *
 * Calibrated against the common case: a runner whose steady runs sit at
 * 6:30/km (effort 3) races 5 km in roughly 28 minutes, i.e. VDOT ~35. The
 * previous factors were far too timid (effort 3 = 1.07) and scored that
 * runner at VDOT 30, which then prescribed 8:11/km easy runs.
 */
const EFFORT_RACE_FACTOR = { 1: 1.32, 2: 1.25, 3: 1.18, 4: 1.07, 5: 1.0 }

/** Sensible VDOT when there is nothing logged to work from. */
const VDOT_BY_LEVEL = { beginner: 32, intermediate: 42, advanced: 52 }

export const VDOT_MIN = 25
export const VDOT_MAX = 85

/**
 * How far above the median of a runner's own runs a single result may sit
 * before it is treated as a data error rather than a breakthrough. Real
 * day-to-day spread across training runs is a few points; +8 is generous.
 */
export const OUTLIER_MARGIN = 8

/**
 * Best estimate of current fitness from the runner's logged runs.
 *
 * Takes the BEST single run rather than an average: one good effort reveals
 * fitness, while easy days only show restraint. Very short runs are ignored
 * because the formula is unreliable below ~1.5 km.
 *
 * @param {Array<{distance, duration, effort}>} runs
 * @param {string} [fitnessLevel] - fallback when nothing usable is logged
 * @returns {{vdot: number, source: 'runs'|'level', basedOn: object|null}}
 */
export function estimateVdot(runs = [], fitnessLevel = 'beginner') {
  const candidates = []

  for (const r of runs) {
    const distance = Number(r.distance)
    const duration = Number(r.duration)
    if (!(distance >= 1.5) || !(duration > 0)) continue

    // Reject physiologically impossible rows outright. A 5 km "in 5 minutes"
    // (a mistyped duration, or a unit mix-up from an import) used to drag the
    // estimate to the clamp and prescribe elite paces to a beginner.
    const pace = duration / distance
    if (pace < MIN_PLAUSIBLE_PACE || pace > MAX_PLAUSIBLE_PACE) continue

    const factor = EFFORT_RACE_FACTOR[Number(r.effort)] ?? EFFORT_RACE_FACTOR[3]
    const vdot = vdotFromRace(distance, duration / factor)
    if (vdot) candidates.push({ vdot, run: r })
  }

  if (!candidates.length) {
    return {
      vdot: VDOT_BY_LEVEL[fitnessLevel] ?? VDOT_BY_LEVEL.beginner,
      source: 'level',
      basedOn: null,
    }
  }

  // Take the best effort — one good run reveals fitness where easy days only
  // show restraint — but never let a lone outlier define the runner. Anything
  // more than OUTLIER_MARGIN above the median of their runs is treated as a
  // bad row and capped, so a single suspect entry cannot poison the plan.
  const sorted = candidates.map((c) => c.vdot).sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const ceiling = median + OUTLIER_MARGIN

  const usable = candidates.filter((c) => c.vdot <= ceiling)
  let best = (usable.length ? usable : candidates).reduce((a, b) => (b.vdot > a.vdot ? b : a))

  // An all-out effort over a real distance IS a race result, and it beats
  // anything inferred from training runs. The effort scaling above is a
  // guess about what an easy run implies; without this cap, an easy 8 km at
  // effort 2 could "prove" more fitness than the 10 km time trial run the
  // same week, and a stretch target time would be judged comfortable.
  const races = candidates.filter((c) => Number(c.run.effort) >= 5 && Number(c.run.distance) >= 3)
  if (races.length) {
    const bestRace = races.reduce((a, b) => (b.vdot > a.vdot ? b : a))
    if (best.vdot > bestRace.vdot) best = bestRace
  }

  return {
    vdot: clamp(round1(Math.min(best.vdot, ceiling)), VDOT_MIN, VDOT_MAX),
    source: 'runs',
    basedOn: best.run,
  }
}

// ---------------------------------------------------------------------------
// 2. Training paces
// ---------------------------------------------------------------------------

/**
 * Daniels' five training intensities, as a fraction of VO2max.
 *
 * IMPORTANT: these are fractions of VO2, NOT of velocity at VDOT. Applying
 * them to velocity (as this file used to) inflates the easy pace badly at the
 * low VDOTs beginners live at — it produced 8:16/km for a VDOT-30 runner whose
 * table pace is 7:52/km, and the error grew as fitness fell. Feeding the
 * fraction through the same oxygen-cost curve reproduces the published table
 * to within ~0.2 min/km from VDOT 30 to 60; see tests/paces.test.mjs.
 */
export const PACE_INTENSITIES = {
  easy: 0.7,
  marathon: 0.8,
  threshold: 0.88,
  interval: 0.98,
  repetition: 1.05,
}

/** Human labels used in the plan and shown on each workout card. */
export const PACE_LABELS = {
  easy: 'lahkotno',
  marathon: 'maratonski tempo',
  threshold: 'pragovni',
  interval: 'intervalni',
  repetition: 'ponovitve',
  goal: 'ciljni tempo',
}

/**
 * Hard plausibility bounds on any prescribed pace, in min/km. Nothing outside
 * this can be right: 2:30/km is inside world-record territory and 12:00/km is
 * a walk. A pace escaping these means the inputs were bad, and it is better to
 * clamp than to tell a beginner to run 3:13/km.
 */
export const MIN_PLAUSIBLE_PACE = 2.5
export const MAX_PLAUSIBLE_PACE = 12

/**
 * The five training paces, in minutes per kilometre.
 * @returns {{easy, marathon, threshold, interval, repetition}}
 */
export function pacesFromVdot(vdot) {
  const out = {}
  for (const [name, intensity] of Object.entries(PACE_INTENSITIES)) {
    const velocity = velocityForVo2(intensity * vdot) // m/min
    out[name] = clamp(1000 / velocity, MIN_PLAUSIBLE_PACE, MAX_PLAUSIBLE_PACE)
  }
  return out
}

/**
 * How wide a pace target should be, by intensity.
 *
 * A single "6:17/km" reads as a precision nobody can hold — terrain, wind and
 * how the legs feel move every run. Easy runs get an asymmetric window because
 * running them slower is fine (and usually better); hard efforts are tighter
 * because the pace is the point.
 */
const PACE_WINDOW = {
  easy: [-0.02, 0.06],
  warmup: [-0.02, 0.06],
  cooldown: [-0.02, 0.06],
  recovery: [-0.02, 0.08],
  marathon: [-0.02, 0.03],
  goal: [-0.02, 0.03],
  threshold: [-0.02, 0.02],
  interval: [-0.02, 0.02],
  repetition: [-0.02, 0.02],
}

/**
 * A target pace window, e.g. "6:10-6:40/km".
 * @returns {{min: number, max: number, label: string}}
 */
export function paceRange(minPerKm, paceKey = 'easy') {
  const [lo, hi] = PACE_WINDOW[paceKey] ?? PACE_WINDOW.easy
  const fast = minPerKm * (1 + lo)
  const slow = minPerKm * (1 + hi)
  return { min: fast, max: slow, label: `${formatPace(fast)}-${formatPace(slow)}/km` }
}

/** "5:42" from 5.7 min/km. */
export function formatPace(minPerKm) {
  if (!Number.isFinite(minPerKm) || minPerKm <= 0) return null
  const m = Math.floor(minPerKm)
  const s = Math.round((minPerKm - m) * 60)
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// 2b. Goal distance, goal time, and whether the goal is realistic
// ---------------------------------------------------------------------------

/**
 * Parse a duration a runner typed. Accepts "1:45:00", "45:30", "21:30",
 * "90" (minutes), "1h45", "45m". Returns MINUTES, or null if unparseable.
 */
export function parseDuration(text) {
  if (typeof text === 'number') return Number.isFinite(text) && text > 0 ? text : null
  const raw = String(text ?? '').trim().toLowerCase()
  if (!raw) return null

  // 1h45, 1h45m, 1h45m30s, 25m, 30s. The "m" is optional so that the common
  // shorthand "1h45" (an hour and 45 minutes) parses.
  const hms = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m?)?\s*(?:(\d+)\s*s)?$/.exec(raw)
  if (hms && (hms[1] || hms[2] || hms[3])) {
    return Number(hms[1] || 0) * 60 + Number(hms[2] || 0) + Number(hms[3] || 0) / 60
  }

  // 1:45:00 or 45:30
  const parts = raw.split(':').map((p) => p.trim())
  if (parts.length > 1 && parts.every((p) => /^\d+$/.test(p))) {
    const nums = parts.map(Number)
    if (nums.length === 3) return nums[0] * 60 + nums[1] + nums[2] / 60
    if (nums.length === 2) return nums[0] + nums[1] / 60 // mm:ss
  }

  // bare number = minutes
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw)
    return n > 0 ? n : null
  }
  return null
}

/**
 * The target time is typed as separate hours / minutes / seconds fields: a
 * single "4:00" box was read as four minutes for a marathon. Seconds only
 * matter below 10 km; above that the field is not shown.
 */
export const targetTimeHasSeconds = (distanceKm) => Number(distanceKm) > 0 && Number(distanceKm) < 10

/** {hours, minutes, seconds} as typed → MINUTES, or null if empty or invalid. */
export function targetTimeFromParts({ hours = '', minutes = '', seconds = '' } = {}) {
  const parts = [hours, minutes, seconds].map((v) => String(v ?? '').trim())
  if (parts.every((p) => p === '')) return null
  if (!parts.every((p) => p === '' || /^\d+$/.test(p))) return null
  const [h, m, s] = parts.map((p) => Number(p || 0))
  const total = h * 60 + m + s / 60
  return total > 0 ? total : null
}

/** Minutes → {hours, minutes, seconds} as strings, for prefilling the fields. */
export function targetTimeToParts(minutes) {
  const total = Math.round(Number(minutes) * 60)
  if (!Number.isFinite(total) || total <= 0) return { hours: '', minutes: '', seconds: '' }
  return {
    hours: String(Math.floor(total / 3600)),
    minutes: String(Math.floor((total % 3600) / 60)),
    seconds: String(total % 60),
  }
}

/** Implied paces outside this range are almost certainly a typing slip. */
export const TARGET_PACE_LIMITS = { fastest: 2 + 50 / 60, slowest: 12 }

/**
 * The pace a target time implies, and whether it looks mistyped.
 * @returns {{paceMin: number, label: string, warning: 'too_fast'|'too_slow'|null}|null}
 */
export function targetPaceCheck(timeMin, distanceKm) {
  if (!(timeMin > 0) || !(Number(distanceKm) > 0)) return null
  const paceMin = timeMin / Number(distanceKm)
  const warning = paceMin < TARGET_PACE_LIMITS.fastest ? 'too_fast'
    : paceMin > TARGET_PACE_LIMITS.slowest ? 'too_slow' : null
  return { paceMin, label: formatPace(paceMin), warning }
}

/** Minutes → "1:45:00" (or "45:30" under an hour). */
export function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  const total = Math.round(minutes * 60)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Predicted race time (minutes) at a given VDOT over any distance.
 *
 * vdotFromRace() is monotonically decreasing in time, so a binary search
 * inverts it cleanly for ANY distance — which is the point: 15 km and 30 km
 * are just numbers here, exactly like 5 or 42.2.
 */
export function raceTimeForVdot(vdot, distanceKm) {
  if (!(vdot > 0) || !(distanceKm > 0)) return null
  let lo = 1
  let hi = 60 * 12 // 12 hours is beyond anything we plan for
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    const v = vdotFromRace(distanceKm, mid)
    if (v === null) break
    if (v > vdot) lo = mid
    else hi = mid
  }
  return round2((lo + hi) / 2)
}

/**
 * How much a runner can realistically improve over one full training block.
 * Deliberately modest: promising more than this produces paces that injure
 * people.
 */
const REALISTIC_IMPROVEMENT = 0.07 // 7% faster by the end of a block

/** Thresholds on (target / currently-predicted) time. Lower = more ambitious. */
const GOAL_BANDS = [
  { min: 0.99, verdict: 'comfortable' },
  { min: 0.95, verdict: 'realistic' },
  { min: 1 - REALISTIC_IMPROVEMENT - 0.02, verdict: 'ambitious' },
]

/**
 * Compare the runner's target time against what their current fitness
 * predicts, and decide what pace the plan should actually be built around.
 *
 * When a target is far out of reach we do NOT train them at a pace they
 * cannot hold — the plan is built toward the best realistic outcome, and the
 * coach is told to say so plainly (see core/ai.js).
 *
 * @param {object} opts
 * @param {number} opts.vdot
 * @param {number} opts.targetDistanceKm
 * @param {number|null} [opts.targetTimeMin]
 * @returns {object|null} null when there is no target distance
 */
export function assessGoal({ vdot, targetDistanceKm, targetTimeMin = null }) {
  if (!(targetDistanceKm > 0)) return null

  const predictedMin = raceTimeForVdot(vdot, targetDistanceKm)
  const achievableMin = round2(predictedMin * (1 - REALISTIC_IMPROVEMENT))

  if (!(targetTimeMin > 0)) {
    return {
      target_distance_km: targetDistanceKm,
      target_time_min: null,
      predicted_time_min: predictedMin,
      achievable_time_min: achievableMin,
      planning_time_min: achievableMin,
      goal_pace_min_per_km: round2(achievableMin / targetDistanceKm),
      verdict: 'no_target',
      realistic: true,
      message: null,
    }
  }

  const ratio = targetTimeMin / predictedMin
  const band = GOAL_BANDS.find((b) => ratio >= b.min)
  const verdict = band ? band.verdict : 'unrealistic'
  const realistic = verdict !== 'unrealistic'

  // Unrealistic targets are replaced by the best realistic outcome; ambitious
  // ones are kept, because that is what a stretch goal is for.
  const planningTimeMin = realistic ? targetTimeMin : achievableMin

  return {
    target_distance_km: targetDistanceKm,
    target_time_min: targetTimeMin,
    predicted_time_min: predictedMin,
    achievable_time_min: achievableMin,
    planning_time_min: planningTimeMin,
    goal_pace_min_per_km: round2(planningTimeMin / targetDistanceKm),
    verdict,
    realistic,
    message: goalMessage({ verdict, targetDistanceKm, targetTimeMin, predictedMin, achievableMin }),
  }
}

/** A plain-English summary of the verdict, handed to the AI to rephrase. */
function goalMessage({ verdict, targetDistanceKm, targetTimeMin, predictedMin, achievableMin }) {
  const d = `${targetDistanceKm} km`
  const target = formatDuration(targetTimeMin)
  const predicted = formatDuration(predictedMin)
  const achievable = formatDuration(achievableMin)
  switch (verdict) {
    case 'comfortable':
      return `Their ${d} target of ${target} is within what they can already run (${predicted} shape today). The plan aims comfortably past it.`
    case 'realistic':
      return `Their ${d} target of ${target} is a realistic step up from their current ${predicted} shape. The plan is built to hit it.`
    case 'ambitious':
      return `Their ${d} target of ${target} is ambitious — current shape is about ${predicted}, and a good block gets them near ${achievable}. The plan chases the target; say it is a stretch but worth aiming at.`
    default:
      return `Their ${d} target of ${target} is well beyond current fitness (about ${predicted} today; roughly ${achievable} is a realistic outcome for this block). The plan is built toward ${achievable}. Tell them this plainly and without discouraging them — it is a great long-term goal, just not this block.`
  }
}

/**
 * Human label for a runner's goal. The goal is a distance; the date is
 * optional. Used by Settings, the dashboard and the plan overview so they
 * never disagree.
 */
export function goalLabel(profile = {}) {
  const d = Number(profile.target_distance_km)
  const time = Number(profile.target_time_min)
  if (!(d > 0)) return profile.event_date ? `Tekma ${profile.event_date}` : 'Splošna kondicija'
  const parts = [`${d} km`]
  if (time > 0) parts.push(`v ${formatDuration(time)}`)
  parts.push(profile.event_date ? `dne ${profile.event_date}` : '— brez datuma')
  return parts.join(' ')
}

/**
 * How long the long run should peak at, for a given goal distance.
 *
 * Monotonic in distance so any number works: 5 km → ~11 km, 21.1 km → ~21 km,
 * 30 km → ~27 km, marathon → capped at 32 km (running the full distance in
 * training costs more than it gives).
 */
export function peakLongRunKm(targetDistanceKm) {
  if (!(targetDistanceKm > 0)) return 24
  return clamp(round1(8 + targetDistanceKm * 0.62), 6, 32)
}

// ---------------------------------------------------------------------------
// 3. Phases
// ---------------------------------------------------------------------------

export const PHASES = ['base', 'build', 'sharpen', 'taper']

/** What each phase is for — surfaced on the dashboard and fed to the AI. */
export const PHASE_INTENT = {
  base: 'gradnjo aerobne osnove in navajanje telesa na reden tek',
  build: 'dvig vzdržne hitrosti s pragovnim delom, medtem ko obseg raste',
  sharpen: 'tekmovalno hitrost in vadbo ciljnega tempa',
  taper: 'odpravljanje utrujenosti ob ohranjanju ostrine za dan tekme',
  // Scenario phases (core/planning)
  walk_run: 'navajanje telesa na tek z izmenjavo hoje in teka',
  return: 'ponovno navajanje kit, kosti in sklepov na tek, brez intenzivnosti',
  consistency: 'rednost in užitek v teku, večinoma lahkotno',
  maintain: 'ohranjanje forme brez nadgradnje obsega',
}

export const TAPER_WEEKS = 2

/**
 * Which phase each week belongs to.
 *
 * With an event: base → build → sharpen → taper, where the final two weeks
 * are always the taper (or one week, for very short plans).
 * Without one: a rolling 4-week base/build alternation that can run forever.
 *
 * @returns {string[]} one phase per week, index 0 = week 1
 */
export function assignPhases(totalWeeks, { hasEvent = false, taperWeeks = TAPER_WEEKS } = {}) {
  if (totalWeeks <= 0) return []

  if (!hasEvent) {
    // Rolling cycles: 4 weeks base, 4 weeks build, repeat.
    return Array.from({ length: totalWeeks }, (_, i) =>
      Math.floor(i / 4) % 2 === 0 ? 'base' : 'build'
    )
  }

  if (totalWeeks === 1) return ['taper']
  if (totalWeeks === 2) return ['taper', 'taper']

  const taper = Math.min(taperWeeks, totalWeeks - 1)
  const preparation = totalWeeks - taper

  // Sharpen only earns a slot once there is room for a real build block.
  let sharpen = preparation >= 6 ? Math.min(4, Math.round(preparation * 0.25)) : 0
  let base = Math.max(1, Math.round(preparation * 0.35))
  let build = preparation - base - sharpen

  // Short plans: protect the build block by trimming sharpen, then base.
  while (build < 1 && sharpen > 0) {
    sharpen--
    build++
  }
  while (build < 1 && base > 1) {
    base--
    build++
  }

  return [
    ...Array(base).fill('base'),
    ...Array(Math.max(0, build)).fill('build'),
    ...Array(sharpen).fill('sharpen'),
    ...Array(taper).fill('taper'),
  ].slice(0, totalWeeks)
}

/**
 * Every 4th week is a recovery week — except during the taper, which is
 * already a volume reduction, and never the very first week.
 */
export function assignRecoveryWeeks(phases) {
  return phases.map((phase, i) => {
    const week = i + 1
    return week % 4 === 0 && phase !== 'taper'
  })
}

// ---------------------------------------------------------------------------
// 4. Volume
// ---------------------------------------------------------------------------

export const MAX_WEEKLY_INCREASE = 1.1 // the 10% rule
export const RECOVERY_VOLUME_FACTOR = 0.7

/** Lighter alternate week once weekly volume has reached its ceiling. */
export const CAP_UNDULATION = 0.92
export const TAPER_FACTORS = [0.7, 0.5] // two weeks out, then race week

const START_VOLUME_BY_LEVEL = { beginner: 15, intermediate: 30, advanced: 50 }
const PEAK_VOLUME_BY_LEVEL = { beginner: 45, intermediate: 85, advanced: 130 }

/**
 * Peak weekly volume, scaled by BOTH level and goal distance. A flat
 * per-level ceiling made long plans flatline: volume hit the cap around week
 * 10 and every later week came out byte-identical. Scaling by the goal keeps
 * 5 km plans modest and gives marathon plans room to keep progressing.
 */
export function peakVolumeCap(fitnessLevel = 'beginner', targetDistanceKm = null) {
  const base = PEAK_VOLUME_BY_LEVEL[fitnessLevel] ?? PEAK_VOLUME_BY_LEVEL.beginner
  if (!(targetDistanceKm > 0)) return base
  // 5 km -> 0.65x, 21.1 km -> 0.9x, 42.2 km -> 1.2x
  const factor = clamp(0.6 + (targetDistanceKm / 42.2) * 0.6, 0.6, 1.2)
  return round1(base * factor)
}

/**
 * Weekly volume where the runner actually is right now: what they ran in the
 * last 7 logged days, falling back to a level default. Clamped so one huge
 * week (or one lazy week) does not set the whole plan's scale.
 */
export function currentWeeklyVolume(runs = [], fitnessLevel = 'beginner', today = new Date(), profile = {}) {
  const fallback = START_VOLUME_BY_LEVEL[fitnessLevel] ?? START_VOLUME_BY_LEVEL.beginner

  // What the runner told us during plan creation beats both the logs (which
  // may only cover a quiet week) and the level default.
  const stated = Number(profile?.weekly_volume_km)
  if (Number.isFinite(stated) && stated > 0) return clamp(round1(stated), 3, 250)

  if (!runs.length) return fallback

  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - 7)
  const recent = runs.filter((r) => {
    const d = new Date(String(r.date) + 'T00:00:00')
    return !Number.isNaN(+d) && d >= cutoff && Number(r.distance) > 0
  })
  if (!recent.length) return fallback

  const volume = recent.reduce((s, r) => s + Number(r.distance), 0)
  // Never scale a plan from less than half, or more than double, the level
  // default — a single logged week is weak evidence.
  return clamp(round1(volume), fallback * 0.5, fallback * 2)
}

/**
 * The weekly volume curve.
 *
 * Rules, in order of precedence:
 *  - taper weeks are a fixed fraction of the peak build volume;
 *  - recovery weeks are ~70% of the week before;
 *  - every other week is at most +10% on the last PROGRESSIVE week.
 *
 * That last point is the subtle one: progression resumes from the pre-recovery
 * level rather than from the recovery dip, which is what makes a recovery week
 * a step back rather than a reset. The 10% ceiling therefore applies to the
 * build trend, not to literal consecutive weeks.
 *
 * @returns {number[]} km per week
 */
export function buildVolumeCurve({
  totalWeeks,
  phases,
  recoveryWeeks,
  startVolumeKm,
  fitnessLevel = 'beginner',
  targetDistanceKm = null,
}) {
  const peakCap = peakVolumeCap(fitnessLevel, targetDistanceKm)
  const volumes = []
  let progressive = startVolumeKm // the build trend, ignoring recovery dips
  let atCeilingCount = 0
  let lastProgressiveValue = null

  for (let i = 0; i < totalWeeks; i++) {
    if (phases[i] === 'taper') {
      volumes.push(null) // filled in below, once the peak is known
      continue
    }
    if (recoveryWeeks[i]) {
      volumes.push(Math.max(1, Math.round(progressive * RECOVERY_VOLUME_FACTOR)))
      continue
    }
    if (i > 0) progressive = Math.min(progressive * MAX_WEEKLY_INCREASE, peakCap)

    // Once volume reaches the ceiling it cannot keep climbing, and emitting
    // the same number every week made the plan flatline into byte-identical
    // weeks. Hold the peak by alternating a full week with a slightly lighter
    // one — standard undulating periodization, and every week now differs.
    const atCeiling = progressive >= peakCap - 0.05
    const lighter = atCeiling && atCeilingCount++ % 2 === 1
    let value = Math.round(lighter ? progressive * CAP_UNDULATION : progressive)

    // Distances are whole kilometres, so a week must step by at least one.
    // Below ~15 km/week a 10% increase rounds to nothing and two consecutive
    // weeks come out identical, which reads as a broken plan. A 1 km step on
    // a 9 km week is 11% — over the ceiling in percentage terms, but it is
    // one kilometre, and the alternative is a plan that never changes.
    if (!lighter && !atCeiling && lastProgressiveValue !== null && value <= lastProgressiveValue) {
      value = Math.min(Math.round(peakCap), lastProgressiveValue + 1)
      progressive = Math.max(progressive, value)
    }
    if (!lighter) lastProgressiveValue = value
    volumes.push(value)
  }

  // Taper: measured against the biggest week actually reached.
  const peak = Math.max(...volumes.filter((v) => v !== null), startVolumeKm)
  const taperIdx = volumes.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0)
  taperIdx.forEach((weekIdx, n) => {
    // Last taper week gets the deepest cut, whatever the taper length.
    const factor = TAPER_FACTORS[TAPER_FACTORS.length - taperIdx.length + n] ?? TAPER_FACTORS[1]
    volumes[weekIdx] = round1(peak * factor)
  })

  return volumes
}

/** Most a long run may grow in one week: the greater of 2 km and 15%. */
const LONG_RUN_STEP_KM = 2
const LONG_RUN_STEP_PCT = 0.15

/** A "cutback" long run, used on alternate weeks once the ramp is at its peak. */
const LONG_RUN_CUTBACK = 0.85

/**
 * Per-week ceiling on the long run.
 *
 * The long run used to be a flat 30% of weekly volume, with no relation to
 * what the runner had actually done. A runner reporting 60 km/week therefore
 * got an 18 km long run in WEEK 2 even though their longest ever run was
 * 8 km. This ramps from where they are to where the goal needs them to be,
 * and never grows faster than LONG_RUN_STEP per week.
 *
 * @param {object} opts
 * @param {number} opts.totalWeeks
 * @param {string[]} opts.phases
 * @param {boolean[]} opts.recoveryWeeks
 * @param {number} opts.startLongRunKm - their current longest run
 * @param {number} opts.peakLongRunKm - what the goal distance calls for
 * @returns {number[]} one ceiling per week
 */
export function buildLongRunCurve({
  totalWeeks,
  phases,
  recoveryWeeks,
  startLongRunKm,
  peakLongRunKm: peak,
}) {
  const start = Math.max(3, startLongRunKm || 0)
  const target = Math.max(start, peak)

  const buildWeeks = phases.filter((p) => p !== 'taper').length || totalWeeks
  // Reach the peak with weeks to spare rather than on the very last one, so
  // there is room to hold it (alternating full and cutback) before tapering.
  const rampWeeks = Math.max(1, Math.round(buildWeeks * 0.75))
  const lastProgressive = phases.reduce(
    (last, ph, i) => (ph !== 'taper' && !recoveryWeeks[i] ? i : last), 0
  )

  const out = []
  let current = start
  let progressiveSoFar = 0
  for (let i = 0; i < totalWeeks; i++) {
    if (phases[i] === 'taper') {
      // Shed distance through the taper: 65% then 45% of peak.
      const taperIdx = phases.slice(0, i).filter((p) => p === 'taper').length
      out.push(round1(target * (taperIdx === 0 ? 0.65 : 0.45)))
      continue
    }
    if (recoveryWeeks[i]) {
      // Ease off, but do not lose the progression already banked.
      out.push(round1(current * 0.8))
      continue
    }
    if (i > 0) {
      const ideal = start + ((target - start) * i) / Math.max(1, rampWeeks - 1)
      const maxStep = Math.max(LONG_RUN_STEP_KM, current * LONG_RUN_STEP_PCT)
      current = Math.min(target, Math.max(current, Math.min(ideal, current + maxStep)))
    }
    // Nobody runs their maximum long run every single week. Once the ramp
    // tops out, alternate a full one with a shorter one — real practice, and
    // it stops consecutive weeks at peak volume being byte-identical. The
    // last long run before the taper is always a full one.
    const atCeiling = current >= target - 0.05
    const cutback = atCeiling && progressiveSoFar % 2 === 1 && i !== lastProgressive
    out.push(round1(cutback ? current * LONG_RUN_CUTBACK : current))
    progressiveSoFar++
  }
  return out
}

// ---------------------------------------------------------------------------
// 5. Constraints from coach memory
// ---------------------------------------------------------------------------

const DAY_WORDS = {
  monday: 'Monday', mon: 'Monday', ponedeljek: 'Monday',
  tuesday: 'Tuesday', tue: 'Tuesday', torek: 'Tuesday',
  wednesday: 'Wednesday', wed: 'Wednesday', sreda: 'Wednesday',
  thursday: 'Thursday', thu: 'Thursday', cetrtek: 'Thursday',
  friday: 'Friday', fri: 'Friday', petek: 'Friday',
  saturday: 'Saturday', sat: 'Saturday', sobota: 'Saturday',
  sunday: 'Sunday', sun: 'Sunday', nedelja: 'Sunday',
}

const norm = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

/**
 * Turn coach memories into the structural constraints the skeleton must obey.
 *
 * Only patterns that can be detected RELIABLY become structure. Everything
 * else stays as free text passed to the AI, which is better at nuance than a
 * keyword matcher — see core/plan.js.
 *
 * @param {Array<{category, content}>} memories
 */
export function deriveConstraints(memories = []) {
  const constraints = {
    noBackToBack: false,
    availableDays: null, // null = any day
    maxRunDays: null,
    timeOfDay: null,
    notes: [],
  }

  for (const m of memories) {
    const text = norm(m.content)
    if (!text) continue
    constraints.notes.push(`[${m.category}] ${m.content}`)

    // Injury that specifically dislikes consecutive running days.
    if (
      /back.?to.?back|consecutive|two days in a row|2 days in a row|zaporedn|dva dni zapored/.test(text)
    ) {
      constraints.noBackToBack = true
    }

    // "runs 4 times a week", "3x per week", "4 dni na teden"
    const times = /(\d)\s*(?:x|times?|dni|days?)\s*(?:a|per|na)?\s*(?:week|teden)/.exec(text)
    if (times) constraints.maxRunDays = clamp(Number(times[1]), 2, 7)

    // Time of day, which the AI mentions in the descriptions.
    if (/morning|jutr|zjutraj|before work/.test(text)) constraints.timeOfDay = 'morning'
    else if (/evening|zvecer|after work|night/.test(text)) constraints.timeOfDay = 'evening'

    // Explicit weekday availability, e.g. "only runs Tue, Thu and Sat".
    if (/only|lahko only|samo|available/.test(text)) {
      const days = []
      for (const [word, day] of Object.entries(DAY_WORDS)) {
        if (new RegExp(`\\b${word}`).test(text) && !days.includes(day)) days.push(day)
      }
      if (days.length >= 2) {
        constraints.availableDays = DAYS.filter((d) => days.includes(d))
      }
    }
  }
  return constraints
}

/**
 * Merge what the runner told us EXPLICITLY during plan creation (available
 * days, days per week) with what was inferred from chat memory. Explicit
 * answers win — they were a deliberate choice, not a guess from prose.
 */
export function mergeProfileConstraints(constraints, profile = {}) {
  const merged = { ...constraints }

  const days = Array.isArray(profile.available_days)
    ? DAYS.filter((d) => profile.available_days.includes(d))
    : null
  if (days?.length >= 2) merged.availableDays = days

  const perWeek = Number(profile.days_per_week)
  if (Number.isFinite(perWeek) && perWeek >= 1) {
    merged.maxRunDays = clamp(Math.round(perWeek), 1, 7)
  }
  // Asking for more run days than available weekdays is a contradiction;
  // availability is the harder constraint.
  if (merged.availableDays && merged.maxRunDays) {
    merged.maxRunDays = Math.min(merged.maxRunDays, merged.availableDays.length)
  }
  return merged
}

// ---------------------------------------------------------------------------
// 6. Laying out one week (80/20 polarized)
// ---------------------------------------------------------------------------

/** How many quality (hard) sessions a week carries, by phase. */
const QUALITY_BY_PHASE = { base: 1, build: 2, sharpen: 2, taper: 1 }

/** Share of weekly volume that should be HARD. The 20 in 80/20. */
export const HARD_VOLUME_SHARE = 0.2

/** How much ordinary training survives in the week that contains the race. */
export const RACE_WEEK_TRAINING_SHARE = 0.35

/** A quality session's hard portion, relative to the long run and absolutely. */
export const MAX_HARD_VS_LONG = 0.7
export const MAX_HARD_SESSION_KM = 12

/**
 * Daniels' per-session ceilings on fast running, as a share of the week's
 * volume and in absolute km (knowledge/vdot.md). `marathon` also covers
 * goal-pace tempo work.
 */
export const HARD_SESSION_CAPS = {
  tempo: { share: 0.1, km: 15 },
  marathon: { share: 0.2, km: 29 },
  interval: { share: 0.08, km: 10 },
  repetition: { share: 0.05, km: 8 },
}

/** Share of weekly volume in the long run. */
const LONG_RUN_SHARE = 0.3

const RUN_DAYS_BY_LEVEL = { beginner: 4, intermediate: 5, advanced: 6 }

/**
 * Pick which weekdays are run days, honouring availability and the
 * no-back-to-back rule. Sunday is preferred for the long run.
 */
export function chooseRunDays({ count, availableDays, noBackToBack }) {
  const pool = availableDays?.length ? availableDays.filter((d) => DAYS.includes(d)) : DAYS

  if (!noBackToBack) {
    // Spread `count` days as evenly as possible across the pool.
    if (count >= pool.length) return [...pool]
    const step = pool.length / count
    const picked = []
    for (let i = 0; i < count; i++) {
      const day = pool[Math.min(pool.length - 1, Math.round(i * step))]
      if (!picked.includes(day)) picked.push(day)
    }
    // Rounding can collide; top up with whatever is left.
    for (const d of pool) {
      if (picked.length >= count) break
      if (!picked.includes(d)) picked.push(d)
    }
    return DAYS.filter((d) => picked.includes(d))
  }

  // No two running days adjacent: walk the week taking every other day.
  const picked = []
  let lastIdx = -2
  for (const day of pool) {
    const idx = DAYS.indexOf(day)
    if (idx - lastIdx >= 2 && picked.length < count) {
      picked.push(day)
      lastIdx = idx
    }
  }
  return picked
}

/**
 * Build one week's seven days.
 *
 * Volume is split 80/20: the long run and easy runs carry the easy 80%, the
 * quality sessions the hard 20%. Recovery weeks drop quality entirely.
 *
 * @returns {Array} seven day objects, Monday..Sunday
 */
export function layOutWeek({
  volumeKm,
  phase,
  isRecovery,
  paces,
  fitnessLevel = 'beginner',
  constraints = {},
  maxLongRunKm = null,
  goalPaceKey = 'marathon',
  race = null, // { day, distanceKm } on the final week of an event plan
  // Scenario overrides (core/planning). Omitted, the legacy behaviour holds.
  runDays: fixedRunDays = null, // explicit weekdays to run on
  qualityPlan = null, // [{ type, paceKey }] — this week's quality sessions, in order
  longShare = LONG_RUN_SHARE,
}) {
  const wanted = constraints.maxRunDays ?? RUN_DAYS_BY_LEVEL[fitnessLevel] ?? 4
  const runDays = fixedRunDays ?? chooseRunDays({
    count: wanted,
    availableDays: constraints.availableDays,
    noBackToBack: constraints.noBackToBack,
  })

  if (!runDays.length) return DAYS.map((day) => restDay(day))

  // The long run goes on the latest run day (usually the weekend).
  const longDay = runDays[runDays.length - 1]
  const wantedQuality = qualityPlan ? qualityPlan.length : QUALITY_BY_PHASE[phase] ?? 1
  const qualityCount = isRecovery ? 0 : Math.min(wantedQuality, Math.max(0, runDays.length - 2))

  // Quality sessions sit as far from the long run (and each other) as possible.
  const candidates = runDays.slice(0, -1)
  const qualityDays = []
  if (qualityCount === 1 && candidates.length) {
    qualityDays.push(candidates[Math.floor((candidates.length - 1) / 2)])
  } else if (qualityCount >= 2 && candidates.length >= 2) {
    qualityDays.push(candidates[0], candidates[candidates.length - 1])
  }

  // --- volume split ---------------------------------------------------------
  // Order matters here: the LONG RUN is sized first, because it is the run
  // the runner's history actually constrains, and everything else is then
  // bounded relative to it. Sizing quality first (as this used to) let a
  // single tempo session swallow 20% of a big week and become a 15 km
  // "workout" for someone whose longest ever run was 8 km.

  // On race week the race IS the week. Everything else shrinks to a couple of
  // shakeout runs; otherwise the race distance lands on top of a full taper
  // week and the "taper" ends up bigger than the week before it.
  const budget = race ? volumeKm * RACE_WEEK_TRAINING_SHARE : volumeKm

  // 1. Long run — a share of the week, hard-capped by the ramp ceiling that
  //    starts at the runner's own longest run (see buildLongRunCurve).
  let longDistance = budget * (isRecovery ? longShare * 0.8 : longShare)
  if (maxLongRunKm) longDistance = Math.min(longDistance, maxLongRunKm)

  // 2. Quality — the 20% in 80/20 is the FAST RUNNING, not the whole session:
  //    a tempo workout is a warm-up, the hard portion, then a cool-down, and
  //    the jogging either side counts as easy volume. The hard portion is
  //    additionally capped so a quality day never rivals the long run.
  const warmupCooldown = Math.min(3, budget * 0.08)
  const maxHardEach = Math.min(longDistance * MAX_HARD_VS_LONG, MAX_HARD_SESSION_KM)
  const hardEach = qualityDays.length
    ? Math.min((budget * HARD_VOLUME_SHARE) / qualityDays.length, maxHardEach)
    : 0
  // Scenario plans also honour Daniels' per-session limits for each
  // intensity (knowledge/vdot.md): without them a 20% "hard" budget handed a
  // single repetition session 8 km of R-pace running.
  const hardFor = (q) => {
    if (!qualityPlan) return hardEach
    const cap = HARD_SESSION_CAPS[q.type === 'tempo' && q.paceKey !== 'threshold' ? 'marathon' : q.type]
    return cap ? Math.min(hardEach, budget * cap.share, cap.km) : hardEach
  }
  // Never longer than the long run: a quality day that out-distances the long
  // run is a second long run with speed in it.
  const sessionFor = (hard) => (hard > 0 ? Math.min(hard + warmupCooldown, longDistance) : 0)
  const qualitySession = sessionFor(hardEach)

  // 3. Easy — whatever is left, spread over the remaining days and kept
  //    below the long run.
  const easyDays = runDays.filter((d) => d !== longDay && !qualityDays.includes(d))
  const qualityKm = qualityPlan
    ? qualityDays.reduce((t, day, i) => t + sessionFor(hardFor({ day, ...qualityPlan[i] })), 0)
    : qualitySession * qualityDays.length
  const easyTotal = Math.max(0, budget - qualityKm - longDistance)
  let easyEach = easyDays.length ? easyTotal / easyDays.length : 0

  // Keeping every easy day below the long run leaves a surplus. Give it to
  // the long run — but ONLY up to the ramp ceiling. Topping up without that
  // clamp is what produced 18 km long runs in week 2; refusing to top up at
  // all silently lost ~20% of every recovery week. Whatever still does not
  // fit is dropped, and `planned_volume_km` records what was intended.
  const easyCap = longDistance * 0.75
  if (easyDays.length && easyEach > easyCap) {
    const surplus = (easyEach - easyCap) * easyDays.length
    easyEach = easyCap
    const headroom = Math.max(0, (maxLongRunKm || Infinity) - longDistance)
    longDistance += Math.min(surplus, headroom)
  }

  // Quality type follows the phase: threshold early, faster work later —
  // unless the scenario supplied its own sessions.
  const sessions = qualityDays.map((day, i) => {
    if (qualityPlan) return { day, ...qualityPlan[i] }
    if (phase === 'base') return { day, type: 'tempo', paceKey: 'threshold' }
    if (phase === 'build') return { day, type: i === 0 ? 'tempo' : 'interval', paceKey: i === 0 ? 'threshold' : 'interval' }
    if (phase === 'sharpen') return { day, type: i === 0 ? 'interval' : 'tempo', paceKey: i === 0 ? 'interval' : goalPaceKey }
    return { day, type: 'tempo', paceKey: 'threshold' } // taper: short and sharp
  })

  const built = DAYS.map((day) => {
    // Race day overrides everything else on the calendar.
    if (race && day === race.day) {
      return makeDay({
        day,
        type: 'race',
        distanceKm: race.distanceKm,
        paceKey: goalPaceKey,
        paces,
        intensity: 'hard',
      })
    }
    if (!runDays.includes(day)) return restDay(day)
    // The long run is pointless two days before a race.
    if (race && day === longDay) return restDay(day)

    if (day === longDay) {
      return makeDay({
        day, type: 'long', distanceKm: longDistance,
        paceKey: 'easy', paces, intensity: 'easy',
      })
    }
    const quality = sessions.find((q) => q.day === day)
    if (quality) {
      const hard = hardFor(quality)
      return makeDay({
        day, type: quality.type,
        distanceKm: sessionFor(hard),
        hardKm: hard, // the fast part; the rest is warm-up and cool-down
        paceKey: quality.paceKey, paces,
        intensity: quality.paceKey === 'marathon' ? 'moderate' : 'hard',
      })
    }
    return makeDay({ day, type: 'easy', distanceKm: easyEach, paceKey: 'easy', paces, intensity: 'easy' })
  })

  return settleRounding(built, budget, maxLongRunKm, paces)
}

/**
 * Give the rounding remainder to the long run.
 *
 * Rounding every day to a whole kilometre loses up to half a kilometre per
 * day, which at beginner volumes is most of a week's 10% progression — two
 * consecutive weeks would round to exactly the same numbers. Pushing the
 * difference onto the long run keeps the week's total honest AND keeps
 * consecutive weeks distinct.
 */
function settleRounding(days, budget, maxLongRunKm, paces) {
  const target = Math.round(budget)
  const trainable = days.filter((d) => d.type !== 'rest' && d.type !== 'race')
  if (!trainable.length) return days

  const sum = trainable.reduce((t, d) => t + d.distance_km, 0)
  let diff = target - sum
  if (diff === 0) return days

  // The long run absorbs it; it is the least sensitive to a kilometre either
  // way, and never past its ramp ceiling.
  const long = trainable.find((d) => d.type === 'long') ||
    trainable.reduce((a, b) => (b.distance_km > a.distance_km ? b : a))
  const ceiling = maxLongRunKm ? Math.round(maxLongRunKm) : Infinity
  const adjusted = clamp(long.distance_km + diff, 1, ceiling)
  if (adjusted === long.distance_km) return days

  return days.map((d) =>
    d === long
      ? { ...d, distance_km: adjusted, duration_min: Math.round(adjusted * (paces[d.pace_key] ?? paces.easy)) }
      : d
  )
}

/** Structural fallback titles. The AI may replace these with Slovenian ones. */
export const DEFAULT_TITLES = {
  easy: 'Lahkoten tek',
  long: 'Dolgi tek',
  tempo: 'Tempo tek',
  interval: 'Intervali',
  repetition: 'Ponovitve',
  cross: 'Druga vadba',
  race: 'Dan tekme',
  rest: 'Počitek',
}

export function restDay(day) {
  return {
    day,
    type: 'rest',
    title: DEFAULT_TITLES.rest,
    distance_km: 0,
    duration_min: 0,
    pace: 'rest',
    pace_key: null,
    intensity: 'rest',
  }
}

/**
 * Prescribed distances are WHOLE kilometres. "7.4 km" is false precision —
 * nobody paces a run to 100 m, and it made every card look machine-generated.
 * Interval reps are the exception and stay in metres (400 m, 800 m, 1000 m).
 */
export function roundKm(km) {
  if (!(km > 0)) return 0
  return Math.max(1, Math.round(km))
}

export function makeDay({ day, type, distanceKm, hardKm = 0, paceKey, paces, intensity }) {
  // Race day keeps the REAL distance: a half marathon is 21.1 km, not 21.
  const distance = type === 'race' ? round1(distanceKm) : roundKm(distanceKm)
  const paceMin = paces[paceKey]
  // A quality session runs its hard portion at the target pace and jogs the
  // rest, so its duration is a blend rather than distance x target pace.
  const hard = Math.min(round1(hardKm), distance)
  const duration = hard > 0
    ? Math.round(hard * paceMin + (distance - hard) * paces.easy)
    : Math.round(distance * paceMin)
  const range = paceRange(paceMin, paceKey)
  return {
    day,
    type,
    title: DEFAULT_TITLES[type] || 'Run',
    distance_km: distance,
    hard_km: hard || 0,
    duration_min: duration,
    pace: `${formatPace(paceMin)}/km`,
    pace_range: range.label,
    pace_key: paceKey,
    pace_label: PACE_LABELS[paceKey],
    intensity,
  }
}

// ---------------------------------------------------------------------------
// 6b. Workout segments — the structure the card renders from
// ---------------------------------------------------------------------------

/**
 * Rep distances (metres) chosen by how much fast running the session carries.
 * Shorter, sharper reps for small volumes; 1 km reps once there is enough.
 */
const REP_LADDER = [
  { upToHardKm: 2.0, metres: 300 },
  { upToHardKm: 3.2, metres: 400 },
  { upToHardKm: 5.0, metres: 800 },
  { upToHardKm: Infinity, metres: 1000 },
]

/** Shortest session worth breaking into warm-up / main / cool-down. */
const MIN_SEGMENTED_KM = 4

/** Workout types that are run at one steady effort start to finish. */
const STEADY_TYPES = new Set(['easy', 'long', 'cross', 'race', 'rest'])

const round1seg = (n) => Math.round(n * 10) / 10

/**
 * Break a workout into the parts the runner actually executes.
 *
 * A tempo run is not "9.8 km at 5:35"; it is a jog, a hard middle, and a jog.
 * Showing one averaged pace for it is wrong, and it is what made the cards
 * unreadable. Steady runs get no segments — their single spec line says
 * everything.
 *
 * Every segment carries its own pace AND its own heart-rate range, so the UI
 * renders from data instead of parsing a sentence.
 *
 * @param {object} day - a day from layOutWeek
 * @param {object} paces - min/km by pace key
 * @param {number|null} age - for the HR ranges; null simply omits them
 * @returns {Array} segments, empty for steady workouts
 */
export function buildSegments(day, paces, age = null) {
  if (STEADY_TYPES.has(day.type)) return []

  const total = day.distance_km
  const hard = day.hard_km || 0
  if (!(total > 0) || !(hard > 0)) return []

  // A session has to be long enough to hold a warm-up, a main part and a
  // cool-down of a kilometre each. Below that the breakdown is fiction —
  // a 1 km "tempo" was rendering as three 1 km segments totalling 3 km.
  if (total < MIN_SEGMENTED_KM) return []

  const easyPace = paces.easy
  const mainPace = paces[day.pace_key] ?? easyPace
  const isReps = day.type === 'interval' || day.type === 'repetition'

  // Reserve the jogs FIRST. Sizing the hard part first and giving it whatever
  // was left meant a short session could end up with no cool-down at all.
  // Roughly a fifth of the session warming up, a tenth cooling down.
  const warmup = clamp(Math.round(total * 0.2), 1, 3)
  const cooldown = clamp(Math.round(total * 0.12), 1, 2)
  const available = Math.max(1, total - warmup - cooldown)

  let repPlan = null
  let mainDistance = available
  if (isReps) {
    const metres = REP_LADDER.find((r) => hard <= r.upToHardKm).metres
    const recovery = Math.max(100, Math.round(metres / 2 / 100) * 100)
    // Each rep costs its own distance plus the jog that follows it.
    const perRep = metres + recovery
    const count = clamp(Math.round((available * 1000) / perRep), 3, 20)
    repPlan = { count, distance_m: metres, recovery_m: recovery }
    mainDistance = (count * metres + Math.max(0, count - 1) * recovery) / 1000
  }

  const segments = []
  if (warmup > 0) {
    segments.push(segment({
      kind: 'warmup', label: 'OGREVANJE', distanceKm: warmup,
      paceKey: 'warmup', paceMin: easyPace, age,
    }))
  }

  if (isReps) {
    const { count, distance_m: metres, recovery_m: recoveryMetres } = repPlan
    segments.push({
      ...segment({
        kind: 'reps', label: 'GLAVNI DEL',
        distanceKm: round1seg(mainDistance),
        paceKey: day.pace_key, paceMin: mainPace, age,
      }),
      reps: {
        count,
        distance_m: metres,
        recovery_m: recoveryMetres,
        // Rendered as: 6 × 400 m @ 4:50/km, vmes 200 m lahkotno
        summary: `${count} × ${metres} m @ ${paceRange(mainPace, day.pace_key).label}, vmes ${recoveryMetres} m lahkotno`,
      },
    })
  } else {
    // tempo, progression and anything else with a sustained hard middle
    segments.push(segment({
      kind: 'main', label: 'GLAVNI DEL', distanceKm: Math.max(1, Math.round(mainDistance)),
      paceKey: day.pace_key, paceMin: mainPace, age,
    }))
  }

  if (cooldown > 0) {
    segments.push(segment({
      kind: 'cooldown', label: 'OHLAJANJE', distanceKm: cooldown,
      paceKey: 'cooldown', paceMin: easyPace, age,
    }))
  }
  return segments
}

function segment({ kind, label, distanceKm, paceKey, paceMin, age }) {
  return {
    kind,
    label,
    distance_km: distanceKm,
    pace: `${formatPace(paceMin)}/km`,
    pace_range: paceRange(paceMin, paceKey).label,
    pace_key: paceKey,
    duration_min: Math.round(distanceKm * paceMin),
    hr: heartRateFor(age, { paceKey }),
  }
}

/**
 * A realistic time window for a run, rather than a single fake-precise
 * number. Terrain, traffic lights and how the legs feel move this around.
 */
export function durationRange(durationMin) {
  if (!(durationMin > 0)) return null
  return {
    min: Math.max(1, Math.round(durationMin * 0.95)),
    max: Math.round(durationMin * 1.1),
  }
}

/**
 * Attach segments, an HR range and a duration window to every day of a week.
 * Called once at plan-build time; the result is stored, so rendering a card
 * costs nothing.
 */
export function enrichDays(days, paces, age = null) {
  return days.map((day) => {
    const segments = buildSegments(day, paces, age)
    const paceMin = paces[day.pace_key]
    return {
      ...day,
      hr: heartRateFor(age, { paceKey: day.pace_key, intensity: day.intensity }),
      duration_range: durationRange(day.duration_min),
      // Legacy days stored before pace ranges existed get one here.
      pace_range: day.pace_range || (paceMin ? paceRange(paceMin, day.pace_key).label : null),
      segments,
      // The card shows a single TEMPO line only when the whole run is at one
      // pace; segmented workouts show their parts instead.
      is_segmented: segments.length > 0,
    }
  })
}

// ---------------------------------------------------------------------------
// 7. The whole skeleton
// ---------------------------------------------------------------------------

/**
 * Build the complete calculated plan skeleton. This is what the AI receives
 * and describes; it never changes the numbers.
 *
 * @param {object} opts
 * @param {object} opts.profile
 * @param {number} opts.totalWeeks
 * @param {Array} [opts.runs] - logged runs, newest first
 * @param {Array} [opts.memories] - coach_memory rows
 * @param {Date} [opts.today]
 */
export function buildPlanSkeleton({ profile = {}, totalWeeks, runs = [], memories = [], today = new Date() }) {
  const fitnessLevel = profile.fitness_level || 'beginner'
  const eventDate = profile.event_date || null
  const hasEvent = Boolean(eventDate)

  // The goal is a DISTANCE IN KILOMETRES, never a race-type enum — 15 km and
  // 30 km are first-class goals, handled identically to 5 km or a marathon.
  const targetDistanceKm = Number(profile.target_distance_km) > 0
    ? Number(profile.target_distance_km)
    : null
  const targetTimeMin = Number(profile.target_time_min) > 0 ? Number(profile.target_time_min) : null

  const { vdot, source, basedOn } = estimateVdot(runs, fitnessLevel)
  const paces = pacesFromVdot(vdot)

  // Goal realism: if the target time is out of reach we plan toward the best
  // realistic outcome instead, and the coach is told to say so (core/ai.js).
  const goalAssessment = assessGoal({ vdot, targetDistanceKm, targetTimeMin })
  if (goalAssessment) paces.goal = goalAssessment.goal_pace_min_per_km
  const goalPaceKey = goalAssessment ? 'goal' : 'marathon'

  const phases = assignPhases(totalWeeks, { hasEvent })
  const recoveryWeeks = assignRecoveryWeeks(phases)
  const startVolumeKm = currentWeeklyVolume(runs, fitnessLevel, today, profile)
  const volumes = buildVolumeCurve({
    totalWeeks, phases, recoveryWeeks, startVolumeKm, fitnessLevel, targetDistanceKm,
  })

  const constraints = mergeProfileConstraints(deriveConstraints(memories), profile)

  // Long runs RAMP from what the runner has actually done toward what the
  // goal needs, rather than jumping straight to a share of weekly volume.
  const loggedLongest = runs.reduce((max, r) => Math.max(max, Number(r.distance) || 0), 0)
  const statedLongest = Number(profile.longest_run_km) || 0
  // Precedence matters. What the runner SAYS their longest run is beats any
  // inference from weekly volume — someone reporting 60 km/week but an 8 km
  // longest run needs the 8, or week 2 hands them an 18 km long run.
  const startLongRunKm = Math.max(
    3,
    statedLongest || Math.max(loggedLongest, startVolumeKm * 0.3)
  )
  // The long run is driven by the goal distance AND by weekly volume. A 5 km
  // specialist running 80 km/week still does a ~20 km long run; capping them
  // at the goal-derived 11 km made the week impossible to fill and every
  // later week came out identical once the composition saturated.
  const peakWeekly = Math.max(...volumes)
  const peakLong = clamp(
    Math.max(
      targetDistanceKm ? peakLongRunKm(targetDistanceKm) : 0,
      peakWeekly * 0.28,
      startLongRunKm
    ),
    3,
    32
  )
  const longRunCaps = buildLongRunCurve({
    totalWeeks, phases, recoveryWeeks, startLongRunKm, peakLongRunKm: peakLong,
  })

  // Race day sits on the event's actual weekday, in the final week.
  const raceDay = hasEvent && targetDistanceKm ? DAYS[(new Date(eventDate + 'T00:00:00').getDay() + 6) % 7] : null

  const weeks = []
  for (let i = 0; i < totalWeeks; i++) {
    const phase = phases[i]
    const isRecovery = recoveryWeeks[i]
    const isFinalWeek = i === totalWeeks - 1
    const rawDays = layOutWeek({
      volumeKm: volumes[i],
      phase,
      isRecovery,
      paces,
      fitnessLevel,
      constraints,
      maxLongRunKm: longRunCaps[i],
      goalPaceKey,
      race: isFinalWeek && raceDay ? { day: raceDay, distanceKm: targetDistanceKm } : null,
    })
    // Segments, HR ranges and time windows are computed ONCE here and stored
    // with the plan, so rendering a workout card never calculates or calls out.
    const days = enrichDays(rawDays, paces, profile.age)
    weeks.push({
      week_number: i + 1,
      phase,
      is_recovery: isRecovery,
      // Recomputed from the ROUNDED day distances, so the week total always
      // equals what the cards actually add up to.
      target_volume_km: Math.round(days.reduce((s, d) => s + d.distance_km, 0)),
      planned_volume_km: volumes[i],
      intent: isRecovery
        ? 'vsrkavanje zadnjih treh tednov treninga, da bo naslednji blok lahko trši'
        : PHASE_INTENT[phase],
      days,
    })
  }

  return {
    vdot,
    vdot_source: source,
    vdot_based_on: basedOn,
    paces: Object.fromEntries(
      Object.entries(paces).map(([k, v]) => [k, { min_per_km: round2(v), label: formatPace(v) }])
    ),
    total_weeks: totalWeeks,
    goal: hasEvent ? 'event' : 'general',
    target_distance_km: targetDistanceKm,
    goal_assessment: goalAssessment,
    event_date: eventDate,
    race_day: raceDay,
    start_volume_km: startVolumeKm,
    peak_volume_km: Math.max(...weeks.map((w) => w.target_volume_km)),
    start_long_run_km: round1(startLongRunKm),
    hr_max: maxHeartRate(profile.age),
    hr_zones: heartRateZones(profile.age),
    max_long_run_km: round1(Math.max(...longRunCaps)),
    constraints,
    weeks,
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}
function round1(n) {
  return Math.round(n * 10) / 10
}
function round2(n) {
  return Math.round(n * 100) / 100
}
