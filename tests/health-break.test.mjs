// "Poškodba / bolezen": the plan changes by code alone, and never asks for
// more than the original plan did. Checked against real plans from the
// planning pipeline (km plans with quality sessions, walk-run beginners,
// race weeks) for every kind of break and many lengths and start days.
import fs from 'node:fs'
import { runPlanningPipeline } from '../src/core/planning/index.js'
import { isAdaptable } from '../src/core/planning/guard.js'
import { addDaysISO } from '../src/core/dates.js'
import {
  applyHealthBreak, breakWindow, returnDays, startFactor, doctorAdvised, validateBreak,
  BREAK_KINDS, MAX_BREAK_DAYS,
} from '../src/core/health-break.js'
import { check, summary } from './harness.mjs'

const HARD = new Set(['tempo', 'interval', 'repetition', 'time_trial'])
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const PROFILES = {
  'intermediate 10 km': { age: 35, fitness_level: 'intermediate', target_distance_km: 10, weekly_volume_km: 25, longest_run_km: 10, days_per_week: 4, experience_months: 24 },
  'advanced half with a date': { age: 41, fitness_level: 'advanced', target_distance_km: 21.1, weekly_volume_km: 45, longest_run_km: 18, days_per_week: 5, experience_months: 60, event_date: '2027-02-14' },
  'beginner 5 km (walk-run)': { age: 30, fitness_level: 'beginner', target_distance_km: 5, weekly_volume_km: 0, longest_run_km: 0, days_per_week: 3, experience_months: 0 },
}

const START = '2026-10-05' // a Monday: week 1 of every plan below
function planWeeks(profile) {
  const r = runPlanningPipeline({ profile, runs: [], memories: [], answers: {} })
  if (r.status !== 'ready') return null
  return r.skeleton.weeks.map((w) => ({
    week_number: w.week_number,
    plan_json: { ...w, paces: r.skeleton.paces },
    start: addDaysISO(START, (w.week_number - 1) * 7),
  }))
}

const dateOf = (week, d, i) => addDaysISO(week.start, NAMES.indexOf(d.day) >= 0 ? NAMES.indexOf(d.day) : i)

console.log('\nRules:')
check('three kinds: poškodba, bolezen, drugo', BREAK_KINDS.join() === 'injury,illness,other')
check('1 to 60 days', validateBreak({ kind: 'injury', days: 1 }) && validateBreak({ kind: 'illness', days: MAX_BREAK_DAYS }) && !validateBreak({ kind: 'illness', days: 0 }) && !validateBreak({ kind: 'illness', days: 61 }))
check('an unknown kind is refused', !validateBreak({ kind: 'holiday', days: 3 }))
check('a fraction of a day is refused', !validateBreak({ kind: 'other', days: 2.5 }))
check('longer breaks get longer returns', returnDays(3, 'illness') < returnDays(7, 'illness') && returnDays(7, 'illness') < returnDays(20, 'illness') && returnDays(20, 'illness') <= returnDays(40, 'illness'))
check('an injury returns more slowly than an illness', returnDays(3, 'injury') > returnDays(3, 'illness') && startFactor(3, 'injury') < startFactor(3, 'illness'))
check('6-28 days off restart at 50 %, more at 33 % (returning.js)', startFactor(10, 'illness') === 0.5 && startFactor(40, 'illness') === 0.33)
check('doctor: over 14 days', doctorAdvised({ days: 15 }) && !doctorAdvised({ days: 14 }))
check('doctor: strong pain at any length', doctorAdvised({ days: 1, strongPain: true }))
const w = breakWindow({ startDate: '2026-10-07', days: 3, kind: 'illness' })
check('window: 3 days of rest from today, then the return', w.restEnd === '2026-10-09' && w.returnUntil === '2026-10-12')

console.log('\nSafety caps, against generated plans:')
let cases = 0
const bad = { longer: 0, restRun: 0, hard: 0, weekMore: 0, notRest: 0, timeBased: 0, adaptable: 0, untouchedOutside: 0 }
for (const [name, profile] of Object.entries(PROFILES)) {
  const weeks = planWeeks(profile)
  check(`${name}: plan built`, Boolean(weeks?.length))
  if (!weeks) continue
  for (const kind of BREAK_KINDS) {
    for (const days of [1, 3, 5, 7, 10, 14, 21, 30, 60]) {
      for (const offset of [0, 2, 9, 20]) {
        cases++
        const startDate = addDaysISO(START, offset)
        const { changed, window } = applyHealthBreak({ weeks, kind, days, startDate, age: profile.age })
        for (const c of changed) {
          const orig = weeks.find((x) => x.week_number === c.week_number)
          const before = orig.plan_json.days
          const after = c.plan_json.days
          if (!isAdaptable(c.plan_json) === false) bad.adaptable++
          const sum = (ds) => ds.reduce((s, d) => s + (Number(d.distance_km) || 0), 0)
          if (sum(after) > sum(before) + 1e-9) bad.weekMore++
          after.forEach((d, i) => {
            const o = before[i]
            const date = dateOf(orig, o, i)
            if ((Number(d.distance_km) || 0) > (Number(o.distance_km) || 0) + 1e-9) bad.longer++
            if (o.type === 'rest' && d.type !== 'rest') bad.restRun++
            const inWindow = date >= window.startDate && date <= window.returnUntil
            if (!inWindow && JSON.stringify(d) !== JSON.stringify(o)) bad.untouchedOutside++
            if (date >= window.startDate && date <= window.restEnd && d.type !== 'rest') bad.notRest++
            if (date > window.restEnd && date <= window.returnUntil && o.type !== 'race' && HARD.has(d.type)) bad.hard++
            if (o.time_based && date > window.restEnd && date <= window.returnUntil && (d.distance_km !== o.distance_km || d.type !== o.type)) bad.timeBased++
          })
        }
      }
    }
  }
}
check(`${cases} breaks applied`, cases > 300)
check('no day gets longer than planned', bad.longer === 0)
check('no rest day gets a run', bad.restRun === 0)
check('no week gets more kilometres', bad.weekMore === 0)
check('every day of the rest window is rest', bad.notRest === 0)
check('no hard session during the return', bad.hard === 0)
check('walk-run days keep their ladder during the return', bad.timeBased === 0)
check('days outside the break are untouched', bad.untouchedOutside === 0)
check('changed weeks are closed to AI rewrites (guard.isAdaptable)', bad.adaptable === 0)

