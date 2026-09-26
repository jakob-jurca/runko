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

/**
 * runko-research load rules, written out here from the research text (not
 * imported from the engine, so the engine is never checked against itself):
 *
 *   b04 r8-12  weekly increase: the runner's percentage (10%; p04: 8% at
 *              50-59, 5% at 60+), or the level's absolute floor where the
 *              percentage rounds to nothing (+2 km beginner/novice, +3
 *              intermediate, +5 advanced/elite; masters +1 km), never more
 *              than 20% — whole kilometres, so +1 km is always allowed.
 *   b04 r16    no run over 1.10 x the longest run of the last 30 days; with
 *              whole kilometres the smallest step is +1 km.
 *   b04 r20    long run <= 150 min, 180 in marathon plans; p04 r21: 150 at
 *              60+, 120 at 70+, unless >= 2 marathons.
 */
const FLOOR_MIN = 5
const LEVEL_FLOOR_KM = { none: 2, beginner: 2, novice: 2, intermediate: 3, advanced: 5, elite: 5 }

/** p04 r6-8: the weekly percentage for this runner's age. */
export function agePct(persona) {
  const age = persona.profile.age ?? 0
  const seasoned = (persona.profile.experience_months ?? 0) >= 120 && persona.profile.injury_last_12m === false
  if (age >= 60) return seasoned ? 7 : 5
  if (age >= 50) return 8
  return 10
}

function floorKm(result, persona) {
  if ((persona.profile.age ?? 0) >= 50) return 1
  return LEVEL_FLOOR_KM[result.stored?.planning?.assessment?.experience_level] ?? 2
}

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

