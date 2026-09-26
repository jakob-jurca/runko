/**
 * Goal blocks — the non-race path (core/planning/goals.js, goal-progress.js).
 * The per-goal personas and the generic plan properties live in
 * personas.test.mjs; this file holds what is specific to the path: who is
 * offered what, that a block is exactly as long as asked, the two time
 * trials, the body-goal text rule, and how progress is measured and reported.
 */
import { runPlanningPipeline } from '../src/core/planning/index.js'
import {
  GOALS, BLOCK_WEEKS, goalsOffered, normalizeGoalPlan, withoutBodyTargets, readyForKm, goalMetric,
} from '../src/core/planning/goals.js'
import { goalProgress, blockSummary, repeatParams, recentVolume, formatTrialTime, goalOf } from '../src/core/goal-progress.js'
import { plannedWorkoutRow, prefillFromPlan } from '../src/core/logging.js'
import { enforceWeekRules } from '../src/core/planning/guard.js'
import { addDaysISO } from '../src/core/dates.js'
import { t } from '../src/core/strings.js'
import { check, summary } from './harness.mjs'

const TODAY = new Date('2026-09-21T09:00:00') // a Monday
const START = '2026-09-21'

const runner = {
  age: 34, fitness_level: 'intermediate', experience_months: 36, weekly_volume_km: 30, longest_run_km: 12,
  days_per_week: 4, pain_at_rest: false, injury_last_12m: false, pregnancy_status: 'none',
}
const beginner = {
  age: 33, fitness_level: 'beginner', experience_months: 0, weekly_volume_km: 0, days_per_week: 3,
  pain_at_rest: false, injury_last_12m: false, pregnancy_status: 'none',
}
const build = (profile, goal_plan) => runPlanningPipeline({ profile: { ...profile, goal_plan }, today: TODAY })

// ---------------------------------------------------------------------------
console.log('\n=== WHO IS OFFERED WHAT ===')
check('seven goals', GOALS.length === 7)
check('blocks of 4, 8 or 12 weeks', BLOCK_WEEKS.join() === '4,8,12')
check('an adult is offered every goal', goalsOffered(30).length === 7)
check('teza is offered from 18', goalsOffered(18).includes('teza') && !goalsOffered(17).includes('teza'))
check('teza is not offered to a 16-year-old', !goalsOffered(16).includes('teza') && goalsOffered(16).length === 6)
check('an unknown age is the conservative case: no teza', !goalsOffered(null).includes('teza'))

const teen = build({ ...runner, age: 16 }, { main: 'teza', blockWeeks: 8 })
check('teza for a 16-year-old is built as zdravje', teen.status === 'ready' && teen.weeks[0].goal_plan.main === 'zdravje')
check('and the runner is told why', teen.weeks[0].goal_plan.adjustments.some((a) => a.id === 'teza_age') &&
  teen.explain.intro.includes(t.goals.adjustReasons.teza_age))
const teenSecondary = build({ ...runner, age: 16 }, { main: 'kondicija', secondary: 'teza', blockWeeks: 8 })
check('teza as a teenager\'s second goal is dropped', teenSecondary.weeks[0].goal_plan.secondary === null)

console.log('\n=== NORMALISING WHAT THE INTAKE SENDS ===')
check('no goal, no goal plan', normalizeGoalPlan(null) === null && normalizeGoalPlan({ main: 'nope' }) === null)
check('a secondary equal to the main is dropped', normalizeGoalPlan({ main: 'zdravje', secondary: 'zdravje' }, { age: 30 }).secondary === null)
check('a bad block length becomes 8 weeks', normalizeGoalPlan({ main: 'zdravje', blockWeeks: 7 }, { age: 30 }).blockWeeks === 8)
check('a time trial does not sit beside an easy main goal',
  normalizeGoalPlan({ main: 'zdravje', secondary: 'hitrost' }, { age: 30 }).secondary === null)
check('but it does beside kondicija', normalizeGoalPlan({ main: 'kondicija', secondary: 'hitrost' }, { age: 30 }).trials === true)
check('metrics: hitrost -> time trial, kondicija -> longest run, the rest -> completion',
  goalMetric('hitrost') === 'time_trial' && goalMetric('kondicija') === 'longest_run' &&
  ['zdravje', 'navada', 'glava', 'teza', 'baza'].every((g) => goalMetric(g) === 'completion'))

