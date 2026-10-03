// Weekly progress review: numbers by code, one AI call a week, stored by the
// server, never regenerated for the same week.
import fs from 'node:fs'
import { weekStats, hasSomethingToReview, reviewPrompt, normalizeReview, loadReview } from '../src/core/weekly-review.js'
import { previousLocalWeekKey, reviewAllowed } from '../supabase/functions/_shared/entitlements.js'
import { check, summary } from './harness.mjs'

// A two-week plan created on Monday 21 Sep 2026: week 1 = 21-27 Sep, week 2 = 28 Sep - 4 Oct.
const day = (d, type, km) => ({ day: d, type, distance_km: km })
const week = (n) => ({
  week_number: n,
  created_at: '2026-09-21T08:00:00',
  plan_json: {
    phase: 'base',
    days: [day('Monday', 'easy', 6), day('Tuesday', 'rest', 0), day('Wednesday', 'tempo', 8), day('Thursday', 'rest', 0),
      day('Friday', 'easy', 5), day('Saturday', 'rest', 0), day('Sunday', 'long', 12)],
  },
})
const plans = [week(1), week(2)]
const workouts = [
  { date: '2026-09-21', distance: 6, effort: 2 },
  { date: '2026-09-23', distance: 8.4, effort: 4 },
  { date: '2026-09-26', distance: 3, effort: 2 }, // Saturday: not planned
  { date: '2026-09-27', distance: 0, effort: 1 }, // logged as missed
  { date: '2026-09-29', distance: 7, effort: 2 }, // next week: not counted
]

console.log('\nPlanned vs done (code, not AI):')
const s = weekStats({ plans, workouts, weekStart: '2026-09-21' })
check('4 runs planned', s.plannedRuns === 4)
check('31 km planned', s.plannedKm === 31)
check('3 runs done (a missed log is not a run)', s.doneRuns === 3)
check('17.4 km done', s.doneKm === 17.4)
check('longest 8.4 km', s.longestKm === 8.4)
check('missed: Friday and Sunday', s.missed.length === 2 && s.missed[0].startsWith('Friday') && s.missed[1].startsWith('Sunday'))
check('one run outside the plan', s.extraRuns === 1)
check('one run felt hard', s.hardDone === 1)
check('the next week is not counted', weekStats({ plans, workouts, weekStart: '2026-09-21' }).doneKm < 20)
const empty = weekStats({ plans: [], workouts: [], weekStart: '2026-09-14' })
check('nothing planned or run: nothing to review (no AI call)', !hasSomethingToReview(empty))
check('something planned: review', hasSomethingToReview(s))

console.log('\nThe prompt and the result:')
const prompt = reviewPrompt(s, { name: 'Ana', nextWeek: plans[1].plan_json })
check('the prompt carries the numbers', prompt.includes('4 runs, 31 km') && prompt.includes('3 runs, 17.4 km'))
check('the prompt asks for JSON with summary, highlights, focus', /"summary": string, "highlights": string\[\], "focus": string/.test(prompt))
check('one concrete focus, short', /ONE concrete/.test(prompt) && /SHORT/.test(prompt))
check('no invented numbers', /never invent/.test(prompt))
const n = normalizeReview({ summary: ' Dober teden. ', highlights: ['a', 7, '', 'b', 'c'], focus: 'Lahkotno.', extra: 'x' })
check('normalize: trims, drops non-strings, keeps two highlights', n.summary === 'Dober teden.' && n.highlights.join() === 'a,b' && n.focus === 'Lahkotno.')
check('normalize: garbage is safe', normalizeReview('nope').summary === '' && normalizeReview(null).highlights.length === 0)

