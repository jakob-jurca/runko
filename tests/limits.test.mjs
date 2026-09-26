/**
 * Rule precedence (runko-research/_RULE-PRECEDENCE.md) and experience_level
 * (b01 rules 9-13). The expected values are the research's own worked
 * examples, not whatever the code returns.
 */
import {
  LEVEL, createLimits, addLimit, resolveLimits, resolveKey, levelAtLeast,
} from '../src/core/planning/limits.js'
import { experienceLevel } from '../src/core/planning/assess.js'
import { runPlanningPipeline } from '../src/core/planning/index.js'
import { computeLimits } from '../src/core/planning/limits.js'
import { collectInputs } from '../src/core/planning/collect.js'
import { assessFitness } from '../src/core/planning/assess.js'
import { nextWeeklyLoad, nextLongRun, longShareFor, taperFor } from '../src/core/planning/rules.js'
import { PERSONAS, TODAY } from './personas/personas.mjs'
import { check, summary } from './harness.mjs'

console.log('\n=== LIMITS: RULE PRECEDENCE ===')

const resolve = (entries) => {
  const set = createLimits()
  for (const [key, value, rule, level] of entries) addLimit(set, key, value, { rule, level })
  return resolveLimits(set)
}

// Caps: a higher-level rule beats a lower-level one...
let r = resolve([
  ['weeklyIncreasePct', 0.1, 'b04 r8', LEVEL.DEFAULT],
  ['weeklyIncreasePct', 0.05, 'p04 r8', LEVEL.AGE],
  ['weeklyIncreasePct', 0.2, 'b04 r12', LEVEL.SAFETY],
])
check('age cap (p04) wins over the generic default', r.values.weeklyIncreasePct === 0.05 && r.sources.weeklyIncreasePct.rule === 'p04 r8')

// ...even when it is looser (p07 r20 replaces b04 r18 for <= 3 runs)...
r = resolve([
  ['longRunShare', 0.45, 'b04 r18', LEVEL.PLAN],
  ['longRunShare', 0.6, 'p07 r20', LEVEL.POPULATION],
])
check('a population rule may replace a looser b-file cap', r.values.longRunShare === 0.6)

// ...but never past a SAFETY ceiling.
r = resolve([
  ['weeklyIncreasePct', 0.3, 'hypothetical', LEVEL.POPULATION],
  ['weeklyIncreasePct', 0.2, 'b04 r12', LEVEL.SAFETY],
])
check('SAFETY ceiling always applies', r.values.weeklyIncreasePct === 0.2 && r.sources.weeklyIncreasePct.rule === 'b04 r12')

// Within one level the conservative value wins: minimum cap...
r = resolve([
  ['weeklyIncreasePct', 0.1, 'p05 r12', LEVEL.POPULATION],
  ['weeklyIncreasePct', 0.2, 'p01 r14', LEVEL.POPULATION],
])
check('same level: the lower cap wins', r.values.weeklyIncreasePct === 0.1)

// ...maximum gap.
r = resolve([
  ['hardGapHours', 48, 'b05 r3', LEVEL.DEFAULT],
  ['hardGapHours', 60, 'p04 r10', LEVEL.AGE],
  ['hardGapHours', 72, 'p04 r11', LEVEL.AGE],
])
check('same level: the longer gap wins', r.values.hardGapHours === 72)

// A SAFETY gap is kept even against a higher-level shorter one.
r = resolve([
  ['hardGapHours', 24, 'b05 r5', LEVEL.PLAN],
  ['hardGapHours', 48, 'safety floor', LEVEL.SAFETY],
])
check('SAFETY gap is a floor', r.values.hardGapHours === 48)

// Booleans are restrictions: any "true" at the deciding level holds.
const b = resolveKey('noBackToBack', [
  { value: false, rule: 'x', level: LEVEL.PLAN },
  { value: true, rule: 'b05 r6', level: LEVEL.PLAN },
])
check('boolean restriction: true wins', b.value === true)

let threw = false
try { addLimit(createLimits(), 'k', 1, { rule: 'r', level: 9 }) } catch { threw = true }
check('unknown precedence level is rejected', threw)