// ---------------------------------------------------------------------------
console.log('\n=== A BLOCK IS EXACTLY AS LONG AS ASKED ===')
const profiles = { runner, beginner, returning: { ...runner, weekly_volume_km: 12, longest_run_km: 6, break_days: 120, age: 40 } }
for (const goal of GOALS) {
  for (const weeks of BLOCK_WEEKS) {
    const lengths = Object.entries(profiles).map(([name, p]) => {
      const r = build(p, { main: goal, blockWeeks: weeks })
      return r.status === 'ready' ? `${name}:${r.weeks.length}` : `${name}:${r.status}`
    })
    check(`${goal}, ${weeks} weeks: ${lengths.join(' ')}`, lengths.every((l) => l.endsWith(`:${weeks}`)))
  }
}
const twelve = build(runner, { main: 'zdravje', blockWeeks: 12 })
check('a 12-week block has exactly 12 weeks, numbered 1 to 12',
  twelve.weeks.length === 12 && twelve.weeks.every((w, i) => w.week_number === i + 1))
check('a block has no race day, no taper and no event date',
  twelve.weeks.every((w) => w.phase !== 'taper' && !w.days.some((d) => d.type === 'race')) && !twelve.goal.event_date)
check('a goal block ignores the race the profile still holds',
  build({ ...runner, target_distance_km: 42.2, event_date: '2026-12-13' }, { main: 'navada', blockWeeks: 8 }).weeks.length === 8)

// ---------------------------------------------------------------------------
console.log('\n=== HITROST: 5 KM TIME TRIALS IN THE FIRST AND THE LAST WEEK ===')
for (const weeks of BLOCK_WEEKS) {
  const r = build(runner, { main: 'hitrost', blockWeeks: weeks })
  const trials = r.weeks.flatMap((w) => w.days.filter((d) => d.type === 'time_trial').map((d) => ({ week: w.week_number, d })))
  check(`${weeks} weeks: hitrost includes both time trials, weeks ${trials.map((x) => x.week).join(' and ')}`,
    r.weeks[0].goal_plan.main === 'hitrost' && trials.map((x) => x.week).join() === `1,${weeks}` &&
    trials.every((x) => x.d.trial_km === 5 && x.d.distance_km >= 5))
  check(`${weeks} weeks: the trial is a 5 km hard effort, recorded in the goal`,
    r.weeks[0].goal_plan.trial_weeks.join() === `1,${weeks}` && trials.every((x) => x.d.hard_km === 5 && x.d.intensity === 'hard'))
}
const speedWeeks = build(runner, { main: 'hitrost', blockWeeks: 12 }).weeks
check('between the trials there are quality sessions within the level cap (at most two hard days)',
  speedWeeks.every((w) => w.days.filter((d) => ['tempo', 'interval', 'repetition', 'time_trial'].includes(d.type)).length <= 2))
const secondary = build(runner, { main: 'kondicija', secondary: 'hitrost', blockWeeks: 8 })
check('hitrost as a second goal adds the trials and its metric',
  secondary.weeks[0].goal_plan.trial_weeks.join() === '1,8' && secondary.weeks[0].goal_plan.metrics.join() === 'longest_run,time_trial')
const notRunning = build(beginner, { main: 'hitrost', blockWeeks: 8 })
check('a beginner cannot start with a 5 km time trial: built as kondicija, with the reason',
  notRunning.weeks[0].goal_plan.main === 'kondicija' && notRunning.weeks.every((w) => !w.days.some((d) => d.type === 'time_trial')) &&
  notRunning.explain.intro.includes(t.goals.adjustReasons.trial_not_running))
const tooLittle = build({ ...runner, weekly_volume_km: 12, longest_run_km: 6 }, { main: 'hitrost', blockWeeks: 8 })
check('a runner too light for a trial inside the low-intensity share is adjusted, not squeezed',
  tooLittle.weeks[0].goal_plan.main === 'kondicija' && tooLittle.weeks.every((w) => !w.days.some((d) => d.type === 'time_trial')))
const knownCondition = build({ ...runner, known_condition: true, medical_clearance: false }, { main: 'hitrost', blockWeeks: 8 })
check('a safety restriction on hard running also removes the trials',
  knownCondition.weeks.every((w) => !w.days.some((d) => d.type === 'time_trial')) && knownCondition.weeks[0].goal_plan.main === 'kondicija')

