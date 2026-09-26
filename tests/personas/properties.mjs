/**
 * The properties a good plan must have, checked in code.
 *
 * Every check takes the engine's result for one persona and returns
 * { ok, detail }. `detail` says what was actually found, so a failing row in
 * the table explains itself.
 *
 * Result shape (see engines.mjs):
 *   { status, questions, scenario, verdict, unit, goal, originalGoal,
 *     proposal, fallbackTarget, startDate, weeks, stored }
 */
import { ALL_DAYS } from './personas.mjs'

export const HARD_TYPES = new Set(['tempo', 'interval', 'repetition'])

/** Floor on a week-to-week increase: a whole kilometre, or 5 minutes. */
const FLOOR_KM = 1
const FLOOR_MIN = 5

const runDaysOf = (week) => week.days.filter((d) => d.type !== 'rest')
const isRace = (d) => d.type === 'race'

/** Weekly load in the week's own unit (or the plan's), ignoring the race itself. */
function weekLoad(week, unit) {
  unit = week.unit ?? unit
  const days = week.days.filter((d) => d.type !== 'rest' && !isRace(d))
  return unit === 'time'
    ? days.reduce((s, d) => s + (Number(d.duration_min) || 0), 0)
    : days.reduce((s, d) => s + (Number(d.distance_km) || 0), 0)
}

const hasRaceDay = (week) => week.days.some(isRace)

/** Weeks that are meant to progress: not recovery, not taper, not race week. */
const progressive = (weeks) =>
  weeks.filter((w) => !w.is_recovery && w.phase !== 'taper' && !hasRaceDay(w))

// ---------------------------------------------------------------------------
// Universal properties — every plan, every persona
// ---------------------------------------------------------------------------

export function restDaysRespected(result, persona) {
  const { available_days: avail, days_per_week: perWeek } = persona.profile
  for (const w of result.weeks) {
    const run = runDaysOf(w)
    if (avail?.length) {
      const bad = run.find((d) => !avail.includes(d.day))
      if (bad) return { ok: false, detail: `week ${w.week_number}: ${bad.type} on ${bad.day}, not an available day` }
    }
    if (perWeek && run.length > perWeek) {
      return { ok: false, detail: `week ${w.week_number}: ${run.length} run days, asked for ${perWeek}` }
    }
    if (run.length >= 7) return { ok: false, detail: `week ${w.week_number}: no rest day` }
  }
  return { ok: true }
}

export function weeklyIncreaseWithinLimit(result, persona, pct = 10) {
  const unit = result.unit
  const floor = unit === 'time' ? FLOOR_MIN : FLOOR_KM
  const limit = (prev) => Math.max(prev * (1 + pct / 100), prev + floor)

  // Week 1 against what they do now.
  const current = Number(persona.profile.weekly_volume_km) || 0
  const first = result.weeks[0]
  if ((first?.unit ?? unit) === 'distance' && current > 0 && first && !hasRaceDay(first)) {
    const load = weekLoad(first, unit)
    if (load > limit(current) + 0.01) {
      return { ok: false, detail: `week 1 is ${load} km against ${current} km/week now` }
    }
  }

  // Each week against the last week that was meant to progress. Where a plan
  // switches from minutes to kilometres, the first kilometre week is held to
  // the km the last minutes week covered.
  let last = null
  for (const w of result.weeks) {
    if (hasRaceDay(w) || w.phase === 'taper') continue
    const u = w.unit ?? unit
    const load = weekLoad(w, unit)
    const prev = last && (last.unit === u ? last.load : u === 'distance' ? last.km : null)
    if (prev && load > limit(prev) + 0.01) {
      return {
        ok: false,
        detail: `week ${w.week_number}: ${load} ${u === 'time' ? 'min' : 'km'} after ${prev} in week ${last.week} (+${Math.round((load / prev - 1) * 100)}%)`,
      }
    }
    if (!w.is_recovery) last = { load, unit: u, km: weekLoad({ ...w, unit: 'distance' }), week: w.week_number }
  }
  return { ok: true }
}

