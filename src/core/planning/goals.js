/**
 * goals.js — the non-race path: a runner with no event who wants to improve
 * something specific.
 *
 * Nothing here builds a plan. A goal maps to an EXISTING scenario (recreational,
 * maintenance, short_race, or whatever the safety rules classify the runner
 * as) plus a set of modifiers the builders read: how far the volume may grow,
 * whether the long run leads, whether strides or a time trial appear. Every
 * gate, population rule and progression cap still applies on top.
 *
 * Pure data and arithmetic. See ../README.md for the core rules.
 */
import { readinessFor } from './rules.js'
import { t } from '../strings.js'

export const GOALS = ['kondicija', 'hitrost', 'zdravje', 'navada', 'glava', 'teza', 'baza']

export const BLOCK_WEEKS = [4, 8, 12]
export const DEFAULT_BLOCK_WEEKS = 8

/** The distance of the speed goal's time trial. */
export const TRIAL_KM = 5

/** "Weight and fitness" is not offered to anyone younger than this. */
export const TEZA_MIN_AGE = 18

/** How each goal's progress is measured on the dashboard. */
export const goalMetric = (goal) =>
  goal === 'hitrost' ? 'time_trial' : goal === 'kondicija' ? 'longest_run' : 'completion'

/**
 * goal -> scenario and modifiers.
 *
 *   scenario     the existing scenario the goal is built on
 *   fitScenario  used instead when the runner is already fit (>= 25 km a week)
 *   peakWeekly   how far the weekly volume may grow over the block (x current);
 *                the weekly progression caps still bind
 *   peakLong     the same for the long run
 *   easyOnly     no quality sessions
 *   strides      true / 'optional' / false
 *   maxRunDays   fewest sessions that still work (navada)
 *   longShareMax the long run's share of the week, lower where frequency is the
 *                point: many shorter runs instead of one big one (teza)
 */
export const GOAL_MODIFIERS = {
  kondicija: { scenario: 'recreational', longRunKey: true, peakWeekly: 1.5, peakLong: 1.8, longCapKm: 21, strides: 'optional' },
  hitrost: { scenario: 'short_race', timeTrials: true, focusKm: TRIAL_KM },
  zdravje: { scenario: 'recreational', fitScenario: 'maintenance', easyOnly: true, peakWeekly: 1.15, peakLong: 1.3, maxRunDays: 4, strides: 'optional' },
  glava: { scenario: 'recreational', fitScenario: 'maintenance', easyOnly: true, peakWeekly: 1.15, peakLong: 1.3, maxRunDays: 4, strides: 'optional' },
  navada: { scenario: 'recreational', fitScenario: 'maintenance', easyOnly: true, peakWeekly: 1.1, peakLong: 1.2, maxRunDays: 3, defaultRunDays: 2, strides: false, forgiving: true },
  teza: { scenario: 'recreational', easyOnly: true, peakWeekly: 1.4, peakLong: 1.3, longShareMax: 0.4, strides: false },
  baza: { scenario: 'recreational', base: true, peakWeekly: 1.5, peakLong: 1.6, longCapKm: 20, strides: 'optional' },
}

/** Goals a runner of this age may pick. Unknown age counts as the conservative case. */
export function goalsOffered(age) {
  const adult = age !== null && age !== undefined && Number(age) >= TEZA_MIN_AGE
  return GOALS.filter((g) => g !== 'teza' || adult)
}

/**
 * A goal plan as the intake sent it, cleaned up. Null when there is none (or
 * it names no known goal), so the ordinary race path runs.
 *
 * @param {object|null} raw - {main, secondary?, blockWeeks?, level?}
 * @param {{age?: number|null}} [ctx]
 */
export function normalizeGoalPlan(raw, { age = null } = {}) {
  if (!raw || typeof raw !== 'object' || !GOALS.includes(raw.main)) return null
  const offered = goalsOffered(age)
  const adjustments = []
  let main = raw.main
  let secondary = GOALS.includes(raw.secondary) && raw.secondary !== raw.main ? raw.secondary : null
  if (!offered.includes(main)) {
    adjustments.push({ id: 'teza_age', from: main, to: 'zdravje' })
    main = 'zdravje'
    if (secondary === 'zdravje') secondary = null
  }
  if (secondary && !offered.includes(secondary)) {
    adjustments.push({ id: 'teza_age', from: secondary, to: null })
    secondary = null
  }
  // A time trial is one hard effort: it only sits beside goals that are about
  // building, never beside "mostly easy" ones.
  if (secondary === 'hitrost' && !['kondicija', 'baza'].includes(main)) {
    adjustments.push({ id: 'trial_conflict', from: 'hitrost', to: null })
    secondary = null
  }
  // The pipeline asks again without trials when a week could not hold one.
  if (raw.retry === 'no_trials') {
    if (main === 'hitrost') {
      adjustments.push({ id: 'trial_placement', from: 'hitrost', to: 'kondicija' })
      main = 'kondicija'
      if (secondary === 'kondicija') secondary = null
    } else if (secondary === 'hitrost') {
      adjustments.push({ id: 'trial_placement', from: 'hitrost', to: null })
      secondary = null
    }
  }
  const blockWeeks = BLOCK_WEEKS.includes(Number(raw.blockWeeks)) ? Number(raw.blockWeeks) : DEFAULT_BLOCK_WEEKS
  const level = Number.isInteger(Number(raw.level)) && Number(raw.level) >= 1 ? Math.min(5, Number(raw.level)) : 1
  return {
    main, secondary, blockWeeks, level,
    trials: main === 'hitrost' || secondary === 'hitrost',
    adjustments,
  }
}

