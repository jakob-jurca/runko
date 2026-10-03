// Chat and plan-build limits: the ai-proxy's decisions (pure functions in
// _shared/entitlements.js) and how the app shows them.
import fs from 'node:fs'
import {
  dailyLimitRefusal, chatLimitMessage, planBuildUsable, planBuildStatus, PLAN_BUILDS,
} from '../supabase/functions/_shared/entitlements.js'
import { slPlural, t } from '../src/core/strings.js'
import { check, summary } from './harness.mjs'

const SLOVENIAN = (s) => typeof s === 'string' && s.length > 0 && !/\b(the|you|your|limit|today|please)\b/i.test(s)

console.log('\nChat limit (checked in ai-proxy):')
check('Start: 10th message of the day goes through', dailyLimitRefusal({ kind: 'chat', tier: 'start', usedToday: 9 }) === null)
const start = dailyLimitRefusal({ kind: 'chat', tier: 'start', usedToday: 10 })
check('Start: 11th message refused, 429 chat_limit', start?.status === 429 && start.code === 'chat_limit' && start.limit === 10)
check('Start: the message mentions Pro', /Pro/.test(start.message) && /50/.test(start.message))
check('Start: the message is friendly Slovenian', SLOVENIAN(start.message) && /Jutri spet/.test(start.message))
check('Pro: 50th goes through', dailyLimitRefusal({ kind: 'chat', tier: 'pro', usedToday: 49 }) === null)
const pro = dailyLimitRefusal({ kind: 'chat', tier: 'pro', usedToday: 50 })
check('Pro: 51st refused, no upsell', pro?.code === 'chat_limit' && !/S paketom Pro/.test(pro.message))
check('trial: 50 a day', dailyLimitRefusal({ kind: 'chat', tier: 'trial', usedToday: 49 }) === null && dailyLimitRefusal({ kind: 'chat', tier: 'trial', usedToday: 50 }) !== null)
check('memory extraction stops with the chat', dailyLimitRefusal({ kind: 'memory', tier: 'start', usedToday: 10 })?.code === 'chat_limit')
check('other kinds have their own ceiling', dailyLimitRefusal({ kind: 'motd', tier: 'pro', usedToday: 5 })?.code === 'daily_limit')
check('plan calls are not counted per day (builds are)', dailyLimitRefusal({ kind: 'plan', tier: 'start', usedToday: 99 }) === null)
check('chatLimitMessage for trial has no upsell', !/Pro/.test(chatLimitMessage('trial')))

const proxy = fs.readFileSync('supabase/functions/ai-proxy/index.ts', 'utf8')
check('the proxy counts only billable calls of this kind since Ljubljana midnight',
  /\.eq\('kind', kind\)\s*\.eq\('billable', true\)\s*\.gte\('created_at', startOfLocalDay\(\)\.toISOString\(\)\)/.test(proxy))
check('a call refused upstream is marked not billable', /if \(!upstream\.ok\)[\s\S]{0,200}billable: false/.test(proxy))
const ai = fs.readFileSync('src/core/ai.js', 'utf8')
check('off-topic chat never reaches the proxy, so it never counts', /classifyCoachMessage\(lastUser\) === 'out'[\s\S]{0,120}return offTopicReply/.test(ai))
check('the app treats chat_limit as final and shows the proxy message', /FINAL_CODES = new Set\(\[[^\]]*'chat_limit'/.test(ai))

console.log('\nPlan builds (reserved by the entitlement function, checked in ai-proxy):')
const now = new Date('2026-10-03T10:00:00Z')
const at = (min) => new Date(now.getTime() + min * 60_000).toISOString()
check('a fresh build may make calls', planBuildUsable({ created_at: at(-1), ai_calls: 0 }, now))
check('no build: refused', !planBuildUsable(null, now))
check('an hour-old build: refused (no reusing a reservation)', !planBuildUsable({ created_at: at(-61), ai_calls: 0 }, now))
check(`at most ${PLAN_BUILDS.aiCallsPerBuild} calls per build`, planBuildUsable({ created_at: at(-1), ai_calls: PLAN_BUILDS.aiCallsPerBuild - 1 }, now) && !planBuildUsable({ created_at: at(-1), ai_calls: PLAN_BUILDS.aiCallsPerBuild }, now))
check('the proxy requires a build for kind plan', /if \(kind === 'plan'\)[\s\S]{0,400}plan_build_required/.test(proxy) && /planBuildUsable\(build\)/.test(proxy))
check('the build is looked up for THIS user only', /\.from\('plan_builds'\)[\s\S]{0,120}\.eq\('id', buildId\)\s*\.eq\('user_id', user\.id\)/.test(proxy))
check('Start: next build shown with its date', planBuildStatus({ tier: 'start', builds: [{ created_at: at(-60 * 24 * 3) }], now }).nextAt !== null)

const plan = fs.readFileSync('src/core/plan.js', 'utf8')
check('createInitialPlan reserves the build only after the pipeline', /runPlanningPipeline[\s\S]*reservePlanBuild\(\)[\s\S]*describePlanSkeleton\(skeleton, \{[^}]*buildId/.test(plan))
check('the plan call carries the build id', (ai.match(/extra: \{ build_id: buildId \}/g) || []).length === 2)
const entitlementFn = fs.readFileSync('supabase/functions/entitlement/index.ts', 'utf8')
check('a refused build answers 403 plan_limit with the date', /fail\(403, planLimitMessage\(planBuild\), 'plan_limit', \{ reason: planBuild\.reason, nextAt: planBuild\.nextAt \}\)/.test(entitlementFn))

console.log('\nWhat the runner reads:')
check('plural: 1 sporočilo', slPlural(1, ['sporočilo', 'sporočili', 'sporočila', 'sporočil']) === 'sporočilo')
check('plural: 2 sporočili', slPlural(2, ['sporočilo', 'sporočili', 'sporočila', 'sporočil']) === 'sporočili')
check('plural: 3 sporočila', slPlural(3, ['sporočilo', 'sporočili', 'sporočila', 'sporočil']) === 'sporočila')
check('plural: 5 sporočil', slPlural(5, ['sporočilo', 'sporočili', 'sporočila', 'sporočil']) === 'sporočil')
check('plural: 101 sporočilo', slPlural(101, ['sporočilo', 'sporočili', 'sporočila', 'sporočil']) === 'sporočilo')
const L = t.billing.limits
check('every limit line is Slovenian', [L.chatLeft(2), L.chatDone, L.chatMoreOnPro, L.planNext('1. november 2026'), L.planTrial, L.planFairUse, L.planMoreOnPro, L.planLimitTitle].every(SLOVENIAN))
const chat = fs.readFileSync('src/pages/Chat.jsx', 'utf8')
check('chat shows the count when 3 or fewer are left', /left !== null && left <= 3/.test(chat))
check('chat mentions Pro to Start runners at the limit', /limitReached && access\?\.tier === 'start'/.test(chat))
const onboarding = fs.readFileSync('src/pages/Onboarding.jsx', 'utf8')
check('a rebuild the plan does not allow yet says when, before any question', /rebuilding \? planBuildNote\(access\) : null/.test(onboarding))

export default summary('usage-limits')
