/**
 * logging.js — turning a planned workout into a logged one.
 *
 * Pure helpers, so the one-tap "done as planned" action and the pre-filled
 * form agree on exactly what a planned session means, and so both can be
 * tested without a database.
 *
 * Platform-agnostic (see ./README.md): no React, no DOM, no network.
 */
import { todayISO } from './dates.js'

/**
 * Perceived effort to assume when a runner says "done as planned" without
 * being asked. Taken from what the session actually demands: an easy run is
 * an easy run, a threshold session is genuinely hard. Anyone who felt
 * differently can still use the form.
 */
export const DEFAULT_EFFORT_BY_TYPE = {
  easy: 2,
  recovery: 2,
  long: 3,
  cross: 2,
  tempo: 4,
  interval: 4,
  repetition: 4,
  race: 5,
}

export const DEFAULT_EFFORT = 3

export function defaultEffortFor(type) {
  return DEFAULT_EFFORT_BY_TYPE[type] ?? DEFAULT_EFFORT
}

/**
 * The middle of a planned duration window, which is what someone who ran
 * "as planned" most likely took. Falls back to the point estimate.
 */
export function plannedDuration(day) {
  if (day?.duration_range?.min && day?.duration_range?.max) {
    return Math.round((day.duration_range.min + day.duration_range.max) / 2)
  }
  return Math.round(Number(day?.duration_min) || 0) || null
}

/**
 * The workout row for a planned session completed exactly as prescribed.
 *
 * @param {object} day - a day from plan_json
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} [opts.date] - defaults to today, in local time
 * @returns {object|null} null when the day is not something you can run
 */
export function plannedWorkoutRow(day, { userId, date = todayISO() } = {}) {
  if (!day || day.type === 'rest' || !(Number(day.distance_km) > 0)) return null
  return {
    user_id: userId,
    date,
    distance: Number(day.distance_km),
    duration: plannedDuration(day),
    effort: defaultEffortFor(day.type),
    notes: `${day.title || day.type} — opravljeno kot načrtovano`,
    source: 'manual',
  }
}

/**
 * Values to pre-fill the manual form with when it is opened from a card.
 * Strings, because they go straight into inputs.
 */
export function prefillFromPlan(day, date = todayISO()) {
  if (!day) return { distance: '', duration: '', effort: DEFAULT_EFFORT, date }
  return {
    distance: Number(day.distance_km) > 0 ? String(day.distance_km) : '',
    duration: plannedDuration(day) ? String(plannedDuration(day)) : '',
    effort: defaultEffortFor(day.type),
    date,
  }
}

/**
 * Is this date loggable? A run in the future has not happened yet, and
 * accepting one silently puts a workout on a day the dashboard will not show
 * as complete until that day arrives.
 *
 * @returns {{ok: boolean, reason?: 'future'|'invalid'}}
 */
export function validateLogDate(date, now = new Date()) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, reason: 'invalid' }
  return date > todayISO(now) ? { ok: false, reason: 'future' } : { ok: true }
}
