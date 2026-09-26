/**
 * rules.js — the safety limits and the per-scenario rules, in one place.
 *
 * Feasibility (step 4) and every builder (step 6) read the SAME numbers from
 * here. If feasibility used one progression rate and the builder another, a
 * goal could be judged reachable and then built into a plan that breaks the
 * limit to get there — which is exactly the "squeezed plan" this pipeline
 * exists to prevent.
 *
 * The numbers are runko-research's engine rules (rule references in the
 * comments). Which of them apply to one runner — an age cap, a level floor —
 * is decided in limits.js; the helpers here take that runner's resolved
 * limits (`L`) and fall back to DEFAULT_LOAD, the rules for an adult under
 * 50 with no other population rule.
 *
 * Pure data and arithmetic. See ../README.md for the core rules.
 */

// ---------------------------------------------------------------------------
// Safe progression limits
// ---------------------------------------------------------------------------

export const SAFE = {
  /** b04 r8: weekly load grows by at most 10% on the progressive trend... */
  weeklyIncrease: 0.1,
  /** ...b04 r12 [SAFETY]: and never by more than 20%, for anyone. */
  weeklyCeiling: 0.2,
  /** Time-based plans: 10% or five minutes a week (walk-run rules: phase 3). */
  weeklyFloorMin: 5,

  /**
   * b04 r16 [SAFETY]: no run longer than 1.10 x the longest run of the last
   * 30 days. Distances are whole kilometres, so under 10 km the smallest
   * possible step is 1 km — the kilometre version of the walk-run "+5 min"
   * floor (5-7 min at easy pace).
   */
  longSpike: 0.1,
  longSpikeFloorKm: 1,

  /** Layout preference: the long run's share of the week by run days. */
  longShareByDays: { 2: 0.65, 3: 0.55, 4: 0.5, 5: 0.45, 6: 0.4, 7: 0.35 },

  /**
   * THE long-run cap is duration, not distance (decision 1, b04 r20): time on
   * feet is what loads tendons and bones, and a slow runner covering 30 km
   * is out for far longer than a fast one.
   */
  longRunMaxMinutes: 150,
  marathonLongRunMaxMinutes: 180,

  /**
   * Long-run share of the week (b04 r18, decisions 1 and 5). Above ~50 km a
   * week it is guidance (36%) that a goal may exceed, the duration cap
   * binding instead; below it, a cap: 60% on 2 run days, 45% on 3, and on
   * 4+ days 45% under 40 km (or a first marathon), 36% from 40 km.
   */
  highVolumeKm: 50,
  lowVolumeKm: 40,
  longShareDefault: 0.36,
  longShareLowVolume: 0.45,
  longShareByRuns: { 2: 0.6, 3: 0.45 },
  /** Above ~50 km a goal may take the long run past 36% — never past half the week. */
  goalDrivenMaxShare: 0.5,

  /** Distance ceilings the goal-derived peak never exceeds (secondary to duration). */
  longRunMaxKm: 32,
  ultraLongRunMaxKm: 35,

  /** b06 r1-3: a lighter week every 4th (3:1), at 0.75 of the last loading week, long run 0.70. */
  recoveryEvery: 4,
  recoveryFactor: 0.75,
  recoveryLongFactor: 0.7,

  /** b04 r2: a self-reported weekly volume is started at 90%. */
  statedVolumeFactor: 0.9,
}

/** b04 r9: the absolute weekly step allowed where 10% rounds to nothing, by level. */
export const WEEKLY_FLOOR_KM = { none: 2, beginner: 2, novice: 2, intermediate: 3, advanced: 5, elite: 5 }

/** The load rules for an adult under 50 with no population rule (see limits.js). */
export const DEFAULT_LOAD = {
  weeklyIncreasePct: SAFE.weeklyIncrease,
  weeklyCeilingPct: SAFE.weeklyCeiling,
  weeklyFloorKm: WEEKLY_FLOOR_KM.novice,
  recoveryEvery: SAFE.recoveryEvery,
  recoveryFactor: SAFE.recoveryFactor,
  recoveryLongFactor: SAFE.recoveryLongFactor,
  startVolumeFactor: 1,
  longRunMaxMin: null,
}

