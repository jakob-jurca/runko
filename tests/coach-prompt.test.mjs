// Coach persona + full-context assembly. Pure functions, no API calls.
import { detectLanguage, buildRunnerContext, buildCoachSystemPrompt, formatPace, weeksUntil } from '../src/core/coach-prompt.js'
import { check, summary } from './harness.mjs'


console.log('\nLanguage detection:')
for (const [t, want] of [
  ['Kako naj tečem jutri?', 'sl'],
  ['Koliko kilometrov naj naredim ta teden', 'sl'],
  ['boli me koleno', 'sl'],
  ['How should I pace my long run?', 'en'],
  ['Should I run today or rest', 'en'],
  ['', 'en'],
]) check(`"${t || '(empty)'}" → ${want}`, detectLanguage(t) === want)

console.log('\nPace + weeks helpers:')
check('5.7 min/km → 5:42', formatPace(5.7) === '5:42')
check('rounding 5.999 → 6:00 not 5:60', formatPace(5.999) === '6:00')
check('nonsense pace → null', formatPace(0) === null && formatPace(NaN) === null)
const today = new Date('2026-09-19T12:00:00')
check('4 weeks out', weeksUntil('2026-10-17', today) === 4)
check('past event is negative', weeksUntil('2026-09-05', today) < 0)

console.log('\nFull context — every required element present (part 3c):')
const profile = {
  name: 'Jakob', age: 38, weight: 74, fitness_level: 'intermediate',
  goal: 'event', target_distance_km: 42.2, target_time_min: 240, event_date: '2026-10-25',
  days_per_week: 4, available_days: ['Monday', 'Wednesday', 'Friday', 'Sunday'],
}
const memories = [
  { category: 'injury', content: 'Knee flares up on back-to-back running days' },
  { category: 'schedule', content: 'Only runs early mornings before work' },
]
const plans = [
  { week_number: 1, plan_json: { phase: 'build', focus: 'Raise threshold', is_recovery: false, days: [
    { day: 'Monday', type: 'easy', title: 'Easy Run', distance_km: 6, pace: '6:30/km', purpose: 'aerobic base' },
    { day: 'Tuesday', type: 'rest', title: 'Rest', distance_km: 0, pace: 'rest' },
    { day: 'Wednesday', type: 'tempo', title: 'Tempo', distance_km: 8, pace: '5:10/km', purpose: 'threshold' },
    { day: 'Thursday', type: 'rest', title: 'Rest', distance_km: 0, pace: 'rest' },
    { day: 'Friday', type: 'easy', title: 'Easy Run', distance_km: 6, pace: '6:30/km' },
    { day: 'Saturday', type: 'rest', title: 'Rest', distance_km: 0, pace: 'rest' },
    { day: 'Sunday', type: 'long', title: 'Long Run', distance_km: 18, pace: '6:20/km' },
  ] } },
  { week_number: 2, plan_json: { days: [] } },
]
const workouts = [
  { date: '2026-09-18', distance: 8, duration: 48, effort: 3, notes: '' },
  { date: '2026-09-16', distance: 0, duration: 0, effort: 1, notes: 'Missed, work' },
  { date: '2026-09-14', distance: 16, duration: 104, effort: 4, notes: '' },
]
// 2026-09-19 is a Saturday
const ctx = buildRunnerContext({ profile, memories, plans, currentWeek: 1, workouts, today })

const required = [
  ['name', 'Jakob'], ['age', '38'], ['weight', '74 kg'], ['level', 'intermediate'],
  ['goal distance as a number', 'Goal distance: 42.2 km'],
  ['target time with its pace', 'Target time: 4:00:00 (5:41/km)'],
  ['event date', 'Event date: 2026-10-25'],
  ['weeks until event', 'Weeks until it: 6'],
  ['days per week', 'Can run 4 days a week'],
  ['available days', 'Available days: Monday, Wednesday, Friday, Sunday'],
  ['memory: injury', 'Knee flares up'], ['memory: schedule', 'Only runs early mornings'],
  ['memory category tag', '[injury]'],
  ['current week', 'Week 1 of 2'], ['phase', 'build phase'],
  ["today's session", 'TODAY (Saturday)'],
  ['rest of week listed', 'Sunday: Long Run'],
  ['logged run with pace', '8 km in 48 min (6:00/km)'],
  ['missed run marked', 'MISSED / skipped'],
  ['7-day volume', 'Volume in the last 7 days'],
]
for (const [label, needle] of required) check(`context includes ${label}`, ctx.includes(needle))

console.log('\nContext degrades gracefully:')
const bare = buildRunnerContext({ profile: { name: 'Ana' }, today })
check('no plan → says so', bare.includes('No training plan yet'))
check('no memory → says so', bare.includes('Nothing yet'))
check('no runs → says so', bare.includes('Nothing logged yet'))
check('missing age not rendered as undefined', !bare.includes('undefined'))

console.log('\nSystem prompt assembly:')
const sys = buildCoachSystemPrompt({ context: ctx, knowledge: '', language: 'sl' })
check('carries the persona', sys.includes('You are Runko'))
check('bans markdown in replies', sys.includes('no bullet lists'))
check('caps reply length', sys.includes('Two or three sentences'))
check('bans moralising', sys.includes('Never moralise'))
check('caps emoji', sys.includes('At most one emoji'))
check('Slovenian hint applied', sys.includes('writing in Slovenian'))
check('runner context appended', sys.includes('# THIS RUNNER'))

export default summary('coach prompt')
