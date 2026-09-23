/**
 * Step 6 — BUILD.
 *
 * One builder per scenario, each with its own structure, progression,
 * session types and intensity. They share the safety machinery
 * (build-time.js, build-distance.js, rules.js) and nothing else: a complete
 * beginner's plan is minutes of walk-run, a short-race plan is speed work
 * with short long runs, a maintenance plan does not build at all.
 *
 * Builders only ever see the ADOPTED goal from feasibility — an unsafe goal
 * never reaches this file.
 */
import {
  pacesFromVdot, assignPhases, peakVolumeCap, PHASE_INTENT, DAYS,
} from '../periodization.js'
import {
  SCENARIO_RULES, SAFE, MAX_PLAN_WEEKS, OPEN_GOAL_WEEKS, OLDER_RUNNER_AGE, GENTLE_START_AGE,
  longShareFor, longRunCeiling, readinessFor, taperFor, longRunDurationCapKm, longRunMaxMinutes,
} from './rules.js'
import { pickRunDays } from './days.js'
import { buildTimePlan } from './build-time.js'
import { buildDistancePlan } from './build-distance.js'
import { withGoal } from './collect.js'

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const round = Math.round

/** Below this weekly volume a returning runner is prescribed minutes, not km. */
const RETURN_TIME_BASED_BELOW_KM = 8

/** Easy pace for someone at the very start: never faster than 7:30/km. */
const BEGINNER_RUN_PACE = 7.5

function intentFor(phase, isRecovery) {
  if (isRecovery) return 'vsrkavanje zadnjih tednov treninga, da bo naslednji blok lahko trši'
  return PHASE_INTENT[phase] || PHASE_INTENT.base
}

/** Everything a builder needs about the runner's week and the adopted goal. */
function context(scenario, inputs, assessment, feasibility) {
  const rules = SCENARIO_RULES[scenario]
  const adopted = feasibility.adopted_goal
  const goalInputs = withGoal(inputs, {
    distanceKm: adopted.distance_km, eventDate: adopted.event_date, targetTimeMin: adopted.target_time_min,
  })
  const g = goalInputs.goal
  const noBackToBack =
    !rules.backToBack ||
    Boolean(inputs.constraints.noBackToBack) ||
    (inputs.age ?? 0) >= OLDER_RUNNER_AGE ||
    (scenario === 'returning' && inputs.signals.injury)
  const available = inputs.constraints.availableDays ?? inputs.availableDays
  const runDays = pickRunDays({ count: feasibility.run_days, available, noBackToBack })

  const paces = pacesFromVdot(assessment.vdot)
  // A target time on the goal being built for sets the goal pace.
  const tg = feasibility.time_goal
  const sameGoal = adopted.distance_km === feasibility.original_goal.distance_km
  if (sameGoal && tg?.goal_pace_min_per_km) paces.goal = tg.goal_pace_min_per_km

  const withinHorizon = g.weeksToEvent !== null && g.weeksToEvent <= MAX_PLAN_WEEKS
  return {
    rules, adopted, goal: g, runDays, available, noBackToBack, paces,
    hasEvent: Boolean(g.eventDate && g.weeksToEvent),
    withinHorizon,
    weekly: assessment.weekly_km ?? 0,
    longest: assessment.longest_km ?? round((assessment.weekly_km ?? 0) * 0.3),
    goalPaceKey: paces.goal ? 'goal' : 'marathon',
    age: inputs.age,
    // 2.5 h (3 h for marathon plans) at this runner's easy pace.
    longMaxKm: longRunDurationCapKm(g.distanceKm ?? 0, paces.easy),
    longMaxMinutes: longRunMaxMinutes(g.distanceKm ?? 0),
    share: (opts = {}) => longShareFor(runDays.length, { weeklyKm: assessment.weekly_km ?? 0, ...opts }),
  }
}

/** Plan length: to the event (capped), or long enough to get ready. */
function planLength(ctx, feasibility, fallbackWeeks) {
  if (ctx.hasEvent) return Math.min(ctx.goal.weeksToEvent, MAX_PLAN_WEEKS)
  if (!ctx.goal.distanceKm) return fallbackWeeks
  return clamp(feasibility.weeks_needed_comfortable ?? fallbackWeeks, OPEN_GOAL_WEEKS.min, OPEN_GOAL_WEEKS.max)
}

