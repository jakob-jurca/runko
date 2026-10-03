/**
 * stripe-setup.mjs — create everything Runko needs in Stripe TEST mode.
 *
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
 *
 * Safe to run again: everything is looked up first and only created when
 * missing. Refuses a live key outright.
 *
 * Creates:
 *   - products Runko Start (runko_start) and Runko Pro (runko_pro)
 *   - four EUR prices, VAT included, found by lookup key:
 *       runko_start_monthly 7,99   runko_start_yearly 59,99
 *       runko_pro_monthly  12,99   runko_pro_yearly   89,99
 *   - coupon runko_ustanovni: -25 % for 12 months, at most 50 redemptions,
 *     and the promotion code USTANOVNI that customers type in Checkout
 *   - Customer Portal settings: switch between the four prices, cancel at
 *     the end of the paid period, update the card, see invoices
 *   - the webhook endpoint (when the Supabase URL is known: VITE_SUPABASE_URL
 *     in .env or SUPABASE_URL), printing its signing secret once
 */
import fs from 'node:fs'
import { stripeRequest, PRICES, FOUNDING, WEBHOOK_EVENTS, STRIPE_API_VERSION } from '../supabase/functions/_shared/stripe.js'

function envFile() {
  if (!fs.existsSync('.env')) return {}
  return Object.fromEntries(
    fs.readFileSync('.env', 'utf8').split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')])
  )
}

const KEY = process.env.STRIPE_SECRET_KEY
if (!KEY || !KEY.startsWith('sk_test_')) {
  console.error('Set STRIPE_SECRET_KEY to a TEST secret key (sk_test_...). Live keys are refused.')
  process.exit(1)
}
const SUPABASE_URL = process.env.SUPABASE_URL || envFile().VITE_SUPABASE_URL || ''
const APP_URL = process.env.APP_URL || 'https://runko-omega.vercel.app'

const stripe = (method, path, params) => stripeRequest(KEY, method, path, params)
const log = (...a) => console.log(' ', ...a)

async function ensureProduct(id, name, tier) {
  try {
    const p = await stripe('GET', `/products/${id}`)
    log(`product ${id}: exists`)
    return p
  } catch (err) {
    if (err.status !== 404) throw err
  }
  const p = await stripe('POST', '/products', { id, name, metadata: { tier } })
  log(`product ${id}: created`)
  return p
}

async function ensurePrice(lookupKey, { tier, interval, amount }) {
  const found = await stripe('GET', '/prices', { lookup_keys: [lookupKey], limit: 1 })
  if (found.data?.[0]) {
    log(`price ${lookupKey}: exists (${found.data[0].id})`)
    return found.data[0]
  }
  const price = await stripe('POST', '/prices', {
    product: `runko_${tier}`,
    currency: 'eur',
    unit_amount: amount,
    // Shown prices are final, VAT included. Stripe Tax is not configured yet;
    // this only records the intent, so turning Tax on later keeps the totals.
    tax_behavior: 'inclusive',
    recurring: { interval },
    lookup_key: lookupKey,
    nickname: `${tier === 'pro' ? 'Pro' : 'Start'} ${interval === 'year' ? 'letno' : 'mesečno'}`,
    metadata: { tier },
  })
  log(`price ${lookupKey}: created (${price.id})`)
  return price
}

async function ensureCoupon() {
  try {
    await stripe('GET', `/coupons/${FOUNDING.couponId}`)
    log(`coupon ${FOUNDING.couponId}: exists`)
  } catch (err) {
    if (err.status !== 404) throw err
    await stripe('POST', '/coupons', {
      id: FOUNDING.couponId,
      name: 'Ustanovni člani -25 %',
      percent_off: FOUNDING.percentOff,
      // Applies to every invoice in the first 12 months: twelve monthly
      // invoices, or the first yearly one. Then the regular price.
      duration: 'repeating',
      duration_in_months: FOUNDING.months,
      max_redemptions: FOUNDING.maxRedemptions,
    })
    log(`coupon ${FOUNDING.couponId}: created`)
  }
  const codes = await stripe('GET', '/promotion_codes', { code: FOUNDING.promoCode, limit: 1 })
  if (codes.data?.[0]) {
    log(`promotion code ${FOUNDING.promoCode}: exists`)
    return
  }
  await stripe('POST', '/promotion_codes', { coupon: FOUNDING.couponId, code: FOUNDING.promoCode })
  log(`promotion code ${FOUNDING.promoCode}: created`)
}

async function ensurePortal(prices) {
  const byProduct = {}
  for (const p of prices) (byProduct[p.product] ??= []).push(p.id)
  const params = {
    business_profile: { headline: 'Runko: tvoja naročnina' },
    default_return_url: `${APP_URL}/settings`,
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: false },
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        proration_behavior: 'create_prorations',
        products: Object.entries(byProduct).map(([product, ids]) => ({ product, prices: ids })),
      },
    },
  }
  const existing = await stripe('GET', '/billing_portal/configurations', { is_default: true, limit: 1 })
  const def = existing.data?.[0]
  if (def) {
    await stripe('POST', `/billing_portal/configurations/${def.id}`, params)
    log(`customer portal: default settings updated (${def.id})`)
    return null
  }
  const created = await stripe('POST', '/billing_portal/configurations', params)
  log(`customer portal: settings created (${created.id})`)
  return created.id
}

async function ensureWebhook() {
  if (!SUPABASE_URL) {
    log('webhook: skipped (no VITE_SUPABASE_URL in .env and no SUPABASE_URL set)')
    return null
  }
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/stripe-webhook`
  const list = await stripe('GET', '/webhook_endpoints', { limit: 100 })
  if (list.data?.some((w) => w.url === url)) {
    log(`webhook ${url}: exists (its signing secret is in the Stripe dashboard)`)
    return null
  }
  const hook = await stripe('POST', '/webhook_endpoints', {
    url,
    enabled_events: WEBHOOK_EVENTS,
    api_version: STRIPE_API_VERSION,
    description: 'Runko: subscriptions',
  })
  log(`webhook ${url}: created`)
  return hook.secret
}

console.log('Stripe test mode setup')
await ensureProduct('runko_start', 'Runko Start', 'start')
await ensureProduct('runko_pro', 'Runko Pro', 'pro')
const prices = []
for (const [key, info] of Object.entries(PRICES)) prices.push(await ensurePrice(key, info))
await ensureCoupon()
const portalConfig = await ensurePortal(prices)
const webhookSecret = await ensureWebhook()

console.log('\nDone. Next:')
if (webhookSecret) {
  console.log(`  npx supabase@latest secrets set STRIPE_WEBHOOK_SECRET=${webhookSecret}`)
}
if (portalConfig) {
  console.log(`  npx supabase@latest secrets set STRIPE_PORTAL_CONFIGURATION=${portalConfig}`)
}
console.log('  npx supabase@latest secrets set STRIPE_SECRET_KEY=<the same sk_test_ key>')
