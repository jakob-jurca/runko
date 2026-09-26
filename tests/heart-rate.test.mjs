// Heart-rate zones (Tanaka) and workout segments. Pure calculation.
import {
  maxHeartRate, heartRateZones, heartRateFor, formatHeartRate, ZONES,
} from '../src/core/heart-rate.js'
import { buildPlanSkeleton, buildSegments, durationRange, pacesFromVdot } from '../src/core/periodization.js'
import { check, near, summary } from './harness.mjs'

const today = new Date('2026-09-19T12:00:00')

console.log('\n=== MAX HR: TANAKA, NOT 220 - AGE ===')
for (const [age, want] of [[20, 194], [30, 187], [38, 181], [45, 177], [55, 170], [65, 163]]) {
  check(`age ${age} → ${want} bpm`, maxHeartRate(age) === want)
}
check('Tanaka is LOWER than 220-age for the young', maxHeartRate(20) < 200)
check('Tanaka is HIGHER than 220-age for the old (the point of using it)',
  maxHeartRate(60) > 160)
check('never asks the runner: age is the only input', maxHeartRate.length === 1)

console.log('\n  unusable ages degrade to null, never to a wrong number:')
for (const bad of [null, undefined, '', 0, -5, 3, 130, NaN, 'forty'])
  check(`${JSON.stringify(bad)} → null`, maxHeartRate(bad) === null)

console.log('\n=== FIVE ZONES AT THE SPECIFIED PERCENTAGES ===')
const spec = [[1, 0.5, 0.6], [2, 0.6, 0.7], [3, 0.7, 0.8], [4, 0.8, 0.9], [5, 0.9, 1.0]]
for (const [zone, lo, hi] of spec) {
  const z = ZONES.find((x) => x.zone === zone)
  check(`zone ${zone} is ${lo * 100}-${hi * 100}%`, z.min === lo && z.max === hi)
}
const zones = heartRateZones(38)
console.log('   ', zones.map((z) => `Z${z.zone} ${z.bpm_min}-${z.bpm_max}`).join('  '))
check('five zones returned', zones.length === 5)
check('zone 1 starts at 50% of max', zones[0].bpm_min === Math.round(181 * 0.5))
check('zone 5 tops out at max HR', zones[4].bpm_max === 181)
check('zones are contiguous', zones.every((z, i) => i === 0 || z.bpm_min === zones[i - 1].bpm_max))
check('zones ascend', zones.every((z, i) => i === 0 || z.bpm_min > zones[i - 1].bpm_min))
check('no age → no zones', heartRateZones(null) === null)

console.log('\n=== INTENSITY → ZONE ===')
const at38 = (paceKey) => heartRateFor(38, { paceKey })
check('easy → zone 2', at38('easy').zone === 2)
check('marathon/goal → zone 3', at38('marathon').zone === 3 && at38('goal').zone === 3)
check('threshold → zone 4', at38('threshold').zone === 4)
check('interval → zone 5', at38('interval').zone === 5)
check('repetition → zone 5', at38('repetition').zone === 5)
check('warm-up matches the easy pace it is run at, not zone 1',
  at38('warmup').zone === 2 && at38('cooldown').zone === 2)
check('harder pace → higher bpm', at38('interval').min > at38('easy').min)
check('falls back to intensity when there is no pace key',
  heartRateFor(38, { intensity: 'hard' }).zone === 4)
check('unknown input still returns a sane zone', heartRateFor(38, {}).zone === 2)
check('no age → null, so the UI can omit the row', heartRateFor(null, { paceKey: 'easy' }) === null)
check('formats as a range', formatHeartRate(at38('easy')) === '109-127 bpm')
check('formats null safely', formatHeartRate(null) === null)

console.log('\n=== SEGMENTS: VARYING-INTENSITY WORKOUTS ARE BROKEN DOWN ===')
const paces = pacesFromVdot(40)
const tempo = { type: 'tempo', distance_km: 10, hard_km: 6, pace_key: 'threshold', pace: '5:06/km', intensity: 'hard' }
const segs = buildSegments(tempo, paces, 38)
console.log('   ', segs.map((s) => `${s.label} ${s.distance_km}km @ ${s.pace}`).join(' | '))
check('tempo splits into three parts', segs.length === 3)
check('warm-up, main, cool-down in order',
  segs.map((s) => s.kind).join() === 'warmup,main,cooldown')
check('segment distances sum to the workout',
  near(segs.reduce((t, s) => t + s.distance_km, 0), 10, 0.6))
check(`the main part is the bulk (${segs[1].distance_km} km of 10)`,
  segs[1].distance_km >= 5 && segs[1].distance_km <= 8)
check('warm-up and cool-down run at easy pace',
  segs[0].pace === segs[2].pace && segs[0].pace !== segs[1].pace)
check('every segment has its own HR range', segs.every((s) => s.hr?.min > 0 && s.hr.max > s.hr.min))
check('the hard part sits in a higher zone than the jog', segs[1].hr.zone > segs[0].hr.zone)
check('every segment has a duration', segs.every((s) => s.duration_min > 0))