const load = (L) => ({ ...DEFAULT_LOAD, ...(L || {}) })

/**
 * The long run's share of a week of `weeklyKm` on `runDays` days.
 * goalDriven: a long race whose goal needs the long run — above ~50 km the
 * 36% is then only guidance and the progression and duration caps bind.
 */
export function longShareFor(runDays, { weeklyKm = 0, goalDriven = false, firstMarathon = false } = {}) {
  const days = Math.min(7, Math.max(2, Math.round(runDays || 3)))
  const byDays = SAFE.longShareByDays[days]
  if (weeklyKm >= SAFE.highVolumeKm) {
    return goalDriven ? SAFE.goalDrivenMaxShare : Math.min(byDays, SAFE.longShareDefault)
  }
  const cap = SAFE.longShareByRuns[days] ??
    (weeklyKm < SAFE.lowVolumeKm || firstMarathon ? SAFE.longShareLowVolume : SAFE.longShareDefault)
  return Math.min(byDays, cap)
}

/** Longest a long run may last, in minutes: 3 h for marathon-and-longer plans, else 2.5 h (b04 r20). */
export function longRunMaxMinutes(distanceKm) {
  return distanceKm >= 42.2 ? SAFE.marathonLongRunMaxMinutes : SAFE.longRunMaxMinutes
}

/** A duration cap (minutes) as whole kilometres at this runner's easy pace (min/km). */
export function longRunDurationCapKm(maxMinutes, easyPaceMinPerKm) {
  if (!(easyPaceMinPerKm > 0) || !(maxMinutes > 0)) return Infinity
  return Math.floor(maxMinutes / easyPaceMinPerKm)
}

/** Absolute long-run ceiling for a goal distance. */
export function longRunCeiling(distanceKm) {
  return distanceKm > 42.2 ? SAFE.ultraLongRunMaxKm : SAFE.longRunMaxKm
}

/**
 * Next week's load on the progressive trend (b04 r8-12): the runner's weekly
 * percentage, or their level's absolute floor where the percentage rounds to
 * nothing, and never past the 20% ceiling. Whole kilometres: below 5 km a
 * week the smallest possible step (1 km) is allowed even though it is more
 * than 20%.
 */
export function nextWeeklyLoad(previous, unit = 'distance', L) {
  const r = load(L)
  if (unit === 'time') {
    return Math.max(previous + SAFE.weeklyFloorMin, Math.floor(previous * (1 + r.weeklyIncreasePct)))
  }
  const grown = Math.max(previous + r.weeklyFloorKm, Math.floor(previous * (1 + r.weeklyIncreasePct)))
  const ceiling = Math.max(previous + 1, Math.floor(previous * (1 + r.weeklyCeilingPct)))
  return Math.min(grown, ceiling)
}

/**
 * The longest any run may be, from the longest run of the last 30 days
 * (b04 r16 [SAFETY]): +10%, or the 1 km whole-kilometre step below 10 km.
 */
export function nextLongRun(longest30d) {
  if (!(longest30d > 0)) return 3
  return Math.floor(Math.max(longest30d * (1 + SAFE.longSpike), longest30d + SAFE.longSpikeFloorKm))
}

// ---------------------------------------------------------------------------
// What a distance demands
// ---------------------------------------------------------------------------

/**
 * Readiness for a goal distance: the long run and weekly volume needed to
 * finish it SAFELY (min) and to run it well (comfortable), plus run days.
 * Between the anchors values are interpolated, so 15 km or 30 km are handled
 * exactly like the standard distances.
 *
 * Anchors follow knowledge/beginners.md and methodology.md: a half needs a
 * base of ~25 km/week and a ~15 km long run to finish without breaking down;
 * a marathon needs ~40 km/week, a ~26 km long run and at least 3 run days.
 */