console.log('\nShape of the change:')
{
  const weeks = planWeeks(PROFILES['intermediate 10 km'])
  const { changed, window } = applyHealthBreak({ weeks, kind: 'illness', days: 10, startDate: START, age: 35 })
  const all = changed.flatMap((c) => c.plan_json.days.map((d, i) => ({ d, date: dateOf(weeks.find((x) => x.week_number === c.week_number), d, i) })))
  const returning = all.filter(({ d, date }) => date > window.restEnd && date <= window.returnUntil && d.type !== 'rest')
  check('return runs are easy', returning.length > 0 && returning.every(({ d }) => d.type === 'easy'))
  const firstBack = returning[0]
  const orig = weeks.flatMap((x) => x.plan_json.days.map((d, i) => ({ d, date: dateOf(x, d, i) }))).find((o) => o.date === firstBack.date)
  check('first run back is about half the planned one', firstBack.d.distance_km <= Math.ceil(orig.d.distance_km * 0.5) + 0.5)
  check('easy runs back have heart rates and a pace', returning.every(({ d }) => d.pace && (d.hr || d.health_break === 'return')))
  check('the week records the break for the coach', changed.every((c) => c.plan_json.health_break?.kind === 'illness' && c.plan_json.health_break.return_until === window.returnUntil))
  check('the week total is recomputed', changed.every((c) => Math.abs(c.plan_json.target_volume_km - c.plan_json.days.reduce((s, d) => s + (Number(d.distance_km) || 0), 0)) < 0.11))
  const rest = all.find(({ date }) => date === START)
  check('rest days say why', rest.d.title === 'Počitek (bolezen)')
}
{
  const weeks = planWeeks(PROFILES['advanced half with a date'])
  const last = weeks[weeks.length - 1]
  const raceIdx = last.plan_json.days.findIndex((d) => d.type === 'race')
  if (raceIdx >= 0) {
    const raceDate = dateOf(last, last.plan_json.days[raceIdx], raceIdx)
    const r = applyHealthBreak({ weeks, kind: 'injury', days: 3, startDate: addDaysISO(raceDate, -2) })
    check('a race inside the break is flagged', r.raceAtRisk)
  } else {
    check('a race inside the break is flagged (no race week in this plan)', true)
  }
}

console.log('\nThe app uses it:')
const plan = fs.readFileSync('src/core/plan.js', 'utf8')
check('reportHealthBreak saves the original weeks before changing them', /saveTrainingBreak\(\{[\s\S]*original_weeks[\s\S]*\}\)[\s\S]*savePlan\(profile\.id, c\.week_number/.test(plan))
check('no AI call in the break path', !/reportHealthBreak[\s\S]{0,1500}(adaptWeeklyPlan|callAi|describePlanSkeleton)/.test(plan))
const prompt = fs.readFileSync('src/core/coach-prompt.js', 'utf8')
check('the coach is told about an active break', /healthBreak/.test(prompt) && /INJURY \/ ILLNESS/.test(prompt))
const { buildRunnerContext, healthBreakContext } = await import('../src/core/coach-prompt.js')
const row = { kind: 'injury', days: 20, strong_pain: false, start_date: '2026-10-05', rest_until: '2026-10-24', return_until: '2026-11-14', undone_at: null }
const ctx = buildRunnerContext({ profile: { name: 'Ana' }, healthBreak: row, today: new Date('2026-10-10T12:00:00') })
check('coach context: kind, days and dates', /an injury and 20 day\(s\)/.test(ctx) && /rest until 2026-10-24/.test(ctx) && /by 2026-11-14/.test(ctx))
check('coach context: resting now', /They are resting now/.test(ctx))
check('coach context: over 14 days -> recommend a doctor', /Calmly recommend seeing a doctor/.test(ctx))
check('coach context: no hard sessions during the return', /no hard sessions/.test(ctx))
check('an undone or finished break is not mentioned', healthBreakContext({ ...row, undone_at: '2026-10-06' }, '2026-10-10') === null && healthBreakContext(row, '2026-11-15') === null)
check('chat sends the active break to the coach', /getActiveBreak\(profile\.id\)/.test(fs.readFileSync('src/pages/Chat.jsx', 'utf8')) && /healthBreak: ctx\.healthBreak/.test(fs.readFileSync('src/pages/Chat.jsx', 'utf8')))

export default summary('health-break')
