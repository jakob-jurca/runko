/**
 * Which local notifications to schedule. Pure logic (no Expo imports), so it
 * is tested without a device: plans + settings + "now" in, a list of
 * one-shot reminders out.
 *
 * - Morning: on each training day, at the runner's chosen time (default 7:30),
 *   what is planned today: type, distance, time range.
 * - Evening: at 19:00 the day before a long run or a quality session.
 * Rest days get nothing. Both are off until the runner opts in.
 */
import { addDaysISO, todayISO, weekStartISO } from '../../src/core/dates.js'
import { t } from '../../src/core/strings.js'

export const DEFAULT_REMINDERS = { morning: false, morningTime: '07:30', evening: false }
export const EVENING_TIME = '19:00'
export const HORIZON_DAYS = 14

/** Long run and the quality sessions the evening reminder is for. */
export const HARD_TYPES = new Set(['long', 'tempo', 'interval', 'repetition', 'time_trial', 'race'])

/** "07:30" -> { hour: 7, minute: 30 }; anything invalid falls back to 7:30. */
export function parseTime(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text ?? '').trim())
  if (!m) return { hour: 7, minute: 30 }
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (hour > 23 || minute > 59) return { hour: 7, minute: 30 }
  return { hour, minute }
}

export const formatTime = ({ hour, minute }) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** "Tempo · 8 km · 40-45 min" from a plan day. */
export function describeWorkout(day) {
  const type = capitalize(t.workout.types[day.type] || day.type)
  const distance = day.distance_km > 0 ? `${day.time_based && day.type !== 'race' ? '~' : ''}${day.distance_km} km` : null
  const time = day.duration_range
    ? `${day.duration_range.min}-${day.duration_range.max} min`
    : day.duration_min
      ? `${day.duration_min} min`
      : null
  return t.reminders.line(type, distance, time)
}

/** The plan day that falls on a calendar date, or null. */
export function dayOn(plans, iso) {
  for (const p of plans) {
    const start = weekStartISO(plans, p.week_number)
    for (let i = 0; i < 7; i++) {
      if (addDaysISO(start, i) === iso) return p.plan_json?.days?.[i] ?? null
    }
  }
  return null
}

const at = (iso, { hour, minute }) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, hour, minute, 0, 0)
}

/**
 * @returns {{id:string, kind:'morning'|'evening', date:string, at:Date, title:string, body:string}[]}
 *   only reminders still in the future, soonest first
 */
export function buildReminders(plans, settings = DEFAULT_REMINDERS, now = new Date(), horizonDays = HORIZON_DAYS) {
  if (!plans?.length || !(settings.morning || settings.evening)) return []
  const out = []
  const morningTime = parseTime(settings.morningTime)
  const eveningTime = parseTime(EVENING_TIME)
  const today = todayISO(now)
  for (let i = 0; i < horizonDays; i++) {
    const date = addDaysISO(today, i)
    if (settings.morning) {
      const day = dayOn(plans, date)
      if (day && day.type !== 'rest') {
        out.push({ id: `morning-${date}`, kind: 'morning', date, at: at(date, morningTime), title: t.reminders.morningTitle, body: describeWorkout(day) })
      }
    }
    if (settings.evening) {
      const tomorrow = dayOn(plans, addDaysISO(date, 1))
      if (tomorrow && HARD_TYPES.has(tomorrow.type)) {
        out.push({ id: `evening-${date}`, kind: 'evening', date, at: at(date, eveningTime), title: t.reminders.eveningTitle, body: describeWorkout(tomorrow) })
      }
    }
  }
  return out.filter((r) => r.at > now).sort((a, b) => a.at - b.at)
}