check('experience scale is ordered', levelAtLeast('advanced', 'novice') && !levelAtLeast('beginner', 'novice'))

console.log('\n=== ASSESSMENT: EXPERIENCE LEVEL (b01 r9-13) ===')

const lvl = (o) => experienceLevel({ fitnessLevel: null, neverRan: false, band: 'moderate', ...o }).level

check('never ran → none', lvl({ months: 0, weeklyKm: 0, longestKm: null, neverRan: true, band: 'none' }) === 'none')
check('3 months, 12 km, 5 km long → novice', lvl({ months: 3, weeklyKm: 12, longestKm: 5 }) === 'novice')
// Median of (beginner, advanced, advanced) = advanced, capped at years + 1 = novice.
check('a big week cannot make a newcomer advanced (cap at years + 1)', lvl({ months: 4, weeklyKm: 60, longestKm: 20 }) === 'novice')
check('6 years, 55 km, 22 km long → advanced', lvl({ months: 72, weeklyKm: 55, longestKm: 22 }) === 'advanced')
check('3 years, 30 km, 14 km long → intermediate', lvl({ months: 36, weeklyKm: 30, longestKm: 14 }) === 'intermediate')
check('elite needs the volume: 10 years, 100 km, 30 km long → elite', lvl({ months: 120, weeklyKm: 100, longestKm: 30 }) === 'elite')
// Missing history: one step below the self-rated level (conservative).
check('no history, self-rated advanced, 40 km, 16 km → intermediate', lvl({ months: null, fitnessLevel: 'advanced', weeklyKm: 40, longestKm: 16 }) === 'intermediate')
check('unknown volume and long run count as beginner', lvl({ months: 36, weeklyKm: null, longestKm: null }) === 'beginner')
check('long history, running nothing now → not "none"', lvl({ months: 60, weeklyKm: 0, longestKm: null, band: 'none' }) !== 'none')

console.log('\n=== LOAD RULES (b04, b06, p04) ===')

// b04 r8-12: percentage, level floor, 20% ceiling; whole kilometres.
const L = (o) => ({ weeklyIncreasePct: 0.1, weeklyFloorKm: 2, weeklyCeilingPct: 0.2, ...o })
check('10% of 40 km → 44 km', nextWeeklyLoad(40, 'distance', L()) === 44)
check('novice floor at 8 km: +2 would be 25%, clipped to the 20% ceiling → 9 km', nextWeeklyLoad(8, 'distance', L()) === 9)
check('intermediate floor: 20 km → 23 km (+3, 15%)', nextWeeklyLoad(20, 'distance', L({ weeklyFloorKm: 3 })) === 23)
check('advanced floor: 30 km → 35 km (+5, under the 36 km ceiling)', nextWeeklyLoad(30, 'distance', L({ weeklyFloorKm: 5 })) === 35)
check('masters 5% with the 1 km step: 30 → 31', nextWeeklyLoad(30, 'distance', L({ weeklyIncreasePct: 0.05, weeklyFloorKm: 1 })) === 31)
check('masters 5% at 60 km → 63', nextWeeklyLoad(60, 'distance', L({ weeklyIncreasePct: 0.05, weeklyFloorKm: 1 })) === 63)
check('tiny volume still moves by the 1 km whole-km step', nextWeeklyLoad(3, 'distance', L()) === 4)

// b04 r16: 1.10 x the 30-day longest, +1 km whole-km step below 10 km.
check('long run 8 → 9 (1 km step)', nextLongRun(8) === 9)
check('long run 20 → 22 (10%)', nextLongRun(20) === 22)
check('long run 29 → 31 (10%, floored)', nextLongRun(29) === 31)

// b04 r18 + decisions 1 and 5.
check('3 runs under 50 km: 45%', longShareFor(3, { weeklyKm: 30 }) === 0.45)
check('2 runs under 50 km: 60%', longShareFor(2, { weeklyKm: 20 }) === 0.6)
check('4 runs under 40 km: 45%', longShareFor(4, { weeklyKm: 35 }) === 0.45)
check('4 runs at 40-50 km: 36%', longShareFor(4, { weeklyKm: 45 }) === 0.36)
check('first marathon at 45 km: 45%', longShareFor(4, { weeklyKm: 45, firstMarathon: true }) === 0.45)
check('above 50 km, no goal: the 36% guidance is applied', longShareFor(5, { weeklyKm: 60 }) === 0.36)
check('above 50 km, long-race goal: may reach half the week', longShareFor(5, { weeklyKm: 60, goalDriven: true }) === 0.5)
check('7 runs keep their smaller layout share (35%)', longShareFor(7, { weeklyKm: 45 }) === 0.35)

