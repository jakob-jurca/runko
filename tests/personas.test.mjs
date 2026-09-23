/**
 * Persona suite — synthetic runners run through the plan engine, with the
 * properties a good plan must have asserted in code. No AI call.
 *
 *   npm test                      the planning pipeline (part of the suite)
 *   PLAN_ENGINE=legacy node tests/personas.test.mjs
 *                                 the old one-size engine, for comparison
 */
import { PERSONAS } from './personas/personas.mjs'
import {
  SPECIFIC, restDaysRespected, weeklyIncreaseWithinLimit, longRunProgressionSafe, planningStored,
  runDurationWithinCap,
} from './personas/properties.mjs'
import { planFor, ENGINE } from './personas/engines.mjs'
import { check, summary } from './harness.mjs'

console.log(`\n=== PERSONAS (${ENGINE} engine) ===`)

const rows = []

for (const persona of PERSONAS) {
  const failed = []
  const results = []
  const record = (name, outcome) => {
    results.push({ name, ...outcome })
    if (!outcome.ok) failed.push(`${name}: ${outcome.detail}`)
  }

  let result
  try {
    // Personas with missing or contradictory input must be ASKED first: the
    // pipeline has to stop and return questions rather than guess and build.
    const want = persona.expect.questions
    if (want) {
      const first = await planFor(persona, { withAnswers: false })
      const ids = (first.questions || []).map((q) => q.id)
      const missing = want.filter((id) => !ids.includes(id))
      record('asks before building', first.status === 'needs_answers' && !missing.length && ids.length <= 3
        ? { ok: true }
        : { ok: false, detail: first.status !== 'needs_answers'
            ? 'built a plan without asking'
            : `asked [${ids.join(', ')}], expected [${want.join(', ')}]` })
    }
    result = await planFor(persona)
  } catch (err) {
    record('engine runs', { ok: false, detail: err.message })
  }

  if (result && result.status !== 'ready') {
    record('builds once answered', { ok: false, detail: `still ${result.status}: ${(result.questions || []).map((q) => q.id).join(', ')}` })
  } else if (result) {
    record('rest days respected', restDaysRespected(result, persona))
    record('weekly increase ≤ 10%', weeklyIncreaseWithinLimit(result, persona, 10))
    record('long-run progression safe', longRunProgressionSafe(result, persona))
    record('run duration ≤ 2.5 h (3 h marathon)', runDurationWithinCap(result, persona))
    record('steps 2-4 stored in plan_json', planningStored(result))
    for (const [key, want] of Object.entries(persona.expect)) {
      if (key === 'questions') continue
      const fn = SPECIFIC[key]
      if (!fn) {
        record(key, { ok: false, detail: 'unknown property' })
        continue
      }
      record(key, fn(result, persona, want))
    }
  }

  for (const r of results) check(`${persona.id}: ${r.name}${r.ok ? '' : ` — ${r.detail}`}`, r.ok)
  rows.push({
    persona,
    result,
    passed: results.filter((r) => r.ok).length,
    total: results.length,
    failed,
  })
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------
const cell = (s, n) => String(s ?? '—').padEnd(n).slice(0, n)
console.log('\n' + [
  cell('persona', 28), cell('scenario', 22), cell('verdict', 9), cell('props', 7), 'result',
].join(' '))
console.log('-'.repeat(80))
for (const r of rows) {
  console.log([
    cell(r.persona.id, 28),
    cell(r.result?.scenario, 22),
    cell(r.result?.verdict, 9),
    cell(`${r.passed}/${r.total}`, 7),
    r.failed.length ? `FAIL (${r.failed.length})` : 'PASS',
  ].join(' '))
}
const passing = rows.filter((r) => !r.failed.length).length
console.log(`\n${passing}/${rows.length} personas pass on the ${ENGINE} engine`)

// Standalone runs (node tests/personas.test.mjs) signal failure too.
if (process.argv[1]?.endsWith('personas.test.mjs') && rows.some((r) => r.failed.length)) {
  process.exitCode = 1
}

export default summary('personas')