function recoveryPattern(phases, raceWeekIndex = -1) {
  return phases.map((phase, i) =>
    (i + 1) % SAFE.recoveryEvery === 0 && phase !== 'taper' && i !== raceWeekIndex && i !== phases.length - 1
  )
}

function raceFor(ctx, totalWeeks, walkBreaks = false) {
  if (!ctx.hasEvent || !ctx.withinHorizon || !ctx.goal.distanceKm) return null
  return {
    weekIndex: totalWeeks - 1,
    day: ctx.goal.eventWeekday,
    distanceKm: ctx.goal.distanceKm,
    walkBreaks,
  }
}

/** Phases for a distance plan: to a race, or a block with no taper. */
function racePhases(ctx, totalWeeks, taperWeeks) {
  const race = ctx.hasEvent && ctx.withinHorizon
  return assignPhases(totalWeeks, { hasEvent: true, taperWeeks: race ? taperWeeks : 0 })
}

// ---------------------------------------------------------------------------
// The builders
// ---------------------------------------------------------------------------

function completeBeginner(ctx) {
  const runPace = Math.max(ctx.paces.easy, BEGINNER_RUN_PACE)
  const ladder = (ctx.age ?? 0) >= GENTLE_START_AGE ? 'gentle' : 'standard'
  // "5 km comfortably" means a session that long, non-stop; otherwise 30 min.
  const targetLongMin = ctx.goal.distanceKm
    ? clamp(round(ctx.goal.distanceKm * runPace), 30, 45)
    : 30
  const draft = buildTimePlan({
    totalWeeks: OPEN_GOAL_WEEKS.max, ladder, runDayCount: ctx.runDays.length, available: ctx.runDays,
    runPace, age: ctx.age, targetLongMin, targetEasyMin: 30,
  })
  // Stop the week after the target is first reached: that is the programme.
  const done = draft.weeks.findIndex((w) =>
    w.days.some((d) => d.type === 'long' && d.walk_run?.continuous_min >= targetLongMin))
  const weeks = done === -1 ? draft.weeks : draft.weeks.slice(0, Math.min(draft.weeks.length, done + 2))
  return { unit: 'time', weeks }
}

function deadlineBeginner(ctx, assessment, feasibility) {
  const total = ctx.goal.weeksToEvent ?? 12
  const walkBreaks = Boolean(ctx.adopted.walk_breaks) || (ctx.goal.distanceKm ?? 0) <= 10
  if (assessment.band === 'none') {
    // From zero: the walk-run ladder, as far as the date allows, then the event.
    const runPace = Math.max(ctx.paces.easy, BEGINNER_RUN_PACE)
    const d = ctx.goal.distanceKm ?? 5
    const plan = buildTimePlan({
      totalWeeks: total,
      ladder: (ctx.age ?? 0) >= GENTLE_START_AGE ? 'gentle' : 'standard',
      runDayCount: Math.min(3, ctx.runDays.length),
      available: ctx.runDays,
      runPace,
      age: ctx.age,
      targetLongMin: clamp(round(d * 0.6 * runPace), 30, 75),
      targetEasyMin: 30,
      race: ctx.hasEvent ? { distanceKm: d, walkBreaks: true, day: ctx.goal.eventWeekday } : null,
    })
    return { unit: 'time', weeks: plan.weeks }
  }
  // Already runs a little: kilometres, no speed work, finish safely.
  const req = readinessFor(ctx.goal.distanceKm)
  const taper = taperFor(ctx.goal.distanceKm)
  const phases = racePhases(ctx, total, taper.weeks).map((p) => (p === 'taper' ? 'taper' : 'base'))
  const race = raceFor(ctx, total, walkBreaks)
  return {
    unit: 'distance',
    weeks: buildDistancePlan({
      longMaxKm: ctx.longMaxKm,
      totalWeeks: total, phases, recoveryWeeks: recoveryPattern(phases, race?.weekIndex ?? -1),
      runDays: ctx.runDays, paces: ctx.paces, age: ctx.age,
      startWeeklyKm: Math.max(ctx.weekly, 4),
      peakWeeklyKm: Math.max(ctx.weekly, round(req.weeklyComf)),
      progression: 'build',
      startLongKm: ctx.longest, peakLongKm: round(req.longComf), cautious: true,
      longShare: ctx.share(),
      taperFactors: taper.factors,
      qualityFor: () => [],
      race, goalPaceKey: 'easy', intentFor,
    }).weeks,
  }
}

