// Distance-based goals: any km target, optional target time, realism check.
// Pure functions, no API calls.
import {
  parseDuration, formatDuration, raceTimeForVdot,
  targetTimeFromParts, targetTimeToParts, targetTimeHasSeconds, targetPaceCheck, assessGoal, peakLongRunKm,
  buildPlanSkeleton, mergeProfileConstraints, currentWeeklyVolume, DAYS,
} from '../src/core/periodization.js'
import { check, near, summary } from './harness.mjs'

const today = new Date('2026-09-19T12:00:00')

console.log('\n=== DURATION PARSING ===')
for (const [text, want] of [
  ['1:45:00', 105], ['3:00:00', 180], ['45:30', 45.5], ['21:30', 21.5],
  ['90', 90], ['1h45', 105], ['1h45m30s', 105.5], ['25m', 25],
]) check(`"${text}" → ${want} min`, near(parseDuration(text), want, 0.01))
for (const bad of ['', '   ', 'abc', 'soon', null, undefined])
  check(`"${bad}" → null`, parseDuration(bad) === null)
check('round-trips through formatDuration', formatDuration(parseDuration('1:45:00')) === '1:45:00')
check('under an hour drops the hour part', formatDuration(45.5) === '45:30')

console.log('\n=== TARGET TIME FIELDS ===')
// "4:00" for a marathon used to parse as four minutes (0:06/km).
check('4 h 0 min → 240 min', targetTimeFromParts({ hours: '4', minutes: '0' }) === 240)
check('minutes only → 45 min', targetTimeFromParts({ minutes: '45' }) === 45)
check('seconds count → 22:30', near(targetTimeFromParts({ minutes: '22', seconds: '30' }), 22.5, 0.001))
check('all empty → null', targetTimeFromParts({ hours: '', minutes: '', seconds: '' }) === null)
check('zero → null', targetTimeFromParts({ hours: '0', minutes: '0' }) === null)
check('junk → null', targetTimeFromParts({ hours: '-1', minutes: '30' }) === null)
check('round-trips to fields', JSON.stringify(targetTimeToParts(105.5)) === JSON.stringify({ hours: '1', minutes: '45', seconds: '30' }))
check('no time → empty fields', targetTimeToParts(null).hours === '')
check('seconds field under 10 km only', targetTimeHasSeconds(5) && !targetTimeHasSeconds(10) && !targetTimeHasSeconds(42.2))
const marathon4h = targetPaceCheck(240, 42.2)
check(`4:00 marathon → 5:41/km (${marathon4h.label})`, marathon4h.label === '5:41' && marathon4h.warning === null)
check('4 minutes for a marathon → too fast', targetPaceCheck(4, 42.2).warning === 'too_fast')
check('2:50/km itself is allowed', targetPaceCheck(2 + 50 / 60, 1).warning === null)
check('3 h for 10 km → too slow', targetPaceCheck(180, 10).warning === 'too_slow')
check('no distance → null', targetPaceCheck(240, 0) === null)

console.log('\n=== RACE TIME PREDICTION (inverse VDOT) ===')
// Anchors from the Daniels tables.
check(`VDOT 50 → 5K ≈ 19:57 (${formatDuration(raceTimeForVdot(50, 5))})`,
  near(raceTimeForVdot(50, 5), 19.95, 0.4))
check(`VDOT 50 → marathon ≈ 3:10 (${formatDuration(raceTimeForVdot(50, 42.195))})`,
  near(raceTimeForVdot(50, 42.195), 190, 6))
check(`VDOT 40 → 10K ≈ 50:00 (${formatDuration(raceTimeForVdot(40, 10))})`,
  near(raceTimeForVdot(40, 10), 50, 3))
check('longer distance always takes longer', raceTimeForVdot(45, 21.1) > raceTimeForVdot(45, 10))
check('fitter runner is always faster', raceTimeForVdot(55, 10) < raceTimeForVdot(45, 10))
check('works for an arbitrary distance (15 km)', raceTimeForVdot(45, 15) > 0)
check('works for an arbitrary distance (30 km)', raceTimeForVdot(45, 30) > 0)
check('30 km sits between a half and a marathon',
  raceTimeForVdot(45, 30) > raceTimeForVdot(45, 21.1) &&
  raceTimeForVdot(45, 30) < raceTimeForVdot(45, 42.195))
check('garbage → null', raceTimeForVdot(0, 10) === null && raceTimeForVdot(45, 0) === null)

console.log('\n=== GOAL REALISM ===')
const vdot = 45
const predictedHalf = raceTimeForVdot(vdot, 21.1)
console.log(`    VDOT ${vdot} predicts a half in ${formatDuration(predictedHalf)}`)

const slower = assessGoal({ vdot, targetDistanceKm: 21.1, targetTimeMin: predictedHalf * 1.1 })
check('a target slower than current shape → comfortable', slower.verdict === 'comfortable')
check('comfortable targets are kept', slower.planning_time_min === slower.target_time_min)

const modest = assessGoal({ vdot, targetDistanceKm: 21.1, targetTimeMin: predictedHalf * 0.96 })
check('a 4% improvement → realistic', modest.verdict === 'realistic')
check('realistic targets are kept', modest.planning_time_min === modest.target_time_min)

