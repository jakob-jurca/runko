/**
 * plan.js — the Training Plan Engine.
 *
 * Structure comes from CODE, personality comes from the AI:
 *   1. core/periodization.js calculates the skeleton — VDOT, paces, phases,
 *      weekly volume, recovery weeks, taper, and which session lands on which
 *      day (80/20 polarized, honouring constraints from coach memory).
 *   2. core/ai.js describePlanSkeleton() writes the words for it.
 *   3. The AI's output is validated against the skeleton; any distance or pace
 *      it tried to change is discarded in favour of the calculated value.
 *
 * That ordering is the whole point: the plan can no longer repeat the same
 * week or ignore the runner, because the maths that produced it never did.
 *
 * Tiers:
 *  - Premium (trial or subscriber): calculated skeleton + AI descriptions.
 *  - Free: the same calculated skeleton with built-in descriptions. Still
 *    fully personalized — only the wording is generic.
 *
 * Plan rebuilds are currently UNLIMITED. The once-a-month limit is still
 * implemented and users.last_plan_created_at is still written on every build;
 * see PLAN_LIMIT_ENABLED below to switch it back on without a migration.
 */
import { describePlanSkeleton, mergeDescriptions, adaptWeeklyPlan } from './ai'
import { buildPlanSkeleton } from './periodization'
import {
  savePlan,
  deletePlans,
  startOfWeekISO,
  currentWeekNumber,
  getWorkouts,
  markPlanCreated,
} from './db'
import { getMemories } from './memory'
import { hasPremium } from './subscription'
import { IS_DEV } from './env'

/** General-fitness plans run 12 weeks; event plans cap at 16 weeks out. */
const DEFAULT_WEEKS = 12
const MAX_WEEKS = 16

const DEBUG = IS_DEV

/** How many weeks the runner's plan should span, from their profile. */
export function totalWeeksFor(profile) {
  // An event date is what makes a plan date-bound — there is no race-type
  // enum any more, just a distance and (optionally) a date.
  if (profile?.event_date) {
    const start = new Date(startOfWeekISO())
    const event = new Date(profile.event_date)
    const weeks = Math.ceil((event - start + 1) / (7 * 86_400_000))
    return Math.min(Math.max(weeks, 1), MAX_WEEKS)
  }
  return DEFAULT_WEEKS
}

// ---------------------------------------------------------------------------
// Rebuild limit — CURRENTLY DISABLED
// ---------------------------------------------------------------------------

/**
 * Master switch for the once-a-month rebuild limit.
 *
 * Turned OFF: runners can build a new plan whenever they like. The machinery
 * below is intact and `users.last_plan_created_at` is still written on every
 * build, so flipping this back to `true` re-enables the limit immediately —
 * no migration, no data backfill, and the dates stay correct for everyone who
 * built a plan while it was off.
 */
export const PLAN_LIMIT_ENABLED = false

/** How long the limit blocks a rebuild for, when enabled. */
const PLAN_LIMIT_MONTHS = 1

/**
 * When the runner may next rebuild their plan, or null if they may right now
 * (the limit is off, or they have never built one).
 */
export function nextPlanAllowedAt(profile) {
  if (!PLAN_LIMIT_ENABLED) return null
  if (!profile?.last_plan_created_at) return null
  const next = new Date(profile.last_plan_created_at)
  next.setMonth(next.getMonth() + PLAN_LIMIT_MONTHS)
  return next
}

/** Is the runner allowed to generate a new plan today? Always true for now. */
export function canCreatePlan(profile) {
  const next = nextPlanAllowedAt(profile)
  return !next || next <= new Date()
}

