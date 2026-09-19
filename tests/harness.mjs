/**
 * A ~30-line test harness so the suite has ZERO dependencies and runs with
 * plain `node`. Everything under test is pure logic in src/core, so there is
 * nothing to mock and no API call to make.
 */

let failures = []
let passes = 0

/** Assert `condition`, printing a labelled line either way. */
export function check(label, condition) {
  if (condition) {
    passes++
    console.log(`  ok   ${label}`)
  } else {
    failures.push(label)
    console.log(`  FAIL ${label}`)
  }
}

/** Floating-point comparison with an explicit tolerance. */
export function near(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance
}

/** Call at the end of a test file; returns its result for the runner. */
export function summary(name) {
  const result = { name, passes, failures: [...failures] }
  passes = 0
  failures = []
  return result
}
