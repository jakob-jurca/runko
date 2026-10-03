/**
 * entitlements.js — who may use what. The single source of truth.
 *
 * Plain JavaScript on purpose, like ai-proxy/limits.js: the Edge Functions
 * import it under Deno (ai-proxy, entitlement, stripe-webhook), and the app
 * and its test suite import the very same file under Vite / Node. A rule that
 * lives in one file cannot drift between the server and the screen.
 *
 * The SERVER is what enforces it: the ai-proxy refuses calls the tier does
 * not cover, and the `entitlement` function hands out plan builds. The app
 * only reads the result (GET /functions/v1/entitlement) to decide what to show.
 *
 * Tiers
 *   none   no access: the paywall and nothing else
 *   trial  14-day Stripe trial (card on file), or the old 1-month no-card
 *          trial for accounts created before it was retired; Pro features
 *          except that only ONE plan can be built
 *   start  Start subscription
 *   pro    Pro subscription, or `comped` (testers: Pro without paying)
 *
 * Daily limits reset at midnight Europe/Ljubljana, whatever the server's or
 * the phone's own clock zone.
 */

export const TIERS = ['none', 'trial', 'start', 'pro']
export const PAID_TIERS = ['start', 'pro']

/** Coach chat messages per day (Europe/Ljubljana). */
export const CHAT_PER_DAY = { trial: 50, start: 10, pro: 50 }

/**
 * Other kinds of AI call, per day. None of these is a feature anyone counts,
 * but `kind` is written by the client, so each one needs a ceiling or a chat
 * could be sent under another name. Memory extraction runs once after each
 * chat reply, so it follows the chat limit.
 */
export const OTHER_PER_DAY = { reaction: 20, motd: 5, adapt: 10 }

/** Every kind the proxy accepts. Anything else is refused. */
export const AI_KINDS = ['chat', 'memory', 'reaction', 'motd', 'adapt', 'plan', 'review']

export const PLAN_BUILDS = {
  /** Start: one build, then the next one a calendar month later. */
  startMonths: 1,
  /** Pro: unlimited, with a hidden fair-use cap to protect the AI bill. */
  proPerDay: 5,
  /** Trial: one plan for the whole trial. */
  trialTotal: 1,
  /** A reserved build must make its AI calls within this time... */
  ttlMs: 60 * 60 * 1000,
  /** ...and at most this many (model fallbacks and one stricter retry). */
  aiCallsPerBuild: 4,
}

/**
 * A Stripe trial that has just ended is still a trial for this long, so the
 * gap between the trial's end and Stripe's "now active" webhook does not
 * lock a paying runner out.
 */
export const TRIAL_GRACE_MS = 24 * 60 * 60 * 1000

/** Stripe subscription statuses that mean "the last payment did not go through". */
const PAYMENT_PROBLEM = new Set(['past_due', 'unpaid', 'incomplete'])

// ---------------------------------------------------------------------------
// Entitlement
// ---------------------------------------------------------------------------

/**
 * The runner's entitlement right now.
 *
 * @param {object} input
 * @param {string|null} [input.trialEnd] - users.trial_end: the OLD no-card
 *   trial. Set only on accounts created before migration_v9.
 * @param {object|null} [input.sub] - the runner's public.subscriptions row
 * @param {Date} [now]
 * @returns {{tier: string, comped: boolean, source: string|null, status: string|null,
 *   chosenTier: string|null, interval: string|null, trialEndsAt: string|null,
 *   renewsAt: string|null, cancelAtPeriodEnd: boolean, paymentFailed: boolean,
 *   trialAvailable: boolean, hasCustomer: boolean}}
 */