console.log('\n=== TEZA: NO WEIGHT, NO CALORIES, IN ANY TEXT ===')
const BODY = /\d\s*(kg|kilogram|kcal|kalorij)|kalorij|kcal|hujš|shujš|izgub\w* (teže|kil)|tehtnic|\bdiet/i
const strings = (value, out = []) => {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out))
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out))
  return out
}
const teza = build({ ...runner, weekly_volume_km: 12, longest_run_km: 6, fitness_level: 'beginner', experience_months: 9 }, { main: 'teza', blockWeeks: 12 })
const tezaText = strings({ explain: teza.explain, weeks: teza.weeks.map(({ planning, ...w }) => w), notices: teza.notices })
check(`every string of a teza plan is free of weight and calorie talk (${tezaText.length} strings)`, tezaText.every((s) => !BODY.test(s)))
check('so are the static strings for the goal', strings(t.goals).every((s) => !BODY.test(s)))
check('the intro does not name a weight, a number of kilograms or calories',
  !/\d\s*(kg|kcal)/i.test(teza.explain.intro) && !/kalorij|hujš/i.test(teza.explain.intro))
check('teza is easy running only, with no strides: nothing to chase', teza.weeks.every((w) =>
  w.days.every((d) => !['tempo', 'interval', 'repetition', 'time_trial'].includes(d.type) && d.variant !== 'strides')))
const written = 'Super trening! Izgubi 5 kg do konca bloka. Tek je lahkoten. Pazi na kalorije. Tehtnica ne laže. Uživaj v teku.'
check('AI prose is cleaned of any sentence that names a weight or a calorie',
  withoutBodyTargets(written) === 'Super trening! Tek je lahkoten. Uživaj v teku.')
check('and a sentence without such words is left alone', withoutBodyTargets('Danes teci lahkotno.') === 'Danes teci lahkotno.')

console.log('\n=== NAVADA AND THE OTHER EASY GOALS ===')
const habit = build({ ...runner, days_per_week: 5 }, { main: 'navada', blockWeeks: 8 })
check('navada: the fewest sessions that still work (three at most, of five offered)',
  habit.weeks.every((w) => w.days.filter((d) => d.type !== 'rest').length <= 3))
check('navada: the goal says a missed session is never a penalty', t.goals.items.navada.intro.includes('nikoli kazen'))
const noDays = build({ ...runner, days_per_week: undefined }, { main: 'navada', blockWeeks: 8 })
check('navada: two runs a week when nothing was offered', noDays.weeks.every((w) => w.days.filter((d) => d.type !== 'rest').length <= 2))
const fit = build({ ...runner, weekly_volume_km: 40, longest_run_km: 16, experience_months: 96 }, { main: 'zdravje', blockWeeks: 8 })
check('an already fit runner is built on the maintenance scenario, all easy',
  fit.scenario === 'maintenance' && fit.weeks.every((w) => !w.days.some((d) => ['tempo', 'interval', 'repetition'].includes(d.type))))
const baza = build(runner, { main: 'baza', blockWeeks: 12 })
check('baza: the base phase, a rising volume, and what it is ready for',
  baza.weeks.every((w) => w.phase === 'base') && baza.weeks[0].goal_plan.ready_for_km >= 10 &&
  Math.max(...baza.weeks.map((w) => w.target_volume_km)) > baza.weeks[0].target_volume_km)
check('readyForKm: 30 km a week and a 16 km long run is ready for a half marathon; 10 and 5 only for a 5', readyForKm(30, 16) === 21.1 && readyForKm(10, 5) === 5)
const harder = build(runner, { main: 'kondicija', blockWeeks: 8, level: 2 })
const first = build(runner, { main: 'kondicija', blockWeeks: 8, level: 1 })
check('a harder block asks for more, inside the same caps',
  harder.weeks[0].goal_plan.target_continuous_min > first.weeks[0].goal_plan.target_continuous_min &&
  Math.max(...harder.weeks.map((w) => w.target_volume_km)) >= Math.max(...first.weeks.map((w) => w.target_volume_km)))

// ---------------------------------------------------------------------------
console.log('\n=== SAFETY STILL APPLIES ===')
const pregnant = build({ ...runner, pregnancy_status: 'pregnant' }, { main: 'zdravje', blockWeeks: 8 })
check('a pregnant runner gets no goal block either', pregnant.status === 'blocked' && !pregnant.weeks.length)
const under15 = build({ ...runner, age: 14 }, { main: 'zdravje', blockWeeks: 8 })
check('nor does a 14-year-old', under15.status === 'blocked')
const pain = build({ ...runner, pain_at_rest: true }, { main: 'kondicija', blockWeeks: 8 })
check('nor pain at rest', pain.status === 'blocked')
const heavy = build({ ...beginner, weight: 130, height_cm: 170, medical_clearance: false }, { main: 'kondicija', blockWeeks: 8 })
check('a BMI 40+ runner gets the walking block, still exactly as long', heavy.status === 'ready' && heavy.weeks.length === 8 &&
  heavy.weeks.every((w) => w.days.every((d) => ['walk', 'rest'].includes(d.type))))