// b06 r9-16.
check('5 km taper: 1 week, 0.65 (novice 0.75)',
  taperFor(5, { level: 'intermediate' }).factors.join() === '0.65' && taperFor(5, { level: 'novice' }).factors.join() === '0.75')
check('10 km taper: 1 week; advanced 2 weeks 0.85, 0.60',
  taperFor(10, { level: 'intermediate' }).weeks === 1 && taperFor(10, { level: 'advanced' }).factors.join() === '0.85,0.6')
check('half taper: 14 days 0.70, 0.50', taperFor(21.1, { level: 'intermediate' }).factors.join() === '0.7,0.5')
check('marathon taper: 21 days at peak >= 40 km', taperFor(42.2, { peakKm: 55 }).factors.join() === '0.75,0.6,0.4')
check('marathon taper: 14 days below 40 km', taperFor(42.2, { peakKm: 35 }).factors.join() === '0.7,0.45')

// p04 through computeLimits.
const limitsFor = (profile) => {
  const inputs = collectInputs({
    profile: { weekly_volume_km: 30, longest_run_km: 12, experience_months: 60, ...profile }, today: TODAY,
  })
  return computeLimits(inputs, assessFitness(inputs)).values
}
const a45 = limitsFor({ age: 45 })
check('age 45: 10%, recovery every 4th at 0.75', a45.weeklyIncreasePct === 0.1 && a45.recoveryEvery === 4 && a45.recoveryFactor === 0.75)
const a55 = limitsFor({ age: 55 })
check('age 55: 8%, 2:1, +1 km floor', a55.weeklyIncreasePct === 0.08 && a55.recoveryEvery === 3 && a55.weeklyFloorKm === 1)
const a62 = limitsFor({ age: 62, experience_months: 180 })
check('age 62, injury unknown: 5%, 0.70 recovery', a62.weeklyIncreasePct === 0.05 && a62.recoveryFactor === 0.7)
check('age 62, 15 years, injury-free: 7%', limitsFor({ age: 62, experience_months: 180, injury_last_12m: false }).weeklyIncreasePct === 0.07)
check('age 65 half: long run capped at 150 min', limitsFor({ age: 65, target_distance_km: 21.1 }).longRunMaxMin === 150)
check('age 65 marathon, marathons unknown: 150 min', limitsFor({ age: 65, target_distance_km: 42.2 }).longRunMaxMin === 150)
check('age 65 marathon, 3 marathons: 180 min', limitsFor({ age: 65, target_distance_km: 42.2, marathons_completed: 3 }).longRunMaxMin === 180)
check('age 72: 120 min', limitsFor({ age: 72, target_distance_km: 21.1 }).longRunMaxMin === 120)
check('stated volume starts at 90%', limitsFor({ age: 30 }).startVolumeFactor === 0.9)
check('beginner level: 2:1 cycles', limitsFor({ age: 30, experience_months: 2, weekly_volume_km: 8, longest_run_km: 4 }).recoveryEvery === 3)

console.log('\n=== LIMITS STORED WITH THE PLAN ===')

const persona = PERSONAS.find((p) => p.id === 'mother-never-ran-5k')
const plan = runPlanningPipeline({ profile: persona.profile, today: TODAY })
const stored = plan.weeks[0].planning
check('plan_json carries the resolved limits', stored.limits?.values?.weeklyIncreasePct === 0.1)
check('…with the rule behind each value', stored.limits.rules.weeklyIncreasePct === 'b04 r8')
check('plan_json carries experience_level', stored.assessment.experience_level === 'none')
check('no health data is stored beyond what the engine uses', !('height_cm' in stored.inputs.health) && !('weight' in stored.inputs.health))

export default summary('limits')
