// Stripe: webhook signature, event handling (idempotent, order-safe) and
// what each event does to the runner's access. Event fixtures in
// tests/fixtures/stripe/ have the shape of Stripe's test-mode events
// (API version 2024-06-20). No network: the database is an in-memory map.
import fs from 'node:fs'
import {
  verifyStripeSignature, signPayload, handleStripeEvent, subscriptionPatch, applyCheckoutSync,
  formEncode, assertKeyAllowed, stripeRequest, lookupKeyFor, priceInfo, PRICES, FOUNDING, WEBHOOK_EVENTS,
} from '../supabase/functions/_shared/stripe.js'
import { entitlementOf } from '../supabase/functions/_shared/entitlements.js'
import { check, summary } from './harness.mjs'

const fixture = (name) => JSON.parse(fs.readFileSync(`tests/fixtures/stripe/${name}.json`, 'utf8'))
const USER = '5b1c1a0e-8f7a-4c6e-9a51-0d6f3c2b7e11'

/** The subscriptions + stripe_events tables, in memory. */
function memoryStore({ failSaves = 0 } = {}) {
  const rows = new Map()
  const events = new Set()
  let failures = failSaves
  return {
    rows,
    events,
    async claimEvent(id) {
      if (events.has(id)) return false
      events.add(id)
      return true
    },
    async releaseEvent(id) {
      events.delete(id)
    },
    async findUserByCustomer(c) {
      for (const [u, r] of rows) if (r.stripe_customer_id === c) return u
      return null
    },
    async getRow(u) {
      return rows.get(u) ?? null
    },
    async saveRow(u, patch) {
      if (failures > 0) {
        failures--
        throw new Error('database down')
      }
      rows.set(u, { ...(rows.get(u) ?? {}), ...patch })
    },
    fetchSubscription: async () => fixture('customer.subscription.created').data.object,
  }
}

const tierAt = (store, now) => entitlementOf({ sub: store.rows.get(USER) ?? null }, now).tier

console.log('\nWebhook signature:')
{
  const secret = 'whsec_test_secret'
  const body = JSON.stringify(fixture('customer.subscription.created'))
  const now = Date.now()
  const header = await signPayload(body, secret, Math.floor(now / 1000))
  check('a correctly signed event is accepted', await verifyStripeSignature(body, header, secret, { now }))
  check('a changed body is refused', !(await verifyStripeSignature(body.replace('trialing', 'active'), header, secret, { now })))
  check('the wrong secret is refused', !(await verifyStripeSignature(body, header, 'whsec_other', { now })))
  check('an old (replayed) signature is refused', !(await verifyStripeSignature(body, header, secret, { now: now + 10 * 60_000 })))
  check('no header is refused', !(await verifyStripeSignature(body, null, secret, { now })))
  check('garbage header is refused', !(await verifyStripeSignature(body, 't=abc,v1=', secret, { now })))
  const rolled = `${header},v1=${'0'.repeat(64)}`
  check('any matching v1 of several is accepted (secret rotation)', await verifyStripeSignature(body, rolled, secret, { now }))
}

console.log('\nSubscription -> row:')
{
  const p = subscriptionPatch(fixture('customer.subscription.created').data.object)
  check('status trialing', p.status === 'trialing')
  check('tier and interval from the lookup key', p.tier === 'start' && p.billing_interval === 'month')
  check('trial end as an ISO time', p.trial_end === new Date((1790000000 + 14 * 86400) * 1000).toISOString())
  check('a trial marks the account trial_used', p.trial_used === true)
  const pro = subscriptionPatch(fixture('customer.subscription.updated.pro_yearly').data.object)
  check('plan change to Pro yearly', pro.tier === 'pro' && pro.billing_interval === 'year')
  check('current_period_end read from the item when the subscription lacks it', subscriptionPatch(fixture('customer.subscription.updated.active').data.object).current_period_end !== null)
  const noTrial = subscriptionPatch({ ...fixture('customer.subscription.created').data.object, trial_start: null, trial_end: null })
  check('no trial: trial_used is not touched (never set back to false)', !('trial_used' in noTrial))
  check('cancel_at (newer API versions) counts as cancelling', subscriptionPatch({ ...fixture('customer.subscription.updated.active').data.object, cancel_at: 1799999999 }).cancel_at_period_end)
  check('a hand-made price falls back to its metadata', priceInfo({ lookup_key: null, metadata: { tier: 'pro' }, recurring: { interval: 'year' } }).tier === 'pro')
  check('an unknown price gives no tier', priceInfo({ lookup_key: 'x', metadata: {}, recurring: { interval: 'month' } }).tier === null)
}