/** "12 October 2026" — the date the next rebuild unlocks, for the UI. */
export function nextPlanAllowedLabel(profile) {
  const next = nextPlanAllowedAt(profile)
  if (!next) return null
  return next.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Whole days until the next rebuild unlocks (0 when it already has). */
export function daysUntilNextPlan(profile) {
  const next = nextPlanAllowedAt(profile)
  if (!next) return 0
  return Math.max(0, Math.ceil((next - new Date()) / 86_400_000))
}

/** Thrown by createInitialPlan when the once-a-month limit blocks a rebuild. */
export class PlanLimitError extends Error {
  constructor(profile) {
    const label = nextPlanAllowedLabel(profile)
    super(
      `You can rebuild your training plan once a month. Your next rebuild unlocks on ${label} ` +
        `(${daysUntilNextPlan(profile)} days) — until then your coach keeps adapting the plan you have.`
    )
    this.name = 'PlanLimitError'
    this.nextAllowedAt = nextPlanAllowedAt(profile)
  }
}

// ---------------------------------------------------------------------------
// Building the plan
// ---------------------------------------------------------------------------

/**
 * Gather the runs the skeleton calibrates from: the intake runs the runner
 * just typed in, topped up with whatever is already in the workouts table.
 * Intake wins on a shared date.
 */
async function gatherRuns(profile, intake) {
  let logged = []
  try {
    logged = await getWorkouts(profile.id, { limit: 20 })
  } catch (err) {
    if (DEBUG) console.warn('[plan] could not read logged runs:', err.message)
  }

  const intakeRuns = (intake?.runs ?? []).map((r) => ({
    date: r.date,
    distance: Number(r.distance),
    duration: Number(r.duration),
    effort: Number(r.effort) || 3,
  }))
  const seen = new Set(intakeRuns.map((r) => r.date))

  return [
    ...intakeRuns,
    ...logged
      .filter((w) => Number(w.distance) > 0 && Number(w.duration) > 0 && !seen.has(w.date))
      .map((w) => ({
        date: w.date,
        distance: Number(w.distance),
        duration: Number(w.duration),
        effort: Number(w.effort) || 3,
      })),
  ]
}

/**
 * Create the runner's full plan — at onboarding completion, and again on
 * every later rebuild ("Create my plan" / "Create new plan").
 *
 * Persists one row per week, stamps users.last_plan_created_at and returns
 * the saved weeks.
 *
 * @throws {PlanLimitError} only if PLAN_LIMIT_ENABLED is turned back on.
 */
export async function createInitialPlan(profile, intake = null) {
  // No-op while PLAN_LIMIT_ENABLED is false; kept so re-enabling the limit
  // is a one-line change.
  if (!canCreatePlan(profile)) throw new PlanLimitError(profile)

  const totalWeeks = totalWeeksFor(profile)
  const runs = await gatherRuns(profile, intake)

  // Coach memory feeds the structural constraints (no back-to-back days,
  // available days, how many times a week they can run).
  let memories = []
  try {
    memories = await getMemories(profile.id)
  } catch (err) {
    if (DEBUG) console.warn('[plan] could not read coach memory:', err.message)
  }

  // --- 1. CODE calculates the structure ------------------------------------
  const skeleton = buildPlanSkeleton({ profile, totalWeeks, runs, memories })
  if (DEBUG) {
    console.log(
      `[plan] skeleton: VDOT ${skeleton.vdot} (${skeleton.vdot_source}), ` +
        `${totalWeeks} weeks, ${skeleton.start_volume_km}→${skeleton.peak_volume_km} km/week, ` +
        `paces ${Object.entries(skeleton.paces).map(([k, v]) => `${k} ${v.label}`).join(' ')}`
    )
    console.log(
      '[plan] weeks:',
      skeleton.weeks
        .map((w) => `${w.week_number}${w.is_recovery ? 'R' : ''}:${w.phase}:${w.target_volume_km}km`)
        .join(' ')
    )
  }

  // --- 2. The AI writes the words ------------------------------------------
  let weeks
  let intro
  if (hasPremium(profile)) {
    const result = await describePlanSkeleton(skeleton, { profile, memories, language: 'sl' })
    weeks = result.weeks
    intro = result.intro
  } else {
    if (DEBUG) console.log('[plan] no premium — calculated plan with built-in descriptions.')
    const result = mergeDescriptions(skeleton, [])
    weeks = result.weeks
    intro = result.intro
  }

  // --- 3. Persist -----------------------------------------------------------
  // Clear the old plan before writing the new one. Upserting alone would
  // leave any weeks beyond the new plan's length behind (a 20-week plan
  // rebuilt as 10 weeks left weeks 11-20 in place) and would keep the
  // original created_at, which the week counter reads.
  await deletePlans(profile.id)

  const saved = []
  for (const week of weeks) {
    const { week_number, ...planJson } = week
    saved.push(
      await savePlan(profile.id, week_number, {
        ...planJson,
        // Plan-wide facts repeated on each row so any single week can be
        // rendered (and sent to the coach) without loading all of them.
        vdot: skeleton.vdot,
        paces: skeleton.paces,
        total_weeks: totalWeeks,
        target_distance_km: skeleton.target_distance_km,
        goal_assessment: skeleton.goal_assessment,
        // The intro belongs to the plan, not a week — stored on week 1 only.
        ...(week_number === 1 ? { intro } : {}),
      })
    )
  }

  // Starts the once-a-month clock for the next rebuild.
  await markPlanCreated(profile.id)
  return saved
}

/**
 * Overlay an adapted week onto the original, keeping everything the
 * periodization engine decided about the WEEK (phase, recovery flag, intent)
 * and the plan as a whole (vdot, paces, total_weeks). Without this, adapting
 * a week would strip the phase and the dashboard would lose its banner.
 */
function mergeAdapted(original = {}, adapted = {}) {
  const days = Array.isArray(adapted.days) && adapted.days.length === 7 ? adapted.days : original.days
  return {
    ...original,
    ...adapted,
    days,
    // recomputed, because the adapted week carries different distances
    target_volume_km:
      Math.round((days || []).reduce((sum, d) => sum + (Number(d.distance_km) || 0), 0) * 10) / 10,
    phase: original.phase,
    is_recovery: original.is_recovery,
    intent: original.intent,
    vdot: original.vdot,
    paces: original.paces,
    total_weeks: original.total_weeks,
    adapted: true,
  }
}

/**
 * Immediate adaptation hook — called after every workout log.
 * The coach "notices" a missed workout (distance 0) or a very hard one
 * (effort >= 4) and rewrites NEXT week's plan (keeping its original intent
 * as the base). Premium only.
 *
 * @returns {Promise<object|null>} the new plan row, or null if no adaptation ran
 */
export async function maybeAdaptPlan(profile, plans, workout, recentWorkouts) {
  if (!hasPremium(profile) || !plans?.length) return null

  const missed = Number(workout.distance) === 0
  const hard = Number(workout.effort) >= 4
  if (!missed && !hard) return null

  const week = currentWeekNumber(plans)
  const nextWeek = week + 1
  const base = plans.find((p) => p.week_number === nextWeek)
  if (!base) return null // plan ends here (e.g. race week) — nothing to rewrite

  try {
    const adapted = await adaptWeeklyPlan(profile, {
      weekNumber: nextWeek,
      basePlan: base.plan_json,
      recentWorkouts,
      trigger: missed ? 'missed' : 'hard',
    })
    // adapted:true stops the weekly rollover from re-adapting this week.
    return await savePlan(profile.id, nextWeek, mergeAdapted(base.plan_json, adapted))
  } catch (err) {
    console.warn('Plan adaptation failed (keeping current plan):', err.message)
    return null
  }
}

/**
 * Weekly rollover adaptation — called when the dashboard loads.
 * When a new week has started and its plan hasn't been adapted yet, rewrite
 * it based on what the runner actually logged last week. Premium only.
 *
 * @returns {Promise<object|null>} the updated plan row, or null if nothing changed
 */
export async function adaptCurrentWeekIfNeeded(profile, plans, recentWorkouts) {
  if (!hasPremium(profile) || !plans?.length) return null

  const week = currentWeekNumber(plans)
  if (week <= 1) return null
  const current = plans.find((p) => p.week_number === week)
  if (!current || current.plan_json?.adapted) return null

  // Only adapt off runs actually logged during the previous week.
  const prevMonday = new Date(startOfWeekISO())
  prevMonday.setDate(prevMonday.getDate() - 7)
  const thisMonday = startOfWeekISO()
  const lastWeekLogs = (recentWorkouts || []).filter(
    (w) => w.date >= prevMonday.toISOString().slice(0, 10) && w.date < thisMonday
  )
  if (!lastWeekLogs.length) return null

  try {
    const adapted = await adaptWeeklyPlan(profile, {
      weekNumber: week,
      basePlan: current.plan_json,
      recentWorkouts: lastWeekLogs,
      trigger: 'weekly',
    })
    return await savePlan(profile.id, week, mergeAdapted(current.plan_json, adapted))
  } catch (err) {
    console.warn('Weekly plan adaptation failed (keeping planned week):', err.message)
    return null
  }
}
