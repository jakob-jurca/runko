/**
 * intensity.js — how much hard running a week holds, and where it goes.
 *
 * A post-pass over the kilometre weeks the builders lay out (runko-research
 * b03 r18-21, b05 r2-22, b06 r20-28, p08 r9-10). The builders decide volumes
 * and the long run; this file makes every week obey the same intensity and
 * placement rules, whichever scenario built it:
 *
 *   quality cap        sessions per week by level and phase, lowered by age,
 *                      teens and the number of run days
 *   hard-session gap   48 h by default, 60 h at 50-59, 72 h at 60+
 *   low-intensity      at least 75% of the running easy (70% on 3 runs or fewer)
 *   race week          the last quality session 4 (5-10 km) or 6 (half and up) days out
 *   easy runs          20 minutes at least, never longer than 0.75 x the long run
 *   strides            1-2 easy runs a week once the base is under way
 *   marathon long run  the last km at marathon pace, at most 110 minutes of it
 *   strength           optional notes, never within 48 h before a hard session
 *
 * Only ever DEMOTES (quality -> easy, an easy run -> rest) or annotates: no
 * rule here adds load beyond what a dropped run carried, so the progression
 * limits the builders obeyed still hold.
 */
import { DAYS, makeDay, enrichDays } from '../periodization.js'

export const HARD_TYPES = new Set(['tempo', 'interval', 'repetition'])

const dayIndex = (d) => DAYS.indexOf(d.day)
const km = (d) => d.distance_km || 0

/** Builder phases -> the three columns of b05 section 2. */
function column(phase) {
  if (phase === 'build') return 'build'
  if (phase === 'sharpen' || phase === 'taper') return 'peak'
  return 'base'
}

/** b05 section 2: quality sessions per week by level, base / build / peak. */
const QUALITY_BY_LEVEL = {
  none: [0, 0, 0],
  beginner: [0, 1, 1],
  novice: [1, 1, 1],
  intermediate: [1, 2, 2],
  advanced: [1, 3, 3],
  elite: [2, 3, 3],
}

/**
 * Quality sessions allowed this week.
 * @param {object} o
 * @param {string} o.level
 * @param {string} o.phase
 * @param {number|null} o.age
 * @param {number} o.runDays
 * @param {boolean} [o.injuryFree] - no running injury for the last 6+ months (p07 r8)
 */
export function qualityCap({ level, phase, age = null, runDays = 4, injuryFree = false }) {
  const col = ['base', 'build', 'peak'].indexOf(column(phase))
  let cap = (QUALITY_BY_LEVEL[level] || QUALITY_BY_LEVEL.beginner)[col]
  // b05 section 2, "any, age >= 50": 1 / 2 / 2, the long run included.
  if (age !== null && age >= 50) cap = Math.min(cap, [1, 2, 2][col])
  // The layouts for 3-5 days carry two at most, and 3 days one (b05 section 4).
  if (runDays <= 5 && cap > 2) cap = 2
  // p07 r6-8: 3 runs: 1 (novice), 2 for intermediate or better without a recent
  // injury; 2 runs: none below intermediate, then 1 with the long run as the other.
  if (runDays === 3) cap = Math.min(cap, ['intermediate', 'advanced', 'elite'].includes(level) && injuryFree ? 2 : 1)
  if (runDays <= 2) cap = ['intermediate', 'advanced', 'elite'].includes(level) ? Math.min(cap, 1) : 0
  // p04 (70+): at most one; p08 r9-10 (teenagers): at most two.
  if (age !== null && age >= 70) cap = Math.min(cap, 1)
  if (age !== null && age < 18) cap = Math.min(cap, 2)
  return cap
}

/** The minimum whole days between two hard sessions (b05 r3-4). */
export function hardGapDays(hours = 48) {
  return Math.max(1, Math.ceil(hours / 24))
}

/** Days before the race by which the last quality session must be done (b05 r29). */
export function lastQualityDaysBeforeRace(distanceKm) {
  return distanceKm > 10 ? 6 : 4
}

