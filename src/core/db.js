/**
 * db.js — thin data-access layer over Supabase.
 * Every table read/write goes through here so pages stay declarative.
 */
import { supabase } from './supabase'
import { t } from './strings'
// Imported for use INSIDE this file. The re-export at the bottom is a
// convenience for callers and does NOT bind these names locally — assuming
// it did is what left currentWeekNumber calling an undefined startOfWeekISO.
import { currentWeekNumber, todayISO as todayLocalISO } from './dates.js'

// ---------- users (profile) ----------

export async function getProfile(userId) {
  const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  return data
}

const FK_VIOLATION = '23503' // Postgres foreign_key_violation
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Returns the id of a CONFIRMED auth user. Unlike getSession() — which just
 * reads the cached token from localStorage — getUser() validates the JWT with
 * the auth server, so a stale session (e.g. the auth user was deleted, or a
 * fresh signup isn't fully settled yet) is caught here instead of blowing up
 * as a users_id_fkey violation. Falls back to one token refresh before
 * giving up.
 */
export async function getConfirmedUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (!error && data?.user) return data.user.id

  const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
  if (!refreshErr && refreshed?.user) return refreshed.user.id

  throw new Error(t.errors.sessionInvalid)
}

/**
 * Insert-or-update the profile row. trial_end is set by a DB default on insert.
 *
 * The row id always comes from a server-confirmed auth user (never from a
 * cached session the caller happens to hold), and a users_id_fkey violation —
 * a just-created auth user not visible to the insert yet — is retried with a
 * growing delay before surfacing a readable error.
 */
export async function saveProfile(profile, { retries = 3 } = {}) {
  const row = { ...profile, id: await getConfirmedUserId() }

  for (let attempt = 0; ; attempt++) {
    const { data, error } = await supabase.from('users').upsert(row).select().single()
    if (!error) return data
    if (error.code !== FK_VIOLATION) throw error

    if (attempt >= retries) {
      throw new Error(t.errors.linkFailed)
    }
    await sleep(1000 * (attempt + 1)) // 1s, 2s, 3s
    // Re-confirm (and possibly refresh) the auth user before the next try.
    row.id = await getConfirmedUserId()
  }
}

