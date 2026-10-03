/**
 * weekly-review.js — the numbers and the prompt for the weekly progress
 * review (Pro and trial). Pure: no database, no AI.
 *
 * The numbers (what was planned, what was done) are counted here, by code,
 * and shown as they are; the AI only writes the words around them: a short
 * summary, a highlight or two, and ONE concrete focus for the coming week.
 * The ai-proxy allows one review per runner per week and stores it
 * (weekly_reviews), so it is never generated twice.
 */
import { addDaysISO, weekStartISO } from './dates.js'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/**
 * Planned vs done for the week starting `weekStart` (an ISO Monday).
 * @returns {{weekStart: string, plannedRuns: number, doneRuns: number, plannedKm: number,
 *   doneKm: number, longestKm: number, missed: string[], extraRuns: number, hardDone: number}}
 */
export function weekStats({ plans = [], workouts = [], weekStart }) {
  const weekEnd = addDaysISO(weekStart, 6)
  const planned = []
  for (const row of plans) {
    const start = weekStartISO(plans, row.week_number)
    for (const [i, d] of (row.plan_json?.days || []).entries()) {
      const date = addDaysISO(start, DAY_NAMES.indexOf(d.day) >= 0 ? DAY_NAMES.indexOf(d.day) : i)
      if (date >= weekStart && date <= weekEnd && d.type !== 'rest') planned.push({ date, day: d })
    }
  }
  const runs = workouts.filter((w) => w.date >= weekStart && w.date <= weekEnd && Number(w.distance) > 0)
  const runDates = new Set(runs.map((w) => w.date))
  const round = (n) => Math.round(n * 10) / 10
  return {
    weekStart,
    plannedRuns: planned.length,
    doneRuns: runs.length,
    plannedKm: round(planned.reduce((s, p) => s + (Number(p.day.distance_km) || 0), 0)),
    doneKm: round(runs.reduce((s, w) => s + Number(w.distance), 0)),
    longestKm: round(Math.max(0, ...runs.map((w) => Number(w.distance)))),
    missed: planned.filter((p) => !runDates.has(p.date)).map((p) => `${p.day.day} (${p.day.type})`),
    extraRuns: runs.filter((w) => !planned.some((p) => p.date === w.date)).length,
    hardDone: runs.filter((w) => Number(w.effort) >= 4).length,
  }
}

/** Nothing planned and nothing run: there is nothing to review, so no AI call. */
export const hasSomethingToReview = (s) => s.plannedRuns > 0 || s.doneRuns > 0

/** The single prompt of the week. */
export function reviewPrompt(stats, { name = '', nextWeek = null, healthBreak = null } = {}) {
  const lines = [
    `Runner: ${name || 'not given'}.`,
    `Week reviewed: ${stats.weekStart} (Monday) to ${addDaysISO(stats.weekStart, 6)}.`,
    `Planned: ${stats.plannedRuns} runs, ${stats.plannedKm} km. Done: ${stats.doneRuns} runs, ${stats.doneKm} km.`,
    `Longest run: ${stats.longestKm} km. Runs that felt hard (effort 4-5): ${stats.hardDone}. Runs outside the plan: ${stats.extraRuns}.`,
    `Planned sessions missed: ${stats.missed.length ? stats.missed.join(', ') : 'none'}.`,
  ]
  if (nextWeek?.days?.length) {
    lines.push(
      `Next week: ${nextWeek.phase || 'n/a'} phase${nextWeek.is_recovery ? ', recovery week' : ''}, ` +
        `${nextWeek.days.filter((d) => d.type !== 'rest').map((d) => `${d.day} ${d.type}${d.distance_km ? ` ${d.distance_km} km` : ''}`).join('; ')}.`
    )
  }
  if (healthBreak) lines.push(`They reported ${healthBreak.kind === 'illness' ? 'an illness' : 'an injury or a break'}; the plan is easing them back.`)
  return [
    'Write a SHORT weekly progress review for this runner. Use only the numbers given; never invent any.',
    '',
    ...lines,
    '',
    'Output JSON only: {"summary": string, "highlights": string[], "focus": string}.',
    '- summary: one or two sentences on what was done versus planned, warm and honest.',
    '- highlights: one or two short things that went well (an empty list if nothing did).',
    '- focus: ONE concrete, doable thing for next week, in one sentence. No new workouts, no extra kilometres.',
    'No markdown. Speak to the runner directly ("ti").',
  ].join('\n')
}

/** The stored review, made safe to render whatever the model returned. */
export function normalizeReview(content) {
  const c = content && typeof content === 'object' ? content : {}
  const str = (v) => (typeof v === 'string' ? v.trim().slice(0, 400) : '')
  return {
    summary: str(c.summary),
    highlights: (Array.isArray(c.highlights) ? c.highlights : []).map(str).filter(Boolean).slice(0, 2),
    focus: str(c.focus),
  }
}

/** One request per runner and week per page load, even if the dashboard mounts twice. */
const inFlight = new Map()

/**
 * Last week's review: read it if it exists, otherwise write it, lazily, the
 * first time the runner opens the app in a new week. No cron. The proxy
 * refuses a second generation for the same week (409 review_exists) and
 * stores the one it made, so this is safe to call on every load.
 *
 * @param {object} input
 * @param {object} input.profile
 * @param {Array} input.plans
 * @param {Array} input.workouts
 * @param {string} input.weekStart - Monday of the reviewed week (previousLocalWeekKey())
 * @param {object|null} [input.healthBreak]
 * @param {(userId: string, weekStart: string) => Promise<object|null>} input.getStored - weekly_reviews row
 * @param {(prompt: string) => Promise<object|null>} input.write - the one AI call
 * @returns {Promise<{weekStart: string, stats: object, review: object|null}|null>}
 *   null when there was nothing to review
 */
export async function loadReview({ profile, plans, workouts, weekStart, healthBreak = null, getStored, write }) {
  const stats = weekStats({ plans, workouts, weekStart })
  const stored = await getStored(profile.id, weekStart)
  if (stored?.status === 'ready') return { weekStart, stats, review: normalizeReview(stored.content) }
  if (!hasSomethingToReview(stats)) return null
  if (stored) return { weekStart, stats, review: null } // being written right now

  const key = `${profile.id}:${weekStart}`
  if (!inFlight.has(key)) {
    // "Next week" for the runner is the week that has just begun.
    const next = plans.find((p) => weekStartISO(plans, p.week_number) === addDaysISO(weekStart, 7))?.plan_json ?? null
    inFlight.set(
      key,
      write(reviewPrompt(stats, { name: profile.name, nextWeek: next, healthBreak })).catch(async (err) => {
        // Another tab or device wrote it first: read theirs.
        if (err?.code === 'review_exists') return (await getStored(profile.id, weekStart))?.content ?? null
        inFlight.delete(key)
        throw err
      })
    )
  }
  const content = await inFlight.get(key)
  return { weekStart, stats, review: content ? normalizeReview(content) : null }
}
