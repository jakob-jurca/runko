/**
 * stripe.js — everything Runko does with Stripe that is not I/O.
 *
 * Plain JavaScript, like entitlements.js: the billing and stripe-webhook
 * functions import it under Deno, scripts/stripe-setup.mjs and the tests
 * under Node. No Stripe SDK: the REST API takes form-encoded bodies, the
 * webhook signature is one HMAC, and an SDK pulled from a CDN at deploy time
 * is one more thing that can break.
 *
 *   prices        the four lookup keys and what they mean
 *   stripeRequest one REST call (test keys only unless explicitly allowed)
 *   verifyStripeSignature   the Stripe-Signature header, with WebCrypto
 *   subscriptionPatch       a Stripe subscription -> our subscriptions row
 *   handleStripeEvent       idempotent, order-safe webhook handling
 */

export const STRIPE_API = 'https://api.stripe.com/v1'

/**
 * Pinned so the shapes below do not move under us. Newer versions moved
 * current_period_end onto the subscription item; subscriptionPatch reads both.
 */
export const STRIPE_API_VERSION = '2024-06-20'

export const TRIAL_DAYS = 14

/** Prices are found by lookup key, so no price id has to be configured anywhere. */
export const PRICES = {
  runko_start_monthly: { tier: 'start', interval: 'month', amount: 799 },
  runko_start_yearly: { tier: 'start', interval: 'year', amount: 5999 },
  runko_pro_monthly: { tier: 'pro', interval: 'month', amount: 1299 },
  runko_pro_yearly: { tier: 'pro', interval: 'year', amount: 8999 },
}

export function lookupKeyFor(tier, interval) {
  const key = `runko_${tier}_${interval === 'year' ? 'yearly' : 'monthly'}`
  return Object.hasOwn(PRICES, key) ? key : null
}

/** Founding members: -25 % for the first 12 months, 50 redemptions. */
export const FOUNDING = { couponId: 'runko_ustanovni', promoCode: 'USTANOVNI', percentOff: 25, months: 12, maxRedemptions: 50 }

/** Events the webhook endpoint subscribes to (scripts/stripe-setup.mjs). */
export const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.trial_will_end',
  'invoice.payment_failed',
  'invoice.paid',
]

// ---------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------

/** Stripe's form encoding: a[b][0][c]=d. */
export function formEncode(value, prefix = '', out = []) {
  if (value === undefined || value === null) return out
  if (Array.isArray(value)) {
    value.forEach((v, i) => formEncode(v, `${prefix}[${i}]`, out))
  } else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) formEncode(v, prefix ? `${prefix}[${k}]` : k, out)
  } else {
    out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`)
  }
  return prefix ? out : out.join('&')
}

/**
 * Refuse a live key unless live mode was switched on on purpose. Until
 * launch, only test keys ever reach Stripe.
 */
export function assertKeyAllowed(key, { allowLive = false } = {}) {
  if (!key || !/^(sk|rk)_(test|live)_/.test(key)) throw new Error('Stripe key missing or malformed')
  if (/^(sk|rk)_live_/.test(key) && !allowLive) throw new Error('Live Stripe key refused (test mode only)')
}

/**
 * One Stripe REST call. Throws an Error carrying Stripe's message and code.
 * @param {string} key - secret key (sk_test_...)
 */
export async function stripeRequest(key, method, path, params = null, { fetchImpl = fetch, idempotencyKey = null, allowLive = false } = {}) {
  assertKeyAllowed(key, { allowLive })
  const query = method === 'GET' && params ? `?${formEncode(params)}` : ''
  const headers = {
    Authorization: `Bearer ${key}`,
    'Stripe-Version': STRIPE_API_VERSION,
  }
  if (method !== 'GET') headers['Content-Type'] = 'application/x-www-form-urlencoded'
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  const res = await fetchImpl(`${STRIPE_API}${path}${query}`, {
    method,
    headers,
    body: method === 'GET' || !params ? undefined : formEncode(params),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Stripe ${res.status}`)
    err.stripeCode = data?.error?.code ?? null
    err.status = res.status
    throw err
  }
  return data
}

// ---------------------------------------------------------------------------
// Webhook signature
// ---------------------------------------------------------------------------