console.log('\nA whole subscription, event by event:')
{
  const s = memoryStore()
  const T0 = 1790000000 * 1000
  check('before Checkout: none', tierAt(s, new Date(T0)) === 'none')
  let r = await handleStripeEvent(fixture('checkout.session.completed'), s)
  check('checkout.session.completed: applied', r.result === 'applied')
  check('checkout links the Stripe customer to the runner', s.rows.get(USER).stripe_customer_id === 'cus_TestRunko001')
  check('checkout: trial access at once (subscription fetched)', tierAt(s, new Date(T0 + 86400_000)) === 'trial')
  r = await handleStripeEvent(fixture('customer.subscription.created'), s)
  check('subscription.created, older than the checkout event: skipped as stale', r.result === 'stale')
  r = await handleStripeEvent(fixture('customer.subscription.trial_will_end'), s)
  check('trial_will_end: applied, still trial', r.result === 'applied' && tierAt(s, new Date(T0 + 12 * 86400_000)) === 'trial')
  r = await handleStripeEvent(fixture('invoice.payment_failed'), s)
  check('invoice.payment_failed: recorded', r.result === 'applied' && s.rows.get(USER).payment_failed_at)
  r = await handleStripeEvent(fixture('customer.subscription.updated.past_due'), s)
  const pastDue = entitlementOf({ sub: s.rows.get(USER) }, new Date(T0 + 15 * 86400_000))
  check('past_due after the trial: no access, payment problem shown', pastDue.tier === 'none' && pastDue.paymentFailed)
  r = await handleStripeEvent(fixture('customer.subscription.updated.active'), s)
  check('paid: Start', tierAt(s, new Date(T0 + 15 * 86400_000)) === 'start')
  r = await handleStripeEvent(fixture('invoice.paid'), s)
  check('invoice.paid clears the failed-payment mark', s.rows.get(USER).payment_failed_at === null)
  r = await handleStripeEvent(fixture('customer.subscription.updated.pro_yearly'), s)
  check('plan changed in the portal: Pro', tierAt(s, new Date(T0 + 21 * 86400_000)) === 'pro')
  r = await handleStripeEvent(fixture('customer.subscription.updated.cancel_at_period_end'), s)
  const cancelling = entitlementOf({ sub: s.rows.get(USER) }, new Date(T0 + 26 * 86400_000))
  check('cancelled in the portal: access until the period ends', cancelling.tier === 'start' && cancelling.cancelAtPeriodEnd)
  r = await handleStripeEvent(fixture('customer.subscription.deleted'), s)
  check('subscription.deleted: none (paywall)', tierAt(s, new Date(T0 + 45 * 86400_000)) === 'none')
  check('the trial cannot be used twice', entitlementOf({ sub: s.rows.get(USER) }).trialAvailable === false)
}

console.log('\nIdempotency and order:')
{
  const s = memoryStore()
  await handleStripeEvent(fixture('customer.subscription.created'), s)
  const before = JSON.stringify(s.rows.get(USER))
  const again = await handleStripeEvent(fixture('customer.subscription.created'), s)
  check('a redelivered event is a duplicate', again.result === 'duplicate')
  check('and changes nothing', JSON.stringify(s.rows.get(USER)) === before)

  const o = memoryStore()
  await handleStripeEvent(fixture('customer.subscription.updated.active'), o)
  const late = await handleStripeEvent(fixture('customer.subscription.created'), o)
  check('"trialing" arriving after "active": stale, ignored', late.result === 'stale' && o.rows.get(USER).status === 'active')

  const other = memoryStore()
  await handleStripeEvent(fixture('customer.subscription.updated.active'), other)
  const oldSub = fixture('customer.subscription.deleted')
  oldSub.id = 'evt_1TestOldSubDeleted'
  oldSub.created = fixture('customer.subscription.updated.active').created + 100
  oldSub.data.object.id = 'sub_1TestOlderSubscription'
  const r = await handleStripeEvent(oldSub, other)
  check('an older subscription ending does not end the current one', r.result === 'ignored' && other.rows.get(USER).status === 'active')

  const flaky = memoryStore({ failSaves: 1 })
  let threw = false
  try {
    await handleStripeEvent(fixture('customer.subscription.created'), flaky)
  } catch {
    threw = true
  }
  check('a failed write is reported (Stripe retries)', threw)
  const retry = await handleStripeEvent(fixture('customer.subscription.created'), flaky)
  check('and the retry is processed, not skipped as a duplicate', retry.result === 'applied' && flaky.rows.get(USER)?.status === 'trialing')

  const unknown = memoryStore()
  const ev = fixture('invoice.paid')
  check('an invoice for an unknown customer is ignored', (await handleStripeEvent(ev, unknown)).result === 'ignored')
  check('an unhandled event type is ignored', (await handleStripeEvent({ id: 'evt_x', type: 'customer.created', created: 1, data: { object: {} } }, unknown)).result === 'ignored')
  const payment = fixture('checkout.session.completed')
  payment.id = 'evt_1TestPaymentMode'
  payment.data.object.mode = 'payment'
  check('a one-off payment checkout is ignored', (await handleStripeEvent(payment, unknown)).result === 'ignored')
}

