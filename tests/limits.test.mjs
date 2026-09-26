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

console.log('\n=== LIMITS STORED WITH THE PLAN ===')

const persona = PERSONAS.find((p) => p.id === 'mother-never-ran-5k')
const plan = runPlanningPipeline({ profile: persona.profile, today: TODAY })
const stored = plan.weeks[0].planning
check('plan_json carries the resolved limits', stored.limits?.values?.weeklyIncreasePct === 0.1)
check('…with the rule behind each value', stored.limits.rules.weeklyIncreasePct === 'b04 r8')
check('plan_json carries experience_level', stored.assessment.experience_level === 'none')
check('no health data is stored beyond what the engine uses', !('height_cm' in stored.inputs.health) && !('weight' in stored.inputs.health))

export default summary('limits')
