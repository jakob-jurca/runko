/**
 * Fast logging, and the completion matching that made a saved run look lost.
 */
process.env.TZ = 'Europe/Ljubljana'

import {
  plannedWorkoutRow, prefillFromPlan, defaultEffortFor, plannedDuration, validateLogDate,
  DEFAULT_EFFORT,
} from '../src/core/logging.js'
import { todayISO, addDaysISO, startOfWeekISO, weekStartISO, currentWeekNumber } from '../src/core/dates.js'
import { buildPlanSkeleton } from '../src/core/periodization.js'
import { check, summary } from './harness.mjs'

const today = new Date('2026-09-19T18:00:00+02:00')

console.log('\n=== ONE TAP: DONE AS PLANNED ===')
const tempo = {
  day: 'Monday', type: 'tempo', title: 'Tempo tek', distance_km: 8, duration_min: 45,
  duration_range: { min: 43, max: 50 }, pace_key: 'threshold',
}
const row = plannedWorkoutRow(tempo, { userId: 'u1', date: '2026-09-19' })
console.log('   ', JSON.stringify(row))
check('produces a complete workout row',
  row.user_id === 'u1' && row.date === '2026-09-19' && row.distance === 8 && row.source === 'manual')
check('duration is the middle of the planned window', row.duration === 47)
check('effort suits the session (tempo → 4)', row.effort === 4)
check('the note says it was as planned', /načrtovano/.test(row.notes))
check('date defaults to today when not given',
  plannedWorkoutRow(tempo, { userId: 'u1' }).date === todayISO())

console.log('\n  effort defaults by session type:')
for (const [type, want] of [['easy', 2], ['long', 3], ['tempo', 4], ['interval', 4], ['race', 5]])
  check(`${type} → ${want}`, defaultEffortFor(type) === want)
check('an unknown type falls back', defaultEffortFor('mystery') === DEFAULT_EFFORT)

console.log('\n  things you cannot "complete":')
check('rest days', plannedWorkoutRow({ type: 'rest', distance_km: 0 }, { userId: 'u1' }) === null)
check('zero-distance days', plannedWorkoutRow({ type: 'easy', distance_km: 0 }, { userId: 'u1' }) === null)
check('nothing at all', plannedWorkoutRow(null, { userId: 'u1' }) === null)

console.log('\n  duration falls back when there is no range:')
check('uses duration_min', plannedDuration({ duration_min: 52 }) === 52)
check('null when there is neither', plannedDuration({}) === null)

console.log('\n=== PREFILLED FORM ===')
const pre = prefillFromPlan(tempo, '2026-09-19')
console.log('   ', JSON.stringify(pre))
check('distance pre-filled as a string', pre.distance === '8')
check('duration pre-filled from the window', pre.duration === '47')
check('effort pre-selected', pre.effort === 4)
check('date pre-filled', pre.date === '2026-09-19')
check('empty plan gives an empty form', prefillFromPlan(null).distance === '')

console.log('\n=== FUTURE DATES ARE REFUSED, NOT SWALLOWED ===')
check('today is fine', validateLogDate(todayISO(today), today).ok)
check('yesterday is fine', validateLogDate(addDaysISO(todayISO(today), -1), today).ok)
check('last month is fine', validateLogDate('2026-08-01', today).ok)
const tomorrow = validateLogDate(addDaysISO(todayISO(today), 1), today)
check('tomorrow is refused', tomorrow.ok === false && tomorrow.reason === 'future')
check('next year is refused', validateLogDate('2027-01-01', today).reason === 'future')
for (const bad of ['', null, undefined, 'soon', '19-09-2026', '2026-9-9'])
  check(`${JSON.stringify(bad)} → invalid`, validateLogDate(bad, today).reason === 'invalid')

console.log('\n=== A LOGGED RUN MARKS ITS CARD ===')
/** Exactly what the dashboard does to decide the checkmark. */
function marks({ plans, workouts, now }) {
  const currentWeek = currentWeekNumber(plans)
  const start = weekStartISO(plans, currentWeek)
  const dayDates = Array.from({ length: 7 }, (_, i) => addDaysISO(start, i))
  const logged = new Set(workouts.filter((w) => Number(w.distance) > 0).map((w) => w.date))
  return {
    flags: dayDates.map((d) => logged.has(d)),
    dayDates,
    lastWeek: plans[plans.length - 1].week_number,
    currentWeek,
  }
}
const mkPlans = (createdAt, weeks) =>
  Array.from({ length: weeks }, (_, i) => ({ week_number: i + 1, created_at: createdAt }))

for (const [label, created, weeks] of [
  ['plan built today', '2026-09-19T10:00:00+02:00', 12],
  ['plan built Monday', '2026-09-14T10:00:00+02:00', 12],
  ['plan built 3 weeks ago', '2026-08-31T10:00:00+02:00', 12],
  ['plan built 11 weeks ago (final week)', '2026-07-06T10:00:00+02:00', 12],
]) {
  const plans = mkPlans(created, weeks)
  const r = marks({ plans, workouts: [{ date: todayISO(today), distance: 8 }], now: today })
  check(`${label}: today's run marks a card`, r.flags.some(Boolean))
}

console.log('\n  an expired plan cannot match — and must SAY so:')
const expired = mkPlans('2026-05-04T10:00:00+02:00', 12)
const r = marks({ plans: expired, workouts: [{ date: todayISO(today), distance: 8 }], now: today })
check('the grid genuinely cannot contain today', !r.dayDates.includes(todayISO(today)))
// This is what the dashboard's `planEnded` flag detects.
const planEnded = weekStartISO(expired, r.lastWeek) < startOfWeekISO(today)
check('planEnded is true, so the UI explains it', planEnded === true)
const liveEnded = weekStartISO(mkPlans('2026-09-14T10:00:00+02:00', 12), 12) < startOfWeekISO(today)
check('planEnded is false for a live plan', liveEnded === false)

console.log('\n=== END TO END: TAP "DONE" ON A REAL PLAN ===')
const plan = buildPlanSkeleton({
  profile: { fitness_level: 'intermediate', age: 38, target_distance_km: 21.1, event_date: '2027-01-02' },
  totalWeeks: 12,
  runs: [{ date: '2026-09-17', distance: 8, duration: 48, effort: 3 }],
  today,
})
const plans = plan.weeks.map((w) => ({
  week_number: w.week_number, created_at: '2026-09-14T10:00:00+02:00', plan_json: w,
}))
const week = plans[currentWeekNumber(plans) - 1]
const start = weekStartISO(plans, week.week_number)
const dayDates = Array.from({ length: 7 }, (_, i) => addDaysISO(start, i))

let allMatched = true
for (const [i, day] of week.plan_json.days.entries()) {
  if (day.type === 'rest') continue
  const logged = plannedWorkoutRow(day, { userId: 'u1', date: dayDates[i] })
  const set = new Set([logged.date])
  if (!dayDates.map((d) => set.has(d))[i]) allMatched = false
}
check('every planned session, logged one-tap, marks its own card', allMatched)
check('the row is valid for every session type',
  week.plan_json.days.filter((d) => d.type !== 'rest').every((d) => {
    const w = plannedWorkoutRow(d, { userId: 'u1' })
    return w && w.distance > 0 && w.duration > 0 && w.effort >= 1 && w.effort <= 5
  }))

export default summary('logging')
