// What the paywall and the landing page promise must be what Stripe charges
// and what the server allows (src/core/pricing.js vs _shared/stripe.js and
// _shared/entitlements.js).
import fs from 'node:fs'
import { PLAN_PRICES, FEATURES, displayPrice, perMonthOfYear, yearlySavingPct, euros, TRIAL_DAYS, TRIAL_LINE } from '../src/core/pricing.js'
import { PRICES, TRIAL_DAYS as STRIPE_TRIAL_DAYS } from '../supabase/functions/_shared/stripe.js'
import { CHAT_PER_DAY, PLAN_BUILDS, reviewAllowed } from '../supabase/functions/_shared/entitlements.js'
import { check, summary } from './harness.mjs'

console.log('\nPrices:')
for (const [key, p] of Object.entries(PRICES)) {
  check(`${key}: the page shows what Stripe charges`, PLAN_PRICES[p.tier][p.interval] === p.amount)
}
check('Start monthly 7,99 €', euros(PLAN_PRICES.start.month) === '7,99 €')
check('Pro monthly 12,99 €', euros(PLAN_PRICES.pro.month) === '12,99 €')
check('Start yearly shown as 5,00 €/mes', perMonthOfYear('start') === '5,00 €')
check('Pro yearly shown as 7,50 €/mes', perMonthOfYear('pro') === '7,50 €')
check('Start yearly saves 37 %', yearlySavingPct('start') === 37)
check('Pro yearly saves 42 %', yearlySavingPct('pro') === 42)
check('yearly display carries the saving and the yearly amount', displayPrice('pro', 'year').saving === '-42 %' && displayPrice('pro', 'year').billed === '89,99 € letno')
check('monthly display has no saving', displayPrice('start', 'month').saving === null && displayPrice('start', 'month').main === '7,99 €')
check('trial is 14 days everywhere', TRIAL_DAYS === 14 && STRIPE_TRIAL_DAYS === 14 && TRIAL_LINE.includes('14 dni'))

console.log('\nFeature matrix matches the server:')
const f = Object.fromEntries(FEATURES.map((x) => [x.key, x]))
check('chat: Start 10 a day', f.chat.start.startsWith(`${CHAT_PER_DAY.start} `))
check('chat: Pro 50 a day', f.chat.pro.startsWith(`${CHAT_PER_DAY.pro} `))
check('new plan: Start once a month', PLAN_BUILDS.startMonths === 1 && /1-krat na mesec/.test(f.rebuild.start))
check('new plan: Pro unlimited (fair use stays hidden)', f.rebuild.pro === 'Neomejeno' && !/5/.test(f.rebuild.pro))
check('weekly review: Pro only', f.review.pro === true && f.review.start === false && reviewAllowed('pro') && !reviewAllowed('start'))
check('plan + adjustment and the injury button on both', f.plan.start && f.plan.pro && f.injury.start && f.injury.pro)

console.log('\nThe paywall:')
const paywall = fs.readFileSync('src/components/Paywall.jsx', 'utf8')
check('yearly is preselected', /useState\('year'\)/.test(paywall))
check('yearly first, monthly second', paywall.indexOf("id: 'year'") < paywall.indexOf("id: 'month'"))
check('two plans', (fs.readFileSync('src/core/pricing.js', 'utf8').match(/tier: '(start|pro)', name:/g) || []).length === 2)
check('the trial line is shown', paywall.includes('TRIAL_LINE'))
const app = fs.readFileSync('src/App.jsx', 'utf8')
check('no access: the paywall and nothing else (app routes)', /if \(!canUseApp\(access\)\) return <Paywall \/>[\s\S]*if \(!profile\) return <Navigate to="\/onboarding"/.test(app))
check('no access: the paywall before onboarding too', (app.match(/if \(!canUseApp\(access\)\) return <Paywall \/>/g) || []).length >= 2)

console.log('\nNo free tier is left:')
for (const file of ['src/pages/Dashboard.jsx', 'src/pages/Log.jsx', 'src/pages/Chat.jsx', 'src/pages/Plan.jsx', 'src/core/plan.js']) {
  const body = fs.readFileSync(file, 'utf8')
  check(`${file}: no premium branch`, !/hasPremium|premium \?|!premium|t\.paywall\./.test(body))
}

export default summary('pricing')