function recreational(ctx) {
  const total = SCENARIO_RULES.recreational.weeks
  const start = Math.max(ctx.weekly, 6)
  const peak = Math.max(start + 2, Math.min(round(start * 1.25), start + 10))
  const longStart = Math.max(3, ctx.longest || round(start * 0.35))
  const phases = Array(total).fill('consistency')
  return {
    unit: 'distance',
    weeks: buildDistancePlan({
      longMaxKm: ctx.longMaxKm,
      totalWeeks: total, phases, recoveryWeeks: recoveryPattern(phases),
      runDays: ctx.runDays, paces: ctx.paces, age: ctx.age,
      startWeeklyKm: start, peakWeeklyKm: peak, progression: 'rolling',
      startLongKm: longStart, peakLongKm: Math.min(16, Math.max(longStart, round(longStart * 1.3))),
      cautious: true, longShare: ctx.share(),
      taperFactors: [], qualityFor: () => [], race: null, goalPaceKey: 'easy', intentFor,
      // Optional variety: strides on one easy run in normal weeks. Still easy
      // running — a few 20-second pick-ups, not a workout.
      decorate: (days, i, phase, isRecovery) => {
        if (isRecovery) return days
        const easy = days.filter((d) => d.type === 'easy')
        const pick = easy[Math.floor((easy.length - 1) / 2)]
        return days.map((d) =>
          d === pick ? { ...d, title: 'Lahkoten tek s pospeški', variant: 'strides', optional_variety: true } : d)
      },
    }).weeks,
  }
}

function maintenance(ctx, assessment) {
  const total = SCENARIO_RULES.maintenance.weeks
  const volume = Math.max(ctx.weekly, 10)
  const share = ctx.share()
  const long = Math.max(3, Math.min(ctx.longest || round(volume * 0.3), round(volume * share), ctx.longMaxKm))
  const experienced = assessment.history === 'experienced'
  const phases = Array(total).fill('maintain')
  return {
    unit: 'distance',
    weeks: buildDistancePlan({
      longMaxKm: ctx.longMaxKm,
      totalWeeks: total, phases, recoveryWeeks: recoveryPattern(phases),
      runDays: ctx.runDays, paces: ctx.paces, age: ctx.age,
      startWeeklyKm: volume, peakWeeklyKm: volume, progression: 'hold',
      startLongKm: long, peakLongKm: long, cautious: false, longShare: share,
      taperFactors: [],
      // Enough quality to keep what they have: threshold every week, and a
      // faster session alternating with repetitions for bigger weeks.
      qualityFor: (i) => {
        const q = [{ type: 'tempo', paceKey: 'threshold' }]
        if (experienced && ctx.runDays.length >= 5) {
          q.push(i % 2 === 0 ? { type: 'interval', paceKey: 'interval' } : { type: 'repetition', paceKey: 'repetition' })
        }
        return q
      },
      race: null, goalPaceKey: 'threshold', intentFor,
    }).weeks,
  }
}

