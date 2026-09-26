/**
 * returning.js — coming back after time off (runko-research b07 r8-16, b01
 * r15, p06 r24-29).
 *
 * Daniels' four categories by days off, the fitness-loss factor (FVDOT) that
 * lowers the VDOT the paces come from, and where a comeback starts. Pure
 * arithmetic; assess.js, limits.js and the builders share it.
 */

/** b07 section 1.1: days off -> FVDOT-1 (no cross-training) and FVDOT-2 (kept fit). */
const T1 = [1.0, 0.997, 0.994, 0.985, 0.973, 0.952, 0.931, 0.91, 0.889, 0.868, 0.847, 0.826, 0.805, 0.8]
const T2 = [1.0, 0.998, 0.997, 0.992, 0.986, 0.976, 0.965, 0.955, 0.944, 0.934, 0.923, 0.913, 0.902, 0.9]
// Table columns: <=5, 6, 7, 10, 14, 21, 28, 35, 42, 49, 56, 63, 70, >=72 days off.
const DAYS = [5, 6, 7, 10, 14, 21, 28, 35, 42, 49, 56, 63, 70, 72]

/** b07 r9: linear interpolation, floor 0.800 (0.900 with cross-training). */
export function fvdot(daysOff, crossTrained = false) {
  const t = crossTrained ? T2 : T1
  if (!(daysOff > DAYS[0])) return 1
  if (daysOff >= DAYS[DAYS.length - 1]) return t[t.length - 1]
  const i = DAYS.findIndex((d) => daysOff <= d)
  const f = (daysOff - DAYS[i - 1]) / (DAYS[i] - DAYS[i - 1])
  return Math.round((t[i - 1] + f * (t[i] - t[i - 1])) * 1000) / 1000
}

/**
 * Daniels' categories: I (5 days or less, nothing changes), II (6-28), III
 * (29-56), IV (over 56). Unknown counts as no break: nothing is guessed.
 */
export function breakCategory(daysOff) {
  if (!(daysOff > 5)) return 'I'
  if (daysOff <= 28) return 'II'
  if (daysOff <= 56) return 'III'
  return 'IV'
}

/**
 * Where the volume restarts, as a share of the pre-break week (b07 r11-13):
 * 0.50 for 6-28 days off (0.75 in the second half of the return period),
 * 0.33 beyond. Growth after the start follows the ordinary caps, which are
 * stricter than the research's +15% (b04 r10): the conservative side wins.
 */
export function returnStartFactor(daysOff) {
  const c = breakCategory(daysOff)
  return c === 'I' ? 1 : c === 'II' ? 0.5 : 0.33
}

/**
 * Whole weeks of Z1-Z2-only running (b07 r15, p06 r28): the return period
 * for a short break, and for a long one or an injury the time it takes to get
 * back to 50% of the old volume at +10% a week.
 */
export function easyOnlyWeeks(daysOff, { injury = false } = {}) {
  const c = breakCategory(daysOff)
  if (c === 'I' && !injury) return 0
  if (c === 'II' && !injury) return Math.ceil(daysOff / 7)
  const start = injury && c === 'I' ? 0.33 : returnStartFactor(daysOff)
  return Math.max(2, Math.ceil(Math.log(0.5 / Math.min(start, 0.5)) / Math.log(1.1)))
}
