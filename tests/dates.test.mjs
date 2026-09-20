/**
 * Regression test for logged runs vanishing.
 *
 * The row always saved; the DATE on it was wrong. Calendar dates were built
 * with `new Date().toISOString()`, which is UTC, so in Slovenia (UTC+1/+2)
 * anything logged before 01:00 or 02:00 local was stamped with yesterday.
 * startOfWeekISO could also return the wrong Monday, shifting the whole
 * dashboard grid so the run never lined up with a day card — it looked like
 * the save had failed.
 *
 * These run under a fixed TZ so the bug cannot come back unnoticed.
 */
process.env.TZ = 'Europe/Ljubljana'

import { todayISO, startOfWeekISO, addDaysISO, weekStartISO } from '../src/core/dates.js'
import { check, summary } from './harness.mjs'

/** What the browser's own locale formatting says the local date is. */
const localDate = (d) => d.toLocaleDateString('sv-SE') // sv-SE is YYYY-MM-DD

console.log('\n=== TZ = Europe/Ljubljana ===')
console.log('    (the bug window is 00:00-02:00 local, when UTC is still yesterday)')

const moments = [
  '2026-07-21T09:00:00+02:00', // midday summer
  '2026-07-21T01:30:00+02:00', // after midnight, summer — UTC is still the 20th
  '2026-07-21T00:01:00+02:00', // one minute past midnight
  '2026-07-21T23:59:00+02:00', // one minute to midnight
  '2026-01-15T00:30:00+01:00', // after midnight, winter (UTC+1)
  '2026-01-15T23:30:00+01:00',
]
for (const iso of moments) {
  const now = new Date(iso)
  const want = localDate(now)
  const got = todayISO(now)
  check(`${iso} → logs as ${got} (local date ${want})`, got === want)
}

console.log('\n  the old UTC approach, for contrast:')
for (const iso of ['2026-07-21T01:30:00+02:00', '2026-01-15T00:30:00+01:00']) {
  const now = new Date(iso)
  const utc = now.toISOString().slice(0, 10)
  console.log(`    ${iso}  local ${localDate(now)}  vs UTC ${utc}  ${utc === localDate(now) ? '' : '<- would have been wrong'}`)
}

console.log('\n=== START OF WEEK IS THE LOCAL MONDAY ===')
for (const [iso, wantMonday] of [
  ['2026-07-21T09:00:00+02:00', '2026-07-20'], // Tue → Mon 20th
  ['2026-07-21T01:30:00+02:00', '2026-07-20'], // after midnight, same Monday
  ['2026-07-20T00:30:00+02:00', '2026-07-20'], // Monday itself, just past midnight
  ['2026-07-19T23:30:00+02:00', '2026-07-13'], // Sunday night → previous Monday
  ['2026-01-15T00:30:00+01:00', '2026-01-12'], // winter
]) {
  const got = startOfWeekISO(new Date(iso))
  check(`${iso} → week starts ${got}`, got === wantMonday)
}

console.log('\n=== A LOGGED RUN LANDS ON A DAY CARD ===')
// This is the end-to-end shape of the bug: the dashboard builds seven dates
// from the week start and matches logged runs by date string.
for (const iso of moments) {
  const now = new Date(iso)
  const logged = todayISO(now) // what Log.jsx writes
  const weekStart = startOfWeekISO(now) // what the dashboard grid starts from
  const dayDates = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i))
  check(`run logged at ${iso.slice(0, 16)} appears in its own week`, dayDates.includes(logged))
}

console.log('\n=== WEEK GRID STAYS ALIGNED ACROSS A DST CHANGE ===')
// Europe/Ljubljana springs forward on 2026-03-29.
const plans = [{ week_number: 1, created_at: '2026-03-23T10:00:00+01:00' }]
const w1 = weekStartISO(plans, 1)
const w2 = weekStartISO(plans, 2)
const w3 = weekStartISO(plans, 3)
console.log(`    week 1 ${w1} · week 2 ${w2} · week 3 ${w3}`)
check('week 1 starts on its Monday', w1 === '2026-03-23')
check('week 2 is exactly 7 days later, DST notwithstanding', w2 === '2026-03-30')
check('week 3 likewise', w3 === '2026-04-06')
check('every week start is a Monday', [w1, w2, w3].every((d) => new Date(d + 'T12:00:00').getDay() === 1))

console.log('\n=== addDaysISO is pure date arithmetic ===')
check('crosses a month boundary', addDaysISO('2026-01-31', 1) === '2026-02-01')
check('crosses a year boundary', addDaysISO('2026-12-31', 1) === '2027-01-01')
check('handles a leap day', addDaysISO('2028-02-28', 1) === '2028-02-29')
check('unaffected by the DST jump', addDaysISO('2026-03-28', 1) === '2026-03-29')
check('negative days work', addDaysISO('2026-03-01', -1) === '2026-02-28')

export default summary('dates')
