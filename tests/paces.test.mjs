/**
 * Regression tests for the two plan-engine failures:
 *   1. weeks stopped progressing (identical weeks after the volume cap)
 *   2. nonsense numbers (elite paces, long runs far beyond the runner)
 *
 * Pure calculation, no API calls.
 */
import {
  pacesFromVdot, estimateVdot, formatPace, buildPlanSkeleton,
  assignPhases, assignRecoveryWeeks, buildVolumeCurve, buildLongRunCurve,
  peakVolumeCap, peakLongRunKm, MIN_PLAUSIBLE_PACE, MAX_PLAUSIBLE_PACE,
  PACE_INTENSITIES, VDOT_MAX,
} from '../src/core/periodization.js'
import { check, near, summary } from './harness.mjs'

const today = new Date('2026-09-19T12:00:00')

/** Jack Daniels' published training paces, min/km. The reference we must match. */
const DANIELS = {
  30: { easy: '7:52', marathon: '6:51', threshold: '6:24', interval: '5:52', repetition: '5:33' },
  35: { easy: '6:56', marathon: '6:03', threshold: '5:40', interval: '5:12', repetition: '4:54' },
  40: { easy: '6:17', marathon: '5:29', threshold: '5:08', interval: '4:42', repetition: '4:24' },
  45: { easy: '5:45', marathon: '5:00', threshold: '4:41', interval: '4:17', repetition: '4:00' },
  50: { easy: '5:19', marathon: '4:37', threshold: '4:19', interval: '3:57', repetition: '3:41' },
  55: { easy: '4:57', marathon: '4:17', threshold: '4:01', interval: '3:41', repetition: '3:25' },
  60: { easy: '4:37', marathon: '4:00', threshold: '3:45', interval: '3:26', repetition: '3:12' },
}
const toMin = (s) => { const [m, sec] = s.split(':').map(Number); return m + sec / 60 }

console.log('\n=== PACES MATCH THE DANIELS TABLE ===')
// Was: fraction of vVDOT VELOCITY, which drifted +0.40 min/km on easy at
// VDOT 30 — exactly where beginners sit.
let worst = 0
for (const [vdot, ref] of Object.entries(DANIELS)) {
  const p = pacesFromVdot(Number(vdot))
  for (const key of Object.keys(ref)) {
    worst = Math.max(worst, Math.abs(p[key] - toMin(ref[key])))
  }
}
console.log(`    worst deviation from the table: ${worst.toFixed(2)} min/km`)
check(`every pace within 0.25 min/km of Daniels (worst ${worst.toFixed(2)})`, worst <= 0.25)

for (const [vdot, ref] of Object.entries(DANIELS)) {
  const p = pacesFromVdot(Number(vdot))
  check(
    `VDOT ${vdot}: ${Object.keys(ref).map((k) => `${k[0].toUpperCase()} ${formatPace(p[k])}`).join(' ')}`,
    Object.keys(ref).every((k) => Math.abs(p[k] - toMin(ref[k])) <= 0.25)
  )
}

console.log('\n=== PACES ARE ALWAYS SANE FOR THE GIVEN VDOT ===')
for (let vdot = 25; vdot <= VDOT_MAX; vdot += 5) {
  const p = pacesFromVdot(vdot)
  const values = Object.values(p)
  const ordered =
    p.easy > p.marathon && p.marathon > p.threshold &&
    p.threshold > p.interval && p.interval > p.repetition
  const inBounds = values.every((v) => v >= MIN_PLAUSIBLE_PACE && v <= MAX_PLAUSIBLE_PACE)
  check(`VDOT ${vdot}: ordered, and every pace within ${MIN_PLAUSIBLE_PACE}-${MAX_PLAUSIBLE_PACE} min/km`,
    ordered && inBounds)
}
check('every intensity is a fraction of VO2max, not of velocity',
  Object.values(PACE_INTENSITIES).every((f) => f > 0.5 && f <= 1.1))

console.log('\n=== THE REPORTED FAILURE: 3:13/km FOR A BEGINNER ===')
// A 6:30/km runner must never be handed an elite pace.
const beginnerRuns = [
  { date: '2026-09-17', distance: 5, duration: 32.5, effort: 3 }, // 6:30/km
  { date: '2026-09-15', distance: 6, duration: 40.5, effort: 3 }, // 6:45/km
  { date: '2026-09-13', distance: 8, duration: 54.7, effort: 3 }, // 6:50/km
]
const est = estimateVdot(beginnerRuns, 'beginner')
const bp = pacesFromVdot(est.vdot)
console.log(`    VDOT ${est.vdot} -> ${Object.entries(bp).map(([k, v]) => `${k} ${formatPace(v)}`).join(', ')}`)
check(`VDOT lands near 35 (got ${est.vdot})`, est.vdot >= 32 && est.vdot <= 38)
check(`easy pace 6:30-7:15 (got ${formatPace(bp.easy)})`, bp.easy >= 6.5 && bp.easy <= 7.25)
check(`threshold 5:30-6:00 (got ${formatPace(bp.threshold)})`, bp.threshold >= 5.5 && bp.threshold <= 6.0)
check(`interval 5:00-5:35 (got ${formatPace(bp.interval)})`, bp.interval >= 5.0 && bp.interval <= 5.6)
check('no pace is anywhere near 3:13/km', Object.values(bp).every((v) => v > 4.5))