console.log('\nReturn from Checkout (sync before the webhook):')
{
  const s = memoryStore()
  const session = { client_reference_id: USER, status: 'complete', customer: 'cus_TestRunko001', subscription: fixture('customer.subscription.created').data.object }
  check('another runner\'s session is refused', (await applyCheckoutSync({ ...session, client_reference_id: 'someone-else' }, USER, s)).result === 'refused')
  check('an unfinished session changes nothing', (await applyCheckoutSync({ ...session, status: 'open' }, USER, s)).result === 'pending' && !s.rows.has(USER))
  check('a finished session starts the trial', (await applyCheckoutSync(session, USER, s)).result === 'applied' && tierAt(s, new Date(1790000000 * 1000 + 1000)) === 'trial')
  await handleStripeEvent(fixture('customer.subscription.updated.active'), s)
  check('after a webhook, sync is a no-op', (await applyCheckoutSync(session, USER, s)).result === 'webhook_first' && s.rows.get(USER).status === 'active')
}

console.log('\nREST and keys:')
check('form encoding of nested params', formEncode({ line_items: [{ price: 'p_1', quantity: 1 }], subscription_data: { metadata: { user_id: 'u' } } }) ===
  'line_items%5B0%5D%5Bprice%5D=p_1&line_items%5B0%5D%5Bquantity%5D=1&subscription_data%5Bmetadata%5D%5Buser_id%5D=u')
check('undefined params are left out', formEncode({ a: 1, b: undefined }) === 'a=1')
let refused = false
try { assertKeyAllowed('sk_live_abc') } catch { refused = true }
check('a live key is refused', refused)
let ok = true
try { assertKeyAllowed('sk_test_abc') } catch { ok = false }
check('a test key is allowed', ok)
let sent = null
await stripeRequest('sk_test_x', 'POST', '/checkout/sessions', { mode: 'subscription' }, {
  fetchImpl: async (url, init) => { sent = { url, init }; return { ok: true, json: async () => ({ id: 'cs_test_1' }) } },
})
check('requests go to api.stripe.com with the key and a pinned version', sent.url === 'https://api.stripe.com/v1/checkout/sessions' && sent.init.headers.Authorization === 'Bearer sk_test_x' && sent.init.headers['Stripe-Version'])
let stripeErr = null
await stripeRequest('sk_test_x', 'GET', '/prices', null, { fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'No such price', code: 'resource_missing' } }) }) }).catch((e) => { stripeErr = e })
check('Stripe errors carry the message and code', stripeErr?.message === 'No such price' && stripeErr.stripeCode === 'resource_missing')

console.log('\nPrices and coupon:')
check('Start 7,99 / 59,99, Pro 12,99 / 89,99 (cents, VAT included)',
  PRICES.runko_start_monthly.amount === 799 && PRICES.runko_start_yearly.amount === 5999 &&
  PRICES.runko_pro_monthly.amount === 1299 && PRICES.runko_pro_yearly.amount === 8999)
check('lookup keys', lookupKeyFor('pro', 'year') === 'runko_pro_yearly' && lookupKeyFor('start', 'month') === 'runko_start_monthly' && lookupKeyFor('gold', 'month') === null)
check('founding coupon: -25 %, 12 months, 50 redemptions', FOUNDING.percentOff === 25 && FOUNDING.months === 12 && FOUNDING.maxRedemptions === 50)
check('the webhook listens to every event the handler handles', ['checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.trial_will_end', 'invoice.payment_failed'].every((e) => WEBHOOK_EVENTS.includes(e)))

console.log('\nThe functions use it:')
const hook = fs.readFileSync('supabase/functions/stripe-webhook/index.ts', 'utf8')
check('webhook verifies the signature on the raw body before parsing', /req\.text\(\)[\s\S]*verifyStripeSignature[\s\S]*JSON\.parse/.test(hook))
check('webhook refuses live-mode events unless enabled', /event\.livemode && !allowLive/.test(hook))
const billing = fs.readFileSync('supabase/functions/billing/index.ts', 'utf8')
check('checkout: 14-day trial only when the account has not had one', /if \(ent\.trialAvailable\)[\s\S]{0,80}trial_period_days = TRIAL_DAYS/.test(billing))
check('checkout: card always collected', /payment_method_collection: 'always'/.test(billing))
check('checkout: promotion codes allowed', /allow_promotion_codes: true/.test(billing))
check('checkout: the runner id on the session and the subscription', /client_reference_id: user\.id/.test(billing) && /metadata: \{ user_id: user\.id \}/.test(billing))
check('checkout: refused when a subscription exists', /already_subscribed/.test(billing))
const src = fs.readFileSync('src/core/subscription.js', 'utf8') + fs.readFileSync('src/pages/Settings.jsx', 'utf8')
check('no Stripe secret anywhere in the app', !/sk_(test|live)_|whsec_/.test(src))

export default summary('stripe')
