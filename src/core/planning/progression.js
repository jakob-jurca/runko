/**
 * progression.js — how long safe progression takes.
 *
 * Simulates week-by-week growth under this runner's limits (rules.js with
 * the values from limits.js: weekly percentage, level floor, 20% ceiling,
 * the 10% long-run spike rule, a recovery week every 3rd or 4th week and a
 * hold the week after it) and answers "how many weeks until this runner
 * could safely be ready for that distance?". Both classify (is the deadline
 * too soon for a beginner?) and feasibility use this, so they can never
 * disagree — and the builder uses the same helpers.
 */
import { levelAtLeast } from './limits.js'
import {
  DEFAULT_LOAD, nextWeeklyLoad, nextLongRun, longShareFor, readinessFor, taperFor, longRunDurationCapKm,
  longRunMaxMinutes, raceFloorWeeks, minPlanWeeks, beginnerRaceGateWeeks, WALK_BREAK_LONG_SHARE, WALK_BREAK_MAX_KM, WALK_RUN_MAX_KM,
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
 * @param {object} opts
 * @param {object} [opts.limits] - resolved limit values (limits.js); defaults otherwise
 * @param {boolean} [opts.goalDriven] - a long race: the long-run share may exceed the 36% guidance
 * @returns {number} Infinity when it takes longer than the horizon
 */
export function weeksToReach({
  startWeekly, startLong, needWeekly, needLong, runDays = 4, limits = DEFAULT_LOAD,
  goalDriven = false, firstMarathon = false,
}) {
  const L = { ...DEFAULT_LOAD, ...limits }
  let weekly = Math.max(0, startWeekly || 0)
  let longest = Math.max(0, startLong || 0)
  if (weekly >= needWeekly && longest >= needLong) return 0

  let lastProgressive = weekly
  let afterRecovery = false
  for (let week = 1; week <= HORIZON; week++) {
    if (week % L.recoveryEvery === 0) {
      afterRecovery = true // recovery: time passes, nothing gained
      continue
    }
    // b04 r15: the week after a recovery week repeats the last loading week.
    const volume = week === 1 ? Math.max(weekly, 1)
      : afterRecovery ? lastProgressive
        : nextWeeklyLoad(lastProgressive, 'distance', L)
    afterRecovery = false
    lastProgressive = volume
    const share = longShareFor(runDays, { weeklyKm: volume, goalDriven, firstMarathon })
    const long = Math.min(nextLongRun(Math.max(longest, 1)), volume * share)
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
 * @param {boolean} [opts.gentle] - older / walking-only beginners
 * @param {object} [opts.limits] - resolved limit values (limits.js)
 * @param {boolean} [opts.firstMarathon]
 * @param {boolean} [opts.completion] - no target time: run-walk counts for a half marathon too
 */
export function weeksNeeded({
  assessment, distanceKm, runDays, walkBreaks = false, gentle = false, limits = DEFAULT_LOAD, firstMarathon = false,
  completion = false,
}) {
  const L = { ...DEFAULT_LOAD, ...limits }
  const req = readinessFor(distanceKm)
  if (!req) return { min: 0, comfortable: 0, requirements: null }
  const level = assessment.experience_level
  const taper = taperFor(distanceKm, { level, peakKm: req.weeklyComf }).weeks

  // Walk breaks lower what it takes to FINISH a short event, not to run it well.
  const walkable = walkBreaks && distanceKm <= (completion ? WALK_RUN_MAX_KM : WALK_BREAK_MAX_KM)
  // No long run is ever required beyond the duration cap: a slow runner is
  // ready for a marathon on 3 hours of long running, not on 30 km.
  // The age cap from limits.js, but never more than this distance allows
  // (a marathon's 3 hours do not apply to a 10 km alternative).
  const maxMin = Math.min(L.longRunMaxMin ?? Infinity, longRunMaxMinutes(distanceKm))
  const durationCap = longRunDurationCapKm(maxMin, assessment.easy_pace_min_per_km)
  const minReq = walkable
    ? { weekly: Math.min(req.weeklyMin, distanceKm * 0.8), long: distanceKm * WALK_BREAK_LONG_SHARE }
    : { weekly: req.weeklyMin, long: Math.min(req.longMin, durationCap) }
  const comfReq = { weekly: req.weeklyComf, long: Math.min(req.longComf, durationCap) }

  // Someone who does not run yet climbs the walk-run ladder first.
  const fromZero = assessment.band === 'none'
  const walkBase = fromZero ? L.walkBaseWeeks ?? 0 : 0
  const ladder = fromZero ? WALK_RUN_WEEKS[gentle ? 'gentle' : 'standard'] + walkBase : 0
  const start = fromZero
    ? AFTER_WALK_RUN
    : {
        weeklyKm: (assessment.weekly_km ?? 0) * (L.startVolumeFactor ?? 1),
        longKm: assessment.longest_km ?? (assessment.weekly_km ?? 0) * 0.3,
      }

  const build = (need) =>
    weeksToReach({
      startWeekly: start.weeklyKm, startLong: start.longKm,
      needWeekly: need.weekly, needLong: need.long, runDays, limits: L,
      goalDriven: distanceKm > 10, firstMarathon,
    })

  let min = ladder + build(minReq) + taper
  // A walk-run session already covers ~3 km with its walking; a walkable 5 km
  // event needs the first few weeks of the ladder, not all of it.
  if (fromZero && walkable && minReq.long <= 3.5) min = MIN_WEEKS_FROM_ZERO + walkBase
  const comfortable = ladder + build(comfReq) + taper

  // p05 r29: a heavier beginner's earliest race, whatever the arithmetic says.
  const gate = beginnerRaceGateWeeks(distanceKm, level, assessment.experience_months)
  // b03 r9-11: no plan shorter than the minimum — unless it is an intermediate
  // or better runner already at 80% of what the distance asks (then it is a
  // warning, not a refusal), or a walk-run completion of a short event.
  const planFloor = minPlanWeeks(distanceKm, level, runDays, assessment.longest_km ?? 0)
  const softFloor = levelAtLeast(level, 'intermediate') && (assessment.weekly_km ?? 0) >= 0.8 * req.weeklyMin
  const hardPlanFloor = walkable || softFloor ? 0 : planFloor
  const floor = Math.max(L.raceFloor ? raceFloorWeeks(distanceKm) : 0, gate, hardPlanFloor)
  min = Math.max(min, floor)

  return {
    min,
    comfortable: Math.max(min, comfortable, floor, planFloor),
    soft_floor_weeks: softFloor && !walkable ? planFloor : null,
    gate_weeks: gate || null,
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
