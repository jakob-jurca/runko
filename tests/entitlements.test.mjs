// Entitlements: the one rule the server enforces and the app displays
// (supabase/functions/_shared/entitlements.js). Pure, no network.
import fs from 'node:fs'
import {
  entitlementOf, planBuildStatus, dailyLimit, chatLimit, reviewAllowed, hasAccess, addMonths,
  startOfLocalDay, startOfNextLocalDay, localDateKey, localWeekKey, previousLocalWeekKey,
  TRIAL_GRACE_MS, AI_KINDS,
} from '../supabase/functions/_shared/entitlements.js'
import { check, summary } from './harness.mjs'

const NOW = new Date('2026-10-03T10:00:00Z')
const days = (n) => new Date(NOW.getTime() + n * 86_400_000).toISOString()

console.log('\nEntitlement states:')
check('no row, no old trial: none', entitlementOf({}, NOW).tier === 'none')
check('old no-card trial still running: trial', entitlementOf({ trialEnd: days(5) }, NOW).tier === 'trial')
check('old trial source is legacy_trial', entitlementOf({ trialEnd: days(5) }, NOW).source === 'legacy_trial')
check('old trial over: none (paywall)', entitlementOf({ trialEnd: days(-1) }, NOW).tier === 'none')
check('Stripe trialing: trial', entitlementOf({ sub: { status: 'trialing', tier: 'start', trial_end: days(10) } }, NOW).tier === 'trial')
check('trial keeps the chosen plan for after', entitlementOf({ sub: { status: 'trialing', tier: 'start', trial_end: days(10) } }, NOW).chosenTier === 'start')
check('trialing just past its end: still trial within the grace', entitlementOf({ sub: { status: 'trialing', tier: 'pro', trial_end: new Date(NOW - TRIAL_GRACE_MS / 2).toISOString() } }, NOW).tier === 'trial')
check('trialing long past its end: none', entitlementOf({ sub: { status: 'trialing', tier: 'pro', trial_end: days(-3) } }, NOW).tier === 'none')
check('active Start: start', entitlementOf({ sub: { status: 'active', tier: 'start' } }, NOW).tier === 'start')
check('active Pro: pro', entitlementOf({ sub: { status: 'active', tier: 'pro' } }, NOW).tier === 'pro')
check('active with an unknown tier: none', entitlementOf({ sub: { status: 'active', tier: 'gold' } }, NOW).tier === 'none')
for (const s of ['past_due', 'unpaid', 'incomplete']) {
  const e = entitlementOf({ sub: { status: s, tier: 'pro' } }, NOW)
  check(`${s}: none, payment problem flagged`, e.tier === 'none' && e.paymentFailed)
}
for (const s of ['canceled', 'incomplete_expired', 'paused']) {
  const e = entitlementOf({ sub: { status: s, tier: 'pro' } }, NOW)
  check(`${s}: none, no payment flag`, e.tier === 'none' && !e.paymentFailed)
}
check('comped: pro without paying', entitlementOf({ sub: { comped: true } }, NOW).tier === 'pro')
check('comped wins over a canceled subscription', entitlementOf({ sub: { comped: true, status: 'canceled' } }, NOW).comped === true)
check('active subscription wins over an old trial', entitlementOf({ trialEnd: days(5), sub: { status: 'active', tier: 'start' } }, NOW).tier === 'start')
check('a card trial is offered once', entitlementOf({ sub: { trial_used: true } }, NOW).trialAvailable === false)
check('a new account may start a trial', entitlementOf({}, NOW).trialAvailable === true)
check('canceled at period end is shown', entitlementOf({ sub: { status: 'active', tier: 'pro', cancel_at_period_end: true } }, NOW).cancelAtPeriodEnd)

console.log('\nFeature matrix:')
check('chat: Start 10 a day', chatLimit('start') === 10)
check('chat: Pro 50 a day', chatLimit('pro') === 50)
check('chat: trial 50 a day', chatLimit('trial') === 50)
check('chat: none 0', chatLimit('none') === 0)
check('memory follows the chat limit', dailyLimit('memory', 'start') === 10)
check('every other kind has a finite ceiling', ['reaction', 'motd', 'adapt'].every((k) => Number.isFinite(dailyLimit(k, 'start')) && dailyLimit(k, 'start') > 0))
check('plan and review are governed elsewhere', dailyLimit('plan', 'pro') === Infinity && dailyLimit('review', 'pro') === Infinity)
check('an unknown kind gets nothing', dailyLimit('essay', 'pro') === 0)
check('no access: no kind at all', AI_KINDS.every((k) => dailyLimit(k, 'none') === 0))
check('weekly review: Pro and trial only', reviewAllowed('pro') && reviewAllowed('trial') && !reviewAllowed('start') && !reviewAllowed('none'))
check('hasAccess', hasAccess('trial') && hasAccess('start') && hasAccess('pro') && !hasAccess('none') && !hasAccess(undefined))

