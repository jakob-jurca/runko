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
import {
  buildPlanSkeleton,
  enrichDays,
  pacesFromVdot,
  paceRange,
  formatPace,
  roundKm,
} from './periodization'
import {
  todayISO,
  getPlans,
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
// Hydration — bring plans stored before a field existed up to date, for free
// ---------------------------------------------------------------------------

/**
 * Fill in everything a workout card needs that an older stored plan lacks.
 *
 * This is the actual reason heart rates and segments stopped appearing: the
 * fields are generated at plan-build time, so a plan created before they
 * existed simply does not have them, and no amount of fixing the component
 * would put them back. Rather than forcing every runner to rebuild, the
 * derived values are recomputed on read — they are pure arithmetic, so this
 * costs nothing and never calls out.
 *
 * Also applies the whole-kilometre rounding to legacy plans, so old and new
 * plans read the same.
 *
 * @param {object} planJson - one week's stored plan_json
 * @param {object} profile - for age; HR is omitted when it is missing
 * @returns {object} the same shape, with the derived fields present
 */
export function hydratePlanJson(planJson, profile = {}) {
  const days = planJson?.days
  if (!Array.isArray(days) || days.length === 0) return planJson

  const needsWork = days.some(
    (d) =>
      d.segments === undefined ||
      d.pace_range === undefined ||
      (d.type !== 'rest' && (!d.hr || !Number.isInteger(d.distance_km)))
  )
  if (!needsWork) return planJson

  // Paces are stored per week as { easy: { min_per_km, label } … }; older
  // rows may only have the VDOT, which is enough to recompute them.
  const paces = pacesFromStored(planJson.paces) || (planJson.vdot ? pacesFromVdot(planJson.vdot) : null)
  if (!paces) return planJson // nothing to derive from; render what we have

  const rounded = days.map((day) => {
    if (day.type === 'rest') {
      return { ...day, distance_km: 0, duration_min: 0, segments: [], is_segmented: false }
    }
    const distance = roundKm(day.distance_km)
    const paceKey = day.pace_key || inferPaceKey(day.type)
    const paceMin = paces[paceKey] ?? paces.easy
    // Older rows may have no hard_km; a quality session is roughly half fast.
    const hard =
      day.hard_km ?? (['tempo', 'interval', 'repetition'].includes(day.type) ? distance * 0.5 : 0)

    return {
      ...day,
      distance_km: distance,
      hard_km: Math.min(hard, distance),
      pace_key: paceKey,
      pace: day.pace || `${formatPace(paceMin)}/km`,
      pace_range: paceRange(paceMin, paceKey).label,
      duration_min: Math.round(distance * paceMin),
    }
  })

  const enriched = enrichDays(rounded, paces, profile.age)
  return {
    ...planJson,
    days: enriched,
    target_volume_km: Math.round(enriched.reduce((sum, d) => sum + d.distance_km, 0)),
  }
}

/** { easy: { min_per_km } } → { easy: 6.2 } */
function pacesFromStored(stored) {
  if (!stored || typeof stored !== 'object') return null
  const out = {}
  for (const [key, value] of Object.entries(stored)) {
    const n = typeof value === 'number' ? value : value?.min_per_km
    if (Number.isFinite(n) && n > 0) out[key] = n
  }
  return out.easy ? out : null
}

/** Best guess at the pace key for a legacy day that has no pace_key. */
function inferPaceKey(type) {
  return (
    {
      easy: 'easy',
      long: 'easy',
      recovery: 'easy',
      tempo: 'threshold',
      interval: 'interval',
      repetition: 'repetition',
      race: 'goal',
    }[type] || 'easy'
  )
}

/** Hydrate a whole array of training_plans rows. */
export function hydratePlans(rows, profile = {}) {
  return (rows || []).map((row) => ({
    ...row,
    plan_json: hydratePlanJson(row.plan_json, profile),
  }))
}

/** Read the runner's plan, already renderable. Use this, not getPlans. */
export async function getHydratedPlans(profile) {
  const rows = await getPlans(profile.id)
  return hydratePlans(rows, profile)
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
  // Recorded on the saved plan so the page can say the words are the
  // built-in ones. A free user's plan is still fully calculated for them —
  // only the prose is generic — and silently serving stock text as the
  // coach's own made the free tier look like a failed premium one.
  const aiDescribed = hasPremium(profile)
  if (aiDescribed) {
    const result = await describePlanSkeleton(skeleton, { profile, memories, language: 'sl' })
    weeks = result.weeks
    intro = result.intro
  } else {
    if (DEBUG) console.log('[plan] no premium — calculated plan with built-in descriptions.')
    const result = mergeDescriptions(skeleton, {})
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
        ai_described: aiDescribed,
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
function mergeAdapted(original = {}, adapted = {}, profile = {}) {
  const rawDays =
    Array.isArray(adapted.days) && adapted.days.length === 7 ? adapted.days : original.days

  // The adapted week comes back as bare days. Re-run the same enrichment the
  // skeleton does, or the card loses its segments, heart rates and time
  // window and renders half-empty for that week.
  const paceMinPerKm = Object.fromEntries(
    Object.entries(original.paces || {}).map(([k, v]) => [k, v?.min_per_km ?? v])
  )
  const days = Object.keys(paceMinPerKm).length
    ? enrichDays(rawDays, paceMinPerKm, profile.age)
    : rawDays
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
    return await savePlan(profile.id, nextWeek, mergeAdapted(base.plan_json, adapted, profile))
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
    (w) => w.date >= todayISO(prevMonday) && w.date < thisMonday
  )
  if (!lastWeekLogs.length) return null

  try {
    const adapted = await adaptWeeklyPlan(profile, {
      weekNumber: week,
      basePlan: current.plan_json,
      recentWorkouts: lastWeekLogs,
      trigger: 'weekly',
    })
    return await savePlan(profile.id, week, mergeAdapted(current.plan_json, adapted, profile))
  } catch (err) {
    console.warn('Weekly plan adaptation failed (keeping planned week):', err.message)
    return null
  }
}