const stretch = assessGoal({ vdot, targetDistanceKm: 21.1, targetTimeMin: predictedHalf * 0.93 })
check('a 7% improvement → ambitious', stretch.verdict === 'ambitious')
check('ambitious targets are still chased', stretch.planning_time_min === stretch.target_time_min)
check('ambitious is flagged as realistic', stretch.realistic === true)

const fantasy = assessGoal({ vdot, targetDistanceKm: 21.1, targetTimeMin: predictedHalf * 0.6 })
check('a 40% improvement → unrealistic', fantasy.verdict === 'unrealistic')
check('unrealistic is flagged', fantasy.realistic === false)
check('the plan is built toward the achievable time, not the fantasy',
  fantasy.planning_time_min === fantasy.achievable_time_min)
check('the achievable time still beats current fitness',
  fantasy.achievable_time_min < fantasy.predicted_time_min)
check('the coach is given a message to relay', typeof fantasy.message === 'string' && fantasy.message.length > 40)
check('the message says what the plan targets instead',
  fantasy.message.includes(formatDuration(fantasy.achievable_time_min)))
check('the message is not discouraging', /great|realistic outcome|long-term/i.test(fantasy.message))

const noTime = assessGoal({ vdot, targetDistanceKm: 15 })
check('no target time is fine', noTime.verdict === 'no_target' && noTime.realistic)
check('a goal pace is still derived', noTime.goal_pace_min_per_km > 0)
check('no target distance → no assessment', assessGoal({ vdot, targetDistanceKm: null }) === null)

console.log('\n=== LONG RUN CEILING SCALES WITH THE GOAL ===')
for (const [d, lo, hi] of [[5, 9, 13], [10, 12, 16], [21.1, 19, 23], [30, 24, 29], [42.2, 30, 32]])
  check(`${d} km goal → long run peaks ${lo}-${hi} km (${peakLongRunKm(d)})`,
    peakLongRunKm(d) >= lo && peakLongRunKm(d) <= hi)
check('monotonic in distance', [5, 10, 15, 21.1, 30, 42.2]
  .every((d, i, a) => i === 0 || peakLongRunKm(d) >= peakLongRunKm(a[i - 1])))
check('never exceeds 32 km', peakLongRunKm(100) === 32)

console.log('\n=== ARBITRARY DISTANCES BUILD REAL PLANS ===')
const runs = [{ date: '2026-09-17', distance: 10, duration: 55, effort: 3 }]
for (const d of [3, 5, 7.5, 10, 15, 21.1, 30, 42.2, 50]) {
  const s = buildPlanSkeleton({
    profile: { fitness_level: 'intermediate', target_distance_km: d, event_date: '2026-12-13' },
    totalWeeks: 12, runs, today,
  })
  const race = s.weeks[11].days.find((x) => x.type === 'race')
  const ok =
    s.weeks.length === 12 &&
    s.weeks.every((w) => w.days.length === 7) &&
    s.target_distance_km === d &&
    race?.distance_km === d &&
    s.paces.goal?.min_per_km > 0
  check(`${d} km goal produces a complete plan with a matching race day`, ok)
}

console.log('\n=== EXPLICIT AVAILABILITY BEATS INFERENCE ===')
const inferred = { maxRunDays: 6, availableDays: null, noBackToBack: false, notes: [] }
const merged = mergeProfileConstraints(inferred, {
  days_per_week: 3, available_days: ['Tuesday', 'Thursday', 'Saturday'],
})
check('days_per_week from the form wins', merged.maxRunDays === 3)
check('available_days from the form wins', merged.availableDays.join() === 'Tuesday,Thursday,Saturday')
check('run days cannot exceed available days',
  mergeProfileConstraints(inferred, { days_per_week: 7, available_days: ['Monday', 'Friday'] }).maxRunDays === 2)
check('an empty profile changes nothing',
  mergeProfileConstraints(inferred, {}).maxRunDays === 6)
check('available days are returned in weekday order',
  mergeProfileConstraints(inferred, { available_days: ['Saturday', 'Monday', 'Wednesday'] })
    .availableDays.join() === 'Monday,Wednesday,Saturday')

const constrained = buildPlanSkeleton({
  profile: {
    fitness_level: 'intermediate', target_distance_km: 10,
    days_per_week: 3, available_days: ['Tuesday', 'Thursday', 'Saturday'],
  },
  totalWeeks: 8, runs, today,
})
check('the plan only schedules runs on the chosen days', constrained.weeks.every((w) =>
  w.days.filter((d) => d.type !== 'rest')
    .every((d) => ['Tuesday', 'Thursday', 'Saturday'].includes(d.day))))
check('and never more than the chosen number of days', constrained.weeks.every((w) =>
  w.days.filter((d) => d.type !== 'rest').length <= 3))

console.log('\n=== STATED WEEKLY VOLUME IS TRUSTED ===')
check('a stated weekly volume overrides the level default',
  currentWeeklyVolume([], 'beginner', today, { weekly_volume_km: 45 }) === 45)
check('a stated weekly volume overrides the logs',
  currentWeeklyVolume([{ date: '2026-09-18', distance: 5 }], 'beginner', today, { weekly_volume_km: 60 }) === 60)
check('absurd stated volume is clamped',
  currentWeeklyVolume([], 'beginner', today, { weekly_volume_km: 9999 }) <= 250)
check('no stated volume → previous behaviour',
  currentWeeklyVolume([], 'beginner', today, {}) === 15)

export default summary('goal + distance')