console.log('\nCaching: once a week, never regenerated:')
{
  const rows = new Map()
  let calls = 0
  const getStored = async (u, w) => rows.get(`${u}:${w}`) ?? null
  const write = async () => {
    calls++
    const content = { summary: 'Teden je bil dober.', highlights: ['Tempo je šel lepo.'], focus: 'Dolgi tek počasneje.' }
    rows.set('u1:2026-09-21', { status: 'ready', content }) // what the proxy stores
    return content
  }
  const input = { profile: { id: 'u1', name: 'Ana' }, plans, workouts, weekStart: '2026-09-21', getStored, write }
  const [a, b] = await Promise.all([loadReview(input), loadReview(input)])
  check('two loads at once: one AI call', calls === 1 && a.review.summary === b.review.summary)
  const c = await loadReview(input)
  check('a later load reads the stored review, no call', calls === 1 && c.review.focus === 'Dolgi tek počasneje.')
  check('the numbers come with it', c.stats.plannedRuns === 4)

  let never = 0
  const nothing = await loadReview({ ...input, profile: { id: 'u2' }, plans: [], workouts: [], weekStart: '2026-09-14', write: async () => { never++ } })
  check('nothing to review: no call, no card', nothing === null && never === 0)

  const pending = await loadReview({ ...input, profile: { id: 'u3' }, getStored: async () => ({ status: 'pending' }), write: async () => { never++ } })
  check('being written elsewhere: no second call', pending.review === null && never === 0)

  const other = new Map([['u4:2026-09-21', { status: 'ready', content: { summary: 'Iz drugega zavihka.' } }]])
  let first = true
  const raced = await loadReview({
    ...input,
    profile: { id: 'u4' },
    getStored: async (u, w) => (first ? ((first = false), null) : other.get(`${u}:${w}`)),
    write: async () => { const e = new Error('exists'); e.code = 'review_exists'; throw e },
  })
  check('another tab won the race: its review is shown', raced.review.summary === 'Iz drugega zavihka.')

  let failCalls = 0
  const failing = { ...input, profile: { id: 'u5' }, getStored: async () => null, write: async () => { failCalls++; throw new Error('down') } }
  let threw = false
  try { await loadReview(failing) } catch { threw = true }
  check('a failed call is reported (the card hides)', threw)
  try { await loadReview(failing) } catch { /* expected */ }
  check('and may be tried again later (the proxy released its claim)', failCalls === 2)
}

console.log('\nThe server side:')
check('Pro and trial only', reviewAllowed('pro') && reviewAllowed('trial') && !reviewAllowed('start'))
check('the reviewed week is the one before (Ljubljana)', previousLocalWeekKey(new Date('2026-09-28T08:00:00Z')) === '2026-09-21')
const proxy = fs.readFileSync('supabase/functions/ai-proxy/index.ts', 'utf8')
check('proxy: Start is refused (review_locked)', /if \(!reviewAllowed\(ent\.tier\)\)[\s\S]{0,120}review_locked/.test(proxy))
check('proxy: the week is claimed BEFORE the AI call', proxy.indexOf(".from('weekly_reviews')\n      .insert(") > 0 && proxy.indexOf(".from('weekly_reviews')\n      .insert(") < proxy.indexOf('await fetch(GROQ_URL'))
check('proxy: a second claim for the week is refused (409 review_exists)', /'23505'\) return fail\(409, [^)]*'review_exists'\)/.test(proxy))
check('proxy: the review is stored by the server', /\.update\(\{ status: 'ready', content: content \?\? \{\} \}\)/.test(proxy))
check('proxy: a failed call releases the claim', /if \(!upstream\.ok\) \{\s*await notBillable\(\)\s*await releaseReview\(\)/.test(proxy))
check('proxy: only a still-pending claim can be released', /delete\(\)\.eq\('user_id', user\.id\)\.eq\('week_start', reviewWeek\)\.eq\('status', 'pending'\)/.test(proxy))
const sql = fs.readFileSync('supabase/migration_v9.sql', 'utf8')
check('weekly_reviews: one row per runner and week', /primary key \(user_id, week_start\)/.test(sql))
check('weekly_reviews: runners read, never write', /create policy "own weekly reviews read" on public\.weekly_reviews\s+for select/.test(sql) && /revoke insert, update, delete on public\.weekly_reviews from anon, authenticated/.test(sql))
const ai = fs.readFileSync('src/core/ai.js', 'utf8')
check('the app stops on review_exists instead of trying another model', /'review_exists'/.test(ai.slice(0, ai.indexOf('function friendlyAiMessage'))))

export default summary('weekly-review')