/** b06 r25-29: the clocks after a race (days), longer from 50. */
export function postRaceClocks(raceKm, age = null) {
  const older = age !== null && age >= 50 ? 1.25 : 1
  return {
    no_intensity_days: Math.ceil(Math.ceil(raceKm / 3) * older),
    load_back_days: Math.ceil(Math.ceil(raceKm / 1.609) * older),
    no_running_days: raceKm >= 40 ? 2 : 0,
    week_fractions: raceKm >= 40 ? [0.3, 0.5, 0.7, 0.85] : null,
  }
}

function toEasy(d, paces, age, distance = km(d), extra = {}) {
  const easy = makeDay({ day: d.day, type: 'easy', distanceKm: distance, paceKey: 'easy', paces, intensity: 'easy' })
  return enrichDays([{ ...easy, ...extra }], paces, age)[0]
}

const toStrideRun = (d, paces, age) =>
  toEasy(d, paces, age, km(d), { title: 'Lahkoten tek s pospeški', variant: 'strides', hard_km: 0 })

const restOf = (d) => ({
  day: d.day, type: 'rest', title: 'Počitek', distance_km: 0, duration_min: 0,
  pace: 'rest', pace_key: null, intensity: 'rest', segments: [], is_segmented: false,
})

/**
 * @param {Array} weeks - the built weeks (only kilometre weeks are touched)
 * @param {object} ctx
 * @param {string} ctx.level - experience level
 * @param {number|null} ctx.age
 * @param {number} ctx.runDays - run days a week
 * @param {number|null} ctx.distanceKm - the race distance, if any
 * @param {object} ctx.paces
 * @param {number} [ctx.hardGapHours]
 * @param {number|null} [ctx.qualityCapOverride] - a population cap (time-crunched)
 * @param {boolean} [ctx.injuryFree] - no running injury in the last 12 months
 * @param {boolean} [ctx.strength] - add optional strength notes
 * @param {boolean} [ctx.strides] - false: none (a goal block that wants no pick-ups)
 * @returns {Array} weeks
 */
