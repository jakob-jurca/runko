/**
 * "Vseeno naredi plan" across a grid of unsafe goals: whatever the runner,
 * the distance and the weeks left, a plan built against advice stays inside
 * the same hard caps as every other plan. The persona suite checks nine
 * people closely; this checks a few hundred combinations broadly.
 */
import { runPlanningPipeline } from '../src/core/planning/index.js'
import { TODAY, sundayIn } from './personas/personas.mjs'
import {
  SPECIFIC, restDaysRespected, weeklyIncreaseWithinLimit, longRunProgressionSafe, runDurationWithinCap,
  longRunShareWithinCap, walkRunWithinLimits, intensityRulesKept,
} from './personas/properties.mjs'
import { check, summary } from './harness.mjs'

console.log('\n=== OVERRIDE SWEEP ===')

const OVERRIDE = { safe_goal: 'override', override_confirmed: true }
const RUNNERS = [
  { label: 'never ran', fitness_level: 'beginner', experience_months: 0, weekly_volume_km: 0 },
  { label: 'new, 8 km/wk', fitness_level: 'beginner', experience_months: 3, weekly_volume_km: 8, longest_run_km: 3 },
  { label: '20 km/wk', fitness_level: 'intermediate', experience_months: 24, weekly_volume_km: 20, longest_run_km: 8 },
  { label: '40 km/wk', fitness_level: 'advanced', experience_months: 60, weekly_volume_km: 40, longest_run_km: 14 },
]

/** Kilometres of training in the biggest week, whatever unit the week is prescribed in. */
function maxWeekKm(result, max) {
  const worst = Math.max(0, ...result.weeks.map((w) =>
    w.days.filter((d) => d.type !== 'rest' && d.type !== 'race').reduce((s, d) => s + (d.distance_km || 0), 0)))
  return worst <= max + 0.01 ? { ok: true } : { ok: false, detail: `a ${worst} km week` }
}

let built = 0
let refused = 0
const failures = []

for (const runner of RUNNERS) {
  for (const age of [16, 28, 54, 66]) {
    for (const km of [5, 10, 21.1, 42.2]) {
      for (const weeks of [2, 4, 8, 12, 18]) {
        for (const days of [2, 3, 5]) {
          const { label, ...fields } = runner
          const profile = { ...fields, age, target_distance_km: km, event_date: sundayIn(weeks), days_per_week: days }
          const persona = { id: `${label}, ${age} y, ${km} km in ${weeks} wk, ${days} d`, profile }
          const run = (answers) => runPlanningPipeline({ profile, answers, today: TODAY })
          const first = run({})
          if (first.status !== 'ready' || first.verdict !== 'unsafe') continue
          const r = run(OVERRIDE)
          const result = { ...r, stored: r.weeks?.[0] }
          if (!first.proposal.override_allowed) {
            refused++
            if (r.againstAdvice || !SPECIFIC.originalGoalNotBuilt(result, persona).ok) failures.push(`${persona.id}: built although a population rule forbids the distance`)
            continue
          }
          built++
          const checks = {
            'ready and marked': { ok: r.status === 'ready' && r.againstAdvice?.confirmed === true, detail: `status ${r.status}` },
            'race day reached': SPECIFIC.reachesRaceDay(result, persona),
            'race is run-walk': SPECIFIC.raceWalkBreaks(result),
            'rest days': restDaysRespected(result, persona),
            'weekly increase': weeklyIncreaseWithinLimit(result, persona),
            'long-run spike': longRunProgressionSafe(result, persona),
            'duration cap': runDurationWithinCap(result, persona),
            'long-run share': longRunShareWithinCap(result, persona),
            'walk-run limits': walkRunWithinLimits(result),
            'intensity rules': intensityRulesKept(result, persona),
            'no hard sessions': SPECIFIC.noHardSessions(result, persona, true),
            // p08 r9-10 and p04 r27: the teenager's and the older beginner's weekly rules.
            ...(age < 18 ? { 'teen weekly km': maxWeekKm(result, age >= 17 ? 60 : 45) } : {}),
            ...(age < 18 ? { 'teen long run minutes': SPECIFIC.maxRunMinutes(result, persona, age >= 17 ? 90 : 75) } : {}),
          }
          for (const [name, outcome] of Object.entries(checks)) {
            if (!outcome.ok) failures.push(`${persona.id}: ${name} — ${outcome.detail}`)
          }
        }
      }
    }
  }
}

check(`the grid reaches enough unsafe goals (${built} built, ${refused} refused)`, built >= 100 && refused >= 20)
check(`every plan built against advice keeps every hard cap (${failures.length} violations)`, failures.length === 0)
for (const f of failures.slice(0, 25)) console.log(`       ${f}`)

export default summary('override-sweep')
