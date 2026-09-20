/**
 * dates.js — calendar-date arithmetic, in the runner's own timezone.
 *
 * Split out from db.js because these are pure functions with no dependency
 * on Supabase, which makes them testable with plain Node — and this is code
 * that earned a test: getting it wrong silently filed runs on the wrong day.
 *
 * Platform-agnostic (see ./README.md): no React, no DOM, no network.
 */

/**
 * Today's date in the runner's OWN timezone, as yyyy-mm-dd.
 *
 * `new Date().toISOString()` is UTC. In Slovenia (UTC+1/+2) that means every
 * run logged before 01:00 or 02:00 local was stamped with YESTERDAY's date,
 * and startOfWeekISO could return the wrong Monday — so the row saved fine
 * but the dashboard was looking at a different day and showed nothing. Every
 * calendar date in the app must come from here.
 */
export function todayISO(d = new Date()) {
  const date = new Date(d)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** ISO date (yyyy-mm-dd) of the Monday of the current week, in local time. */
export function startOfWeekISO(d = new Date()) {
  const date = new Date(d)
  const day = (date.getDay() + 6) % 7 // Mon=0 … Sun=6
  date.setDate(date.getDate() - day)
  return todayISO(date)
}

/** ISO date `days` days after `iso`. */
export function addDaysISO(iso, days) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Calendar Monday a given plan week starts on. Week 1 = the Monday of the
 * week the plan was created in, each following week 7 days later.
 */
export function weekStartISO(plans, weekNumber) {
  if (!plans?.length) return startOfWeekISO()
  const first = plans[0]
  const base = startOfWeekISO(first.created_at ? new Date(first.created_at) : new Date())
  return addDaysISO(base, (weekNumber - first.week_number) * 7)
}

/**
 * Which week of the plan is the runner in right now?
 * Week 1 is the calendar week the plan was created in (created_at of the
 * first row); clamped to the last generated week so a lapsed plan still
 * shows something sensible.
 */
export function currentWeekNumber(plans) {
  if (!plans?.length) return 1
  const first = plans[0]
  const lastWeek = plans[plans.length - 1].week_number
  if (!first.created_at) return lastWeek
  const start = new Date(startOfWeekISO(new Date(first.created_at)))
  const now = new Date(startOfWeekISO())
  const elapsed = Math.round((now - start) / (7 * 86_400_000))
  return Math.min(Math.max(first.week_number + elapsed, 1), lastWeek)
}
