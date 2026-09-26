/**
 * guard.js — keep an AI-adapted week inside the plan's own rules.
 *
 * The premium weekly adaptation lets the AI rewrite a week. Without a guard
 * it could hand a complete beginner a tempo run, put a run on a day the
 * runner cannot run, or add kilometres the progression never allowed. The
 * scenario's rules travel with every stored week (allow_hard, time_based
 * days, run days), so the guard enforces them against the original week.
 */
const HARD = new Set(['tempo', 'interval', 'repetition'])

/** True when this week must not be rewritten by the AI at all. */
export function isAdaptable(week) {
  // Walk-run and minute-based weeks follow a ladder; a kilometre rewrite
  // from the AI would break both the unit and the progression.
  return !(week?.days || []).some((d) => d.time_based)
}

/**
 * @param {object} original - the stored week (plan_json)
 * @param {Array} proposed - seven days from the AI
 * @returns {{days: Array, changes: string[]}} days safe to store, and what was corrected
 */
export function enforceWeekRules(original, proposed) {
  const changes = []
  const base = original?.days || []
  if (!isAdaptable(original) || !Array.isArray(proposed) || proposed.length !== 7) {
    return { days: base, changes: ['kept the original week'] }
  }

  const runDays = new Set(base.filter((d) => d.type !== 'rest').map((d) => d.day))
  const longest = Math.max(0, ...base.filter((d) => d.type !== 'race').map((d) => Number(d.distance_km) || 0))
  const budget = base.reduce((s, d) => s + (Number(d.distance_km) || 0), 0)

  let days = proposed.map((d, i) => {
    const orig = base.find((b) => b.day === d.day) || base[i]
    // The race and a time trial are fixed.
    if (orig?.type === 'race' || orig?.type === 'time_trial') return orig
    // Rest days stay rest days: they are the runner's unavailable days, or
    // the spacing the scenario requires.
    if (d.type !== 'rest' && !runDays.has(d.day)) {
      changes.push(`${d.day}: run moved off a rest day`)
      return { ...orig }
    }
    let day = { ...d }
    if (HARD.has(day.type) && original.allow_hard === false) {
      changes.push(`${d.day}: ${day.type} → easy (no hard sessions in this week)`)
      day = { ...day, type: 'easy', pace_key: 'easy', hard_km: 0, intensity: 'easy' }
    }
    if (day.type !== 'rest' && Number(day.distance_km) > longest) {
      changes.push(`${d.day}: ${day.distance_km} km capped at ${longest} km`)
      day = { ...day, distance_km: longest }
    }
    return day
  })

  // Never more volume than the week the progression allowed.
  const total = days.reduce((s, d) => s + (Number(d.distance_km) || 0), 0)
  if (total > budget + 0.5) {
    const easy = days.filter((d) => d.type === 'easy')
    const easyKm = easy.reduce((s, d) => s + d.distance_km, 0)
    const excess = total - budget
    if (easyKm > 0) {
      const f = Math.max(0, (easyKm - excess) / easyKm)
      days = days.map((d) => (d.type === 'easy' ? { ...d, distance_km: Math.max(1, Math.round(d.distance_km * f)) } : d))
      changes.push(`easy runs scaled to keep the week at ${Math.round(budget)} km`)
    }
  }
  return { days, changes }
}
