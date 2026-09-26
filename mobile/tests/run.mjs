/** Mobile test runner: `npm test` in mobile/. Pure logic only, no device. */
const SUITES = ['./auth-link.test.mjs', './hybrid-storage.test.mjs', './platform.test.mjs', './logic.test.mjs', './reminders.test.mjs']

let passes = 0
const failed = []
for (const file of SUITES) {
  console.log(`\n== ${file}`)
  const mod = await import(file)
  const r = mod.result
  passes += r.passes
  failed.push(...r.failures.map((f) => `${file}: ${f}`))
}
console.log('\n' + '='.repeat(50))
if (failed.length) {
  console.log(`FAILED — ${failed.length} of ${passes + failed.length}`)
  failed.forEach((f) => console.log('  ' + f))
  process.exit(1)
}
console.log(`PASSED — all ${passes} checks`)