console.log('\nPlan builds:')
const b = (...offsets) => offsets.map((d) => ({ created_at: days(d) }))
check('none: never', !planBuildStatus({ tier: 'none', now: NOW }).allowed)
check('Start, never built: allowed', planBuildStatus({ tier: 'start', builds: [], now: NOW }).allowed)
const startBlocked = planBuildStatus({ tier: 'start', builds: b(-10), now: NOW })
check('Start, built 10 days ago: blocked, monthly', !startBlocked.allowed && startBlocked.reason === 'monthly')
check('Start: next build a month after the last', startBlocked.nextAt === addMonths(new Date(days(-10)), 1).toISOString())
check('Start, built 32 days ago: allowed', planBuildStatus({ tier: 'start', builds: b(-32), now: NOW }).allowed)
check('Start counts from the NEWEST build', !planBuildStatus({ tier: 'start', builds: b(-60, -3), now: NOW }).allowed)
check('Pro: 4 today, allowed', planBuildStatus({ tier: 'pro', builds: b(0, 0, 0, 0), now: NOW }).allowed)
const proCap = planBuildStatus({ tier: 'pro', builds: b(0, 0, 0, 0, 0), now: NOW })
check('Pro: 5 today, fair-use cap', !proCap.allowed && proCap.reason === 'fair_use')
check('Pro: cap lifts at Ljubljana midnight', proCap.nextAt === startOfNextLocalDay(NOW).toISOString())
check('Pro: yesterday does not count', planBuildStatus({ tier: 'pro', builds: b(-1, -1, -1, -1, -1), now: NOW }).allowed)
check('trial: first plan allowed', planBuildStatus({ tier: 'trial', builds: [], now: NOW }).allowed)
const trialUsed = planBuildStatus({ tier: 'trial', builds: b(-2), trialStartedAt: days(-5), trialEndsAt: days(9), now: NOW })
check('trial: second plan blocked until the trial ends', !trialUsed.allowed && trialUsed.reason === 'trial_used' && trialUsed.nextAt === days(9))
check('trial: a build from before the trial does not count', planBuildStatus({ tier: 'trial', builds: b(-40), trialStartedAt: days(-5), now: NOW }).allowed)
check('old trial: every build counts', !planBuildStatus({ tier: 'trial', builds: b(-40), now: NOW }).allowed)
check('31 Jan + 1 month = 28 Feb', addMonths(new Date('2027-01-31T12:00:00Z'), 1).toISOString().startsWith('2027-02-28'))

console.log('\nLjubljana calendar (limits reset at local midnight):')
// Summer (UTC+2): 23:30 UTC on 3 Oct is already 4 Oct in Ljubljana.
check('late UTC evening is the next day in Ljubljana', localDateKey(new Date('2026-10-03T23:30:00Z')) === '2026-10-04')
check('summer midnight is 22:00 UTC', startOfLocalDay(new Date('2026-10-03T10:00:00Z')).toISOString() === '2026-10-02T22:00:00.000Z')
check('winter midnight is 23:00 UTC', startOfLocalDay(new Date('2026-12-03T10:00:00Z')).toISOString() === '2026-12-02T23:00:00.000Z')
check('next midnight, summer', startOfNextLocalDay(new Date('2026-10-03T10:00:00Z')).toISOString() === '2026-10-03T22:00:00.000Z')
check('next midnight across the October clock change', startOfNextLocalDay(new Date('2026-10-24T12:00:00Z')).toISOString() === '2026-10-24T22:00:00.000Z' &&
  startOfNextLocalDay(new Date('2026-10-25T12:00:00Z')).toISOString() === '2026-10-25T23:00:00.000Z')
check('00:30 local is after midnight', startOfLocalDay(new Date('2026-10-02T22:30:00Z')).toISOString() === '2026-10-02T22:00:00.000Z')
check('week starts on Monday (Sat 3 Oct 2026 -> 28 Sep)', localWeekKey(NOW) === '2026-09-28')
check('Sunday night UTC that is Monday in Ljubljana', localWeekKey(new Date('2026-10-04T22:30:00Z')) === '2026-10-05')
check('previous week', previousLocalWeekKey(NOW) === '2026-09-21')

