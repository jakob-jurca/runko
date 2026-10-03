/**
 * health-break.js — "Poškodba / bolezen": rest now, then a gradual return.
 *
 * Pure code, no AI. The runner says what happened (injury, illness, other)
 * and for how many days they cannot train; the plan changes at once:
 *
 *   1. Rest window: every day from today for `days` days is a rest day.
 *   2. Return window: easy running only, starting at a fraction of each
 *      planned run and growing back to the full run by its end. Quality
 *      sessions (tempo, intervals, repetitions, time trials) become easy runs.
 *
 * Lengths follow the comeback rules the plan engine already uses
 * (planning/returning.js, Daniels' categories and the research's injury
 * return): a few days off need only a few easy days; longer breaks restart at
 * 50 % (6-28 days) or 33 % (more) of the old volume.
 *
 * Safety: the result never asks for more than the original plan did. No day
 * gets longer, no rest day gets a run, no week gets more kilometres, no hard
 * session appears, and walk-run (minute-based) days keep their ladder.
 * Weeks touched by a break are no longer rewritten by the AI adaptation
 * (planning/guard.js isAdaptable), so nothing undoes this later.
 * tests/health-break.test.mjs checks all of it against generated plans.
 */
import { addDaysISO } from './dates.js'
import { returnStartFactor } from './planning/returning.js'
import { enrichDays, formatPace, roundKm } from './periodization.js'

export const BREAK_KINDS = ['injury', 'illness', 'other']
export const MIN_BREAK_DAYS = 1
export const MAX_BREAK_DAYS = 60
/** Over this many days, or with strong pain, the runner is told to see a doctor. */
export const DOCTOR_AFTER_DAYS = 14

const HARD = new Set(['tempo', 'interval', 'repetition', 'time_trial'])
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const REST_TITLE = { injury: 'Počitek (poškodba)', illness: 'Počitek (bolezen)', other: 'Počitek' }

/** Days of easy running after the break: longer for longer breaks and for injuries. */
export function returnDays(days, kind) {
  const injury = kind === 'injury'
  if (days <= 3) return injury ? 5 : 3
  if (days <= 7) return injury ? 10 : 7
  if (days <= 14) return 14
  if (days <= 28) return 21
  return 28
}

/** Share of each planned run on the first day back. */
export function startFactor(days, kind) {
  if (days <= 5) return kind === 'injury' ? 0.5 : 0.6
  return returnStartFactor(days) // 0.5 for 6-28 days, 0.33 beyond
}

/** Should the runner be told, calmly, to see a doctor? */
export const doctorAdvised = ({ days, strongPain }) => Boolean(strongPain) || days > DOCTOR_AFTER_DAYS

export function validateBreak({ kind, days }) {
  return BREAK_KINDS.includes(kind) && Number.isInteger(days) && days >= MIN_BREAK_DAYS && days <= MAX_BREAK_DAYS
}

/** The dates of the break: last rest day and last day of the return. */
export function breakWindow({ startDate, days, kind }) {
  const restEnd = addDaysISO(startDate, days - 1)
  const returnUntil = addDaysISO(restEnd, returnDays(days, kind))
  return { startDate, restEnd, returnUntil }
}

function restDay(day, kind) {
  return {
    day: day.day,
    type: 'rest',
    title: REST_TITLE[kind] || REST_TITLE.other,
    distance_km: 0,
    duration_min: 0,
    pace: 'rest',
    pace_key: null,
    intensity: 'rest',
    segments: [],
    is_segmented: false,
    health_break: 'rest',
  }
}

/** An easy run of `km` in place of `day`, never longer than it was. */
function easyDay(day, km, paces, age) {
  const easyMin = paces?.easy?.min_per_km ?? paces?.easy ?? null
  const base = {
    day: day.day,
    type: 'easy',
    title: 'Lahkoten tek (vrnitev)',
    distance_km: km,
    hard_km: 0,
    duration_min: easyMin ? Math.round(km * easyMin) : day.duration_min ? Math.round((day.duration_min * km) / (day.distance_km || km)) : 0,
    pace: easyMin ? `${formatPace(easyMin)}/km` : day.pace,
    pace_key: 'easy',
    pace_label: 'lahkotno',
    intensity: 'easy',
    segments: [],
    is_segmented: false,
    health_break: 'return',
  }
  if (!easyMin) return base
  const enriched = enrichDays([base], { easy: easyMin }, age)[0]
  return { ...enriched, segments: [], is_segmented: false }
}

/**
 * Change the plan for a break.
 *
 * @param {object} input
 * @param {Array<{week_number: number, plan_json: object, start: string}>} input.weeks -
 *   the plan's weeks, each with the ISO date of its Monday
 * @param {'injury'|'illness'|'other'} input.kind
 * @param {number} input.days - days without training, from startDate
 * @param {string} input.startDate - ISO date, normally today
 * @param {number|null} [input.age] - for heart rates on the new easy runs
 * @returns {{changed: Array<{week_number: number, plan_json: object}>, window: object, raceAtRisk: boolean}}
 */
export function applyHealthBreak({ weeks, kind, days, startDate, age = null }) {
  const window = breakWindow({ startDate, days, kind })
  const returnLength = returnDays(days, kind)
  const first = startFactor(days, kind)
  let raceAtRisk = false
  const changed = []

  for (const week of weeks) {
    const original = week.plan_json || {}
    const dayList = original.days || []
    let touched = false

    const newDays = dayList.map((d, i) => {
      const date = addDaysISO(week.start, DAY_NAMES.indexOf(d.day) >= 0 ? DAY_NAMES.indexOf(d.day) : i)
      if (date < window.startDate || date > window.returnUntil) return d

      if (date <= window.restEnd) {
        if (d.type === 'race') raceAtRisk = true
        touched = true
        return d.type === 'rest' ? { ...d, health_break: 'rest' } : restDay(d, kind)
      }

      // Return window.
      if (d.type === 'rest') return d
      if (d.type === 'race') {
        raceAtRisk = true
        return d
      }
      touched = true
      // Walk-run and minute-based days already are easy and follow a ladder.
      if (d.time_based) return { ...d, health_break: 'return' }
      const dayIndex = Math.round((new Date(date) - new Date(addDaysISO(window.restEnd, 1))) / 86_400_000)
      const factor = Math.min(1, first + ((1 - first) * dayIndex) / Math.max(1, returnLength))
      const planned = Number(d.distance_km) || 0
      const km = Math.min(planned, Math.max(1, roundKm(planned * factor)))
      if (!HARD.has(d.type) && km >= planned) return { ...d, health_break: 'return' }
      return easyDay(d, km, original.paces, age)
    })

    if (!touched) continue
    changed.push({
      week_number: week.week_number,
      plan_json: {
        ...original,
        days: newDays,
        target_volume_km: Math.round(newDays.reduce((s, d) => s + (Number(d.distance_km) || 0), 0) * 10) / 10,
        // Read by the coach's context, the dashboard and guard.isAdaptable.
        health_break: { kind, start: window.startDate, rest_until: window.restEnd, return_until: window.returnUntil },
      },
    })
  }

  return { changed, window, raceAtRisk }
}