const bmi30 = build({ ...beginner, weight: 95, height_cm: 170 }, { main: 'kondicija', blockWeeks: 4 })
check('a 4-week block for a BMI 30+ beginner still opens with the walking base', bmi30.weeks.length === 4 &&
  bmi30.weeks[0].days.every((d) => ['walk', 'rest'].includes(d.type)))
const returning = build(profiles.returning, { main: 'zdravje', blockWeeks: 8 })
check('a returning runner keeps the return rules under any goal (no hard sessions, 8 weeks)',
  returning.scenario === 'returning' && returning.weeks.length === 8 &&
  returning.weeks.every((w) => !w.days.some((d) => ['tempo', 'interval', 'repetition'].includes(d.type))))
check('one AI call per plan: the pipeline makes none', typeof build(runner, { main: 'zdravje', blockWeeks: 4 }).skeleton === 'object')

// ---------------------------------------------------------------------------
console.log('\n=== A TIME TRIAL IS TYPED IN, NEVER ASSUMED ===')
const trialDay = build(runner, { main: 'hitrost', blockWeeks: 8 }).weeks[0].days.find((d) => d.type === 'time_trial')
check('"done as planned" is not offered for a trial', plannedWorkoutRow(trialDay, { userId: 'u', date: START }) === null)
const pre = prefillFromPlan(trialDay, START)
check('the form opens with 5 km and no time', pre.distance === '5' && pre.duration === '' && pre.effort === 5)
const week = build(runner, { main: 'hitrost', blockWeeks: 8 }).weeks[0]
const kept = enforceWeekRules(week, week.days.map((d) => (d.type === 'time_trial' ? { ...d, type: 'easy', distance_km: 3 } : d)))
check('a rewrite of the week cannot change the trial', kept.days.some((d) => d.type === 'time_trial' && d.distance_km === trialDay.distance_km))

// ---------------------------------------------------------------------------
console.log('\n=== PROGRESS ON THE DASHBOARD ===')
const rows = (result) => result.weeks.map((w) => ({ week_number: w.week_number, created_at: `${START}T09:00:00`, plan_json: w }))
const dateOf = (plans, weekNumber, dayName) =>
  addDaysISO(addDaysISO(START, (weekNumber - 1) * 7), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(dayName))
const run = (date, distance, duration) => ({ date, distance, duration, effort: 3 })

const speed = build(runner, { main: 'hitrost', blockWeeks: 4 })
const speedPlans = rows(speed)
const trialOn = (n) => dateOf(speedPlans, n, speedPlans[n - 1].plan_json.days.find((d) => d.type === 'time_trial').day)
check('the goal is read back from the stored weeks', goalOf(speedPlans).main === 'hitrost' && goalOf(rows(build({ ...runner, weekly_volume_km: 10 }, null))) === null)
const beforeAny = goalProgress({ plans: speedPlans, workouts: [], today: START })
check('week 1: the speed metric is a time trial, nothing logged yet',
  beforeAny.metrics[0].kind === 'time_trial' && beforeAny.metrics[0].first.result === null && !beforeAny.inLastWeek)
const midWorkouts = [run(trialOn(1), 5, 25.5), run(addDaysISO(trialOn(1), 1), 8, 50)]
const mid = goalProgress({ plans: speedPlans, workouts: midWorkouts, today: addDaysISO(START, 8) })
check('the first trial is read from the run on its day: 25:30', mid.metrics[0].first.result.minutes === 25.5 && formatTrialTime(25.5) === '25:30')
check('a 8 km run is not taken for the 5 km trial', mid.metrics[0].first.result.date === trialOn(1))
const lastToday = addDaysISO(START, 24)
const endWorkouts = [...midWorkouts, run(trialOn(4), 4.95, 24.25)]
const end = goalProgress({ plans: speedPlans, workouts: endWorkouts, today: lastToday })
check('the last trial gives the change: 1:15 faster', end.metrics[0].last.result.minutes === 24.25 && Math.abs(end.metrics[0].changeMinutes + 1.25) < 1e-9)
check('in the last week the block is flagged', end.inLastWeek === true && end.totalWeeks === 4)
const lines = blockSummary(end)
check('the summary names both times and the change', lines.length === 1 && lines[0].includes('25:30') && lines[0].includes('24:15') && lines[0].includes('1:15 hitreje'))
check('with only the first trial, the summary says the last is waiting',
  blockSummary(goalProgress({ plans: speedPlans, workouts: midWorkouts, today: lastToday }))[0].includes('Zadnji še čaka'))