function race(ctx, assessment, feasibility, kind) {
  const d = ctx.goal.distanceKm
  const req = readinessFor(d)
  const taper = taperFor(d)
  const total = planLength(ctx, feasibility, 12)
  const phases = racePhases(ctx, total, taper.weeks)
  const raceWeek = raceFor(ctx, total)
  const level = assessment.history === 'experienced' ? 'advanced'
    : assessment.history === 'developing' ? 'intermediate' : 'beginner'
  const volumeCap = Math.max(ctx.weekly, peakVolumeCap(level, d))
  const experienced = assessment.history === 'experienced'
  const days = ctx.runDays.length

  if (kind === 'short') {
    // Speed-led: repetitions from the start, intervals and threshold in the
    // build, race-specific work late. Long runs deliberately short.
    const peakWeekly = clamp(Math.max(round(req.weeklyComf), round(ctx.weekly * 1.15)), ctx.weekly, volumeCap)
    const longCeiling = Math.min(18, Math.max(ctx.longest, round(d + 6)))
    const maxQuality = experienced || assessment.history === 'developing' ? 2 : 1
    const q = {
      base: [{ type: 'repetition', paceKey: 'repetition' }],
      build: [{ type: 'interval', paceKey: 'interval' }, { type: 'tempo', paceKey: 'threshold' }],
      sharpen: [{ type: 'repetition', paceKey: 'repetition' }, { type: 'interval', paceKey: ctx.paces.goal ? 'goal' : 'interval' }],
      taper: [{ type: 'interval', paceKey: 'interval' }],
    }
    return {
      unit: 'distance',
      weeks: buildDistancePlan({
      longMaxKm: ctx.longMaxKm,
        totalWeeks: total, phases, recoveryWeeks: recoveryPattern(phases, raceWeek?.weekIndex ?? -1),
        runDays: ctx.runDays, paces: ctx.paces, age: ctx.age,
        startWeeklyKm: Math.max(ctx.weekly, 5), peakWeeklyKm: Math.max(peakWeekly, 5), progression: 'build',
        startLongKm: ctx.longest, peakLongKm: longCeiling, cautious: !experienced,
        longShare: Math.min(ctx.share(), 0.35),
        taperFactors: taper.factors,
        qualityFor: (i, phase) => (q[phase] || []).slice(0, maxQuality),
        race: raceWeek, goalPaceKey: ctx.goalPaceKey, intentFor,
      }).weeks,
    }
  }

  // Long race: the long run is the backbone; quality supports it.
  const peakWeekly = clamp(Math.max(round(req.weeklyComf), round(ctx.weekly * 1.2)), ctx.weekly, volumeCap)
  const peakLong = Math.min(longRunCeiling(d), Math.max(req.longComf, Math.min(d, 32), ctx.longest))
  const q = {
    base: experienced ? [{ type: 'tempo', paceKey: 'threshold' }] : [],
    build: [{ type: 'tempo', paceKey: 'threshold' }, ...(experienced && days >= 5 ? [{ type: 'interval', paceKey: 'interval' }] : [])],
    sharpen: [{ type: 'tempo', paceKey: ctx.goalPaceKey }, ...(experienced && days >= 5 ? [{ type: 'interval', paceKey: 'interval' }] : [])],
    taper: [{ type: 'tempo', paceKey: ctx.goalPaceKey }],
  }
  return {
    unit: 'distance',
    weeks: buildDistancePlan({
      longMaxKm: ctx.longMaxKm,
      totalWeeks: total, phases, recoveryWeeks: recoveryPattern(phases, raceWeek?.weekIndex ?? -1),
      runDays: ctx.runDays, paces: ctx.paces, age: ctx.age,
      startWeeklyKm: Math.max(ctx.weekly, 5), peakWeeklyKm: Math.max(peakWeekly, 5), progression: 'build',
      startLongKm: ctx.longest, peakLongKm: round(peakLong), cautious: assessment.history !== 'experienced',
      // Goal-driven: the ~30% guidance may be exceeded; duration still binds.
      longShare: ctx.share({ goalDriven: true }),
      taperFactors: taper.factors,
      qualityFor: (i, phase) => q[phase] || [],
      race: raceWeek, goalPaceKey: ctx.goalPaceKey, intentFor,
    }).weeks,
  }
}

