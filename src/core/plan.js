/**
 * plan.js — the Training Plan Engine.
 *
 * Structure comes from CODE, personality comes from the AI:
 *   1. core/planning runs the planning pipeline — collect, assess, classify
 *      into one of seven runner scenarios, check feasibility, ask up to three
 *      follow-up questions if something critical is missing, build with the
 *      scenario's own rules, explain. Pure code, no AI.
 *   2. core/ai.js describePlanSkeleton() writes the words for it — ONE call.
 *   3. The AI's output is validated against the plan; any distance or pace
 *      it tried to change is discarded in favour of the calculated value.
 *
 * That ordering is the whole point: an unsafe goal is never squeezed into a
 * plan, and why a plan looks the way it does is stored with it
 * (plan_json.planning).
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
import { runPlanningPipeline } from './planning/index.js'
import { withNotices } from './planning/explain.js'
import { enforceWeekRules, isAdaptable } from './planning/guard.js'
import {
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
  getHealthProfile,
  HEALTH_FIELDS,
} from './db'
import { getMemories } from './memory'
import { hasPremium } from './subscription'
import { IS_DEV } from './env'

const DEBUG = IS_DEV

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

  // Time-based days (walk-run, minutes) are stored complete; recomputing them
  // from a pace would turn "20 min" into kilometres.
  const needsWork = days.some(
    (d) =>
      !d.time_based && (d.segments === undefined ||
      d.pace_range === undefined ||
      (d.type !== 'rest' && (!d.hr || !Number.isInteger(d.distance_km))))
  )
  if (!needsWork) return planJson

  // Paces are stored per week as { easy: { min_per_km, label } … }; older
  // rows may only have the VDOT, which is enough to recompute them.
  const paces = pacesFromStored(planJson.paces) || (planJson.vdot ? pacesFromVdot(planJson.vdot) : null)
  if (!paces) return planJson // nothing to derive from; render what we have

  const rounded = days.map((day) => {
    if (day.time_based) return day
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

  const enriched = rounded.map((d) => (d.time_based ? d : enrichDays([d], paces, profile.age)[0]))
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
  if (profile?.id) {
    try {
      logged = await getWorkouts(profile.id, { limit: 20 })
    } catch (err) {
      if (DEBUG) console.warn('[plan] could not read logged runs:', err.message)
    }
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

async function gatherMemories(profile) {
  if (!profile?.id) return []
  try {
    return await getMemories(profile.id)
  } catch (err) {
    if (DEBUG) console.warn('[plan] could not read coach memory:', err.message)
    return []
  }
}

/**
 * The optional health profile. Unlike runs and memories, a read failure is
 * NOT swallowed: a plan built without a "yes" the runner gave to a safety
 * question would be built on a silent guess. (A database without the table
 * reads as "no profile" in db.js.)
 */
async function gatherHealth(profile) {
  if (!profile?.id) return null
  return getHealthProfile(profile.id)
}

/** The pipeline's input: the profile, with the health profile and anything the intake adds on top. */
function pipelineProfile(profile, intake, health = null) {
  const healthFields = health
    ? Object.fromEntries(HEALTH_FIELDS.map((k) => [k, health[k] ?? null]))
    : {}
  return {
    ...profile,
    ...healthFields,
    ...(intake?.hasRunBefore === false ? { hasRunBefore: false } : {}),
    ...(intake?.goalPlan ? { goal_plan: intake.goalPlan } : {}),
  }
}

/**
 * Thrown by createInitialPlan when the pipeline needs answers first. The
 * plan is never built on a guess about something that changes its shape.
 */
/**
 * Thrown by createInitialPlan when the safety gate builds no plan (pregnant,
 * under 15, pain at rest, …). `block.message` is the kind explanation to show.
 */
export class PlanBlockedError extends Error {
  constructor(block) {
    super(block.message)
    this.name = 'PlanBlockedError'
    this.block = block
  }
}

export class ClarificationNeededError extends Error {
  constructor(questions) {
    super('The plan needs a few answers before it can be built.')
    this.name = 'ClarificationNeededError'
    this.questions = questions
  }
}

/**
 * Run the planning pipeline without saving anything — what onboarding uses to
 * ask its follow-up questions and show the coach's verdict before building.
 * Pure code: no AI call.
 *
 * @returns {Promise<object>} the pipeline result (status, questions, verdict,
 *   explain, proposal, ...)
 */
export async function previewPlan(profile, intake = null, answers = {}) {
  const [runs, memories, health] = await Promise.all([
    gatherRuns(profile, intake), gatherMemories(profile), gatherHealth(profile),
  ])
  return runPlanningPipeline({ profile: pipelineProfile(profile, intake, health), runs, memories, answers })
}

/**
 * Create the runner's full plan — at onboarding completion, and again on
 * every later rebuild ("Create my plan" / "Create new plan").
 *
 * Persists one row per week, stamps users.last_plan_created_at and returns
 * the saved weeks.
 *
 * @param {object} profile
 * @param {object|null} intake - onboarding intake (runs typed in, etc.)
 * @param {object} answers - replies to the pipeline's follow-up questions
 * @throws {ClarificationNeededError} when critical information is missing
 * @throws {PlanLimitError} only if PLAN_LIMIT_ENABLED is turned back on.
 */
