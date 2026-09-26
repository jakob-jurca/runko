/**
 * Step 3 — CLASSIFY.
 *
 * Assigns the runner to exactly one scenario. The order of the checks is the
 * policy: a returning runner is handled as returning even if they also have
 * a race, because the comeback is what limits them; a beginner with a race
 * too soon is the most dangerous case and is caught before any race logic.
 *
 * Every decision appends a plain-English reason, stored with the plan.
 */
import { SCENARIO_RULES, GENTLE_START_AGE } from './rules.js'
import { weeksNeeded } from './progression.js'

/** Weekly km at which a runner with no goal counts as "already fit". */
export const FIT_WEEKLY_KM = 25

/**
 * A first marathon (b04 r18: the long run may take 45% of the week). Only a
 * stated count of zero counts — unknown takes the stricter 36%.
 */
export function isFirstMarathon(inputs, distanceKm) {
  return (distanceKm ?? 0) >= 42.2 && inputs.health?.marathonsCompleted === 0
}

/** Distances up to this are short races; above it, long races. */
export const SHORT_RACE_MAX_KM = 10

/** Effective run days: what they offered, what is available, what the scenario allows. */
export function effectiveRunDays(inputs, scenario = null, limits = null) {
  const offered = inputs.constraints.maxRunDays ?? inputs.daysPerWeek ?? null
  const available = inputs.constraints.availableDays?.length ?? inputs.availableDays?.length ?? 7
  const cap = Math.min(scenario ? SCENARIO_RULES[scenario].maxRunDays : 7, limits?.maxRunDays ?? 7)
  const fallback = scenario === 'complete_beginner' ? 3 : 4
  return Math.max(1, Math.min(offered ?? fallback, available, cap))
}

/**
 * @returns {{scenario: string, reasons: string[], pending: string[]}}
 *   pending: facts the classification had to guess at, which the clarify
 *   step may turn into questions.
 */
export function classifyRunner(inputs, assessment, limits) {
  const reasons = []
  const pending = []
  const { goal, signals } = inputs
  const hasEvent = Boolean(goal.eventDate && !goal.eventInPast && goal.weeksToEvent)
  const months = assessment.experience_months

  // 1. Returning: has a running past, and is coming back from a break or injury.
  const hasPast = months === null ? assessment.history !== 'none' : months >= 6
  if (signals.returning && hasPast) {
    reasons.push(
      signals.injury
        ? 'Has a running history and is coming back from an injury.'
        : 'Has a running history and is coming back after a break.'
    )
    return { scenario: 'returning', reasons, pending }
  }

  // 2. Beginners: little or no history, or not running at all right now.
  const beginner = assessment.history === 'none' || assessment.history === 'novice'
  if (beginner) {
    if (hasEvent && goal.distanceKm) {
      const need = weeksNeeded({
        assessment,
        distanceKm: goal.distanceKm,
        runDays: effectiveRunDays(inputs, 'beginner_with_deadline', limits),
        walkBreaks: true,
        gentle: (inputs.age ?? 0) >= GENTLE_START_AGE,
        limits,
        firstMarathon: isFirstMarathon(inputs, goal.distanceKm),
      })
      if (goal.weeksToEvent < need.comfortable) {
        reasons.push(
          `Little running experience (${assessment.history}) and the ${goal.distanceKm} km event is ` +
            `${goal.weeksToEvent} weeks away; a comfortable build needs about ${need.comfortable}.`
        )
        return { scenario: 'beginner_with_deadline', reasons, pending }
      }
    }
    if (assessment.band === 'none') {
      reasons.push('Does not run yet (or only rarely): starts from walk-run.')
      return { scenario: 'complete_beginner', reasons, pending }
    }
    reasons.push(`Novice who already runs ${assessment.weekly_km} km/week, with time enough for the goal.`)
  }

  // 3. No distance and no date: health, consistency, or holding fitness.
  if (!goal.distanceKm && !hasEvent) {
    const fit = (assessment.weekly_km ?? 0) >= FIT_WEEKLY_KM && assessment.history === 'experienced'
    if (fit && signals.maintain) {
      reasons.push(`Already fit (${assessment.weekly_km} km/week) and wants to hold that fitness.`)
      return { scenario: 'maintenance', reasons, pending }
    }
    if (fit && inputs.answers.intent !== 'build') {
      // Hold or build? Genuinely the runner's call — ask rather than guess.
      pending.push('intent')
      reasons.push(`Already fit (${assessment.weekly_km} km/week), no goal given; intent unclear, assuming maintenance.`)
      return { scenario: 'maintenance', reasons, pending }
    }
    reasons.push('No event and no target distance: runs for health and enjoyment.')
    return { scenario: 'recreational', reasons, pending }
  }

  // 4. A distance goal (with or without a date).
  const distance = goal.distanceKm
  if (!distance) {
    // A date but no distance should not happen through onboarding; treat it
    // as a short event rather than inventing a marathon.
    reasons.push('Event date given without a distance; planned as a short race.')
    return { scenario: 'short_race', reasons, pending }
  }
  if (distance <= SHORT_RACE_MAX_KM) {
    reasons.push(`Target distance ${distance} km: short race, speed matters proportionally more.`)
    return { scenario: 'short_race', reasons, pending }
  }
  reasons.push(`Target distance ${distance} km: long race, the long run is central.`)
  return { scenario: 'long_race', reasons, pending }
}