export function weeklyIncreaseWithinLimit(result, persona, pct = agePct(persona)) {
  const unit = result.unit
  const kmFloor = floorKm(result, persona)
  // Walk-run minutes: 10% or 5 min here; the +10 running-minute rule is walkRunWithinLimits.
  const limit = (prev, u = unit) => u === 'time'
    ? Math.max(prev * 1.1, prev + FLOOR_MIN)
    : Math.min(Math.max(prev * (1 + pct / 100), prev + kmFloor), Math.max(prev * 1.2, prev + 1))

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
    // Walking is not running load (p05 r12 caps RUNNING minutes): the check starts with the first run.
    if (w.days.every((d) => d.type === 'walk' || d.type === 'rest')) { last = null; continue }
    const u = w.unit ?? unit
    const load = weekLoad(w, unit)
    const prev = last && (last.unit === u ? last.load : u === 'distance' ? last.km : null)
    if (prev && load > limit(prev, u) + 0.01) {
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
  const longs = []
  for (const [i, w] of result.weeks.entries()) {
    const long = Math.max(0, ...runDaysOf(w).filter((d) => !isRace(d)).map((d) => Number(d.distance_km) || 0))
    // The last 30 days: the four weeks before, and their stated longest
    // while the plan is younger than that.
    const m30 = Math.max(0, ...longs.slice(-4), i < 4 ? stated : 0)
    if ((w.unit ?? result.unit) === 'distance' && m30 > 0) {
      const cap = Math.floor(Math.max(m30 * 1.1, m30 + 1))
      if (long > cap + 0.01) {
        return { ok: false, detail: `week ${w.week_number}: longest run ${long} km, 30-day longest ${m30} km (cap ${cap})` }
      }
    }
    longs.push(long)
  }
  return { ok: true }
}

/**
 * The long-run cap is DURATION: no training run over 2.5 h, or 3 h in a
 * marathon-or-longer plan (knowledge/methodology.md).
 */
export function runDurationWithinCap(result, persona) {
  let cap = (result.goal?.distance_km ?? 0) >= 42.2 ? 180 : 150
  const age = persona?.profile?.age ?? 0
  if (age >= 60 && !((persona.profile.marathons_completed ?? 0) >= 2)) cap = Math.min(cap, age >= 70 ? 120 : 150)
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

/**
 * b04 r18 with decisions 1 and 5: below 50 km a week the long run is at most
 * 60% of the week on 2 run days, 45% on 3, and on 4+ days 45% under 40 km (or
 * a first marathon, marathons_completed = 0) and 36% from 40 km. Above 50 km
 * the 36% is guidance a long-race goal may exceed, never past half the week.
 * One kilometre of tolerance for whole-kilometre rounding.
 */
export function longRunShareWithinCap(result, persona) {
  const firstMarathon = (result.goal?.distance_km ?? 0) >= 42.2 && persona.profile.marathons_completed === 0
  const longRace = (result.goal?.distance_km ?? 0) > 10
  for (const w of result.weeks) {
    if ((w.unit ?? result.unit) !== 'distance' || hasRaceDay(w)) continue
    const runs = runDaysOf(w)
    const km = weekLoad(w, 'distance')
    if (!runs.length || !km) continue
    const long = Math.max(...runs.map((d) => d.distance_km || 0))
    let cap
    if (km >= 50) cap = longRace ? 0.5 : 0.36
    else if (runs.length <= 2) cap = 0.6
    else if (runs.length === 3) cap = 0.45
    else cap = km < 40 || firstMarathon ? 0.45 : 0.36
    // A week of a single run (fragments dropped) has nothing to share with.
    if (runs.length > 1 && long > km * cap + 1) {
      return { ok: false, detail: `week ${w.week_number}: long run ${long} km of ${km} km (${Math.round((long / km) * 100)}%, cap ${cap * 100}%)` }
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
    r.weeks.some((w) => w.days.some((d) => d.type === 'walk_run'))
      ? { ok: true }
      : { ok: false, detail: 'no walk-run session in the plan' },

  walkBase: (r, p, weeks) => {
    const first = r.weeks.findIndex((w) => w.days.some((d) => d.type === 'walk_run'))
    const walked = r.weeks.slice(0, weeks).every((w) => w.days.every((d) => d.type === 'walk' || d.type === 'rest'))
    return walked && first === weeks ? { ok: true } : { ok: false, detail: `first walk-run week index ${first}, wanted ${weeks}` }
  },

  // The first walk-run session (p03 section 2.8: the Goom table starts 8 x 1 min run).
  firstWalkRun: (r, p, want) => {
    const d = r.weeks.flatMap((w) => w.days).find((x) => x.type === 'walk_run')?.walk_run
    return d && d.repeats === want.repeats && d.run_sec === want.run_sec
      ? { ok: true }
      : { ok: false, detail: `first walk-run is ${d ? `${d.repeats} x ${d.run_sec} s` : 'missing'}` }
  },

  firstWeekMaxKm: (r, p, max) => {
    const km = weekLoad(r.weeks[0], 'distance')
    return km <= max + 0.01 ? { ok: true } : { ok: false, detail: `week 1 is ${km} km, at most ${max}` }
  },

  noQualityUntilWeek: (r, p, n) => {
    for (const w of r.weeks.slice(0, n)) {
      const hard = w.days.find((d) => HARD_TYPES.has(d.type))
      if (hard) return { ok: false, detail: `week ${w.week_number}: ${hard.type}` }
    }
    return { ok: true }
  },

  walkingOnly: (r) => {
    const types = new Set(r.weeks.flatMap((w) => w.days.map((d) => d.type)))
    const bad = [...types].filter((x) => !['walk', 'rest'].includes(x))
    return bad.length ? { ok: false, detail: `types: ${bad.join(', ')}` } : { ok: true }
  },

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

  maxWeeklyKm: (r, p, max) => {
    const worst = Math.max(0, ...r.weeks.map((w) => weekLoad(w, 'distance')))
    return worst <= max + 0.01 ? { ok: true } : { ok: false, detail: `a ${worst} km week` }
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

  // b06 r9-17: the race week carries less training than the peak, and every
  // taper week less than the one before it (no rebound inside a taper).
  taper: (r) => {
    const raceIdx = r.weeks.findIndex(hasRaceDay)
    if (raceIdx < 1) return { ok: false, detail: 'no race week' }
    const peak = Math.max(...r.weeks.slice(0, raceIdx).map((w) => weekLoad(w, r.unit)))
    const race = weekLoad(r.weeks[raceIdx], r.unit)
    if (!(race < peak)) return { ok: false, detail: `race week training ${race}, peak ${peak}` }
    const first = r.weeks.findIndex((w) => w.phase === 'taper')
    for (let i = Math.max(1, first); first !== -1 && i <= raceIdx; i++) {
      const a = weekLoad(r.weeks[i - 1], r.unit)
      const b = weekLoad(r.weeks[i], r.unit)
      if (b >= a) return { ok: false, detail: `taper week ${r.weeks[i].week_number}: ${b} after ${a}` }
    }
    return { ok: true }
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
  // b06 r1, p04 r14: at most n-1 loading weeks between two recovery weeks.
  recoveryCycle: (r, p, n) => {
    const idx = r.weeks.map((w, i) => (w.is_recovery ? i : -1)).filter((i) => i >= 0)
    if (!idx.length) return { ok: false, detail: 'no recovery week' }
    for (let k = 1; k < idx.length; k++) {
      if (idx[k] - idx[k - 1] > n) return { ok: false, detail: `recovery weeks ${idx[k - 1] + 1} and ${idx[k] + 1}: ${idx[k] - idx[k - 1] - 1} loading weeks between` }
    }
    return { ok: true }
  },

  // b06 r2, p04 r14: a recovery week is at most f x the loading week before it.
  recoveryDepth: (r, p, f) => {
    for (const [i, w] of r.weeks.entries()) {
      if (!w.is_recovery || i === 0 || (w.unit ?? r.unit) !== 'distance') continue
      const before = weekLoad(r.weeks[i - 1], 'distance')
      const load = weekLoad(w, 'distance')
      if (load > before * f + 1) return { ok: false, detail: `week ${w.week_number}: ${load} km after ${before} (> ${f})` }
    }
    return { ok: true }
  },

  // b06 r9: taper length in weeks, race week included.
  taperWeeks: (r, p, n) => {
    const got = r.weeks.filter((w) => w.phase === 'taper').length
    return got === n ? { ok: true } : { ok: false, detail: `${got} taper weeks, expected ${n}` }
  },

  foundationFirst: (r, p, weeks) => {
    const lead = r.weeks.findIndex((w) => w.phase !== 'foundation')
    return lead === weeks ? { ok: true } : { ok: false, detail: `${lead === -1 ? r.weeks.length : lead} foundation weeks, expected ${weeks}` }
  },

  // --- goal blocks (no race) ------------------------------------------------
  // The goal the block was built for, after any adjustment.
  goalMain: (r, p, want) => {
    const got = r.weeks[0]?.goal_plan?.main
    return got === want ? { ok: true } : { ok: false, detail: `goal ${got ?? 'none'}, expected ${want}` }
  },

  // The block is exactly this long, numbered 1..n.
  blockWeeks: (r, p, n) => {
    const gap = r.weeks.findIndex((w, i) => w.week_number !== i + 1)
    if (r.weeks.length !== n) return { ok: false, detail: `${r.weeks.length} weeks, expected ${n}` }
    return gap === -1 ? { ok: true } : { ok: false, detail: `week ${gap + 1} is numbered ${r.weeks[gap].week_number}` }
  },

  goalAdjusted: (r, p, id) => {
    const ids = (r.weeks[0]?.goal_plan?.adjustments || []).map((a) => a.id)
    return ids.includes(id) && r.explain?.intro
      ? { ok: true }
      : { ok: false, detail: `adjustments [${ids.join(', ')}], expected ${id}` }
  },

  goalMetric: (r, p, kind) => {
    const metrics = r.weeks[0]?.goal_plan?.metrics || []
    return metrics[0] === kind ? { ok: true } : { ok: false, detail: `metrics [${metrics.join(', ')}], expected ${kind} first` }
  },

  // A block without a race has no race day, no taper and no event date.
  noRaceInPlan: (r) => {
    const bad = r.weeks.find((w) => w.phase === 'taper' || hasRaceDay(w))
    return bad || r.goal?.event_date ? { ok: false, detail: `week ${bad?.week_number}: race or taper in a block without one` } : { ok: true }
  },

  // The speed goal: one 5 km time trial in the first week and one in the last, and no other.
  timeTrials: (r) => {
    const trialWeeks = r.weeks.filter((w) => w.days.some((d) => d.type === 'time_trial')).map((w) => w.week_number)
    const want = [1, r.weeks.length]
    if (trialWeeks.join() !== want.join()) return { ok: false, detail: `trials in weeks [${trialWeeks.join(', ')}], expected [${want.join(', ')}]` }
    const each = r.weeks.flatMap((w) => w.days.filter((d) => d.type === 'time_trial'))
    const bad = each.find((d) => d.trial_km !== 5 || d.distance_km < 5)
    return bad ? { ok: false, detail: `a trial of ${bad.trial_km} km (session ${bad.distance_km} km)` } : { ok: true }
  },

  noStrides: (r) => {
    const w = r.weeks.find((x) => x.days.some((d) => d.variant === 'strides'))
    return w ? { ok: false, detail: `strides in week ${w.week_number}` } : { ok: true }
  },

  // The weight goal never puts a weight or a calorie in front of the runner.
  noBodyTargets: (r) => {
    const found = []
    const walk = (value, path) => {
      if (typeof value === 'string') {
        if (BODY_TARGET.test(value)) found.push(`${path}: ${value.slice(0, 60)}`)
      } else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`))
      else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`)
    }
    walk({ intro: r.explain, weeks: r.weeks.map(({ planning, ...w }) => w) }, 'plan')
    return found.length ? { ok: false, detail: found[0] } : { ok: true }
  },
}

/** A weight in kg, a calorie figure, or the words for losing weight or dieting. */
const BODY_TARGET = /\d\s*(kg|kilogram|kcal|kalorij)|kalorij|kcal|hujš|shujš|izgub\w* (teže|kil)|tehtnic|\bdiet/i

/**
 * Walk-run rules (decision 6): in a minutes plan, running minutes grow by at
 * most 10 a week, and no session runs more than max(110%, +5 min) of the
 * longest running session of the last four weeks.
 */
export function walkRunWithinLimits(result) {
  const runMin = (d) => d.walk_run
    ? d.walk_run.run_min_total ?? 0
    : ['easy', 'long'].includes(d.type) && d.time_based ? Math.max(0, (d.duration_min || 0) - 10) : 0
  const weeks = result.weeks.filter((w) => w.unit === 'time')
  if (!weeks.length) return { ok: true }
  const sessions = weeks.map((w) => w.days.filter((d) => d.type !== 'race').map(runMin))
  let lastTotal = null
  for (const [i, w] of weeks.entries()) {
    if (w.phase === 'taper' || w.days.some((d) => d.type === 'race')) continue
    const total = sessions[i].reduce((s, x) => s + x, 0)
    if (lastTotal && total > lastTotal + 10 + 0.01) {
      return { ok: false, detail: `week ${w.week_number}: ${total} running min after ${lastTotal} (+${total - lastTotal})` }
    }
    const recent = Math.max(0, ...sessions.slice(Math.max(0, i - 4), i).flat())
    const longest = Math.max(...sessions[i])
    if (recent && longest > Math.max(recent * 1.1, recent + 5) + 0.01) {
      return { ok: false, detail: `week ${w.week_number}: a ${longest} min running session after ${recent} min` }
    }
    if (!w.is_recovery) lastTotal = total
  }
  return { ok: true }
}

/**
 * Intensity and placement (Group B): on every kilometre week of every plan,
 * quality sessions stay within the cap for the runner's level, phase and age;
 * hard sessions keep their gap (48/60/72 h by age); the low-intensity share
 * holds (75%, 70% on 3 runs or fewer); and in race week no quality session
 * falls inside the last 4 (5-10 km) or 6 (half and up) days.
 */
import { qualityCap, hardGapDays, lastQualityDaysBeforeRace } from '../../src/core/planning/intensity.js'

export function intensityRulesKept(result, persona) {
  const p = result.stored?.planning
  const level = p?.assessment?.experience_level
  const runDays = p?.feasibility?.run_days ?? 4
  const age = persona.profile.age ?? null
  const gap = hardGapDays(p?.limits?.values?.hardGapHours ?? 48)
  const distance = result.goal?.distance_km ?? 0
  const idx = (d) => ALL_DAYS.indexOf(d.day)
  for (const w of result.weeks) {
    if ((w.unit ?? result.unit) === 'time') continue
    const q = w.days.filter((d) => HARD_TYPES.has(d.type))
    const cap = qualityCap({ level, phase: w.phase, age, runDays, injuryFree: persona.profile.injury_last_12m === false })
    if (q.length > cap) return { ok: false, detail: `week ${w.week_number}: ${q.length} quality sessions, cap ${cap}` }
    const km = w.days.reduce((s, d) => s + (d.distance_km || 0), 0)
    const hard = w.days.filter((d) => HARD_TYPES.has(d.type) || d.type === 'race')
      .sort((a, b) => idx(a) - idx(b))
    // Long runs are allowed to sit next to a hard day only when they are easy
    // runs of the ordinary kind; two quality or race days always keep the gap.
    for (let i = 1; i < hard.length; i++) {
      if (idx(hard[i]) - idx(hard[i - 1]) < gap && HARD_TYPES.has(hard[i].type) && HARD_TYPES.has(hard[i - 1].type)) {
        return { ok: false, detail: `week ${w.week_number}: ${hard[i - 1].day} and ${hard[i].day} are ${idx(hard[i]) - idx(hard[i - 1])} day(s) apart` }
      }
    }
    if (km && w.days.some((d) => d.type !== 'race')) {
      const low = 1 - w.days.reduce((s, d) => s + (d.hard_km || 0), 0) / km
      const min = runDays <= 3 ? 0.7 : 0.75
      if (low < min - 0.001 && !w.days.some((d) => d.type === 'race')) {
        return { ok: false, detail: `week ${w.week_number}: ${Math.round(low * 100)}% easy, floor ${Math.round(min * 100)}%` }
      }
    }
    const race = w.days.find((d) => d.type === 'race')
    if (race) {
      const need = lastQualityDaysBeforeRace(distance)
      const late = q.find((d) => idx(race) - idx(d) < need)
      if (late) return { ok: false, detail: `race week: ${late.type} on ${late.day}, ${idx(race) - idx(late)} days before the race` }
    }
  }
  return { ok: true }
}
