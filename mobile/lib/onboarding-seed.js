import { GOALS, BLOCK_WEEKS } from '../../src/core/planning/goals.js'

/**
 * "What next?" after a goal block arrives as next=repeat|switch|race (from the
 * dashboard's end-of-block card); a repeat also carries the goal it repeats.
 * `params` is a plain object of strings (expo-router search params).
 */
export function readSeed(params = {}) {
  const next = params.next
  if (!['repeat', 'switch', 'race'].includes(next)) return null
  const weeks = Number(params.weeks)
  return {
    next,
    main: GOALS.includes(params.main) ? params.main : '',
    secondary: GOALS.includes(params.secondary) ? params.secondary : '',
    weeks: BLOCK_WEEKS.includes(weeks) ? weeks : null,
    level: Math.max(1, Math.min(5, Number(params.level) || 1)),
  }
}

/** Decimal keyboards may type a comma; the engine's Number() wants a dot. */
export const dot = (text) => String(text ?? '').replace(',', '.')
