/**
 * Step 5 — CLARIFY.
 *
 * Decides whether critical information is missing or contradictory, and if
 * so returns at most three targeted questions. The pipeline stops and waits
 * for the answers; nothing is built on a guess about something that changes
 * the plan's shape.
 *
 * Questions are chosen by code and answered by tapping an option, so each
 * answer maps straight back onto an input in collectInputs(). Once three have
 * been asked in total, the remaining unknowns get conservative defaults and
 * the assumption is recorded instead.
 */
import { t } from '../strings.js'

export const MAX_QUESTIONS = 3

/** Highest priority first: the ones that change the scenario come first. */
export const QUESTION_ORDER = ['event_date', 'current_volume', 'returning', 'longest_run', 'intent']

function question(id) {
  const q = t.planning.questions[id]
  return { id, text: q.text, why: q.why, options: q.options.map((o) => ({ ...o })) }
}

/**
 * @returns {{questions: Array, assumptions: string[], unasked: string[]}}
 */
export function clarifyQuestions(inputs, assessment, classification) {
  const answered = new Set(Object.keys(inputs.answers).filter((k) => QUESTION_ORDER.includes(k)))
  const needed = []
  const assumptions = []

  // A race date that has already passed: plan toward what?
  if (inputs.goal.eventInPast && !answered.has('event_date')) needed.push('event_date')

  // How much do they run now? Everything downstream scales from this.
  if (
    inputs.statedWeeklyKm === null &&
    assessment.weekly_source === 'unknown' &&
    !inputs.signals.neverRan &&
    !answered.has('current_volume')
  ) {
    needed.push('current_volume')
  }

  // Years of running but calling themselves a beginner, or barely running
  // now: a comeback (start well below the old level) or a fresh start?
  const months = inputs.experienceMonths ?? 0
  const lowNow = assessment.weekly_km === null || assessment.weekly_km < 5
  if (
    months >= 12 &&
    !inputs.signals.returning &&
    (inputs.fitnessLevel === 'beginner' || lowNow) &&
    !answered.has('returning')
  ) {
    needed.push('returning')
  }

  // Longest run: contradictory with weekly volume, or missing where the
  // goal distance makes it decisive.
  const contradictory = assessment.contradictions.includes('longest_vs_weekly')
  const missing =
    assessment.longest_km === null && assessment.running_now && (inputs.goal.distanceKm ?? 0) >= 10
  if ((contradictory || missing) && !answered.has('longest_run')) needed.push('longest_run')

  // Fit, no goal: hold or build?
  if (classification.pending.includes('intent') && !answered.has('intent')) needed.push('intent')

  const budget = Math.max(0, MAX_QUESTIONS - answered.size)
  const ordered = QUESTION_ORDER.filter((id) => needed.includes(id))
  const ask = ordered.slice(0, budget)

  // Anything we cannot ask any more is assumed, conservatively, and said so.
  const unasked = ordered.slice(budget)
  for (const id of unasked) assumptions.push(t.planning.assumptions[id])

  return { questions: ask.map(question), assumptions, unasked }
}