const beg = build(beginner, { main: 'kondicija', blockWeeks: 8 })
const begPlans = rows(beg)
const w1 = begPlans[0].plan_json.days.find((d) => d.type === 'walk_run')
const w8 = begPlans[7].plan_json.days.filter((d) => d.type !== 'rest')
const logs = [run(dateOf(begPlans, 1, w1.day), 3, 30), ...w8.map((d) => run(dateOf(begPlans, 8, d.day), d.distance_km, d.duration_min))]
const longest = goalProgress({ plans: begPlans, workouts: logs, today: addDaysISO(START, 55) })
check('kondicija for a beginner: the metric is the longest run without stopping',
  longest.metrics[0].kind === 'longest_run' && longest.metrics[0].startMinutes === 0)
// A walk-run session counts for its longest non-stop bout, never its whole time.
const bout = (d) => (d.walk_run ? d.walk_run.continuous_min ?? d.walk_run.run_sec / 60 : d.duration_min)
check('a walk-run session counts for its longest non-stop bout, not its whole time',
  longest.metrics[0].bestMinutes === Math.round(Math.max(bout(w1), ...w8.map(bout))))
check('the summary reports it in minutes', blockSummary(longest)[0].includes(`${longest.metrics[0].bestMinutes} min`))
check('the longest run only grows across the block',
  goalProgress({ plans: begPlans, workouts: logs.slice(0, 1), today: addDaysISO(START, 55) }).metrics[0].bestMinutes <= longest.metrics[0].bestMinutes)

const health = build(runner, { main: 'zdravje', blockWeeks: 4 })
const hPlans = rows(health)
const perWeek = hPlans[0].plan_json.days.filter((d) => d.type !== 'rest').length
const some = [run(START, 6, 36), run(addDaysISO(START, 2), 6, 36)]
const partial = goalProgress({ plans: hPlans, workouts: some, today: addDaysISO(START, 6) })
check(`zdravje: completion is a plain count of planned sessions (${perWeek} planned in week 1)`,
  partial.metrics[0].kind === 'completion' && partial.metrics[0].planned === perWeek && partial.metrics[0].done === 2)
check('a run on another day of the same week still counts', goalProgress({ plans: hPlans, workouts: [run(addDaysISO(START, 1), 6, 36)], today: addDaysISO(START, 6) }).metrics[0].done === 1)
check('the current week counts only the sessions already due', goalProgress({ plans: hPlans, workouts: [], today: START }).metrics[0].planned <= 1)
check('nothing logged is 0 %, never a negative or a shaming word', (() => {
  const p = goalProgress({ plans: hPlans, workouts: [], today: addDaysISO(START, 27) })
  return p.metrics[0].percent === 0 && blockSummary(p).every((l) => !/neuspeh|zamud|kazen|slab/i.test(l.replace('nikoli kazen', '')))
})())
check('every goal shows a metric', GOALS.every((g) => {
  const r = build(runner, { main: g, blockWeeks: 4 })
  return r.status === 'ready' && goalProgress({ plans: rows(r), workouts: [], today: START }).metrics.length >= 1
}))
const bazaPlans = rows(build(runner, { main: 'baza', blockWeeks: 4 }))
const bazaEnd = goalProgress({ plans: bazaPlans, workouts: [], today: addDaysISO(START, 27) })
check('baza: the end summary says whether the base is enough for a race plan', blockSummary(bazaEnd).length === 2)

console.log('\n=== THE END OF THE BLOCK: THREE WAYS ON ===')
const repeat = new URLSearchParams(repeatParams(goalOf(speedPlans)))
check('repeat: the same goal, the same length, one level harder',
  repeat.get('next') === 'repeat' && repeat.get('main') === 'hitrost' && repeat.get('weeks') === '4' && repeat.get('level') === '2')
check('the options are worded in the strings', ['repeat', 'switch', 'race'].every((k) => typeof t.goals.next[k] === 'string'))
check('the next block starts from what was actually run', (() => {
  const v = recentVolume([run('2026-10-01', 8, 50), run('2026-10-05', 12, 75), run('2026-09-20', 5, 30)], '2026-10-10')
  return v.weeklyKm === 6 && v.longestKm === 12
})())
check('and from nothing when nothing was logged', recentVolume([], '2026-10-10').weeklyKm === null)

export default summary('goals')