const READINESS = [
  { d: 5, longMin: 4, longComf: 6, weeklyMin: 6, weeklyComf: 12, daysMin: 2, daysComf: 3 },
  { d: 10, longMin: 8, longComf: 10, weeklyMin: 12, weeklyComf: 20, daysMin: 2, daysComf: 3 },
  { d: 21.1, longMin: 15, longComf: 18, weeklyMin: 25, weeklyComf: 35, daysMin: 2, daysComf: 3 },
  { d: 42.2, longMin: 26, longComf: 30, weeklyMin: 40, weeklyComf: 55, daysMin: 3, daysComf: 4 },
  { d: 50, longMin: 28, longComf: 32, weeklyMin: 50, weeklyComf: 65, daysMin: 3, daysComf: 4 },
]

export function readinessFor(distanceKm) {
  if (!(distanceKm > 0)) return null
  if (distanceKm <= READINESS[0].d) {
    // Below 5 km scale down proportionally, never below a walkable minimum.
    const r = READINESS[0]
    const f = distanceKm / r.d
    return {
      longMin: Math.max(2, r.longMin * f), longComf: Math.max(3, r.longComf * f),
      weeklyMin: Math.max(4, r.weeklyMin * f), weeklyComf: Math.max(6, r.weeklyComf * f),
      daysMin: r.daysMin, daysComf: r.daysComf,
    }
  }
  const last = READINESS[READINESS.length - 1]
  if (distanceKm >= last.d) {
    const f = distanceKm / last.d
    return {
      longMin: Math.min(SAFE.ultraLongRunMaxKm, last.longMin * f),
      longComf: Math.min(SAFE.ultraLongRunMaxKm, last.longComf * f),
      weeklyMin: last.weeklyMin * f, weeklyComf: last.weeklyComf * f,
      daysMin: last.daysMin, daysComf: last.daysComf,
    }
  }
  const hi = READINESS.findIndex((r) => r.d >= distanceKm)
  const a = READINESS[hi - 1]
  const b = READINESS[hi]
  const f = (distanceKm - a.d) / (b.d - a.d)
  const mix = (k) => a[k] + (b[k] - a[k]) * f
  return {
    longMin: mix('longMin'), longComf: mix('longComf'),
    weeklyMin: mix('weeklyMin'), weeklyComf: mix('weeklyComf'),
    daysMin: f < 1 ? a.daysMin : b.daysMin, daysComf: f < 1 ? a.daysComf : b.daysComf,
  }
}

/**
 * Run-walk makes a COMPLETION goal finishable on less: someone who can
 * run-walk 40% of the distance can finish it by walking more on the day.
 * Up to 10 km this holds for anyone; up to a half marathon only when there
 * is no target time (WALK_RUN_MAX_KM). A marathon is never rescued this way,
 * and a target time is never reached by walking. Only the MINIMUM readiness
 * counts run-walk, so the result is at most a stretch, never comfortable.
 */
export const WALK_BREAK_LONG_SHARE = 0.4
export const WALK_BREAK_MAX_KM = 10
/** A completion goal (no target time) may be met run-walk up to a half marathon. */
export const WALK_RUN_MAX_KM = 21.1

/**
 * Taper (b06 rules 9-16, 22-23): weeks (race week included), each week's
 * volume as a fraction of peak_ref (the mean of the three biggest loading
 * weeks; the race-week figure is its training EXCLUDING the race), and the
 * long-run cap in each week as a fraction of the peak long run.
 *
 *   5 km      7 days    race week 0.65 (beginner/novice 0.75)
 *   10 km     7 days    race week 0.60 (0.70); advanced/elite 2 weeks, 0.85 first
 *   half      14 days   0.70, 0.50; novice 10 days (week -2 is 4 normal days
 *                       and 3 at 0.70: 0.87)
 *   marathon  21 days   0.75, 0.60, 0.40 when the peak is >= 40 km a week;
 *             14 days   0.70, 0.45 below that
 *
 * `preTaperLong` caps the long run of the week BEFORE a short taper, so the
 * last full-length long run is >= 10 days out for 5 and 10 km.
 */
const BEGINNERS = new Set(['none', 'beginner', 'novice'])

