/**
 * Step 4 — CHECK FEASIBILITY.
 *
 * Compares the goal against current fitness and the time available, using
 * the SAME safe progression limits the builders obey (rules.js via
 * progression.js). Output: feasible, stretch or unsafe.
 *
 *   feasible  the plan can reach comfortable readiness in time
 *   stretch   minimum readiness is reachable, comfortable is not (or the
 *             target time is ambitious) — a plan, a clear warning, and a
 *             fallback target
 *   unsafe    even minimum readiness cannot be reached without breaking the
 *             limits — NO squeezed plan. The closest safe goal is proposed
 *             (shorter distance on the date, or the distance on a later
 *             date) and the plan is built for that instead.
 */
import { assessGoal, raceTimeForVdot, DAYS } from '../periodization.js'
import { SCENARIO_RULES, GENTLE_START_AGE } from './rules.js'
import { weeksNeeded } from './progression.js'
import { effectiveRunDays } from './classify.js'

/** Distances offered as safer alternatives, longest first. */
const STANDARD_DISTANCES = [42.2, 21.1, 10, 5]

const BEGINNER_SCENARIOS = new Set(['complete_beginner', 'beginner_with_deadline'])

/** ISO date of `weekday` in plan week `week` (1-based) from the start Monday. */
function dateInWeek(startDate, week, weekday = 'Sunday') {
  const d = new Date(startDate + 'T00:00:00')
  d.setDate(d.getDate() + (week - 1) * 7 + Math.max(0, DAYS.indexOf(weekday)))
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const round2 = (n) => Math.round(n * 100) / 100

/**
 * @returns {object} the feasibility record, stored verbatim in plan_json
 */
export function checkFeasibility(inputs, assessment, classification) {
  const scenario = classification.scenario
  const rules = SCENARIO_RULES[scenario]
  const { goal } = inputs
  const runDays = effectiveRunDays(inputs, scenario)
  const hasEvent = Boolean(goal.eventDate && !goal.eventInPast && goal.weeksToEvent)
  const beginner = BEGINNER_SCENARIOS.has(scenario)
  const walkBreaks = Boolean(rules.walkBreaksInEvent)
  const gentle = (inputs.age ?? 0) >= GENTLE_START_AGE

  const original = {
    distance_km: goal.distanceKm,
    event_date: hasEvent ? goal.eventDate : null,
    target_time_min: goal.targetTimeMin,
  }

  // No distance to be ready for: nothing to be infeasible about. The
  // scenario's own rules keep the progression safe.
  if (!goal.distanceKm) {
    return {
      verdict: 'feasible',
      reasons: ['No distance goal: the plan builds consistency within the safe limits.'],
      run_days: runDays,
      weeks_available: null,
      weeks_needed_min: null,
      weeks_needed_comfortable: null,
      requirements: null,
      time_goal: null,
      fallback_target: null,
      alternatives: [],
      original_goal: original,
      adopted_goal: { ...original, walk_breaks: false },
    }
  }

  // Anyone can finish a short event (≤ 10 km) by walking some of it — that is
  // exactly the stretch fallback offered below — so walk breaks count toward
  // MINIMUM readiness for every scenario. They never count toward comfortable.
  const need = weeksNeeded({
    assessment, distanceKm: goal.distanceKm, runDays, walkBreaks: true, cautious: rules.cautious, gentle,
  })
  const req = need.requirements
  const available = hasEvent ? goal.weeksToEvent : null

  const reasons = []
  let verdict = 'feasible'
  let distanceStretch = false

  if (runDays < req.run_days_min) {
    verdict = 'unsafe'
    reasons.push(`${runDays} run day(s) a week is below the ${req.run_days_min} a ${goal.distanceKm} km needs.`)
  }
  if (available !== null) {
    if (available < need.min) {
      verdict = 'unsafe'
      reasons.push(
        `${available} weeks available; safely reaching minimum readiness ` +
          `(long run ${req.long_run_min_km} km, ${req.weekly_min_km} km/week) takes at least ${need.min === Infinity ? 'far more' : need.min}.`
      )
    } else if (available < need.comfortable) {
      distanceStretch = true
      reasons.push(
        `${available} weeks reach minimum readiness but not comfortable readiness ` +
          `(long run ${req.long_run_comfortable_km} km, ${req.weekly_comfortable_km} km/week, about ${need.comfortable} weeks).`
      )
    } else {
      reasons.push(`${available} weeks available, about ${need.comfortable} needed for comfortable readiness.`)
    }
  } else {
    reasons.push(`No date: the plan runs until comfortable readiness, about ${need.comfortable} weeks.`)
  }
  if (verdict !== 'unsafe' && runDays < req.run_days_comfortable) {
    distanceStretch = true
    reasons.push(`${runDays} run days a week is below the ${req.run_days_comfortable} that make a ${goal.distanceKm} km comfortable.`)
  }

  // Target time: only meaningful for someone who already runs.
  let timeGoal = null
  let timeStretch = false
  if (goal.targetTimeMin && assessment.band !== 'none') {
    timeGoal = assessGoal({
      vdot: assessment.vdot, targetDistanceKm: goal.distanceKm, targetTimeMin: goal.targetTimeMin,
    })
    if (timeGoal && (timeGoal.verdict === 'ambitious' || timeGoal.verdict === 'unrealistic')) {
      timeStretch = true
      reasons.push(`Target time is ${timeGoal.verdict} for current fitness (predicts about ${Math.round(timeGoal.predicted_time_min)} min).`)
    }
  }

  if (verdict !== 'unsafe' && (distanceStretch || timeStretch)) verdict = 'stretch'

  // --- stretch: a fallback target -------------------------------------------
  let fallback = null
  if (verdict === 'stretch') {
    if (timeStretch && !distanceStretch) {
      const predicted = timeGoal.predicted_time_min
      const time = timeGoal.verdict === 'ambitious' ? round2(predicted * 0.97) : timeGoal.achievable_time_min
      fallback = { kind: 'time', distance_km: goal.distanceKm, time_min: time }
    } else if (goal.distanceKm <= 10) {
      fallback = { kind: 'walk_breaks', distance_km: goal.distanceKm }
    } else {
      fallback = { kind: 'finish', distance_km: goal.distanceKm }
    }
  }

  // --- unsafe: safer alternatives --------------------------------------------
  const alternatives = []
  if (verdict === 'unsafe') {
    // Shorter distance on the same date (or with no date, if there was none).
    for (const d of STANDARD_DISTANCES.filter((x) => x < goal.distanceKm)) {
      const n = weeksNeeded({ assessment, distanceKm: d, runDays, walkBreaks: true, cautious: rules.cautious, gentle })
      if (runDays < n.requirements.run_days_min) continue
      if (available !== null && available < n.min) continue
      alternatives.push({
        kind: 'shorter',
        distance_km: d,
        event_date: original.event_date,
        walk_breaks: beginner && d <= 10,
        verdict: available === null || available >= n.comfortable ? 'feasible' : 'stretch',
      })
      break
    }
    // The same distance later — only if more time actually fixes it.
    const daysProblem = runDays < req.run_days_min
    if (!daysProblem && Number.isFinite(need.comfortable)) {
      alternatives.push({
        kind: 'later',
        distance_km: goal.distanceKm,
        event_date: dateInWeek(inputs.startDate, need.comfortable, goal.eventWeekday || 'Sunday'),
        weeks: need.comfortable,
        walk_breaks: false,
        verdict: 'feasible',
      })
    }
    if (daysProblem) {
      alternatives.push({
        kind: 'more_days',
        distance_km: goal.distanceKm,
        event_date: original.event_date,
        run_days: req.run_days_comfortable,
        verdict: 'feasible',
      })
    }
    if (!alternatives.some((a) => a.kind === 'shorter' || a.kind === 'later')) {
      alternatives.unshift({ kind: 'no_event', distance_km: null, event_date: null, verdict: 'feasible' })
    }
    alternatives.forEach((a, i) => { a.id = `alt${i + 1}` })
  }

  // The goal the plan is actually built for.
  let adopted = { ...original, walk_breaks: walkBreaks && goal.distanceKm <= 10 }
  if (verdict === 'unsafe') {
    // "more_days" needs the runner to change their week; it cannot be adopted
    // on their behalf. The first buildable alternative is the default.
    const buildable = alternatives.filter((a) => a.kind !== 'more_days')
    const chosen = buildable.find((a) => a.id === inputs.answers.safe_goal) || buildable[0]
    adopted = {
      distance_km: chosen.distance_km,
      event_date: chosen.event_date,
      target_time_min: null,
      walk_breaks: Boolean(chosen.walk_breaks),
      alternative_id: chosen.id,
    }
  }

  return {
    verdict,
    reasons,
    run_days: runDays,
    weeks_available: available,
    weeks_needed_min: Number.isFinite(need.min) ? need.min : null,
    weeks_needed_comfortable: Number.isFinite(need.comfortable) ? need.comfortable : null,
    requirements: req,
    time_goal: timeGoal,
    predicted_time_min: assessment.band !== 'none' ? raceTimeForVdot(assessment.vdot, goal.distanceKm) : null,
    fallback_target: fallback,
    alternatives,
    original_goal: original,
    adopted_goal: adopted,
  }
}
