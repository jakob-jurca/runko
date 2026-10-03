/**
 * stripe-webhook — Stripe tells us about checkouts, subscriptions and
 * invoices; this keeps public.subscriptions in step.
 *
 * Stripe does not send a Supabase JWT, so this function is deployed with
 * --no-verify-jwt. Its own check is the Stripe-Signature header: an event
 * that is not signed with STRIPE_WEBHOOK_SECRET is refused (400) before
 * anything is read from it. Handling is idempotent and order-safe
 * (_shared/stripe.js handleStripeEvent).
 *
 * Deploy:
 *   npx supabase@latest functions deploy stripe-webhook --no-verify-jwt
 *   npx supabase@latest secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_...
 */

// @ts-ignore — resolved by Deno at deploy time.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore — plain JS, shared with the tests.
import { verifyStripeSignature, handleStripeEvent, stripeRequest } from '../_shared/stripe.js'
import { subscriptionStore } from '../_shared/subscriptions-store.ts'

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return reply(405, { error: 'method not allowed' })

  // Payments switched off: nothing to do, and no secret is needed. 503 (not
  // 200) so that, should Stripe ever call while off, it retries later
  // instead of the event being lost.
  if (Deno.env.get('PAYMENTS_ENABLED') !== 'true') return reply(503, { error: 'payments disabled' })

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!secret || !stripeKey || !supabaseUrl || !serviceKey) {
    console.error('stripe-webhook misconfigured: STRIPE_WEBHOOK_SECRET / STRIPE_SECRET_KEY / Supabase env missing')
    return reply(500, { error: 'misconfigured' })
  }
  const allowLive = Deno.env.get('STRIPE_ALLOW_LIVE') === 'true'

  // The signature covers the exact bytes Stripe sent: read the raw text.
  const payload = await req.text()
  const ok = await verifyStripeSignature(payload, req.headers.get('Stripe-Signature'), secret)
  if (!ok) return reply(400, { error: 'bad signature' })

  let event
  try {
    event = JSON.parse(payload)
  } catch {
    return reply(400, { error: 'bad payload' })
  }
  if (event.livemode && !allowLive) {
    console.error('stripe-webhook: live-mode event refused (test mode only)', event.id)
    return reply(400, { error: 'live mode not enabled' })
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  try {
    const result = await handleStripeEvent(event, {
      ...subscriptionStore(admin),
      fetchSubscription: (id: string) => stripeRequest(stripeKey, 'GET', `/subscriptions/${id}`, null, { allowLive }),
    })
    console.log('stripe-webhook', event.type, event.id, result.result)
    return reply(200, { received: true, ...result })
  } catch (err) {
    // 500 makes Stripe retry later; the claim on the event id was released.
    console.error('stripe-webhook: failed', event.type, event.id, (err as Error).message)
    return reply(500, { error: 'failed' })
  }
})