console.log('\nCreator (set only by SQL):')
const creator = entitlementOf({ sub: { creator: true } }, NOW)
check('creator: own tier, never the paywall', creator.tier === 'creator' && hasAccess('creator'))
check('creator wins over comped and over a cancelled subscription', entitlementOf({ sub: { creator: true, comped: true, status: 'canceled' } }, NOW).tier === 'creator')
check('creator: no chat limit', chatLimit('creator') === Infinity && dailyLimit('chat', 'creator') === Infinity)
check('creator: no daily limit on any kind', AI_KINDS.every((k) => dailyLimit(k, 'creator') === Infinity))
check('creator: an unknown kind is still refused', dailyLimit('essay', 'creator') === 0)
check('creator: plan builds without limit or fair-use cap', planBuildStatus({ tier: 'creator', builds: b(0, 0, 0, 0, 0, 0, 0, 0, 0, 0), now: NOW }).allowed)
check('creator: weekly review always available', reviewAllowed('creator'))
check('comped is still Pro with Pro limits', entitlementOf({ sub: { comped: true } }, NOW).tier === 'pro' && chatLimit('pro') === 50)

console.log('\nOld no-card trial keeps building plans as before:')
check('old trial: a second plan is allowed (as it was)', planBuildStatus({ tier: 'trial', source: 'legacy_trial', builds: b(-3), now: NOW }).allowed)
check('old trial: only the hidden fair-use cap applies', !planBuildStatus({ tier: 'trial', source: 'legacy_trial', builds: b(0, 0, 0, 0, 0), now: NOW }).allowed)
check('card trial: still one plan', !planBuildStatus({ tier: 'trial', source: 'stripe', builds: b(-2), now: NOW }).allowed)

console.log('\nThe server uses it:')
const proxy = fs.readFileSync('supabase/functions/ai-proxy/index.ts', 'utf8')
check('ai-proxy reads access through _shared/access.ts', proxy.includes("from '../_shared/access.ts'") && /loadAccess\(admin, user\.id\)/.test(proxy))
check('ai-proxy refuses tier none with 402', /ent\.tier === 'none'[\s\S]{0,80}402/.test(proxy))
check('ai-proxy refuses an unknown kind', /AI_KINDS\.includes\(kind\)/.test(proxy))
check('ai-proxy counts today from Ljubljana midnight', /startOfLocalDay\(\)/.test(proxy))
check('ai-proxy no longer has its own trial rule', !/trial_end\s*\)\s*>/.test(proxy) && !/subscription_status === 'active'/.test(proxy))
const access = fs.readFileSync('supabase/functions/_shared/access.ts', 'utf8')
check('access.ts computes with entitlementOf', /entitlementOf\(/.test(access))
check('ai-proxy: the creator skips the hourly limit too', /RATE_LIMIT && !unlimited\(ent\.tier\)/.test(proxy))
const fn = fs.readFileSync('supabase/functions/entitlement/index.ts', 'utf8')
check('entitlement function passes the source (old trial rule)', /source: ent\.source/.test(fn))

console.log('\nMigration order (safe while the old app is live):')
const v9 = fs.readFileSync('supabase/migration_v9.sql', 'utf8').replace(/--[^\n]*/g, '')
const v10 = fs.readFileSync('supabase/migration_v10_cutover.sql', 'utf8').replace(/--[^\n]*/g, '')
check('v9 does not change the users table (the live app keeps working)', !/alter\s+table\s+public\.users/i.test(v9) && !/update\s+public\.users/i.test(v9))
check('v9 has no drop / rename / delete of anything the old app uses', !/\bdrop\s+(table|column)\b|\brename\b/i.test(v9) && !/delete\s+from\s+public\.(users|workouts|training_plans|chat_messages|coach_memory)/i.test(v9))
check('v9: creator column, client writes revoked', /creator boolean not null default false/.test(v9) && /revoke insert, update, delete on public\.subscriptions/.test(v9))
check('v10 ends the default no-card trial', /alter table public\.users alter column trial_end drop default/.test(v10))
const creatorSql = fs.readFileSync('set_creator.sql', 'utf8')
check('set_creator.sql sets creator for jakob.jurca@gmail.com only', /creator = true/.test(creatorSql) && /email = 'jakob\.jurca@gmail\.com'/.test(creatorSql) && !/comped = true/.test(creatorSql))

export default summary('entitlements')