export function entitlementOf({ trialEnd = null, sub = null } = {}, now = new Date()) {
  const status = sub?.status ?? null
  const base = {
    tier: 'none',
    comped: false,
    source: null,
    status,
    chosenTier: PAID_TIERS.includes(sub?.tier) ? sub.tier : null,
    interval: sub?.billing_interval ?? null,
    trialEndsAt: null,
    renewsAt: sub?.current_period_end ?? null,
    cancelAtPeriodEnd: Boolean(sub?.cancel_at_period_end),
    paymentFailed: false,
    // One card trial per account, ever.
    trialAvailable: !sub?.trial_used,
    hasCustomer: Boolean(sub?.stripe_customer_id),
  }

  if (sub?.comped) return { ...base, tier: 'pro', comped: true, source: 'comped' }

  if (status === 'active' && base.chosenTier) {
    return { ...base, tier: base.chosenTier, source: 'stripe' }
  }

  if (status === 'trialing') {
    const end = sub.trial_end ? new Date(sub.trial_end).getTime() : null
    if (end === null || end + TRIAL_GRACE_MS > now.getTime()) {
      return { ...base, tier: 'trial', source: 'stripe', trialEndsAt: sub.trial_end ?? null }
    }
  }

  // The retired 1-month trial: honoured to its end, then the paywall.
  if (trialEnd && new Date(trialEnd).getTime() > now.getTime()) {
    return { ...base, tier: 'trial', source: 'legacy_trial', trialEndsAt: trialEnd }
  }

  return { ...base, paymentFailed: PAYMENT_PROBLEM.has(status) }
}

export const hasAccess = (tier) => tier !== 'none' && TIERS.includes(tier)

/** Weekly progress review: Pro and trial. */
export const reviewAllowed = (tier) => tier === 'pro' || tier === 'trial'

/** Coach chat messages a day for this tier. */
export const chatLimit = (tier) => CHAT_PER_DAY[tier] ?? 0

/**
 * The daily ceiling for one kind of AI call, or Infinity when the kind is
 * governed elsewhere (plan: by builds, review: once a week).
 */
export function dailyLimit(kind, tier) {
  if (!hasAccess(tier)) return 0
  if (kind === 'chat' || kind === 'memory') return chatLimit(tier)
  if (kind === 'plan' || kind === 'review') return Infinity
  return OTHER_PER_DAY[kind] ?? 0
}

/** The coach's day is over. Start runners hear that Pro has more room. */
export function chatLimitMessage(tier, limit = chatLimit(tier)) {
  const base = `Danes sva se pogovorila že ${limit}-krat, kolikor jih omogoča tvoj paket. Jutri spet, od polnoči naprej.`
  return tier === 'start' ? `${base} S paketom Pro imaš ${CHAT_PER_DAY.pro} sporočil na dan.` : base
}

/**
 * The ai-proxy's daily check: null when the call may go ahead, otherwise the
 * refusal to send. `usedToday` counts billable calls of this kind since
 * midnight in Ljubljana.
 */
export function dailyLimitRefusal({ kind, tier, usedToday }) {
  const limit = dailyLimit(kind, tier)
  if (!Number.isFinite(limit) || usedToday < limit) return null
  if (kind === 'chat' || kind === 'memory') {
    return { status: 429, code: 'chat_limit', message: chatLimitMessage(tier, limit), limit }
  }
  return { status: 429, code: 'daily_limit', message: 'Za danes je trener naredil dovolj. Jutri spet.', limit }
}

// ---------------------------------------------------------------------------
// Plan builds
// ---------------------------------------------------------------------------

/**
 * May a plan AI call run under this reserved build? It must exist (for this
 * runner: the caller filters by user), be recent, and have calls left.
 */
export function planBuildUsable(build, now = new Date()) {
  if (!build) return false
  if (now.getTime() - new Date(build.created_at).getTime() > PLAN_BUILDS.ttlMs) return false
  return (build.ai_calls ?? 0) < PLAN_BUILDS.aiCallsPerBuild
}

