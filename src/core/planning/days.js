/**
 * days.js — which weekdays a runner runs on.
 *
 * Shared by every builder so "rest days respected" means the same thing in
 * every scenario: only the runner's available days, never more run days than
 * they asked for, and — where the scenario or the runner needs it — never two
 * run days in a row, counting Sunday → Monday across the week boundary.
 */
import { DAYS } from '../periodization.js'

const idx = (d) => DAYS.indexOf(d)

/** True if no two chosen days touch, including Sunday → next Monday. */
function spacedCyclically(days) {
  const i = days.map(idx).sort((a, b) => a - b)
  for (let k = 1; k < i.length; k++) if (i[k] - i[k - 1] < 2) return false
  return i.length < 2 || i[0] + 7 - i[i.length - 1] >= 2
}

function combinations(pool, k) {
  const out = []
  const walk = (start, picked) => {
    if (picked.length === k) return out.push([...picked])
    for (let i = start; i < pool.length; i++) walk(i + 1, [...picked, pool[i]])
  }
  walk(0, [])
  return out
}

/** How evenly a set of days spreads over the week (bigger = better). */
function spreadScore(days) {
  const i = days.map(idx).sort((a, b) => a - b)
  const gaps = i.map((d, k) => (k === 0 ? d + 7 - i[i.length - 1] : d - i[k - 1]))
  return Math.min(...gaps) * 10 + (i[i.length - 1] >= 5 ? 1 : 0) // prefer a weekend long run
}

/**
 * @param {object} opts
 * @param {number} opts.count - run days wanted
 * @param {string[]|null} opts.available - weekdays the runner can run
 * @param {boolean} opts.noBackToBack
 * @returns {string[]} weekdays, Monday-first
 */
export function pickRunDays({ count, available, noBackToBack }) {
  const pool = available?.length ? DAYS.filter((d) => available.includes(d)) : [...DAYS]
  const n = Math.max(1, Math.min(count, pool.length))

  if (noBackToBack) {
    // Seven days hold at most three that never touch (cyclically). Search the
    // few combinations for the best-spread one, dropping a day if none fits.
    for (let k = Math.min(n, 3); k >= 1; k--) {
      const ok = combinations(pool, k).filter(spacedCyclically)
      if (ok.length) return ok.sort((a, b) => spreadScore(b) - spreadScore(a))[0].sort((a, b) => idx(a) - idx(b))
    }
  }

  if (n >= pool.length) return pool
  const best = combinations(pool, n).sort((a, b) => spreadScore(b) - spreadScore(a))[0]
  return best.sort((a, b) => idx(a) - idx(b))
}
