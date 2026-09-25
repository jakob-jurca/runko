/**
 * rules.js — the safety limits and the per-scenario rules, in one place.
 *
 * Feasibility (step 4) and every builder (step 6) read the SAME numbers from
 * here. If feasibility used one progression rate and the builder another, a
 * goal could be judged reachable and then built into a plan that breaks the
 * limit to get there — which is exactly the "squeezed plan" this pipeline
 * exists to prevent.
 *
 * Pure data and arithmetic. See ../README.md for the core rules.
 */

// ---------------------------------------------------------------------------
// Safe progression limits
// ---------------------------------------------------------------------------

export const SAFE = {
  /** Weekly load may grow by at most 10% on the progressive trend... */
  weeklyIncrease: 0.1,
  /** ...or by one whole kilometre, where 10% rounds to nothing. */
  weeklyFloorKm: 1,
  /** Time-based plans: 10% or five minutes a week. */
  weeklyFloorMin: 5,

  /** Longest-run growth per week for runners with a real base. */
  longStepKm: 2,
  longStepPct: 0.15,
  /** Beginners and returning runners: tendons adapt slower than lungs. */
  cautiousLongStepKm: 1,
  cautiousLongStepPct: 0.1,

  /** The long run's share of the week, by run days (fewer days, larger share). */
  longShareByDays: { 2: 0.65, 3: 0.55, 4: 0.5, 5: 0.45, 6: 0.4, 7: 0.35 },

  /**
   * THE long-run cap is duration, not distance: time on feet is what loads
   * tendons and bones, and a slow runner covering 30 km is out for far longer
   * than a fast one. 2.5 h for most runners, up to 3 h in marathon plans
   * (knowledge/methodology.md).
   */
  longRunMaxMinutes: 150,
  marathonLongRunMaxMinutes: 180,

  /**
   * Above ~50 km a week the long run is GUIDED to ~30% of the week (Daniels).
   * Guidance, not a cap: where the goal needs a longer run (marathon builds)
   * the duration cap is what binds.
   */
  highVolumeKm: 50,
  highVolumeLongShare: 0.3,

  /** Distance ceilings the goal-derived peak never exceeds (secondary to duration). */
  longRunMaxKm: 32,
  ultraLongRunMaxKm: 35,

  recoveryEvery: 4,
  recoveryFactor: 0.75,
}

/**
 * The long run's share of the week. By run days; above ~50 km a week, guided
 * down to ~30% unless the goal itself needs the long run (goalDriven).
 */
export function longShareFor(runDays, { weeklyKm = 0, goalDriven = false } = {}) {
  const days = Math.min(7, Math.max(2, Math.round(runDays || 3)))
  const byDays = SAFE.longShareByDays[days]
  if (!goalDriven && weeklyKm >= SAFE.highVolumeKm) return Math.min(byDays, SAFE.highVolumeLongShare)
  return byDays
}

/** Longest a long run may last, in minutes: 3 h for marathon-and-longer plans, else 2.5 h. */
export function longRunMaxMinutes(distanceKm) {
  return distanceKm >= 42.2 ? SAFE.marathonLongRunMaxMinutes : SAFE.longRunMaxMinutes
}

/** The duration cap as kilometres at this runner's easy pace (min/km). */
export function longRunDurationCapKm(distanceKm, easyPaceMinPerKm) {
  if (!(easyPaceMinPerKm > 0)) return Infinity
  return Math.floor(longRunMaxMinutes(distanceKm) / easyPaceMinPerKm)
}

/** Absolute long-run ceiling for a goal distance. */
export function longRunCeiling(distanceKm) {
  return distanceKm > 42.2 ? SAFE.ultraLongRunMaxKm : SAFE.longRunMaxKm
}

/**
 * Next week's load on the progressive trend, never more than the limit.
 * Floors the 10% so rounding can never push a week over it.
 */
export function nextWeeklyLoad(previous, unit = 'distance') {
  const floor = unit === 'time' ? SAFE.weeklyFloorMin : SAFE.weeklyFloorKm
  return Math.max(previous + floor, Math.floor(previous * (1 + SAFE.weeklyIncrease)))
}

/** Next long-run ceiling from the longest run so far. */
export function nextLongRun(previous, { cautious = false } = {}) {
  const km = cautious ? SAFE.cautiousLongStepKm : SAFE.longStepKm
  const pct = cautious ? SAFE.cautiousLongStepPct : SAFE.longStepPct
  return Math.max(previous + km, previous * (1 + pct))
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
 * Walk breaks make a SHORT event finishable on less: a beginner who can
 * walk-run 60% of 5-10 km can complete it by walking more on the day. They
 * do not rescue a half or a marathon, where the time on feet is the problem.
 */
export const WALK_BREAK_LONG_SHARE = 0.6
export const WALK_BREAK_MAX_KM = 10

/** Taper length (weeks, race week included) and volume factors, by distance. */
export function taperFor(distanceKm) {
  if (!(distanceKm > 0)) return { weeks: 0, factors: [] }
  if (distanceKm <= 10) return { weeks: 2, factors: [0.85, 0.6] }
  if (distanceKm <= 30) return { weeks: 2, factors: [0.75, 0.5] }
  return { weeks: 3, factors: [0.8, 0.6, 0.45] }
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
 *   cautious    long-run steps of 1 km / 10% rather than 2 km / 15%
 *   backToBack  whether two run days may be adjacent
 *   maxRunDays  cap on run days, whatever the runner offered
 *   progression 'build' grows toward a goal, 'hold' keeps volume flat,
 *               'rolling' grows gently to a plateau and stays there
 */
export const SCENARIO_RULES = {
  complete_beginner: {
    unit: 'time', hard: false, cautious: true, backToBack: false, maxRunDays: 3,
    progression: 'build', weeks: null,
  },
  beginner_with_deadline: {
    unit: 'distance', hard: false, cautious: true, backToBack: false, maxRunDays: 4,
    progression: 'build', weeks: null, walkBreaksInEvent: true,
  },
  recreational: {
    unit: 'distance', hard: false, cautious: true, backToBack: true, maxRunDays: 5,
    progression: 'rolling', weeks: 12,
  },
  short_race: {
    unit: 'distance', hard: true, cautious: false, backToBack: true, maxRunDays: 7,
    progression: 'build', weeks: null,
  },
  long_race: {
    unit: 'distance', hard: true, cautious: false, backToBack: true, maxRunDays: 7,
    progression: 'build', weeks: null,
  },
  returning: {
    unit: 'distance', hard: 'late', cautious: true, backToBack: true, maxRunDays: 5,
    progression: 'build', weeks: 12, noIntensityWeeks: 6,
  },
  maintenance: {
    unit: 'distance', hard: true, cautious: false, backToBack: true, maxRunDays: 7,
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