/** The scenario the main goal is built on. `fit`: already running 25+ km a week. */
export function goalScenario(goalPlan, { fit = false } = {}) {
  const m = GOAL_MODIFIERS[goalPlan.main]
  return fit && m.fitScenario ? m.fitScenario : m.scenario
}

/**
 * The modifiers the builders read: the main goal's, plus the few things a
 * secondary goal may add (a long run that leads, run days, a time trial).
 * The main goal wins every conflict.
 */
export function goalModifiers(goalPlan) {
  const main = GOAL_MODIFIERS[goalPlan.main]
  const sec = goalPlan.secondary ? GOAL_MODIFIERS[goalPlan.secondary] : null
  // A harder block asks for more of the same, inside the same caps.
  const bump = 0.1 * ((goalPlan.level ?? 1) - 1)
  return {
    ...main,
    peakWeekly: (main.peakWeekly ?? 1.25) + bump,
    peakLong: (main.peakLong ?? 1.3) + bump,
    longRunKey: Boolean(main.longRunKey || sec?.longRunKey),
    strides: main.strides ?? (sec?.strides === 'optional' ? 'optional' : true),
    timeTrials: goalPlan.trials === true,
    // Minutes of non-stop running a beginner works toward (30, then 45, 60).
    continuousTargetMin: Math.min(60, 30 + 15 * ((goalPlan.level ?? 1) - 1)),
  }
}

/** Run days a goal caps or defaults to (navada: the fewest that still work). */
export function goalRunDayCap(goalPlan) {
  if (!goalPlan) return { cap: 7, fallback: null }
  const m = goalModifiers(goalPlan)
  return { cap: m.maxRunDays ?? 7, fallback: m.defaultRunDays ?? null }
}

/**
 * Why a time trial cannot be part of this runner's block, or null when it can.
 * A trial is a hard 5 km: it needs someone who runs, no restriction on hard
 * running, and a week big enough that it stays inside the low-intensity share.
 */
export function trialBlocker({ assessment, limits = {}, restrictions = {}, scenario, runDays }) {
  if (['returning', 'complete_beginner', 'beginner_with_deadline'].includes(scenario)) return 'not_running'
  if (restrictions.walkOnly || restrictions.noHardSessions || (limits.noIntensityWeeks ?? 0) > 0) return 'no_intensity'
  const weekly = assessment.weekly_km ?? 0
  const longest = assessment.longest_km ?? 0
  const week1 = Math.round(weekly * (limits.startVolumeFactor ?? 1))
  const minLow = runDays <= 3 ? 0.7 : 0.75
  if (longest < TRIAL_KM || week1 < Math.ceil(TRIAL_KM / (1 - minLow))) return 'not_ready'
  return null
}

/**
 * Where the safety rules and the runner's level do not allow the goal as
 * asked, it becomes the nearest one that they do — and says so. The speed
 * goal is the only one that can fail this way.
 *
 * @returns {{goalPlan: object, changed: boolean}}
 */
export function adjustGoalPlan({ goalPlan, assessment, limits, restrictions, scenario, runDays }) {
  const blocker = goalPlan.trials
    ? trialBlocker({ assessment, limits, restrictions, scenario, runDays })
    : null
  if (!blocker) return { goalPlan, changed: false }
  const adjustments = [...goalPlan.adjustments, { id: `trial_${blocker}`, from: 'hitrost', to: goalPlan.main === 'hitrost' ? 'kondicija' : null }]
  if (goalPlan.main === 'hitrost') {
    return {
      goalPlan: {
        ...goalPlan, main: 'kondicija', trials: false, adjustments,
        secondary: goalPlan.secondary === 'kondicija' ? null : goalPlan.secondary,
      },
      changed: true,
    }
  }
  return { goalPlan: { ...goalPlan, secondary: null, trials: false, adjustments }, changed: true }
}

/**
 * The teza goal never names a weight, a calorie or a diet. AI-written prose is
 * cleaned of any sentence that does, so what the runner reads cannot.
 */
const BODY_TARGET = /\d\s*(kg|kilogram|kcal|kalorij)|kalorij|kcal|hujš|shujš|izgub\w* (teže|kil)|tehtnic/i
export function withoutBodyTargets(text) {
  return String(text ?? '')
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !BODY_TARGET.test(sentence))
    .join(' ')
    .trim()
}

/** True when the plan is a body-composition goal, as main or secondary. */
export const isBodyGoal = (goalPlan) => goalPlan?.main === 'teza' || goalPlan?.secondary === 'teza'

/** A goal's short label ("Kondicija"). */
export const goalName = (goal) => t.goals.items[goal]?.label ?? goal

/** One adjustment as a sentence for the runner. */
export function adjustmentText(a) {
  return t.goals.adjustText(goalName(a.from), a.to ? goalName(a.to) : null, t.goals.adjustReasons[a.id] ?? '')
}

/** The largest standard race the planned base is enough to start preparing for, or null. */
export function readyForKm(weeklyKm, longKm) {
  let best = null
  for (const d of [5, 10, 21.1]) {
    const r = readinessFor(d)
    if (weeklyKm >= r.weeklyMin && longKm >= r.longMin) best = d
  }
  return best
}

/** Weeks (1-based) that hold the time trials: the first and the last. */
export const trialWeeksFor = (blockWeeks) => [1, blockWeeks]
