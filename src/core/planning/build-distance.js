/**
 * build-distance.js — plans prescribed in KILOMETRES.
 *
 * One week-by-week sequencer, driven by a per-scenario config (see
 * build.js). The sequencer owns the safety limits; the config owns the
 * structure — which sessions appear in which phase, how central the long run
 * is, whether volume builds, rolls to a plateau or holds.
 *
 * Every week's progression is computed from what the PREVIOUS week actually
 * prescribed (after rounding and caps), not from what it was meant to be, so
 * a week can never exceed the runner's weekly limit on the one before it,
 * and no run exceeds 1.10 x the longest of the last 30 days (limits.js).
 */
import { layOutWeek, enrichDays, restDay, formatPace } from '../periodization.js'
import { DEFAULT_LOAD, nextWeeklyLoad, nextLongRun } from './rules.js'

const round = Math.round
const HARD = new Set(['tempo', 'interval', 'repetition'])
/** Shortest quality session that holds a warm-up, a main part and a cool-down. */
const MIN_QUALITY_KM = 4
const sum = (days, f) => days.reduce((s, d) => s + f(d), 0)
const trainingKm = (days) => sum(days, (d) => (d.type === 'race' || d.type === 'rest' ? 0 : d.distance_km || 0))
const longestKm = (days) => Math.max(0, ...days.filter((d) => d.type !== 'race').map((d) => d.distance_km || 0))

/**
 * @param {object} c - config
 * @param {number}   c.totalWeeks
 * @param {string[]} c.phases           one per week
 * @param {boolean[]} c.recoveryWeeks   one per week
 * @param {string[]} c.runDays          weekdays
 * @param {object}   c.paces            min/km by pace key
 * @param {number|null} c.age
 * @param {number}   c.startWeeklyKm
 * @param {number}   c.peakWeeklyKm
 * @param {string}   c.progression      'build' | 'rolling' | 'hold'
 * @param {number}   c.startLongKm      their current longest run
 * @param {number}   c.peakLongKm
 * @param {number|Function} c.longShare  share, or (weekVolumeKm) => share
 * @param {object}   [c.limits]         resolved limit values (limits.js)
 * @param {number}   c.longMaxKm        duration cap as km at easy pace (binds always)
 * @param {number[]} c.taperFactors     weekly volume vs peak_ref, per taper week
 * @param {number[]} [c.taperLongFactors] long-run cap vs peak long run, per taper week
 * @param {number}   [c.preTaperLong]   long-run cap in the week before the taper
 * @param {Function} c.qualityFor       (weekIndex, phase) => [{type, paceKey}]
 * @param {Function} [c.decorate]       (days, weekIndex, phase) => days
 * @param {object|null} c.race          { weekIndex, day, distanceKm, walkBreaks }
 * @param {string}   c.goalPaceKey
 * @param {Function} c.intentFor        (phase, isRecovery) => string
 */