export async function createInitialPlan(profile, intake = null, answers = {}) {
  // No-op while PLAN_LIMIT_ENABLED is false; kept so re-enabling the limit
  // is a one-line change.
  if (!canCreatePlan(profile)) throw new PlanLimitError(profile)

  const [runs, memories, health] = await Promise.all([
    gatherRuns(profile, intake), gatherMemories(profile), gatherHealth(profile),
  ])

  // --- 1. CODE decides everything structural ---------------------------------
  const result = runPlanningPipeline({ profile: pipelineProfile(profile, intake, health), runs, memories, answers })
  if (result.status === 'blocked') throw new PlanBlockedError(result.block)
  if (result.status !== 'ready') throw new ClarificationNeededError(result.questions)
  const skeleton = result.skeleton
  if (DEBUG) {
    console.log(
      `[plan] ${result.scenario} / ${result.verdict} — ${skeleton.total_weeks} weeks, ` +
        `unit ${result.unit}, VDOT ${skeleton.vdot} (${skeleton.vdot_source})`
    )
    for (const reason of result.explain.reasons) console.log(`[plan]   · ${reason}`)
    console.log(
      '[plan] weeks:',
      skeleton.weeks
        .map((w) => `${w.week_number}${w.is_recovery ? 'R' : ''}:${w.phase}:${w.unit === 'time' ? `${w.target_minutes}min` : `${w.target_volume_km}km`}`)
        .join(' ')
    )
  }

  // --- 2. The AI writes the words — one call ----------------------------------
  // Recorded on the saved plan so the page can say the words are the
  // built-in ones. A free user's plan is still fully calculated for them —
  // only the prose is generic — and silently serving stock text as the
  // coach's own made the free tier look like a failed premium one.
  const aiDescribed = hasPremium(profile)
  const described = aiDescribed
    ? await describePlanSkeleton(skeleton, { profile, memories, language: 'sl' })
    : mergeDescriptions(skeleton, {})
  if (!aiDescribed && DEBUG) console.log('[plan] no premium — calculated plan with built-in descriptions.')

  // --- 3. Persist -----------------------------------------------------------
  // Clear the old plan before writing the new one. Upserting alone would
  // leave any weeks beyond the new plan's length behind (a 20-week plan
  // rebuilt as 10 weeks left weeks 11-20 in place) and would keep the
  // original created_at, which the week counter reads.
  await deletePlans(profile.id)

  const saved = []
  for (const week of described.weeks) {
    const { week_number, ...planJson } = week
    saved.push(
      await savePlan(profile.id, week_number, {
        ...planJson,
        // Plan-wide facts repeated on each row so any single week can be
        // rendered (and sent to the coach) without loading all of them —
        // including `planning`: assessment, scenario and feasibility.
        vdot: skeleton.vdot,
        paces: skeleton.paces,
        total_weeks: skeleton.total_weeks,
        target_distance_km: skeleton.target_distance_km,
        goal_assessment: skeleton.goal_assessment,
        ai_described: aiDescribed,
        // The intro belongs to the plan, not a week — stored on week 1 only.
        ...(week_number === 1 ? { intro: withNotices(described.intro, result.notices) } : {}),
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
  // The scenario's rules still hold: no hard sessions where the plan allows
  // none, no runs on rest days, never more than the week the progression
  // allowed (core/planning/guard.js).
  const { days: rawDays, changes } = enforceWeekRules(original, adapted.days)
  if (changes.length && DEBUG) console.warn('[plan] adaptation corrected:', changes.join('; '))

  // The adapted week comes back as bare days. Re-run the same enrichment the
  // skeleton does, or the card loses its segments, heart rates and time
  // window and renders half-empty for that week.
  const paceMinPerKm = Object.fromEntries(
    Object.entries(original.paces || {}).map(([k, v]) => [k, v?.min_per_km ?? v])
  )
  const days = Object.keys(paceMinPerKm).length
    ? rawDays.map((d) => (d.time_based ? d : enrichDays([d], paceMinPerKm, profile.age)[0]))
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
    // Plan-wide facts the AI must not overwrite.
    scenario: original.scenario,
    feasibility_verdict: original.feasibility_verdict,
    planning: original.planning,
    goal_plan: original.goal_plan,
    allow_hard: original.allow_hard,
    unit: original.unit,
    adapted: true,
  }
}

const isHabitGoal = (plans) => plans?.[0]?.plan_json?.goal_plan?.main === 'navada'

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
  // A habit goal never answers a missed session with a changed week.
  if (missed && isHabitGoal(plans)) return null

  const week = currentWeekNumber(plans)
  const nextWeek = week + 1
  const base = plans.find((p) => p.week_number === nextWeek)
  if (!base) return null // plan ends here (e.g. race week) — nothing to rewrite
  // Walk-run weeks follow a ladder; no AI call can improve on it.
  if (!isAdaptable(base.plan_json)) return null

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
  // The weekly rewrite eases a week after missed sessions; a habit goal has no such thing.
  if (isHabitGoal(plans)) return null

  const week = currentWeekNumber(plans)
  if (week <= 1) return null
  const current = plans.find((p) => p.week_number === week)
  if (!current || current.plan_json?.adapted) return null
  if (!isAdaptable(current.plan_json)) return null

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