/** Patch a few columns on the profile row, leaving the rest untouched. */
export async function updateProfile(userId, patch) {
  const { data, error } = await supabase
    .from('users')
    .update(patch)
    .eq('id', userId)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Stamp users.last_plan_created_at — this starts the clock on the
 * once-a-month plan rebuild limit (see core/plan.js).
 */
export async function markPlanCreated(userId) {
  return updateProfile(userId, { last_plan_created_at: new Date().toISOString() })
}

// ---------- health_profiles (optional, special-category data) ----------

/** Columns the plan engine reads; nothing else is ever stored (GDPR). */
export const HEALTH_FIELDS = [
  'sex', 'height_cm', 'cardiac_symptoms', 'known_condition', 'medical_clearance',
  'caesarean', 'postpartum_cleared', 'marathons_completed',
  'pelvic_floor_symptoms', 'severe_tear', 'height_gain_cm_3mo',
]

const MISSING_TABLE = new Set(['PGRST205', '42P01'])

/**
 * The runner's health profile, or null if they have not filled one in.
 * A database that has not run migration_v7 yet reads as "no profile".
 */
export async function getHealthProfile(userId) {
  const { data, error } = await supabase
    .from('health_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    if (MISSING_TABLE.has(error.code)) return null
    throw error
  }
  return data
}

/**
 * Save the health profile. Only called after the runner has accepted the
 * consent line; `consent_at` records when. Unknown keys are dropped.
 */
export async function saveHealthProfile(userId, fields, consentAt) {
  const row = { user_id: userId, consent_at: consentAt, updated_at: new Date().toISOString() }
  // Columns added by migration v8 are written only when answered, so saving
  // still works on a database that has not run it yet.
  const LATE = new Set(['pelvic_floor_symptoms', 'severe_tear', 'height_gain_cm_3mo'])
  for (const k of HEALTH_FIELDS) {
    if (LATE.has(k) && (fields[k] ?? null) === null) continue
    row[k] = fields[k] ?? null
  }
  const { data, error } = await supabase.from('health_profiles').upsert(row).select().single()
  if (error) throw error
  return data
}

/** Delete the health profile entirely (withdrawing consent). */
export async function deleteHealthProfile(userId) {
  const { error } = await supabase.from('health_profiles').delete().eq('user_id', userId)
  if (error) throw error
}

// ---------- training_plans ----------

/** All plan weeks, ascending. The full plan is one row per week. */
export async function getPlans(userId) {
  const { data, error } = await supabase
    .from('training_plans')
    .select('*')
    .eq('user_id', userId)
    .order('week_number', { ascending: true })
  if (error) throw error
  return data ?? []
}

/** The plan row for the week the runner is currently in. */
export async function getCurrentPlan(userId) {
  const plans = await getPlans(userId)
  if (!plans.length) return null
  const week = currentWeekNumber(plans)
  return plans.find((p) => p.week_number === week) ?? plans[plans.length - 1]
}

/**
 * Remove every training_plans row for a user.
 *
 * Creating a plan must do this FIRST. savePlan upserts on
 * (user_id, week_number), so rebuilding a 20-week plan as a 10-week one used
 * to overwrite weeks 1-10 and leave weeks 11-20 of the old plan behind — the
 * dashboard and plan overview then read a chimera of both. Deleting also
 * resets created_at, which is what currentWeekNumber() counts from; without
 * it a fresh plan would think the runner was already mid-block.
 */
export async function deletePlans(userId) {
  const { error } = await supabase.from('training_plans').delete().eq('user_id', userId)
  if (error) throw error
}

export async function savePlan(userId, weekNumber, planJson) {
  const { data, error } = await supabase
    .from('training_plans')
    .upsert(
      { user_id: userId, week_number: weekNumber, plan_json: planJson },
      { onConflict: 'user_id,week_number' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

// ---------- training_breaks ("Poškodba / bolezen") ----------

/**
 * The break still in effect (resting or returning) on `today`, or null.
 * A database without migration_v9 reads as "no break".
 */
export async function getActiveBreak(userId, today = todayLocalISO()) {
  const { data, error } = await supabase
    .from('training_breaks')
    .select('*')
    .eq('user_id', userId)
    .is('undone_at', null)
    .gte('return_until', today)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    if (MISSING_TABLE.has(error.code)) return null
    throw error
  }
  return data
}

export async function saveTrainingBreak(row) {
  const { data, error } = await supabase.from('training_breaks').insert(row).select().single()
  if (error) throw error
  return data
}

export async function markBreakUndone(id) {
  const { error } = await supabase.from('training_breaks').update({ undone_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// ---------- weekly_reviews (written only by the ai-proxy) ----------

/** The stored review of the week starting `weekStart`, or null. */
export async function getWeeklyReview(userId, weekStart) {
  const { data, error } = await supabase
    .from('weekly_reviews')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle()
  if (error) {
    if (MISSING_TABLE.has(error.code)) return null
    throw error
  }
  return data
}

// ---------- workouts ----------

export async function getWorkouts(userId, { since, limit = 50 } = {}) {
  let q = supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit)
  if (since) q = q.gte('date', since)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function addWorkout(workout) {
  const { data, error } = await supabase.from('workouts').insert(workout).select().single()
  if (error) throw error
  return data
}

// ---------- chat_messages ----------

/**
 * The most RECENT `limit` messages, returned oldest-first for rendering.
 *
 * Ordering descending and reversing matters: ordering ascending with a limit
 * returns the OLDEST messages, so a long-running conversation would show
 * ancient history and never the last thing anyone said.
 *
 * @param {string} userId
 * @param {object} [opts]
 * @param {number} [opts.limit] - how many to fetch (default 50)
 * @param {string} [opts.before] - created_at cursor; fetch older than this
 * @returns {Promise<Array>} oldest-first
 */
export async function getChatMessages(userId, { limit = 50, before = null } = {}) {
  let q = supabase
    .from('chat_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (before) q = q.lt('created_at', before)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []).reverse()
}

/**
 * Wipe the runner's chat history.
 *
 * Deliberately scoped to chat_messages only — coach_memory is a separate
 * table and survives, which is what the confirmation dialog promises.
 */
export async function deleteChatMessages(userId) {
  const { error } = await supabase.from('chat_messages').delete().eq('user_id', userId)
  if (error) throw error
}

export async function addChatMessage(userId, role, content) {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ user_id: userId, role, content })
    .select()
    .single()
  if (error) throw error
  return data
}

// ---------- helpers ----------

// Date helpers live in ./dates.js (pure, no Supabase) and are re-exported
// here so existing imports keep working.
export {
  todayISO,
  startOfWeekISO,
  addDaysISO,
  weekStartISO,
  currentWeekNumber,
} from './dates.js'