export function buildDistancePlan(c) {
  const L = { ...DEFAULT_LOAD, ...(c.limits || {}) }
  const shareFor = typeof c.longShare === 'function' ? c.longShare : () => c.longShare
  const weeks = []
  let lastProgressive = null // actual km of the last progressive week
  const loadingWeeks = [] // actual km of every loading week, for peak_ref
  const weekLongs = [] // longest run of each week, for the 30-day spike window
  let longMax = c.startLongKm || 0
  let peakLongReached = 0
  let atCeiling = 0
  let longAtPeak = 0
  let afterRecovery = false

  const taperCount = c.phases.filter((p) => p === 'taper').length

  for (let i = 0; i < c.totalWeeks; i++) {
    const phase = c.phases[i]
    const isRecovery = Boolean(c.recoveryWeeks[i])
    const isTaper = phase === 'taper'
    const isRaceWeek = Boolean(c.race) && i === c.race.weekIndex
    const taperIndex = c.phases.slice(0, i).filter((p) => p === 'taper').length
    const preTaper = !isTaper && c.phases[i + 1] === 'taper'

    // The longest run of the last 30 days: the previous four weeks, plus what
    // they ran before the plan while the plan is younger than that.
    const recent = weekLongs.slice(-4)
    const longest30d = Math.max(0, ...recent, i < 4 ? c.startLongKm || 0 : 0)

    // --- this week's volume ---------------------------------------------------
    let volume
    if (isTaper) {
      // b06 r10: peak_ref = mean of the three biggest loading weeks.
      const top = [...loadingWeeks].sort((a, b) => b - a).slice(0, 3)
      const peakRef = top.length ? top.reduce((a, b) => a + b, 0) / top.length : c.startWeeklyKm
      const factors = c.taperFactors
      const f = factors[factors.length - taperCount + taperIndex] ?? factors[factors.length - 1] ?? 0.6
      volume = Math.max(2, round(peakRef * f))
    } else if (isRecovery) {
      volume = Math.max(2, round((lastProgressive ?? c.startWeeklyKm) * L.recoveryFactor))
    } else if (lastProgressive === null) {
      volume = Math.min(c.startWeeklyKm, c.peakWeeklyKm)
    } else if (c.progression === 'hold') {
      // Maintenance: the same week, with a slightly lighter one alternating so
      // consecutive weeks are not identical.
      volume = atCeiling++ % 2 === 1 ? round(c.peakWeeklyKm * 0.95) : c.peakWeeklyKm
    } else if (afterRecovery) {
      // b04 r15: the week after a recovery week repeats the last loading week.
      volume = Math.min(c.peakWeeklyKm, lastProgressive)
    } else {
      const next = Math.min(c.peakWeeklyKm, nextWeeklyLoad(lastProgressive, 'distance', L))
      if (next >= c.peakWeeklyKm && lastProgressive >= c.peakWeeklyKm - 1) {
        // At the ceiling: alternate full and slightly lighter weeks.
        volume = atCeiling++ % 2 === 1 ? round(c.peakWeeklyKm * 0.92) : c.peakWeeklyKm
      } else {
        volume = next
      }
    }
    volume = Math.max(1, volume)

    // --- this week's long-run ceiling -------------------------------------
    let longCap
    if (isTaper) {
      const f = c.taperLongFactors?.[c.taperLongFactors.length - taperCount + taperIndex] ?? 0.5
      longCap = Math.max(3, round((peakLongReached || longMax) * f))
    } else if (isRecovery) {
      // b06 r3: the recovery week's long run is 0.70 of the last one.
      longCap = Math.max(3, round((weekLongs[weekLongs.length - 1] || longMax) * L.recoveryLongFactor))
    } else if (c.progression === 'hold') {
      longCap = Math.min(c.peakLongKm, Math.max(3, longMax))
    } else {
      // The peak is whichever binds first: the goal's distance or the
      // duration cap at this runner's pace.
      const peak = Math.min(c.peakLongKm, c.longMaxKm || Infinity)
      longCap = Math.max(3, Math.min(peak, nextLongRun(longest30d)))
      // Nobody runs their peak long run every week. Once it is reached,
      // alternate a full one with a shorter one until the taper.
      if (longCap >= peak && longMax >= peak - 0.5) {
        longCap = longAtPeak++ % 2 === 1 ? Math.max(3, round(peak * 0.85)) : peak
      }
    }
    // b06 r23: before a one-week taper the last full-length long run is
    // already >= 10 days out.
    if (preTaper && c.preTaperLong) longCap = Math.min(longCap, Math.max(3, round((peakLongReached || longMax) * c.preTaperLong)))

    // b04 r16 [SAFETY]: no run over 1.10 x the 30-day longest (1 km step
    // below 10 km), whatever the week; and duration binds before anything
    // else. Whole kilometres, so settleRounding cannot round past either.
    longCap = Math.min(longCap, Math.max(nextLongRun(longest30d), longest30d))
    if (c.longMaxKm) longCap = Math.min(longCap, c.longMaxKm)
    longCap = Math.floor(longCap)

    const qualityPlan = isRecovery ? [] : c.qualityFor(i, phase)
    let days = layOutWeek({
      volumeKm: volume,
      phase,
      isRecovery,
      paces: c.paces,
      runDays: c.runDays,
      qualityPlan,
      longShare: shareFor(volume),
      maxLongRunKm: longCap,
      // The taper factors are the race week's training WITHOUT the race.
      raceTrainingShare: 1,
      capLongAtShare: true,
      goalPaceKey: c.goalPaceKey,
      race: isRaceWeek ? { day: c.race.day, distanceKm: c.race.distanceKm } : null,
    })
    if (isRaceWeek && c.race.walkBreaks) {
      days = days.map((d) =>
        d.type === 'race'
          ? { ...d, walk_breaks: true, pace_key: 'easy', pace: 'pogovorni tempo, s hojo po potrebi', intensity: 'easy' }
          : d
      )
    }
    // Fragments help nobody: a 1 km "easy run" becomes rest, and a quality
    // session too short to hold a warm-up, reps and a cool-down becomes an
    // easy run with a few strides. In race week the bar for an easy run is
    // higher still — a couple of real shakeouts, not a scatter of jogs.
    const minEasy = isRaceWeek ? 3 : 2
    days = days.map((d) => {
      if (d.type === 'easy' && d.distance_km < minEasy) return restDay(d.day)
      if (HARD.has(d.type) && d.distance_km < MIN_QUALITY_KM) {
        return {
          ...d, type: 'easy', title: 'Lahkoten tek s pospeški', variant: 'strides', hard_km: 0,
          pace_key: 'easy', pace: `${formatPace(c.paces.easy)}/km`, pace_range: null, intensity: 'easy',
        }
      }
      return d
    })
    if (c.decorate) days = c.decorate(days, i, phase, isRecovery)
    days = enrichDays(days, c.paces, c.age)

    const actual = trainingKm(days)
    if (!isRecovery && !isTaper && !isRaceWeek) {
      lastProgressive = actual
      loadingWeeks.push(actual)
    }
    afterRecovery = isRecovery
    const long = longestKm(days)
    weekLongs.push(long)
    longMax = Math.max(longMax, long)
    if (!isTaper) peakLongReached = Math.max(peakLongReached, long)

    weeks.push({
      week_number: i + 1,
      phase,
      is_recovery: isRecovery,
      unit: 'distance',
      target_volume_km: round(sum(days, (d) => d.distance_km || 0)),
      planned_volume_km: volume,
      intent: c.intentFor(phase, isRecovery),
      allow_hard: qualityPlan.length > 0,
      days,
    })
  }
  return { weeks }
}
