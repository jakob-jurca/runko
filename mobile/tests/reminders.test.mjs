import { check, summary } from '../../tests/harness.mjs'
import { buildReminders, describeWorkout, parseTime, formatTime, DEFAULT_REMINDERS, HARD_TYPES } from '../lib/reminders.js'

const week = [
  { day: 'Monday', type: 'easy', distance_km: 6, duration_range: { min: 35, max: 40 } },
  { day: 'Tuesday', type: 'rest' },
  { day: 'Wednesday', type: 'tempo', distance_km: 8, duration_range: { min: 40, max: 45 } },
  { day: 'Thursday', type: 'easy', distance_km: 5, duration_min: 30 },
  { day: 'Friday', type: 'rest' },
  { day: 'Saturday', type: 'long', distance_km: 14, duration_range: { min: 85, max: 95 } },
  { day: 'Sunday', type: 'easy', distance_km: 5, duration_min: 30 },
]
// Week 1 starts Monday 21 Sep 2026.
const plans = [1, 2].map((n) => ({ week_number: n, created_at: '2026-09-21T10:00:00', plan_json: { days: week } }))
const now = new Date(2026, 8, 22, 6, 0) // Tuesday 22 Sep, 06:00

const on = { morning: true, morningTime: '07:30', evening: false }
const morning = buildReminders(plans, on, now)
check('off by default: nothing scheduled', buildReminders(plans, DEFAULT_REMINDERS, now).length === 0)
check('default settings are all off', DEFAULT_REMINDERS.morning === false && DEFAULT_REMINDERS.evening === false && DEFAULT_REMINDERS.morningTime === '07:30')
check('no plan, no reminders', buildReminders([], on, now).length === 0)
check('rest days get no morning reminder', !morning.some((r) => r.date === '2026-09-22' || r.date === '2026-09-25'))
check('training days get one', morning.some((r) => r.date === '2026-09-23') && morning.length === 9)
const wed = morning.find((r) => r.date === '2026-09-23')
check('morning fires at the chosen time', wed.at.getHours() === 7 && wed.at.getMinutes() === 30)
check('body has type, distance and time range', wed.body === 'Tempo · 8 km · 40-45 min')
check('sorted soonest first', morning.every((r, i) => i === 0 || morning[i - 1].at <= r.at))

const later = buildReminders(plans, { ...on, morningTime: '18:05' }, now)
check('user-chosen time is used', later[0].at.getHours() === 18 && later[0].at.getMinutes() === 5)

const late = buildReminders(plans, on, new Date(2026, 8, 23, 8, 0)) // Wednesday 08:00
check('a time that has passed today is not scheduled', !late.some((r) => r.date === '2026-09-23'))

const evening = buildReminders(plans, { morning: false, morningTime: '07:30', evening: true }, now)
check('evening reminders only before hard sessions', evening.length === 4 && evening.every((r) => r.kind === 'evening'))
check('evening is the day before', evening[0].date === '2026-09-22' && evening[0].body.startsWith('Tempo'))
check('long run gets one on Friday', evening.some((r) => r.date === '2026-09-25' && r.body.startsWith('Dolgi')))
check('evening fires at 19:00', evening.every((r) => r.at.getHours() === 19 && r.at.getMinutes() === 0))
check('easy days get no evening reminder', !evening.some((r) => r.date === '2026-09-23'))

const both = buildReminders(plans, { morning: true, morningTime: '07:30', evening: true }, now)
check('both together', both.length === 13 && new Set(both.map((r) => r.id)).size === 13)

check('horizon is respected', buildReminders(plans, on, now, 3).length === 2)
check('time trial and race count as hard', HARD_TYPES.has('time_trial') && HARD_TYPES.has('race') && !HARD_TYPES.has('easy'))
check('minute-based sessions show an estimated distance', describeWorkout({ type: 'walk_run', distance_km: 3, time_based: true, duration_min: 30 }) === 'Hoja-tek · ~3 km · 30 min')
check('a day with no numbers still reads', describeWorkout({ type: 'cross' }) === 'Druga vadba')

check('time parsing', parseTime('06:05').hour === 6 && parseTime('06:05').minute === 5)
check('bad time falls back to 7:30', formatTime(parseTime('25:99')) === '07:30' && formatTime(parseTime('')) === '07:30')

export const result = summary('reminders')
