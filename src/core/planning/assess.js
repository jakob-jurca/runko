/**
 * Step 2 — ASSESS.
 *
 * Where the runner is today: how much they run, their longest recent run,
 * how long they have been running, and a fitness estimate. What they STATED
 * wins over what we infer from logs (a quiet logged week is weak evidence),
 * and every number records where it came from.
 *
 * Contradictions are flagged here, not resolved: the clarify step decides
 * whether they are worth a question.
 */
import { estimateVdot, pacesFromVdot } from '../periodization.js'
import { EXPERIENCE_LEVELS } from './limits.js'
import { breakCategory, fvdot } from './returning.js'

const DAY_MS = 86_400_000
const round1 = (n) => Math.round(n * 10) / 10

/** Experience bands, in months of consistent running. */
function historyFrom(months, level, neverRan) {
  if (neverRan || months === 0) return 'none'
  if (months === null) {
    return { beginner: 'novice', intermediate: 'developing', advanced: 'experienced' }[level] || 'novice'
  }
  if (months < 6) return 'novice'
  if (months < 24) return 'developing'
  return 'experienced'
}

/** Current training bands, in km per week. */
function bandFrom(weeklyKm) {
  if (weeklyKm === null) return 'unknown'
  if (weeklyKm < 3) return 'none'
  if (weeklyKm < 15) return 'low'
  if (weeklyKm < 35) return 'moderate'
  if (weeklyKm < 60) return 'high'
  return 'very_high'
}

/**
 * `experience_level` (runko-research b01 rules 9-13): the median of three
 * component levels — years running, current weekly volume, longest recent
 * run — capped at one step above the years component, so a big week cannot
 * make a newcomer "advanced".
 *
 * Missing data falls back to the conservative end: no stated history counts
 * one step below the self-rated fitness level, and an unknown volume or long
 * run counts as beginner.
 */
const YEARS_FROM_FITNESS = { beginner: 'beginner', intermediate: 'novice', advanced: 'intermediate' }

export function experienceLevel({ months, fitnessLevel, weeklyKm, longestKm, neverRan, band }) {
  // b01 r9: has never run and cannot run ten minutes yet.
  if (neverRan || (band === 'none' && (months ?? 0) === 0)) return { level: 'none', years: 'none', volume: 'none', long: 'none' }

  let years
  if (months === null || months === undefined) years = YEARS_FROM_FITNESS[fitnessLevel] || 'beginner'
  else if (months < 6) years = 'beginner'
  else if (months < 24) years = 'novice'
  else if (months < 60) years = 'intermediate'
  else years = 'advanced'

  const byBands = (value, bands) => {
    if (value === null || value === undefined) return 'beginner'
    const i = bands.findIndex((b) => value < b)
    return ['beginner', 'novice', 'intermediate', 'advanced', 'elite'][i === -1 ? 4 : i]
  }
  const volume = byBands(weeklyKm, [10, 25, 50, 90]) // b01 r11
  const long = byBands(longestKm, [5, 10, 18, 25]) // b01 r12

  const idx = (l) => EXPERIENCE_LEVELS.indexOf(l)
  const median = [years, volume, long].map(idx).sort((a, b) => a - b)[1]
  const level = EXPERIENCE_LEVELS[Math.min(median, idx(years) + 1)] // b01 r13
  return { level, years, volume, long }
}

/**
 * @param {object} inputs - from collectInputs()
 * @returns {object} the assessment, stored verbatim in plan_json
 */
export function assessFitness(inputs) {
  const today = new Date(inputs.today + 'T00:00:00')
  const within = (days) =>
    inputs.runs.filter((r) => {
      const d = new Date(r.date + 'T00:00:00')
      return !Number.isNaN(+d) && today - d >= 0 && today - d <= days * DAY_MS
    })

  const last7 = within(7)
  const last28 = within(28)
  const logged7Km = round1(last7.reduce((s, r) => s + r.distance, 0))
  const logged28AvgKm = round1(last28.reduce((s, r) => s + r.distance, 0) / 4)
  const loggedLongestKm = last28.reduce((m, r) => Math.max(m, r.distance), 0) || null

  // A single "test run" from someone who has never run is not a training
  // week; it must not lift them out of the beginner bands.
  const neverRan = inputs.signals.neverRan
  let weeklyKm = inputs.statedWeeklyKm
  let weeklySource = weeklyKm !== null ? 'stated' : 'unknown'
  if (weeklyKm === null && last28.length) {
    weeklyKm = neverRan ? 0 : Math.max(logged7Km, logged28AvgKm)
    weeklySource = 'logged'
  }
  if (weeklyKm === null && neverRan) {
    weeklyKm = 0
    weeklySource = 'never_ran'
  }

  let longestKm = inputs.statedLongestKm
  let longestSource = longestKm !== null ? 'stated' : 'unknown'
  if (longestKm === null && loggedLongestKm && !neverRan) {
    longestKm = loggedLongestKm
    longestSource = 'logged'
  }

  const history = historyFrom(inputs.experienceMonths, inputs.fitnessLevel, neverRan)
  const band = neverRan && (weeklyKm ?? 0) <= 5 ? 'none' : bandFrom(weeklyKm)

  const est = estimateVdot(inputs.runs, inputs.fitnessLevel || 'beginner')
  const { source: vdotSource, basedOn } = est
  // b07 r8-9: after a break of more than five days the VDOT the paces come
  // from is the pre-break one times Daniels' fitness-loss factor.
  const breakDays = inputs.safety?.breakDays ?? null
  const fitnessLoss = breakDays > 5 && band !== 'none' ? fvdot(breakDays) : 1
  const vdot = fitnessLoss < 1 ? Math.round(est.vdot * fitnessLoss * 10) / 10 : est.vdot
  const easyPace = pacesFromVdot(vdot).easy

  const experience = experienceLevel({
    months: inputs.experienceMonths, fitnessLevel: inputs.fitnessLevel,
    weeklyKm, longestKm, neverRan, band,
  })

  const contradictions = []
  if (
    inputs.statedLongestKm !== null && inputs.statedWeeklyKm !== null &&
    inputs.statedLongestKm > inputs.statedWeeklyKm * 1.2 + 4
  ) {
    contradictions.push('longest_vs_weekly')
  }

  return {
    weekly_km: weeklyKm,
    weekly_source: weeklySource,
    longest_km: longestKm,
    longest_source: longestSource,
    logged_7d_km: logged7Km,
    logged_28d_avg_km: logged28AvgKm,
    logged_runs_28d: last28.length,
    experience_months: inputs.experienceMonths,
    history,
    band,
    experience_level: experience.level,
    experience_components: { years: experience.years, volume: experience.volume, long: experience.long },
    running_now: band !== 'none' && band !== 'unknown',
    continuous_min: band === 'none' ? 0 : longestKm ? Math.round(longestKm * easyPace) : null,
    vdot,
    pre_break_vdot: fitnessLoss < 1 ? est.vdot : null,
    fitness_loss_factor: fitnessLoss,
    break_days: breakDays,
    break_category: breakCategory(breakDays),
    vdot_source: vdotSource,
    vdot_based_on: basedOn,
    easy_pace_min_per_km: round1(easyPace),
    age: inputs.age,
    older: (inputs.age ?? 0) >= 55,
    returning_signal: inputs.signals.returning,
    injury_signal: inputs.signals.injury,
    contradictions,
  }
}