export function longRunProgressionSafe(result, persona) {
  const stated = Number(persona.profile.longest_run_km) || 0
  let prev = stated || null
  let firstChecked = false
  for (const w of result.weeks) {
    if (w.is_recovery || w.phase === 'taper' || hasRaceDay(w)) continue
    const long = Math.max(0, ...runDaysOf(w).map((d) => Number(d.distance_km) || 0))
    if (!long) continue
    if (prev !== null) {
      const cap = Math.max(prev + 2, prev * 1.15)
      if (long > cap + 0.01) {
        return {
          ok: false,
          detail: `week ${w.week_number}: longest run ${long} km after ${prev} km${firstChecked ? '' : ' (their current longest)'}`,
        }
      }
    }
    firstChecked = true
    prev = Math.max(prev ?? 0, long)
  }
  return { ok: true }
}

/**
 * The long-run cap is DURATION: no training run over 2.5 h, or 3 h in a
 * marathon-or-longer plan (knowledge/methodology.md).
 */
export function runDurationWithinCap(result) {
  const cap = (result.goal?.distance_km ?? 0) >= 42.2 ? 180 : 150
  for (const w of result.weeks) {
    for (const d of runDaysOf(w)) {
      if (isRace(d)) continue
      if ((d.duration_min || 0) > cap) {
        return { ok: false, detail: `week ${w.week_number}: ${d.distance_km} km ${d.type} lasts ${d.duration_min} min (cap ${cap})` }
      }
    }
  }
  return { ok: true }
}

export function planningStored(result) {
  const p = result.stored?.planning
  const missing = ['assessment', 'classification', 'feasibility'].filter((k) => !p?.[k])
  return missing.length
    ? { ok: false, detail: `plan_json lacks ${missing.join(', ')}` }
    : { ok: true }
}

// ---------------------------------------------------------------------------
// Persona-specific properties, switched on by `expect`
// ---------------------------------------------------------------------------

