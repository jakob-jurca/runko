/**
 * billing — Stripe Checkout and the Customer Portal for the signed-in runner.
 *
 *   { action: 'checkout', tier: 'start'|'pro', interval: 'month'|'year' } -> { url }
 *   { action: 'portal' }                                                  -> { url }
 *   { action: 'sync', sessionId }  after Checkout returns                 -> { result }
 *
 * Checkout: 14-day trial (only if the account never had one), card always
 * collected, promotion codes allowed (the founding-member code), Slovenian.
 * The runner's id travels on the session and on the subscription's
 * metadata, which is how the webhook knows whose it is.
 *
 * Secrets: STRIPE_SECRET_KEY (sk_test_...). Optional APP_ORIGINS: comma-
 * separated origins Checkout may return to; the request's own Origin is used
 * when it is one of them.
 *
 * Deploy: npx supabase@latest functions deploy billing
 */

// @ts-ignore — resolved by Deno at deploy time.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors, json, fail, BUSY, UNAVAILABLE } from '../_shared/http.ts'
import { loadAccess, userFromRequest } from '../_shared/access.ts'
import { subscriptionStore } from '../_shared/subscriptions-store.ts'
// @ts-ignore — plain JS, shared with the tests.
import { stripeRequest, lookupKeyFor, TRIAL_DAYS, applyCheckoutSync } from '../_shared/stripe.js'

const DEFAULT_ORIGINS = ['https://runko-omega.vercel.app', 'http://localhost:5173', 'http://localhost:4173']

/** Statuses with which a second Checkout would bill the runner twice. */
const HAS_SUBSCRIPTION = ['trialing', 'active', 'past_due', 'unpaid', 'incomplete']

function returnOrigin(req: Request) {
  const configured = (Deno.env.get('APP_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const list = configured.length ? configured : DEFAULT_ORIGINS
  const origin = req.headers.get('Origin') ?? ''
  return list.includes(origin) ? origin : list[0]
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return fail(405, 'Method not allowed.', 'method_not_allowed')

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!stripeKey || !supabaseUrl || !serviceKey) {
    console.error('billing misconfigured: STRIPE_SECRET_KEY or Supabase env missing')
    return fail(500, UNAVAILABLE, 'server_misconfigured')
  }
  const allowLive = Deno.env.get('STRIPE_ALLOW_LIVE') === 'true'
  const stripe = (method: string, path: string, params: Record<string, unknown> | null = null, opts = {}) =>
    stripeRequest(stripeKey, method, path, params, { allowLive, ...opts })

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const user = await userFromRequest(admin, req)
  if (!user) return fail(401, 'Seja je potekla. Prijavi se znova.', 'unauthenticated')

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) ?? {}
  } catch {
    return fail(400, 'Neveljavna zahteva.', 'bad_request')
  }

  let access
  try {
    access = await loadAccess(admin, user.id)
  } catch (err) {
    console.error('billing: lookup failed', (err as Error).message)
    return fail(503, BUSY, 'entitlement_check_failed')
  }
  const { sub, ent } = access
  const store = subscriptionStore(admin)
  const origin = returnOrigin(req)

  try {
    if (body.action === 'checkout') {
      const priceKey = lookupKeyFor(String(body.tier ?? ''), String(body.interval ?? ''))
      if (!priceKey) return fail(400, 'Neveljavna zahteva.', 'bad_plan')

      // One subscription per runner. Changing plan, fixing a card or
      // cancelling is the portal's job.
      if (sub?.stripe_subscription_id && HAS_SUBSCRIPTION.includes(sub.status)) {
        return fail(409, 'Naročnino že imaš. Paket zamenjaš ali plačilo urediš v Nastavitvah pod Naročnina.', 'already_subscribed')
      }

      const prices = await stripe('GET', '/prices', { lookup_keys: [priceKey], active: true, limit: 1 })
      const price = prices?.data?.[0]
      if (!price) {
        console.error('billing: no active price with lookup key', priceKey)
        return fail(500, UNAVAILABLE, 'price_missing')
      }

      // One Stripe customer per runner, created once and remembered, so the
      // portal shows every invoice in one place.
      let customer = sub?.stripe_customer_id ?? null
      if (!customer) {
        const created = await stripe(
          'POST',
          '/customers',
          { email: user.email, metadata: { user_id: user.id } },
          { idempotencyKey: `runko-customer-${user.id}` }
        )
        customer = created.id
        await store.saveRow(user.id, { stripe_customer_id: customer })
      }

      const subscriptionData: Record<string, unknown> = { metadata: { user_id: user.id } }
      if (ent.trialAvailable) {
        subscriptionData.trial_period_days = TRIAL_DAYS
        subscriptionData.trial_settings = { end_behavior: { missing_payment_method: 'cancel' } }
      }

      const session = await stripe('POST', '/checkout/sessions', {
        mode: 'subscription',
        customer,
        client_reference_id: user.id,
        line_items: [{ price: price.id, quantity: 1 }],
        payment_method_collection: 'always',
        allow_promotion_codes: true,
        locale: 'sl',
        subscription_data: subscriptionData,
        metadata: { user_id: user.id },
        success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?checkout=cancel`,
      })
      return json({ url: session.url })
    }

    if (body.action === 'portal') {
      if (!sub?.stripe_customer_id) {
        return fail(409, 'Naročnine še nimaš. Izberi paket.', 'no_customer')
      }
      const session = await stripe('POST', '/billing_portal/sessions', {
        customer: sub.stripe_customer_id,
        return_url: `${origin}/settings`,
        locale: 'sl',
        // Set only when scripts/stripe-setup.mjs had to create the settings
        // rather than update the account's default ones.
        configuration: Deno.env.get('STRIPE_PORTAL_CONFIGURATION') || undefined,
      })
      return json({ url: session.url })
    }

    if (body.action === 'sync') {
      const id = String(body.sessionId ?? '')
      if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return fail(400, 'Neveljavna zahteva.', 'bad_session')
      const session = await stripe('GET', `/checkout/sessions/${id}`, { expand: ['subscription'] })
      return json(await applyCheckoutSync(session, user.id, store))
    }

    return fail(400, 'Neveljavna zahteva.', 'bad_action')
  } catch (err) {
    console.error('billing: Stripe call failed', body.action, (err as Error).message)
    return fail(502, 'Plačilnega sistema trenutno ni bilo mogoče doseči. Poskusi čez trenutek.', 'stripe_failed')
  }
})
