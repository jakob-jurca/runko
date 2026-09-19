/**
 * Test runner — `npm test`.
 *
 * Every suite here exercises pure logic from src/core: no network, no API
 * key, no database, no bundler. That is deliberate — the training-plan maths
 * is the part that must be provably correct, and it should be checkable in a
 * second on any machine.
 */
const SUITES = ['./periodization.test.mjs', './goal.test.mjs', './paces.test.mjs', './coach-prompt.test.mjs', './chat-format.test.mjs', './plan-rows.test.mjs']

let totalPasses = 0
const allFailures = []

for (const suite of SUITES) {
  const { default: result } = await import(suite)
  totalPasses += result.passes
  for (const f of result.failures) allFailures.push(`${result.name}: ${f}`)
}

console.log('\n' + '='.repeat(60))
if (allFailures.length) {
  console.log(`FAILED — ${allFailures.length} of ${totalPasses + allFailures.length} checks`)
  for (const f of allFailures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`PASSED — all ${totalPasses} checks`)