export function taperFor(distanceKm, { level = 'novice', peakKm = 0 } = {}) {
  if (!(distanceKm > 0)) return { weeks: 0, factors: [], longFactors: [], preTaperLong: null, rule: null }
  const novice = BEGINNERS.has(level)
  const advanced = level === 'advanced' || level === 'elite'
  if (distanceKm <= 5) {
    return { weeks: 1, factors: [novice ? 0.75 : 0.65], longFactors: [0.4], preTaperLong: 0.85, rule: 'b06 r15' }
  }
  if (distanceKm <= 10) {
    if (advanced) return { weeks: 2, factors: [0.85, 0.6], longFactors: [0.7, 0.4], preTaperLong: null, rule: 'b06 r14' }
    return { weeks: 1, factors: [novice ? 0.7 : 0.6], longFactors: [0.4], preTaperLong: 0.85, rule: 'b06 r14' }
  }
  if (distanceKm <= 30) {
    return novice
      ? { weeks: 2, factors: [0.87, 0.5], longFactors: [0.75, 0.4], preTaperLong: null, rule: 'b06 r13 (novice, 10 days)' }
      : { weeks: 2, factors: [0.7, 0.5], longFactors: [0.65, 0.4], preTaperLong: null, rule: 'b06 r13' }
  }
  if (peakKm >= 40) {
    return { weeks: 3, factors: [0.75, 0.6, 0.4], longFactors: [0.78, 0.6, 0.35], preTaperLong: null, rule: 'b06 r11, r22' }
  }
  return { weeks: 2, factors: [0.7, 0.45], longFactors: [0.65, 0.35], preTaperLong: null, rule: 'b06 r12' }
}

// ---------------------------------------------------------------------------
// The seven scenarios
// ---------------------------------------------------------------------------

export const SCENARIOS = [
  'complete_beginner',
  'beginner_with_deadline',
  'recreational',
  'short_race',
  'long_race',
  'returning',
  'maintenance',
]

/**
 * Structural rules per scenario. These are what make the scenarios different
 * plans rather than one plan with different numbers:
 *
 *   unit        'time' prescribes minutes (walk-run), 'distance' kilometres
 *   hard        whether tempo / interval / repetition sessions may appear
 *   backToBack  whether two run days may be adjacent
 *   maxRunDays  cap on run days, whatever the runner offered
 *   progression 'build' grows toward a goal, 'hold' keeps volume flat,
 *               'rolling' grows gently to a plateau and stays there
 */
export const SCENARIO_RULES = {
  complete_beginner: {
    unit: 'time', hard: false, backToBack: false, maxRunDays: 3,
    progression: 'build', weeks: null,
  },
  beginner_with_deadline: {
    unit: 'distance', hard: false, backToBack: false, maxRunDays: 4,
    progression: 'build', weeks: null, walkBreaksInEvent: true,
  },
  recreational: {
    unit: 'distance', hard: false, backToBack: true, maxRunDays: 5,
    progression: 'rolling', weeks: 12,
  },
  short_race: {
    unit: 'distance', hard: true, backToBack: true, maxRunDays: 7,
    progression: 'build', weeks: null,
  },
  long_race: {
    unit: 'distance', hard: true, backToBack: true, maxRunDays: 7,
    progression: 'build', weeks: null,
  },
  returning: {
    unit: 'distance', hard: 'late', backToBack: true, maxRunDays: 5,
    progression: 'build', weeks: 12, noIntensityWeeks: 6,
  },
  maintenance: {
    unit: 'distance', hard: true, backToBack: true, maxRunDays: 7,
    progression: 'hold', weeks: 12,
  },
}

/**
 * Longest useful race block. A race further out still gets a plan to race
 * day: this block ends on it, and steady foundation weeks come before it.
 */
export const MAX_PLAN_WEEKS = 30

/** Default length of a plan with a distance goal but no date. */
export const OPEN_GOAL_WEEKS = { min: 8, max: 16 }

/** Age at which back-to-back run days are avoided whatever the scenario. */
export const OLDER_RUNNER_AGE = 65

/** Age at which a complete beginner starts on the gentler walk-run ladder. */
export const GENTLE_START_AGE = 55