/**
 * May the runner build a new plan now, and if not, from when?
 *
 * @param {object} input
 * @param {string} input.tier
 * @param {Array<{created_at: string}>} input.builds - plan_builds rows, any order
 * @param {string|null} [input.trialStartedAt] - only builds from here count
 *   toward the trial's one plan (null: all of them, the old trial)
 * @param {string|null} [input.trialEndsAt] - when a trial runner may build again
 * @param {Date} [input.now]
 * @returns {{allowed: boolean, reason: string|null, nextAt: string|null}}
 */
export function planBuildStatus({ tier, builds = [], trialStartedAt = null, trialEndsAt = null, now = new Date() }) {
  const times = builds.map((b) => new Date(b.created_at).getTime()).sort((a, b) => b - a)
  const yes = { allowed: true, reason: null, nextAt: null }

  if (!hasAccess(tier)) return { allowed: false, reason: 'no_access', nextAt: null }

  if (tier === 'pro') {
    const dayStart = startOfLocalDay(now).getTime()
    const today = times.filter((t) => t >= dayStart).length
    if (today >= PLAN_BUILDS.proPerDay) {
      return { allowed: false, reason: 'fair_use', nextAt: startOfNextLocalDay(now).toISOString() }
    }
    return yes
  }

  if (tier === 'trial') {
    const from = trialStartedAt ? new Date(trialStartedAt).getTime() : -Infinity
    const used = times.filter((t) => t >= from).length
    if (used >= PLAN_BUILDS.trialTotal) return { allowed: false, reason: 'trial_used', nextAt: trialEndsAt ?? null }
    return yes
  }

  // start
  if (times.length) {
    const next = addMonths(new Date(times[0]), PLAN_BUILDS.startMonths)
    if (next.getTime() > now.getTime()) return { allowed: false, reason: 'monthly', nextAt: next.toISOString() }
  }
  return yes
}

/** Same day-of-month N months on, clamped to the month's end (31 Jan -> 28/29 Feb). */
export function addMonths(date, months) {
  const d = new Date(date.getTime())
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d
}

// ---------------------------------------------------------------------------
// Europe/Ljubljana calendar
// ---------------------------------------------------------------------------

export const TIME_ZONE = 'Europe/Ljubljana'

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function parts(date) {
  const p = {}
  for (const { type, value } of fmt.formatToParts(date)) p[type] = Number(value)
  return p
}

/** How far Ljubljana's wall clock is ahead of UTC at this instant, in ms. */
function offsetAt(ms) {
  const p = parts(new Date(ms))
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return wall - Math.floor(ms / 1000) * 1000
}

/** The instant Ljubljana's wall clock reads 00:00 on (y, m, d). */
function localMidnight(y, m, d) {
  const guess = Date.UTC(y, m - 1, d)
  let t = guess - offsetAt(guess)
  t = guess - offsetAt(t) // a DST change between guess and t
  return new Date(t)
}

/** "2026-10-03": the calendar date in Ljubljana. */
export function localDateKey(date = new Date()) {
  const p = parts(date)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Midnight in Ljubljana at the start of `date`'s day. */
export function startOfLocalDay(date = new Date()) {
  const p = parts(date)
  return localMidnight(p.year, p.month, p.day)
}

/** The next midnight in Ljubljana, when the daily limits reset. */
export function startOfNextLocalDay(date = new Date()) {
  const p = parts(date)
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1))
  return localMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())
}

/** "2026-09-28": Monday of `date`'s week in Ljubljana. */
export function localWeekKey(date = new Date()) {
  const p = parts(date)
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day))
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
  return day.toISOString().slice(0, 10)
}

/** "2026-09-21": Monday of the week before `date`'s, the one a weekly review covers. */
export function previousLocalWeekKey(date = new Date()) {
  const monday = new Date(localWeekKey(date) + 'T00:00:00Z')
  monday.setUTCDate(monday.getUTCDate() - 7)
  return monday.toISOString().slice(0, 10)
}
