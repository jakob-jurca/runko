/**
 * The adaptation guard: an AI-rewritten week must stay inside the plan's own
 * scenario rules. Uses real weeks from the planning pipeline.
 */
import { runPlanningPipeline } from '../src/core/planning/index.js'
import { enforceWeekRules, isAdaptable } from '../src/core/planning/guard.js'
import { PERSONAS, TODAY } from './personas/personas.mjs'
import { check, summary } from './harness.mjs'

const planFor = (id) => {
  const p = PERSONAS.find((x) => x.id === id)
  return runPlanningPipeline({ profile: p.profile, runs: p.runs || [], memories: p.memories || [], answers: p.answers || {}, today: TODAY })
}

console.log('\n=== ADAPTATION GUARD ===')

// A walk-run week is never handed to the AI.
const beginner = planFor('mother-never-ran-5k')
check('walk-run week is not adaptable', !isAdaptable(beginner.weeks[0]))
const kept = enforceWeekRules(beginner.weeks[0], beginner.weeks[0].days.map((d) => ({ ...d, type: 'tempo', distance_km: 8 })))
check('…and a rewrite of it is discarded', kept.days === beginner.weeks[0].days)

// A recreational week allows no hard sessions, no new run days, no extra km.
const rec = planFor('feel-fitter')
const week = rec.weeks[1]
check('recreational week is adaptable', isAdaptable(week))
check('recreational week forbids hard sessions', week.allow_hard === false)
const runDay = week.days.find((d) => d.type === 'easy')
const restDay = week.days.find((d) => d.type === 'rest')
const proposed = week.days.map((d) => {
  if (d === runDay) return { ...d, type: 'interval', distance_km: 30 }
  if (d === restDay) return { ...d, type: 'easy', distance_km: 6 }
  return { ...d }
})
const { days, changes } = enforceWeekRules(week, proposed)
const fixedRun = days.find((d) => d.day === runDay.day)
const fixedRest = days.find((d) => d.day === restDay.day)
const longest = Math.max(...week.days.map((d) => d.distance_km || 0))
check(`hard session becomes easy (${fixedRun.type})`, fixedRun.type === 'easy')
check(`run capped at the week's longest run (${fixedRun.distance_km} ≤ ${longest})`, fixedRun.distance_km <= longest)
check('run on a rest day is removed', fixedRest.type === 'rest')
const total = (ds) => ds.reduce((s, d) => s + (d.distance_km || 0), 0)
check(`week total not above the original (${total(days)} ≤ ${total(week.days)})`, total(days) <= total(week.days) + 0.5)
check('corrections are reported', changes.length >= 3)

// A race-build week that allows quality keeps it.
const race = planFor('sub45-10k-12w')
const buildWeek = race.weeks.find((w) => w.phase === 'build' && !w.is_recovery)
const same = enforceWeekRules(buildWeek, buildWeek.days.map((d) => ({ ...d })))
check('allowed quality sessions survive untouched',
  same.days.filter((d) => ['tempo', 'interval', 'repetition'].includes(d.type)).length ===
    buildWeek.days.filter((d) => ['tempo', 'interval', 'repetition'].includes(d.type)).length)

// Legacy weeks (no allow_hard recorded) are left as they were.
const legacy = { days: buildWeek.days.map(({ ...d }) => d) }
check('legacy week without scenario rules keeps its quality',
  enforceWeekRules(legacy, legacy.days.map((d) => ({ ...d }))).days.some((d) => d.type === 'interval'))

export default summary('plan-guard')
