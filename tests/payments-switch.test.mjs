// PAYMENTS_ENABLED: everything works without Stripe while it is off, and the
// trial wording comes from one place for both states.
import fs from 'node:fs'
import { entitlementOf, chatLimit, reviewAllowed, planBuildStatus } from '../supabase/functions/_shared/entitlements.js'
import { trialCopy, PAYMENTS_LIVE } from '../src/core/pricing.js'
import { check, summary } from './harness.mjs'

const NOW = new Date('2026-10-03T10:00:00Z')
const days = (n) => new Date(NOW.getTime() + n * 86_400_000).toISOString()

console.log('\nPayments off: new signups get the 1-month no-card trial:')
const fresh = entitlementOf({ paymentsEnabled: false, profileExists: false, signedUpAt: days(-2) }, NOW)
check('signed up 2 days ago, onboarding not finished: trial (can reach onboarding)', fresh.tier === 'trial' && fresh.source === 'legacy_trial')
check('the month counts from signup', fresh.trialEndsAt?.startsWith(days(-2).slice(0, 4)) && new Date(fresh.trialEndsAt) > NOW)
check('signed up 40 days ago, never onboarded: trial over', entitlementOf({ paymentsEnabled: false, profileExists: false, signedUpAt: days(-40) }, NOW).tier === 'none')
check('profile exists: its own trial_end decides (the DB default)', entitlementOf({ paymentsEnabled: false, profileExists: true, trialEnd: days(20) }, NOW).tier === 'trial')
check('profile without a trial_end gets no invented one', entitlementOf({ paymentsEnabled: false, profileExists: true, trialEnd: null, signedUpAt: days(-1) }, NOW).tier === 'none')
check('trial over while payments are off: none (the app shows "coming soon")', entitlementOf({ paymentsEnabled: false, trialEnd: days(-1) }, NOW).tier === 'none')
check('payments on: no trial is invented before onboarding (the card trial is the way in)', entitlementOf({ paymentsEnabled: true, profileExists: false, signedUpAt: days(-2) }, NOW).tier === 'none')
check('the switch travels to the app', fresh.paymentsEnabled === false && entitlementOf({ paymentsEnabled: true }, NOW).paymentsEnabled === true)
check('default (no flag given) behaves as built: payments on', entitlementOf({}, NOW).paymentsEnabled === true)

console.log('\nPayments off: everything else works normally:')
check('trial: Pro features and limits (50 chats, weekly review)', chatLimit('trial') === 50 && reviewAllowed('trial'))
check('trial: plans rebuilt like Pro (no 1-plan cap)', planBuildStatus({ tier: 'trial', source: fresh.source, builds: [{ created_at: days(-1) }], now: NOW }).allowed)
check('creator still creator', entitlementOf({ paymentsEnabled: false, sub: { creator: true } }, NOW).tier === 'creator')
check('comped still Pro', entitlementOf({ paymentsEnabled: false, sub: { comped: true } }, NOW).tier === 'pro')

console.log('\nTrial wording, one place, both states:')
const off = trialCopy(false)
const live = trialCopy(true)
check('off: "1 mesec brezplačno, brez kartice"', off.short === '1 mesec brezplačno, brez kartice')
check('off: no "14 dni", no card, nothing charged', !JSON.stringify(off).includes('14 dni') && /brez kartice/.test(off.line) && /nič ne zaračuna/.test(off.line))
check('off: no "how to cancel" FAQ (nothing to cancel)', off.faqCancel === null)
check('live: 14 days, charged automatically, cancel FAQ', live.short === '14 dni brezplačno' && /samodejno/.test(live.line) && live.faqCancel)
check('both states have every key', Object.keys(off).sort().join() === Object.keys(live).sort().join())
check('tests run with payments off (no VITE_PAYMENTS_ENABLED)', PAYMENTS_LIVE === false)