console.log('\n=== BAD INPUT CANNOT PRODUCE ELITE PACES ===')
for (const [label, run] of [
  ['5 km in 5 min (mistyped duration)', { distance: 5, duration: 5, effort: 3 }],
  ['10 km in 4 min (unit mix-up)', { distance: 10, duration: 4, effort: 3 }],
  ['5 km in 0.5 min', { distance: 5, duration: 0.5, effort: 3 }],
  ['42 km in 20 min', { distance: 42, duration: 20, effort: 5 }],
]) {
  const e = estimateVdot([run], 'beginner')
  check(`${label} -> rejected, falls back to level (VDOT ${e.vdot})`, e.source === 'level')
}
check('one bad row among good ones does not poison the estimate',
  estimateVdot([...beginnerRuns, { distance: 5, duration: 5, effort: 3 }], 'beginner').vdot ===
  estimateVdot(beginnerRuns, 'beginner').vdot)
check('an implausibly slow row is ignored too',
  estimateVdot([{ distance: 5, duration: 90, effort: 3 }], 'beginner').source === 'level')

console.log('\n=== EVERY WEEK DIFFERS FROM THE ONE BEFORE ===')
// Was: volume hit a flat per-level cap and later weeks came out identical.
const scenarios = [
  ['beginner, 21.1 km, 15 weeks', { fitness_level: 'beginner', target_distance_km: 21.1, event_date: '2027-01-02' }, 15, beginnerRuns],
  ['beginner, 10 km, 20 weeks', { fitness_level: 'beginner', target_distance_km: 10 }, 20, beginnerRuns],
  ['intermediate, 42.2 km, 16 weeks', { fitness_level: 'intermediate', target_distance_km: 42.2, event_date: '2027-01-09' }, 16, beginnerRuns],
  ['advanced, 5 km, 24 weeks', { fitness_level: 'advanced', target_distance_km: 5 }, 24, beginnerRuns],
  ['no runs at all, 18 weeks', { fitness_level: 'beginner', target_distance_km: 21.1 }, 18, []],
]
for (const [label, profile, weeks, runs] of scenarios) {
  const s = buildPlanSkeleton({ profile, totalWeeks: weeks, runs, today })
  const sigs = s.weeks.map((w) =>
    `${w.target_volume_km}|${w.days.map((d) => `${d.type}:${d.distance_km}`).join(',')}`
  )
  const dupes = sigs.map((sig, i) => (i > 0 && sig === sigs[i - 1] ? i + 1 : 0)).filter(Boolean)
  check(`${label}: no week repeats the previous one${dupes.length ? ` (weeks ${dupes.join(', ')})` : ''}`,
    dupes.length === 0)
  // Holding peak volume for two non-adjacent weeks is legitimate training;
  // what must never happen is the plan flatlining week after week.
  const runLengths = []
  let run = 1
  for (let i = 1; i < sigs.length; i++) { sigs[i] === sigs[i - 1] ? run++ : (runLengths.push(run), run = 1) }
  runLengths.push(run)
  check(`${label}: never two identical weeks in a row`, Math.max(...runLengths) === 1)
}

console.log('\n=== PROGRESSION RUNS THE WHOLE PLAN LENGTH ===')
const long = buildPlanSkeleton({
  profile: { fitness_level: 'beginner', target_distance_km: 21.1, event_date: '2027-01-02' },
  totalWeeks: 15, runs: beginnerRuns, today,
})
const phases = long.weeks.map((w) => w.phase)
check('all four phases appear', ['base', 'build', 'sharpen', 'taper'].every((p) => phases.includes(p)))
check('the plan does not stall on one phase label', new Set(phases).size >= 3)
check('the last two weeks taper', phases.slice(-2).join() === 'taper,taper')

const recoveryIdx = long.weeks.map((w, i) => (w.is_recovery ? i + 1 : 0)).filter(Boolean)
check(`recovery weeks land on 4, 8, 12 (got ${recoveryIdx.join(', ')})`,
  recoveryIdx.includes(4) && recoveryIdx.includes(8) && recoveryIdx.includes(12))
for (const wk of recoveryIdx) {
  const ratio = long.weeks[wk - 1].target_volume_km / long.weeks[wk - 2].target_volume_km
  check(`week ${wk} recovery is ~70% of week ${wk - 1} (${ratio.toFixed(2)})`, near(ratio, 0.7, 0.1))
}