const enc = new TextEncoder()

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Stripe-Signature: t=<unix>,v1=<hex>[,v1=...]. Valid when one v1 is the
 * HMAC-SHA256 of "<t>.<raw body>" with the endpoint secret, and t is within
 * the tolerance (replayed old events are refused).
 */
export async function verifyStripeSignature(payload, header, secret, { toleranceSec = 300, now = Date.now() } = {}) {
  if (!payload || !header || !secret) return false
  let t = null
  const v1 = []
  for (const part of String(header).split(',')) {
    const [k, v] = part.split('=')
    if (k?.trim() === 't') t = Number(v)
    if (k?.trim() === 'v1' && v) v1.push(v.trim())
  }
  if (!Number.isFinite(t) || !v1.length) return false
  if (Math.abs(now / 1000 - t) > toleranceSec) return false
  const expected = await hmacHex(secret, `${t}.${payload}`)
  return v1.some((sig) => safeEqual(sig, expected))
}

/** A header Stripe would send, for tests and local replays. */
export async function signPayload(payload, secret, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${await hmacHex(secret, `${t}.${payload}`)}`
}

// ---------------------------------------------------------------------------
// Subscription -> row
// ---------------------------------------------------------------------------

const iso = (unix) => (unix ? new Date(unix * 1000).toISOString() : null)
const idOf = (x) => (typeof x === 'string' ? x : x?.id ?? null)

/** Statuses under which a subscription still is, or may again become, the runner's plan. */
const LIVE = new Set(['trialing', 'active', 'past_due', 'unpaid', 'incomplete', 'paused'])

/** The tier and interval a Stripe price stands for. */
export function priceInfo(price) {
  if (!price) return { tier: null, interval: null }
  const known = PRICES[price.lookup_key]
  if (known) return { tier: known.tier, interval: known.interval }
  // A price made by hand in the dashboard: fall back to its metadata.
  const tier = ['start', 'pro'].includes(price.metadata?.tier) ? price.metadata.tier : null
  const interval = ['month', 'year'].includes(price.recurring?.interval) ? price.recurring.interval : null
  return { tier, interval }
}

/** The columns of public.subscriptions a Stripe subscription object sets. */
export function subscriptionPatch(sub) {
  const item = sub?.items?.data?.[0]
  const { tier, interval } = priceInfo(item?.price)
  return {
    stripe_customer_id: idOf(sub.customer),
    stripe_subscription_id: sub.id,
    status: sub.status,
    ...(tier ? { tier } : {}),
    ...(interval ? { billing_interval: interval } : {}),
    trial_start: iso(sub.trial_start),
    trial_end: iso(sub.trial_end),
    current_period_end: iso(sub.current_period_end ?? item?.current_period_end),
    // The portal cancels "at period end"; newer API versions express that as cancel_at.
    cancel_at_period_end: Boolean(sub.cancel_at_period_end || (sub.cancel_at && sub.status !== 'canceled')),
    // Never set back to false: one card trial per account.
    ...(sub.trial_start ? { trial_used: true } : {}),
  }
}

// ---------------------------------------------------------------------------
// Webhook events
// ---------------------------------------------------------------------------

/**
 * Apply one verified Stripe event.
 *
 * Idempotent: the event id is claimed first (stripe_events), so a redelivery
 * is acknowledged and skipped. If applying fails the claim is released and
 * the error rethrown, so Stripe's retry gets another go.
 *
 * Order-safe: Stripe does not promise delivery order. Each subscriptions row
 * remembers the `created` time of the newest event applied to it, and an
 * older one arriving late is skipped instead of undoing a newer state (e.g.
 * "trialing" landing after "active"). An event about a different, dead
 * subscription never overwrites the runner's current one.
 *
 * @param {object} event - the parsed, signature-checked event
 * @param {object} deps
 * @param {(id: string, type: string) => Promise<boolean>} deps.claimEvent - true when first seen
 * @param {(id: string) => Promise<void>} deps.releaseEvent
 * @param {(customerId: string) => Promise<string|null>} deps.findUserByCustomer
 * @param {(userId: string) => Promise<object|null>} deps.getRow
 * @param {(userId: string, patch: object) => Promise<void>} deps.saveRow - upsert
 * @param {(id: string) => Promise<object>} [deps.fetchSubscription]
 * @returns {Promise<{result: string, userId?: string}>}
 */
export async function handleStripeEvent(event, deps) {
  if (!event?.id || !event?.type) return { result: 'malformed' }
  const first = await deps.claimEvent(event.id, event.type)
  if (!first) return { result: 'duplicate' }
  try {
    return await applyEvent(event, deps)
  } catch (err) {
    await deps.releaseEvent(event.id)
    throw err
  }
}

async function applyEvent(event, deps) {
  const obj = event.data?.object ?? {}
  const at = iso(event.created)

  switch (event.type) {
    case 'checkout.session.completed': {
      if (obj.mode !== 'subscription') return { result: 'ignored' }
      const userId = obj.client_reference_id || obj.metadata?.user_id || null
      if (!userId) return { result: 'ignored', reason: 'no user on the session' }
      const subId = idOf(obj.subscription)
      let patch = { stripe_customer_id: idOf(obj.customer), ...(subId ? { stripe_subscription_id: subId } : {}) }
      // The session does not carry the subscription's state; fetch it, so
      // access starts even if the subscription.* events are late.
      const sub = typeof obj.subscription === 'object' && obj.subscription ? obj.subscription
        : subId && deps.fetchSubscription ? await deps.fetchSubscription(subId) : null
      if (sub) patch = { ...patch, ...subscriptionPatch(sub) }
      return applyPatch(deps, userId, patch, at)
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.trial_will_end': {
      const userId = obj.metadata?.user_id || (await deps.findUserByCustomer(idOf(obj.customer)))
      if (!userId) return { result: 'ignored', reason: 'unknown customer' }
      return applyPatch(deps, userId, subscriptionPatch(obj), at)
    }

    case 'invoice.payment_failed':
    case 'invoice.paid': {
      const userId = await deps.findUserByCustomer(idOf(obj.customer))
      if (!userId) return { result: 'ignored', reason: 'unknown customer' }
      const row = await deps.getRow(userId)
      const subId = idOf(obj.subscription ?? obj.parent?.subscription_details?.subscription)
      if (row?.stripe_subscription_id && subId && subId !== row.stripe_subscription_id) {
        return { result: 'ignored', reason: 'another subscription' }
      }
      // The status itself (past_due / active) comes with subscription.updated;
      // this only records when a payment last failed, for the paywall's wording.
      await deps.saveRow(userId, { payment_failed_at: event.type === 'invoice.payment_failed' ? at : null })
      return { result: 'applied', userId }
    }

    default:
      return { result: 'ignored' }
  }
}

async function applyPatch(deps, userId, patch, at) {
  const row = await deps.getRow(userId)
  if (row?.last_event_at && at && new Date(at) < new Date(row.last_event_at)) {
    return { result: 'stale', userId }
  }
  // A late event about an old subscription (say, the one cancelled before
  // this one began) must not replace the runner's current subscription.
  if (
    row?.stripe_subscription_id && patch.stripe_subscription_id &&
    patch.stripe_subscription_id !== row.stripe_subscription_id &&
    LIVE.has(row.status) && !LIVE.has(patch.status)
  ) {
    return { result: 'ignored', reason: 'another subscription', userId }
  }
  await deps.saveRow(userId, { ...patch, ...(at ? { last_event_at: at } : {}) })
  return { result: 'applied', userId }
}

/**
 * The same state, fetched by the app right after Checkout (billing `sync`),
 * so access starts before the webhook arrives. Applied only while no webhook
 * has: once one has, it is the source of truth and this is a no-op.
 */
export async function applyCheckoutSync(session, userId, deps) {
  if (session?.client_reference_id !== userId) return { result: 'refused' }
  if (session.status !== 'complete' || typeof session.subscription !== 'object' || !session.subscription) {
    return { result: 'pending' }
  }
  const row = await deps.getRow(userId)
  if (row?.last_event_at) return { result: 'webhook_first' }
  await deps.saveRow(userId, { stripe_customer_id: idOf(session.customer), ...subscriptionPatch(session.subscription) })
  return { result: 'applied', userId }
}