const content = fs.readFileSync('src/landing/content.js', 'utf8')
check('landing copy has no hard-coded trial length', !/14 dni|1 mesec|Prvi mesec/.test(content.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')))
const { trust, pricing, faq, finalCta } = await import('../src/landing/content.js')
check('landing (off): trust strip', trust.items.some((i) => i.value === off.short))
check('landing (off): pricing intro, CTA and facts', pricing.intro === off.intro && pricing.trialCta === off.cta && pricing.facts[0].title === '1 mesec brezplačno')
check('landing (off): FAQ after the trial, no cancel question', faq.items.some((i) => i.q === off.faqAfter.q) && !faq.items.some((i) => i.q === live.faqCancel.q))
check('landing (off): final call', finalCta.text === off.finalCta)
check('landing keeps the real prices', /displayPrice/.test(fs.readFileSync('src/landing/sections/Pricing.jsx', 'utf8')))
check('index.html share text comes from trialCopy at build', fs.readFileSync('index.html', 'utf8').includes('%RUNKO_OG_DESCRIPTION%') && /trialCopy\(env\.VITE_PAYMENTS_ENABLED === 'true'\)/.test(fs.readFileSync('vite.config.js', 'utf8')))

console.log('\nNo Stripe needed while off:')
const access = fs.readFileSync('supabase/functions/_shared/access.ts', 'utf8')
check('server switch: PAYMENTS_ENABLED, off unless exactly "true"', /Deno\.env\.get\('PAYMENTS_ENABLED'\) === 'true'/.test(access))
check('access passes the switch, profile and signup time', /paymentsEnabled: paymentsEnabled\(\)/.test(access) && /profileExists: Boolean\(userRes\.data\)/.test(access) && /signedUpAt: user\.created_at/.test(access))
const billing = fs.readFileSync('supabase/functions/billing/index.ts', 'utf8')
check('billing answers payments_disabled before needing any Stripe secret', billing.indexOf("'payments_disabled'") > 0 && billing.indexOf("'payments_disabled'") < billing.indexOf("Deno.env.get('STRIPE_SECRET_KEY')"))
const hook = fs.readFileSync('supabase/functions/stripe-webhook/index.ts', 'utf8')
check('webhook: off -> 503 before reading any secret', hook.indexOf("PAYMENTS_ENABLED") > 0 && hook.indexOf("PAYMENTS_ENABLED") < hook.indexOf("STRIPE_WEBHOOK_SECRET')"))
check('trial reminder stays off while payments are', /TRIAL_REMINDER_ENABLED'\) === 'true' && Deno\.env\.get\('PAYMENTS_ENABLED'\) === 'true'/.test(fs.readFileSync('supabase/functions/trial-reminder/index.ts', 'utf8')))
const proxy = fs.readFileSync('supabase/functions/ai-proxy/index.ts', 'utf8')
check('ai-proxy: calm 402 wording while off', /ent\.paymentsEnabled\s*\?[\s\S]{0,120}:\s*'Tvoj brezplačni preizkus se je iztekel\. Plačljiva paketa prihajata kmalu\.'/.test(proxy))

console.log('\nNo payment buttons in the app while off:')
const paywall = fs.readFileSync('src/components/Paywall.jsx', 'utf8')
check('the paywall becomes "coming soon" (no Checkout, no portal)', /if \(!a\.paymentsEnabled\) return <ComingSoon/.test(paywall) && paywall.indexOf('return <ComingSoon') < paywall.indexOf('startCheckout(plan.tier'))
check('Settings hides Naročnina', /\{access\?\.paymentsEnabled && <Subscription access=\{access\} \/>\}/.test(fs.readFileSync('src/pages/Settings.jsx', 'utf8')))
check('no upgrade teaser or link while off', /if \(!access\?\.paymentsEnabled\) return null/.test(fs.readFileSync('src/components/WeeklyReview.jsx', 'utf8')) && /access\?\.paymentsEnabled && \(/.test(fs.readFileSync('src/pages/Chat.jsx', 'utf8')))
const sql = fs.readFileSync('supabase/migration_v9.sql', 'utf8').replace(/--[^\n]*/g, '')
check('migration_v9 keeps the 1-month trial default (v10 not part of this)', !/trial_end\s+drop\s+default/i.test(sql))

export default summary('payments-switch')