function returning(ctx, assessment, feasibility, inputs) {
  const noIntensity = SCENARIO_RULES.returning.noIntensityWeeks
  const total = ctx.hasEvent ? Math.min(ctx.goal.weeksToEvent, MAX_PLAN_WEEKS) : SCENARIO_RULES.returning.weeks
  const d = ctx.goal.distanceKm

  if (ctx.weekly < RETURN_TIME_BASED_BELOW_KM) {
    // Back from (almost) nothing: minutes, a short walk-run bridge, then
    // continuous. A kilometre plan at this volume is 1 km fragments.
    const runPace = Math.max(ctx.paces.easy, 7)
    const plan = buildTimePlan({
      totalWeeks: total, ladder: 'returning',
      runDayCount: Math.min(ctx.runDays.length, 4), available: ctx.runDays,
      runPace, age: ctx.age, targetLongMin: d ? clamp(round(d * runPace * 0.8), 30, 90) : 45, targetEasyMin: 35,
      race: ctx.hasEvent && d ? { distanceKm: d, walkBreaks: false, day: ctx.goal.eventWeekday } : null,
      ladderPhase: 'return',
    })
    return { unit: 'time', weeks: plan.weeks }
  }

  const req = d ? readinessFor(d) : null
  const taper = d ? taperFor(d) : { weeks: 0, factors: [] }
  const raceWeek = raceFor(ctx, total)
  const taperWeeks = raceWeek ? taper.weeks : 0
  const phases = Array.from({ length: total }, (_, i) => {
    if (i >= total - taperWeeks) return 'taper'
    if (i < noIntensity) return 'return'
    return i < (total - taperWeeks) * 0.75 ? 'base' : 'build'
  })
  const peakWeekly = req
    ? Math.max(ctx.weekly, Math.min(round(req.weeklyComf), round(ctx.weekly * 2)))
    : Math.max(ctx.weekly + 3, Math.min(round(ctx.weekly * 2), ctx.weekly + 15))
  const peakLong = req
    ? Math.max(ctx.longest, round(req.longComf))
    : Math.max(ctx.longest, Math.min(16, round(Math.max(ctx.longest, 4) * 1.8)))
  return {
    unit: 'distance',
    weeks: buildDistancePlan({
      longMaxKm: ctx.longMaxKm,
      totalWeeks: total, phases, recoveryWeeks: recoveryPattern(phases, raceWeek?.weekIndex ?? -1),
      runDays: ctx.runDays, paces: ctx.paces, age: ctx.age,
      startWeeklyKm: ctx.weekly, peakWeeklyKm: peakWeekly, progression: 'build',
      startLongKm: ctx.longest, peakLongKm: peakLong, cautious: true,
      longShare: ctx.share(),
      taperFactors: taper.factors,
      // Intensity only once the body has had six weeks to re-adapt, and then
      // one short threshold session at most.
      qualityFor: (i, phase) =>
        i >= noIntensity && phase === 'build' ? [{ type: 'tempo', paceKey: 'threshold' }] : [],
      race: raceWeek, goalPaceKey: ctx.goalPaceKey, intentFor,
    }).weeks,
  }
}

// ---------------------------------------------------------------------------

/**
 * @returns {{unit: 'time'|'distance', weeks: Array, run_days: string[], paces: object}}
 */
export function buildPlan(scenario, inputs, assessment, feasibility) {
  const ctx = context(scenario, inputs, assessment, feasibility)
  let built
  switch (scenario) {
    case 'complete_beginner': built = completeBeginner(ctx); break
    case 'beginner_with_deadline': built = deadlineBeginner(ctx, assessment, feasibility); break
    case 'recreational': built = recreational(ctx); break
    case 'maintenance': built = maintenance(ctx, assessment); break
    case 'short_race': built = race(ctx, assessment, feasibility, 'short'); break
    case 'long_race': built = race(ctx, assessment, feasibility, 'long'); break
    case 'returning': built = returning(ctx, assessment, feasibility, inputs); break
    default: throw new Error(`Unknown scenario: ${scenario}`)
  }

  // Scenario rules travel with every week, so later adaptation can enforce them.
  const rules = SCENARIO_RULES[scenario]
  const weeks = built.weeks.map((w, i) => ({
    ...w,
    intent: w.intent || intentFor(w.phase, w.is_recovery),
    allow_hard:
      rules.hard === true ? w.allow_hard !== false
        : rules.hard === 'late' ? i >= (rules.noIntensityWeeks ?? 0) && Boolean(w.allow_hard)
          : false,
  }))

  return {
    unit: built.unit,
    weeks,
    run_days: ctx.runDays,
    no_back_to_back: ctx.noBackToBack,
    paces: ctx.paces,
    goal_pace_key: ctx.goalPaceKey,
    race_day: ctx.hasEvent && ctx.withinHorizon ? ctx.goal.eventWeekday : null,
    beyond_horizon: ctx.hasEvent && !ctx.withinHorizon,
  }
}

export { DAYS }
