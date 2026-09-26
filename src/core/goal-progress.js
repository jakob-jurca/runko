/**
 * goal-progress.js — how a goal block is going, and how it ended.
 *
 * Pure functions over the stored plan weeks and the logged runs; nothing is
 * fetched or written. The engine stores the goal on every week
 * (plan_json.goal_plan, see core/planning/index.js); this reads it back and
 * measures it:
 *
 *   time_trial   the 5 km time in the first and the last week
 *   longest_run  the longest run without stopping, across the block
 *   completion   planned sessions that were run
 *
 * A session that was missed is never a mark against the runner: completion is
 * a plain count, and a week's sessions may be run on any of its days.
 *
 * Platform-agnostic (see ./README.md): no React, no DOM, no network.
 */
import { addDaysISO, weekStartISO, currentWeekNumber, todayISO } from './dates.js'
import { t } from './strings.js'

/** A GPS watch reads a "5 km" a little short; this much still counts as the distance. */
const TRIAL_MIN_KM = 4.8
const TRIAL_MAX_KM = 5.5

const ran = (w) => Number(w.distance) > 0 && Number(w.duration) > 0
const isNonRest = (d) => d.type !== 'rest'
const dayIndexOf = (day) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(day)

/** 24.5 minutes -> "24:30". */
export function formatTrialTime(minutes) {
  const total = Math.round(minutes * 60)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** The goal stored with the plan, or null for a race plan. */
export function goalOf(plans) {
  return plans?.find((p) => p.plan_json?.goal_plan)?.plan_json.goal_plan ?? null
}

function weekRun(plans, weekNumber, workouts) {
  const start = weekStartISO(plans, weekNumber)
  const end = addDaysISO(start, 6)
  return { start, end, runs: workouts.filter((w) => ran(w) && w.date >= start && w.date <= end) }
}

/** The 5 km trial of one week: the run on its day, else the fastest run of that distance. */
function trialResult(plans, weekNumber, workouts) {
  const row = plans.find((p) => p.week_number === weekNumber)
  const day = row?.plan_json?.days?.find((d) => d.type === 'time_trial')
  if (!day) return null
  const { start, runs } = weekRun(plans, weekNumber, workouts)
  const date = addDaysISO(start, dayIndexOf(day.day))
  const inRange = runs.filter((w) => Number(w.distance) >= TRIAL_MIN_KM && Number(w.distance) <= TRIAL_MAX_KM)
  const pick = inRange.find((w) => w.date === date) ?? [...inRange].sort((a, b) => a.duration - b.duration)[0]
  return { week: weekNumber, date, result: pick ? { date: pick.date, minutes: Number(pick.duration) } : null }
}

function timeTrialMetric(goal, plans, workouts) {
  const [firstWeek, lastWeek] = goal.trial_weeks
  const first = trialResult(plans, firstWeek, workouts)
  const last = lastWeek !== firstWeek ? trialResult(plans, lastWeek, workouts) : null
  const change = first?.result && last?.result ? last.result.minutes - first.result.minutes : null
  return { kind: 'time_trial', first, last, changeMinutes: change }
}

/** Minutes of running without stopping in one logged run, given the day it was planned as. */
function continuousMinutes(workout, plannedDay) {
  const wr = plannedDay?.walk_run
  if (wr) return wr.continuous_min ?? (wr.run_sec ? wr.run_sec / 60 : 0)
  return Number(workout.duration)
}

function longestRunMetric(goal, plans, workouts, today) {
  let best = { minutes: 0, km: 0 }
  for (const row of plans) {
    const { start, runs } = weekRun(plans, row.week_number, workouts)
    if (start > today) break
    for (const w of runs) {
      const planned = row.plan_json?.days?.[(new Date(w.date + 'T00:00:00').getDay() + 6) % 7]
      const minutes = continuousMinutes(w, planned)
      if (minutes > best.minutes) best = { minutes, km: planned?.walk_run ? 0 : Number(w.distance) }
    }
  }
  return {
    kind: 'longest_run',
    startMinutes: Math.round(goal.baseline?.continuous_min ?? 0),
    bestMinutes: Math.round(best.minutes),
    bestKm: Math.round(best.km * 10) / 10,
    targetMinutes: goal.target_continuous_min ? Math.round(goal.target_continuous_min) : null,
  }
}

/** Sessions planned up to today, and how many were run: any run of a week counts for one session. */
function completionMetric(plans, workouts, today) {
  let planned = 0
  let done = 0
  for (const row of plans) {
    const start = weekStartISO(plans, row.week_number)
    if (start > today) break
    const days = row.plan_json?.days ?? []
    const due = days.filter((d, i) => isNonRest(d) && addDaysISO(start, i) <= today).length
    const dates = new Set(weekRun(plans, row.week_number, workouts).runs.map((w) => w.date))
    planned += due
    done += Math.min(due, dates.size)
  }
  return { kind: 'completion', planned, done, percent: planned ? Math.round((done / planned) * 100) : 0 }
}

/**
 * @param {{plans: Array, workouts: Array, today?: string}} input
 * @returns {object|null} null for a race plan
 */
export function goalProgress({ plans, workouts, today = todayISO() }) {
  const goal = goalOf(plans)
  if (!goal) return null
  const lastWeek = plans[plans.length - 1].week_number
  const week = currentWeekNumber(plans, new Date(today + 'T12:00:00'))
  const metrics = goal.metrics.map((kind) => {
    if (kind === 'time_trial') return timeTrialMetric(goal, plans, workouts)
    if (kind === 'longest_run') return longestRunMetric(goal, plans, workouts, today)
    return completionMetric(plans, workouts, today)
  })
  return {
    goal,
    week,
    totalWeeks: lastWeek,
    inLastWeek: week === lastWeek,
    ended: today >= addDaysISO(weekStartISO(plans, lastWeek), 7),
    metrics,
    completion: metrics.find((m) => m.kind === 'completion') ?? completionMetric(plans, workouts, today),
  }
}

/** The short result of the block, as sentences for the last week. */
export function blockSummary(progress) {
  const S = t.goals.summary
  const lines = []
  for (const m of progress.metrics) {
    if (m.kind === 'time_trial') {
      const a = m.first?.result
      const b = m.last?.result
      if (a && b) {
        const faster = m.changeMinutes < 0
        const change = Math.abs(m.changeMinutes) < 1 / 60
          ? t.goals.trial.same
          : t.goals.trial.change(faster, formatTrialTime(Math.abs(m.changeMinutes)))
        lines.push(S.trialBoth(formatTrialTime(a.minutes), formatTrialTime(b.minutes), change))
      } else if (a) lines.push(S.trialFirstOnly(formatTrialTime(a.minutes)))
      else lines.push(S.trialNone)
    } else if (m.kind === 'longest_run') {
      lines.push(m.startMinutes && m.startMinutes !== m.bestMinutes
        ? S.longest(m.startMinutes, m.bestMinutes)
        : S.longestNow(m.bestMinutes))
    } else {
      lines.push(m.planned ? S.completion(m.done, m.planned, m.percent) : S.completionNone)
    }
  }
  const ready = progress.goal.ready_for_km
  if (progress.goal.main === 'baza' || progress.goal.secondary === 'baza') {
    lines.push(ready && progress.completion.percent >= 60 ? S.ready(ready) : S.notReady)
  }
  return lines
}

/** Query string for the next block: the same goal, one level harder. */
export function repeatParams(goal) {
  const p = new URLSearchParams({
    next: 'repeat', main: goal.main, weeks: String(goal.block_weeks), level: String((goal.level ?? 1) + 1),
  })
  if (goal.secondary) p.set('secondary', goal.secondary)
  return p.toString()
}

/**
 * What the runner is doing now, from logged runs: the average of the last four
 * weeks and the longest run, for the next block to start from where they are.
 */
export function recentVolume(workouts, today = todayISO()) {
  const since = addDaysISO(today, -28)
  const runs = workouts.filter((w) => ran(w) && w.date >= since && w.date <= today)
  if (!runs.length) return { weeklyKm: null, longestKm: null }
  const total = runs.reduce((s, w) => s + Number(w.distance), 0)
  return {
    weeklyKm: Math.round(total / 4),
    longestKm: Math.round(Math.max(...runs.map((w) => Number(w.distance))) * 10) / 10,
  }
}