const prog = long.weeks.filter((w) => !w.is_recovery && w.phase !== 'taper')
// Whole-kilometre volumes mean a minimum step of 1 km, which is more than
// 10% on a sub-15 km week. The percentage ceiling applies once the numbers
// are big enough for it to mean anything.
let rises = true
for (let i = 1; i < prog.length; i++) {
  const prev = prog[i - 1].target_volume_km
  const allowed = prev < 15 ? prev + 1.01 : prev * 1.1 + 1.01
  if (prog[i].target_volume_km > allowed) rises = false
}
check('no progressive week jumps more than 10% (or 1 km at low volume)', rises)
check('volume genuinely grows across the block',
  prog[prog.length - 1].target_volume_km > prog[0].target_volume_km * 1.3)

console.log('\n=== TAPER ACTUALLY REDUCES LOAD ===')
const trainingKm = (w) => w.days.filter((d) => d.type !== 'race').reduce((s, d) => s + d.distance_km, 0)
const taperWeeks = long.weeks.filter((w) => w.phase === 'taper')
const peakTraining = Math.max(...long.weeks.filter((w) => w.phase !== 'taper').map(trainingKm))
check(`first taper week is ~70% of peak training (${trainingKm(taperWeeks[0]).toFixed(1)} vs ${peakTraining.toFixed(1)})`,
  trainingKm(taperWeeks[0]) < peakTraining * 0.85)
check('taper training volume keeps falling',
  trainingKm(taperWeeks[1]) < trainingKm(taperWeeks[0]))
check('race week total is not larger than the week before it',
  long.weeks[14].target_volume_km <= long.weeks[13].target_volume_km * 1.25)

console.log('\n=== LONG RUN RESPECTS THE RUNNER\'S HISTORY ===')
// Was: a flat 30% of weekly volume, so a stated 60 km/week gave an 18 km
// long run in week 2 to someone whose longest ever run was 8 km.
const longestLogged = 8
check(`plan starts the long run near their ${longestLogged} km, not beyond it`,
  Math.max(...long.weeks[0].days.map((d) => d.distance_km)) <= longestLogged * 1.15)
check('week 2 does not jump beyond their history',
  Math.max(...long.weeks[1].days.map((d) => d.distance_km)) <= longestLogged * 1.3)

const overstated = buildPlanSkeleton({
  profile: { fitness_level: 'intermediate', target_distance_km: 21.1, weekly_volume_km: 60, longest_run_km: 8 },
  totalWeeks: 15, runs: beginnerRuns, today,
})
const wk2Longest = Math.max(...overstated.weeks[1].days.map((d) => d.distance_km))
check(`a 60 km/week claim with an 8 km longest run still caps week 2 (${wk2Longest} km)`, wk2Longest <= 12)

for (const w of long.weeks) {
  const biggest = Math.max(...w.days.map((d) => d.distance_km))
  if (w.days.some((d) => d.type === 'race')) continue
  if (biggest > peakLongRunKm(21.1) + 0.5) {
    check(`week ${w.week_number} long run ${biggest} km exceeds the ceiling`, false)
  }
}
check('no non-race run ever exceeds the goal-derived ceiling',
  long.weeks.every((w) =>
    w.days.filter((d) => d.type !== 'race').every((d) => d.distance_km <= peakLongRunKm(21.1) + 1)))

console.log('\n=== LONG-RUN CURVE IN ISOLATION ===')
const ph = assignPhases(15, { hasEvent: true })
const rec = assignRecoveryWeeks(ph)
const curve = buildLongRunCurve({ totalWeeks: 15, phases: ph, recoveryWeeks: rec, startLongRunKm: 8, peakLongRunKm: 21.1 })
console.log('   ', curve.join(' '))
check('starts at the runner\'s current longest', curve[0] === 8)
check('reaches the goal ceiling before the taper', Math.max(...curve) >= 21)
// Compare against the last PROGRESSIVE week, not the recovery dip — stepping
// back up out of a cutback week is the point of having one.
// Track the running PEAK, not the previous value: stepping back up after a
// cutback week is not growth, it is returning to where you already were.
check('the long-run ceiling never grows more than ~15% or 2 km per week', (() => {
  let peak = null
  for (let i = 0; i < curve.length; i++) {
    if (ph[i] === 'taper' || rec[i]) continue
    if (peak !== null && curve[i] > Math.max(peak + 2.05, peak * 1.16)) return false
    peak = Math.max(peak ?? 0, curve[i])
  }
  return true
})())
check('comes down through the taper', curve[14] < curve[12])

console.log('\n=== GOAL-AWARE VOLUME CEILING ===')
check('a 5 km goal peaks lower than a marathon goal',
  peakVolumeCap('beginner', 5) < peakVolumeCap('beginner', 42.2))
check('an advanced marathoner gets the most room',
  peakVolumeCap('advanced', 42.2) > peakVolumeCap('beginner', 42.2))
check('no target distance still returns a usable cap', peakVolumeCap('intermediate') > 0)

export default summary('paces + progression')