export function applyIntensityRules(weeks, ctx) {
  const { level, age, paces } = ctx
  const hr = ctx.hrAge ?? age // heart-rate zones may use a sex-specific formula
  const gap = hardGapDays(ctx.hardGapHours ?? 48)
  const minLow = ctx.runDays <= 3 ? 0.7 : 0.75
  const d = ctx.distanceKm ?? 0
  const raceWeekIndex = weeks.findIndex((w) => w.days.some((x) => x.type === 'race'))
  const polarizedFrom = raceWeekIndex === -1 ? null : raceWeekIndex - 7
  const trained = ['intermediate', 'advanced', 'elite'].includes(level)
  const priority = (x) => ({ interval: 3, tempo: 2, repetition: 1 }[x.type] ?? 0)

  return weeks.map((week, wi) => {
    if (week.unit === 'time') return week
    let days = week.days.slice()
    const isRace = days.some((x) => x.type === 'race')
    const quality = () => days.filter((x) => HARD_TYPES.has(x.type))
    const demote = (x) => {
      days = days.map((y) => (y.day === x.day ? toStrideRun(y, paces, hr) : y))
    }

    // -- 1. quality cap ---------------------------------------------------------
    const base = qualityCap({ level, phase: week.phase, age, runDays: ctx.runDays, injuryFree: ctx.injuryFree })
    const cap = ctx.qualityCapOverride != null ? Math.min(ctx.qualityCapOverride, base) : base
    // Polarized final weeks (b03 r21, m11): no threshold work beside intervals
    // for a trained 5-10 km runner in the last 8 weeks.
    const polarized = trained && d > 0 && d <= 10 && polarizedFrom !== null && wi >= polarizedFrom
    // The threshold session becomes a repetition session (R pace, Daniels' cap
    // of 5% of the week or 8 km): still two hard days, none of them in the middle.
    if (polarized && quality().some((x) => x.type === 'interval')) {
      const wk = days.reduce((s, x) => s + km(x), 0)
      for (const x of quality().filter((y) => y.type === 'tempo')) {
        const rep = makeDay({
          day: x.day, type: 'repetition', distanceKm: km(x),
          hardKm: Math.min(x.hard_km || 0, 0.05 * wk, 8), paceKey: 'repetition', paces, intensity: 'hard',
        })
        days = days.map((y) => (y.day === x.day ? enrichDays([rep], paces, hr)[0] : y))
      }
    }
    while (quality().length > cap) demote([...quality()].sort((a, b) => priority(a) - priority(b))[0])

    // -- 2. the gap between hard sessions; a hard long run counts (b05 r2-4) ------
    const weekKm = days.reduce((s, x) => s + km(x), 0)
    const isHardLong = (x) => x.type === 'long' && (x.duration_min >= 90 || km(x) >= 0.3 * weekKm)
    const hardDays = (list) => list.filter((x) => HARD_TYPES.has(x.type) || isHardLong(x) || x.type === 'race')
      .sort((a, b) => dayIndex(a) - dayIndex(b))
    const gapsOk = (list) => {
      const h = hardDays(list)
      return h.every((x, i) => i === 0 || dayIndex(x) - dayIndex(h[i - 1]) >= gap)
    }
    // A session too close to another hard one first tries to swap places with
    // an easy run further away (the week's kilometres stay the same); only if
    // no such day exists does it become an easy run (b05 r9).
    const relocate = (victim) => {
      for (const y of days.filter((z) => z.type === 'easy')) {
        const swapped = days.map((z) => {
          if (z.day === victim.day) return { ...y, day: victim.day }
          if (z.day === y.day) return { ...victim, day: y.day }
          return z
        })
        if (gapsOk(swapped)) { days = swapped; return true }
      }
      return false
    }
    for (let again = true; again;) {
      again = false
      const hard = hardDays(days)
      for (let i = 1; i < hard.length && !again; i++) {
        if (dayIndex(hard[i]) - dayIndex(hard[i - 1]) >= gap) continue
        const victim = [hard[i - 1], hard[i]].filter((x) => HARD_TYPES.has(x.type))
          .sort((a, b) => priority(a) - priority(b))[0]
        if (victim) { if (!relocate(victim)) demote(victim); again = true }
      }
    }

    // -- 3. race week: the last quality session far enough out (b05 r29) -----------
    if (isRace) {
      const raceIdx = dayIndex(days.find((x) => x.type === 'race'))
      const need = lastQualityDaysBeforeRace(d)
      quality().filter((x) => raceIdx - dayIndex(x) < need).forEach(demote)
    }

    // -- 4. low-intensity floor (b05 r18) --------------------------------------------
    const total = () => days.reduce((s, x) => s + km(x), 0)
    const hardShare = () => (total() ? days.reduce((s, x) => s + (x.hard_km || 0), 0) / total() : 0)
    while (1 - hardShare() < minLow && quality().length) {
      demote([...quality()].sort((a, b) => priority(a) - priority(b))[0])
    }

    // -- 5. easy runs: 20 minutes at least, 0.75 x the long run at most (b05 r15) ------
    const longKm = Math.max(0, ...days.filter((x) => x.type === 'long').map(km))
    if (!isRace && week.phase !== 'taper' && longKm) {
      // The week's kilometres are what the progression limits were checked
      // against, so nothing may be lost: what a dropped or shortened run
      // carried moves to another easy day, and if it has nowhere to go the
      // week is left as the builder laid it out.
      const ceiling = Math.floor(0.75 * longKm)
      const before = days
      let freed = 0
      days = days.map((x) => {
        if (x.type !== 'easy') return x
        if (km(x) * paces.easy < 20 && !week.is_recovery) { freed += km(x); return restOf(x) }
        if (km(x) > ceiling) {
          freed += km(x) - ceiling
          return toEasy(x, paces, hr, ceiling, { title: x.title, variant: x.variant })
        }
        return x
      })
      for (const x of days.filter((y) => y.type === 'easy' && km(y) < ceiling)) {
        const add = Math.min(ceiling - km(x), Math.floor(freed))
        if (add >= 1 && (km(x) + add) * paces.easy >= 20) {
          days = days.map((y) => (y.day === x.day ? toEasy(y, paces, hr, km(x) + add, { title: y.title, variant: y.variant }) : y))
          freed -= add
        }
      }
      if (freed >= 1) days = before
    }

    // -- 6. strides: 1-2 easy runs once the base is under way (b03 r18, b05 r17) ---------
    const startWeek = ['none', 'beginner'].includes(level) ? 4 : 1
    if (ctx.strides !== false && ['base', 'build', 'foundation', 'consistency'].includes(week.phase) && !week.is_recovery && !isRace && wi >= startWeek) {
      const want = ctx.runDays >= 4 ? 2 : 1
      const hardIdx = days.filter((x) => HARD_TYPES.has(x.type) || x.type === 'long').map(dayIndex)
      let have = days.filter((x) => x.variant === 'strides').length
      for (const x of days.filter((y) => y.type === 'easy' && !y.variant)) {
        if (have >= want) break
        if (hardIdx.includes(dayIndex(x) + 1)) continue // not the day before a hard session
        days = days.map((y) => (y.day === x.day
          ? { ...y, variant: 'strides', title: 'Lahkoten tek s pospeški', strides: '6–8 × 15–20 s hitro, vmes hoja ali počasen tek' }
          : y))
        have++
      }
    }

    // -- 7. the marathon long run with marathon-pace kilometres (b03 r21, b05 r14) ---------
    if (d >= 40 && week.phase === 'sharpen' && trained && paces.marathon) {
      days = days.map((x) => {
        if (x.type !== 'long' || km(x) < 0.5 * d) return x
        // >= 25% of the distance, but never past 110 minutes, 20% of the week or 29 km.
        const mp = Math.floor(Math.min(Math.max(0.25 * d, 8), 110 / paces.marathon, 0.2 * weekKm, 29, km(x) - 4))
        if (mp < 5) return x
        return {
          ...x, variant: 'mp_segments', mp_km: mp, title: `Dolgi tek z ${mp} km v maratonskem tempu`,
          note: `Zadnjih ${mp} km v maratonskem tempu.`,
        }
      })
    }

    // -- 8. optional strength notes (b05 r20-23, p04 r16) ------------------------------------
    if (ctx.strength && !isRace) {
      const perWeek = week.phase === 'taper' ? 0
        : week.phase === 'base' || week.phase === 'foundation' ? 2 : (age !== null && age >= 40 ? 2 : 1)
      const hardIdx = days.filter((x) => HARD_TYPES.has(x.type) || x.type === 'long').map(dayIndex)
      const beginner = ['none', 'beginner'].includes(level)
      // The last heavy session is at least 7 days before the race.
      const tooLate = raceWeekIndex !== -1 && wi >= raceWeekIndex - 1
      let placed = 0
      for (const x of tooLate ? [] : days.filter((y) => y.type === 'rest' || y.type === 'easy')) {
        if (placed >= perWeek) break
        // No heavy lower-body work within 48 h before a hard session.
        if (hardIdx.some((h) => h > dayIndex(x) && h - dayIndex(x) < 2)) continue
        if (beginner && x.type !== 'rest') continue
        const focus = ['dvigi na prste (mečki)', 'počepi', 'izpadni koraki', 'most za zadnjico']
        if (age !== null && age >= 65) focus.push('ravnotežje (stoja na eni nogi)')
        days = days.map((y) => (y.day === x.day
          ? { ...y, strength_note: `Neobvezno: krepilna vadba (do 30 min${beginner ? ', z lastno težo' : ''}): ${focus.join(', ')}.` }
          : y))
        placed++
      }
    }

    const out = { ...week, days, allow_hard: days.some((x) => HARD_TYPES.has(x.type)) }
    if (polarized) out.distribution = 'polarized'
    else if (d >= 40 && ['build', 'sharpen'].includes(week.phase)) out.distribution = 'pyramidal'
    return out
  })
}
