/**
 * progression.js — how long safe progression takes.
 *
 * Simulates week-by-week growth under the limits in rules.js (10% weekly,
 * capped long-run steps, a recovery week every 4th) and answers "how many
 * weeks until this runner could safely be ready for that distance?". Both
 * classify (is the deadline too soon for a beginner?) and feasibility use
 * this, so they can never disagree.
 */
import {
  SAFE, nextWeeklyLoad, nextLongRun, longShareFor, readinessFor, taperFor, longRunDurationCapKm,
  WALK_BREAK_LONG_SHARE, WALK_BREAK_MAX_KM,
} from './rules.js'

/** Weeks of walk-run before a complete beginner runs 20 minutes non-stop. */
export const WALK_RUN_WEEKS = { standard: 8, gentle: 10 }

/**
 * Where a complete beginner stands once the walk-run ladder is done: three
 * 20-25 minute runs a week at beginner easy pace, roughly.
 */
export const AFTER_WALK_RUN = { weeklyKm: 8, longKm: 3 }

/** Shortest build before any event, however short, for someone starting at zero. */
export const MIN_WEEKS_FROM_ZERO = 3

const HORIZON = 156 // three years; beyond this, "not in one block" is the answer

/**
 * Weeks of safe progression (recovery weeks included, taper excluded) until
 * the runner reaches both the weekly volume and the long run.
 *
 * @returns {number} Infinity when it takes longer than the horizon
 */
export function weeksToReach({ startWeekly, startLong, needWeekly, needLong, runDays = 4, cautious = false }) {
  let weekly = Math.max(0, startWeekly || 0)
  let longest = Math.max(0, startLong || 0)
  if (weekly >= needWeekly && longest >= needLong) return 0

  const share = longShareFor(runDays)
  let lastProgressive = weekly
  for (let week = 1; week <= HORIZON; week++) {
    if (week % SAFE.recoveryEvery === 0) continue // recovery: time passes, nothing gained
    const volume = week === 1 ? Math.max(weekly, 1) : nextWeeklyLoad(lastProgressive)
    lastProgressive = volume
    const long = Math.min(nextLongRun(Math.max(longest, 1), { cautious }), volume * share)
    longest = Math.max(longest, long)
    if (volume >= needWeekly && longest >= needLong) return week
  }
  return Infinity
}

/**
 * Minimum and comfortable plan length (weeks, race week included) for a
 * distance, from where this runner is now.
 *
 * @param {object} opts
 * @param {object} opts.assessment
 * @param {number} opts.distanceKm
 * @param {number} opts.runDays
 * @param {boolean} [opts.walkBreaks] - a beginner event where walking is allowed
 * @param {boolean} [opts.cautious]
 * @param {boolean} [opts.gentle] - older / walking-only beginners
 */
export function weeksNeeded({ assessment, distanceKm, runDays, walkBreaks = false, cautious = false, gentle = false }) {
  const req = readinessFor(distanceKm)
  if (!req) return { min: 0, comfortable: 0, requirements: null }
  const taper = taperFor(distanceKm).weeks

  // Walk breaks lower what it takes to FINISH a short event, not to run it well.
  const walkable = walkBreaks && distanceKm <= WALK_BREAK_MAX_KM
  // No long run is ever required beyond the duration cap: a slow runner is
  // ready for a marathon on 3 hours of long running, not on 30 km.
  const durationCap = longRunDurationCapKm(distanceKm, assessment.easy_pace_min_per_km)
  const minReq = walkable
    ? { weekly: Math.min(req.weeklyMin, distanceKm * 0.8), long: distanceKm * WALK_BREAK_LONG_SHARE }
    : { weekly: req.weeklyMin, long: Math.min(req.longMin, durationCap) }
  const comfReq = { weekly: req.weeklyComf, long: Math.min(req.longComf, durationCap) }

  // Someone who does not run yet climbs the walk-run ladder first.
  const fromZero = assessment.band === 'none'
  const ladder = fromZero ? WALK_RUN_WEEKS[gentle ? 'gentle' : 'standard'] : 0
  const start = fromZero
    ? AFTER_WALK_RUN
    : { weeklyKm: assessment.weekly_km ?? 0, longKm: assessment.longest_km ?? (assessment.weekly_km ?? 0) * 0.3 }

  const build = (need) =>
    weeksToReach({
      startWeekly: start.weeklyKm, startLong: start.longKm,
      needWeekly: need.weekly, needLong: need.long, runDays, cautious: cautious || fromZero,
    })

  let min = ladder + build(minReq) + taper
  // A walk-run session already covers ~3 km with its walking; a walkable 5 km
  // event needs the first few weeks of the ladder, not all of it.
  if (fromZero && walkable && minReq.long <= 3.5) min = MIN_WEEKS_FROM_ZERO
  const comfortable = ladder + build(comfReq) + taper

  return {
    min,
    comfortable: Math.max(min, comfortable),
    requirements: {
      long_run_min_km: round1(minReq.long),
      long_run_comfortable_km: round1(comfReq.long),
      weekly_min_km: round1(minReq.weekly),
      weekly_comfortable_km: round1(comfReq.weekly),
      run_days_min: req.daysMin,
      run_days_comfortable: req.daysComf,
      walk_breaks: walkable,
      long_run_duration_cap_km: Number.isFinite(durationCap) ? durationCap : null,
    },
  }
}

const round1 = (n) => Math.round(n * 10) / 10