export const SPECIFIC = {
  // A safety notice from the gate, carried in the result AND in the intro.
  notice: (r, p, id) => {
    const n = (r.notices || []).find((x) => x.id === id)
    if (!n) return { ok: false, detail: `notices: [${(r.notices || []).map((x) => x.id).join(', ')}]` }
    return r.explain?.intro?.includes(n.text) ? { ok: true } : { ok: false, detail: 'notice missing from the intro' }
  },
  noNotice: (r, p, id) =>
    (r.notices || []).some((x) => x.id === id) ? { ok: false, detail: `has notice ${id}` } : { ok: true },
  // b01 rules 9-13, read from the stored assessment.
  experienceLevel: (r, p, want) => {
    const got = r.stored?.planning?.assessment?.experience_level
    return got === want ? { ok: true } : { ok: false, detail: `experience_level ${got}, expected ${want}` }
  },
  scenario: (r, p, want) =>
    r.scenario === want ? { ok: true } : { ok: false, detail: `got ${r.scenario ?? 'none'}` },

  verdict: (r, p, want) =>
    r.verdict === want ? { ok: true } : { ok: false, detail: `got ${r.verdict ?? 'none'}` },

  walkRun: (r) =>
    r.weeks[0]?.days.some((d) => d.type === 'walk_run')
      ? { ok: true }
      : { ok: false, detail: `week 1 is ${[...new Set(runDaysOf(r.weeks[0] || { days: [] }).map((d) => d.type))].join('+') || 'empty'}` },

  timeBased: (r) =>
    r.unit === 'time' ? { ok: true } : { ok: false, detail: 'plan is prescribed in kilometres' },

  noHardSessions: (r, p, want) => {
    const upTo = typeof want === 'object' ? want.firstWeeks : Infinity
    for (const w of r.weeks.slice(0, upTo)) {
      const hard = w.days.find((d) => HARD_TYPES.has(d.type))
      if (hard) return { ok: false, detail: `week ${w.week_number}: ${hard.type} on ${hard.day}` }
    }
    return { ok: true }
  },

  noBackToBack: (r) => {
    for (const w of r.weeks) {
      const idx = runDaysOf(w).map((d) => ALL_DAYS.indexOf(d.day))
      for (let i = 1; i < idx.length; i++) {
        if (idx[i] - idx[i - 1] === 1) {
          return { ok: false, detail: `week ${w.week_number}: ${ALL_DAYS[idx[i - 1]]} and ${ALL_DAYS[idx[i]]}` }
        }
      }
    }
    return { ok: true }
  },

  maxRunDays: (r, p, max) => {
    const most = Math.max(...r.weeks.map((w) => runDaysOf(w).length))
    return most <= max ? { ok: true } : { ok: false, detail: `${most} run days in a week` }
  },

  maxWeeklyIncreasePct: (r, p, pct) => weeklyIncreaseWithinLimit(r, p, pct),

  maxRunMinutes: (r, p, max) => {
    const longest = Math.max(0, ...r.weeks.flatMap((w) => runDaysOf(w).filter((d) => !isRace(d)).map((d) => d.duration_min || 0)))
    return longest <= max ? { ok: true } : { ok: false, detail: `longest run lasts ${longest} min` }
  },

  maxLongRunKm: (r, p, max) => {
    let worst = null
    for (const w of r.weeks) {
      for (const d of runDaysOf(w)) {
        if (isRace(d)) continue
        if (!worst || d.distance_km > worst.distance_km) worst = { ...d, week: w.week_number }
      }
    }
    return !worst || worst.distance_km <= max
      ? { ok: true }
      : { ok: false, detail: `${worst.distance_km} km ${worst.type} in week ${worst.week}` }
  },

  reachesLongRunKm: (r, p, min) => {
    const longest = Math.max(0, ...r.weeks.flatMap((w) => runDaysOf(w).filter((d) => !isRace(d)).map((d) => d.distance_km)))
    return longest >= min ? { ok: true } : { ok: false, detail: `longest run only ${longest} km` }
  },

  gentleStart: (r) => {
    const first = r.weeks[0]?.days.find((d) => d.type === 'walk_run')
    const bout = first?.walk_run?.run_sec
    return bout && bout <= 30
      ? { ok: true }
      : { ok: false, detail: bout ? `starts with ${bout} s running bouts` : 'no walk-run structure' }
  },

  minHardPerWeek: (r, p, { phase, count }) => {
    const weeks = r.weeks.filter((w) => w.phase === phase && !w.is_recovery)
    if (!weeks.length) return { ok: false, detail: `no ${phase} weeks` }
    const thin = weeks.find((w) => w.days.filter((d) => HARD_TYPES.has(d.type)).length < count)
    return thin
      ? { ok: false, detail: `week ${thin.week_number} has ${thin.days.filter((d) => HARD_TYPES.has(d.type)).length} hard sessions` }
      : { ok: true }
  },

  hasRepetitionWork: (r) =>
    r.weeks.some((w) => w.days.some((d) => d.type === 'repetition' ||
      (d.segments || []).some((s) => s.reps && s.reps.distance_m <= 400)))
      ? { ok: true }
      : { ok: false, detail: 'no short fast reps anywhere' },

  taper: (r) => {
    const raceIdx = r.weeks.findIndex(hasRaceDay)
    if (raceIdx < 1) return { ok: false, detail: 'no race week' }
    const peak = Math.max(...r.weeks.slice(0, raceIdx).map((w) => weekLoad(w, r.unit)))
    const before = weekLoad(r.weeks[raceIdx - 1], r.unit)
    return before < peak ? { ok: true } : { ok: false, detail: `week before the race is ${before}, peak ${peak}` }
  },

  noTaper: (r) =>
    r.weeks.some((w) => w.phase === 'taper' || hasRaceDay(w))
      ? { ok: false, detail: 'plan tapers toward a race that does not exist' }
      : { ok: true },

  raceOnEventDay: (r, p) => {
    const event = p.profile.event_date
    const start = new Date(r.startDate + 'T00:00:00')
    const weekIdx = Math.floor((new Date(event + 'T00:00:00') - start) / (7 * 86_400_000))
    const week = r.weeks[weekIdx]
    const weekday = ALL_DAYS[(new Date(event + 'T00:00:00').getDay() + 6) % 7]
    const race = week?.days.find(isRace)
    return race && race.day === weekday
      ? { ok: true }
      : { ok: false, detail: `week ${weekIdx + 1} ${week ? `has ${race ? `race on ${race.day}` : 'no race'}` : 'is not in the plan'}` }
  },

  noEarlyRace: (r, p) => {
    const event = p.profile.event_date
    const start = new Date(r.startDate + 'T00:00:00')
    const eventIdx = event ? Math.floor((new Date(event + 'T00:00:00') - start) / (7 * 86_400_000)) : -1
    const bad = r.weeks.findIndex((w, i) => hasRaceDay(w) && i !== eventIdx)
    return bad === -1 ? { ok: true } : { ok: false, detail: `race scheduled in week ${bad + 1}` }
  },

  startsBelowPrevious: (r, p) => {
    const current = Number(p.profile.weekly_volume_km) || 0
    const first = r.weeks[0]
    const km = runDaysOf(first).reduce((s, d) => s + (d.distance_km || 0), 0)
    return km <= Math.max(current, 6)
      ? { ok: true }
      : { ok: false, detail: `week 1 is ${km} km (runs ${current} km/week now)` }
  },

  mostlyEasy: (r) => {
    let easy = 0
    let total = 0
    for (const w of r.weeks) {
      for (const d of runDaysOf(w)) {
        total += d.duration_min || 0
        if (d.intensity === 'easy') easy += d.duration_min || 0
      }
    }
    const share = total ? easy / total : 0
    return share >= 0.8 ? { ok: true } : { ok: false, detail: `${Math.round(share * 100)}% easy` }
  },

  flatVolumePct: (r, p, pct) => {
    const loads = progressive(r.weeks).map((w) => weekLoad(w, r.unit))
    const lo = Math.min(...loads)
    const hi = Math.max(...loads)
    return hi <= lo * (1 + (2 * pct) / 100)
      ? { ok: true }
      : { ok: false, detail: `volume ranges ${lo}-${hi} ${r.unit === 'time' ? 'min' : 'km'}` }
  },

  proposesSaferGoal: (r, p) => {
    const alts = r.proposal?.alternatives || []
    const orig = p.profile
    const safer = alts.filter((a) =>
      a.distance_km < orig.target_distance_km ||
      (a.event_date && orig.event_date && a.event_date > orig.event_date))
    return safer.length ? { ok: true } : { ok: false, detail: 'no safer alternative offered' }
  },

  originalGoalNotBuilt: (r, p) => {
    const d = p.profile.target_distance_km
    const race = r.weeks.flatMap((w) => w.days).find(isRace)
    if (race && race.distance_km >= d && (!r.goal?.event_date || r.goal.event_date === p.profile.event_date)) {
      return { ok: false, detail: `still builds the ${race.distance_km} km race on the original date` }
    }
    return { ok: true }
  },

  hasFallbackTarget: (r) =>
    r.fallbackTarget ? { ok: true } : { ok: false, detail: 'no fallback target' },

  raceWalkBreaks: (r) => {
    const race = r.weeks.flatMap((w) => w.days).find(isRace)
    return race?.walk_breaks ? { ok: true } : { ok: false, detail: race ? 'race without walk breaks' : 'no race day' }
  },

  /** Every week from now to race day is in the plan, and the last one holds the race. */
  reachesRaceDay: (r, p) => {
    const event = p.profile.event_date
    const start = new Date(r.startDate + 'T00:00:00')
    const weeksToEvent = Math.floor((new Date(event + 'T00:00:00') - start) / (7 * 86_400_000)) + 1
    const gap = r.weeks.findIndex((w, i) => w.week_number !== i + 1)
    if (gap !== -1) return { ok: false, detail: `week ${gap + 1} is numbered ${r.weeks[gap].week_number}` }
    if (r.weeks.length !== weeksToEvent) {
      return { ok: false, detail: `${r.weeks.length} weeks, race day is in week ${weeksToEvent}` }
    }
    const last = r.weeks[r.weeks.length - 1]
    return hasRaceDay(last) ? { ok: true } : { ok: false, detail: `last week (${last.week_number}) has no race` }
  },

  /**
   * Walk-run in minutes first; once the long session is ~30 minutes non-stop,
   * kilometres — switching exactly once, and never back.
   */
  walkRunThenDistance: (r) => {
    const units = r.weeks.map((w) => w.unit)
    const switchAt = units.indexOf('distance')
    if (units[0] !== 'time' || switchAt === -1) return { ok: false, detail: `units ${[...new Set(units)].join(' → ')}` }
    if (units.slice(switchAt).some((u) => u !== 'distance')) return { ok: false, detail: 'goes back to minutes after kilometres' }
    const lastTime = r.weeks[switchAt - 1]
    const continuous = Math.max(0, ...lastTime.days.map((d) => d.walk_run?.continuous_min || 0))
    return continuous >= 30
      ? { ok: true }
      : { ok: false, detail: `switches in week ${switchAt + 1} after only ${continuous} min non-stop` }
  },

  /** The weeks before the race block are labelled as their own phase. */
  foundationFirst: (r, p, weeks) => {
    const lead = r.weeks.findIndex((w) => w.phase !== 'foundation')
    return lead === weeks ? { ok: true } : { ok: false, detail: `${lead === -1 ? r.weeks.length : lead} foundation weeks, expected ${weeks}` }
  },
}
