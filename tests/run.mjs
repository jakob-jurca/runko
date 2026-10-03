/**
 * Test runner — `npm test`.
 *
 * Most suites here exercise pure logic from src/core: no network, no API key,
 * no database, no bundler. That is deliberate — the training-plan maths is the
 * part that must be provably correct, and it should be checkable in a second
 * on any machine.
 *
 * The two RLS suites are the exception, because the question "can one runner
 * read another's data" cannot be answered by reading source:
 *   - rls-schema  reads supabase/*.sql and always runs.
 *   - rls-live    attacks the real database with two users; it runs whenever
 *                 .env has credentials and SKIPS (visibly, listed below) when
 *                 it cannot, so the suite still works offline.
 */
const SUITES = [
  './periodization.test.mjs',
  './goal.test.mjs',
  './paces.test.mjs',
  './heart-rate.test.mjs',
  './coach-prompt.test.mjs',
  './coach-scope.test.mjs',
  './ai-limits.test.mjs',
  './entitlements.test.mjs',
  './stripe.test.mjs',
  './pricing.test.mjs',
  './payments-switch.test.mjs',
  './usage-limits.test.mjs',
  './health-break.test.mjs',
  './weekly-review.test.mjs',
  './trial-reminder.test.mjs',
  './auth.test.mjs',
  './chat-format.test.mjs',
  './dates.test.mjs',
  './imports.test.mjs',
  './logging.test.mjs',
  './plan-rows.test.mjs',
  './limits.test.mjs',
  './returning.test.mjs',
  './intensity.test.mjs',
  './research.test.mjs',
  './gate.test.mjs',
  './personas.test.mjs',
  './override-sweep.test.mjs',
  './goals.test.mjs',
  './knowledge-scenarios.test.mjs',
  './plan-guard.test.mjs',
  './rls-schema.test.mjs',
  './rls-live.test.mjs',
]

let totalPasses = 0
const allFailures = []
const skipped = []

for (const suite of SUITES) {
  const { default: result } = await import(suite)
  totalPasses += result.passes
  if (result.skipped) skipped.push(`${result.name}: ${result.skipped}`)
  for (const f of result.failures) allFailures.push(`${result.name}: ${f}`)
}

console.log('\n' + '='.repeat(60))
// Skips are printed before the verdict so a silently un-run security check is
// impossible to miss.
for (const s of skipped) console.log(`SKIPPED — ${s}`)
if (allFailures.length) {
  console.log(`FAILED — ${allFailures.length} of ${totalPasses + allFailures.length} checks`)
  for (const f of allFailures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`PASSED — all ${totalPasses} checks`)
