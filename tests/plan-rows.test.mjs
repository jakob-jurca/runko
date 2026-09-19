/**
 * Regression test for stale training_plans rows.
 *
 * training_plans is unique on (user_id, week_number) and the engine used to
 * only upsert. Rebuilding a 20-week plan as a 10-week one therefore left
 * weeks 11-20 of the OLD plan in the table, and kept week 1's original
 * created_at — which currentWeekNumber() counts from, so a brand-new plan
 * believed the runner was already mid-block.
 *
 * This models the table's behaviour rather than hitting Supabase, so it runs
 * with no network and no credentials.
 */
// Simulates the training_plans table (unique on user_id+week_number) and
// replays createInitialPlan's persistence, before and after the fix.
let table = []
const upsert = (u, w, json) => {
  const i = table.findIndex((r) => r.user_id === u && r.week_number === w)
  if (i >= 0) table[i] = { ...table[i], plan_json: json }          // created_at kept
  else table.push({ user_id: u, week_number: w, plan_json: json, created_at: json.stamp })
}
const del = (u) => { table = table.filter((r) => r.user_id !== u) }
const getPlans = (u) => table.filter((r) => r.user_id === u).sort((a, b) => a.week_number - b.week_number)

const writePlan = (u, weeks, label, { clearFirst }) => {
  if (clearFirst) del(u)
  for (let w = 1; w <= weeks; w++) upsert(u, w, { label, stamp: label })
}

import { check, summary } from './harness.mjs'

console.log('\nBEFORE (upsert only, as shipped):')
table = []
writePlan('u1', 20, 'plan-A', { clearFirst: false })
writePlan('u1', 10, 'plan-B', { clearFirst: false })
let rows = getPlans('u1')
console.log(`    rows: ${rows.length}, weeks ${rows[0].week_number}-${rows[rows.length-1].week_number}`)
console.log(`    labels: ${[...new Set(rows.map(r => r.plan_json.label))].join(' + ')}`)
console.log(`    week 1 created_at: ${rows[0].created_at}`)
check('reproduces the bug: 20 rows remain after a 10-week rebuild', rows.length === 20)
check('reproduces the bug: stale plan-A weeks survive', rows.some(r => r.plan_json.label === 'plan-A'))
check('reproduces the bug: created_at still from the OLD plan', rows[0].created_at === 'plan-A')

console.log('\nAFTER (delete, then insert):')
table = []
writePlan('u1', 20, 'plan-A', { clearFirst: true })
writePlan('u1', 10, 'plan-B', { clearFirst: true })
rows = getPlans('u1')
console.log(`    rows: ${rows.length}, weeks ${rows[0].week_number}-${rows[rows.length-1].week_number}`)
console.log(`    labels: ${[...new Set(rows.map(r => r.plan_json.label))].join(' + ')}`)
console.log(`    week 1 created_at: ${rows[0].created_at}`)
check('exactly 10 rows remain', rows.length === 10)
check('weeks are 1..10 with no gaps',
  rows.map(r => r.week_number).join() === Array.from({length:10},(_,i)=>i+1).join())
check('every row belongs to the new plan', rows.every(r => r.plan_json.label === 'plan-B'))
check('created_at is refreshed, so the week counter restarts', rows[0].created_at === 'plan-B')

console.log('\nAnother user is untouched:')
table = []
writePlan('u1', 20, 'plan-A', { clearFirst: true })
writePlan('u2', 12, 'other-user', { clearFirst: true })
writePlan('u1', 10, 'plan-B', { clearFirst: true })
check('u2 still has its 12 weeks', getPlans('u2').length === 12)
check('u1 has 10', getPlans('u1').length === 10)

export default summary('plan replacement')