console.log('\n  intervals get a rep structure:')
const intervals = { type: 'interval', distance_km: 8, hard_km: 2.4, pace_key: 'interval', pace: '4:40/km', intensity: 'hard' }
const iSegs = buildSegments(intervals, paces, 38)
const reps = iSegs.find((s) => s.reps)
console.log('   ', reps.reps.summary)
check('a reps block exists', Boolean(reps))
check('rep count, distance and recovery are all present',
  reps.reps.count > 0 && reps.reps.distance_m > 0 && reps.reps.recovery_m > 0)
check(`the summary reads like a coach wrote it ("${reps.reps.summary}")`,
  /^\d+ × \d+ m @ \d+:\d\d-\d+:\d\d\/km, vmes \d+ m lahkotno$/.test(reps.reps.summary))
check(`reps fill the main block (${reps.reps.count} × ${reps.reps.distance_m} m)`,
  reps.reps.count >= 3)
check('rep distance scales with the session',
  buildSegments({ ...intervals, hard_km: 6 }, paces, 38).find((s) => s.reps).reps.distance_m >
  reps.reps.distance_m)

console.log('\n  steady runs get NO segments (a single spec line says it all):')
for (const type of ['easy', 'long', 'rest', 'race']) {
  check(`${type} → no segments`,
    buildSegments({ type, distance_km: 10, hard_km: 0, pace_key: 'easy' }, paces, 38).length === 0)
}
check('no age → segments still built, just without HR',
  buildSegments(tempo, paces, null).every((s) => s.hr === null))

console.log('\n=== DURATION IS A RANGE, NOT FAKE PRECISION ===')
const dr = durationRange(60)
check(`60 min → ${dr.min}-${dr.max} min`, dr.min < 60 && dr.max > 60)
check('null in, null out', durationRange(0) === null && durationRange(null) === null)

console.log('\n=== EVERY DAY OF A REAL PLAN IS RENDERABLE FROM DATA ===')
const plan = buildPlanSkeleton({
  profile: { fitness_level: 'intermediate', age: 38, target_distance_km: 21.1, event_date: '2027-01-02' },
  totalWeeks: 12,
  runs: [{ date: '2026-09-17', distance: 8, duration: 48, effort: 3 }],
  today,
})
check('the plan exposes max HR', plan.hr_max === 181)
check('the plan exposes all five zones', plan.hr_zones.length === 5)

const allDays = plan.weeks.flatMap((w) => w.days)
const runs = allDays.filter((d) => d.type !== 'rest')
check('every running day has a duration range', runs.every((d) => d.duration_range?.min > 0))
check('every running day has an HR range', runs.every((d) => d.hr?.min > 0))
check('every day declares whether it is segmented',
  allDays.every((d) => typeof d.is_segmented === 'boolean'))
// Sessions under 4 km are too short to hold a real warm-up/main/cool-down
// split, so they stay steady — see MIN_SEGMENTED_KM.
check('every tempo/interval day of a usable length HAS segments',
  allDays
    .filter((d) => ['tempo', 'interval'].includes(d.type) && d.distance_km >= 4)
    .every((d) => d.segments.length >= 2))
check('short quality sessions fall back to a single pace line',
  allDays
    .filter((d) => ['tempo', 'interval'].includes(d.type) && d.distance_km < 4)
    .every((d) => d.segments.length === 0 && d.pace_range))
check('every easy/long day has none',
  allDays.filter((d) => ['easy', 'long'].includes(d.type)).every((d) => d.segments.length === 0))
check('segment distances reconcile with their workout', allDays.every((d) =>
  !d.segments.length || near(d.segments.reduce((t, s) => t + s.distance_km, 0), d.distance_km, 0.6)))
check('no HR range is above max HR', runs.every((d) => d.hr.max <= plan.hr_max))
check('no HR range is implausibly low', runs.every((d) => d.hr.min >= plan.hr_max * 0.49))

console.log('\n  a runner with no age still gets a complete plan:')
const ageless = buildPlanSkeleton({
  profile: { fitness_level: 'beginner', target_distance_km: 10 },
  totalWeeks: 8, runs: [], today,
})
check('no max HR', ageless.hr_max === null)
check('no zones', ageless.hr_zones === null)
check('but every week is still complete', ageless.weeks.every((w) => w.days.length === 7))
check('and HR is simply absent, not zero',
  ageless.weeks.flatMap((w) => w.days).every((d) => d.hr === null))

// Gulati (2010) for women when sex is known: 206 - 0.88 x age.
import { formulaAge } from '../src/core/heart-rate.js'
check('Gulati for a 40-year-old woman: 171 bpm (Tanaka would say 180)',
  maxHeartRate(formulaAge(40, 'female')) === 171 && maxHeartRate(40) === 180)
check('Gulati for a 60-year-old woman: 153 bpm', maxHeartRate(formulaAge(60, 'female')) === 153)
check('unknown sex or a man keeps Tanaka', maxHeartRate(formulaAge(40, null)) === 180 && maxHeartRate(formulaAge(40, 'male')) === 180)
check('a missing age stays missing', formulaAge(null, 'female') === null && maxHeartRate(formulaAge(null, 'female')) === null)

export default summary('heart rate + segments')
