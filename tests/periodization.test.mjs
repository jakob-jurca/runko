// Training-plan maths. Pure functions, no API calls, no dependencies.
import {
  vdotFromRace, estimateVdot, pacesFromVdot, formatPace, velocityForVo2, vo2AtVelocity,
  assignPhases, assignRecoveryWeeks, buildVolumeCurve, currentWeeklyVolume,
  deriveConstraints, chooseRunDays, layOutWeek, buildPlanSkeleton,
  MAX_WEEKLY_INCREASE, RECOVERY_VOLUME_FACTOR, HARD_VOLUME_SHARE, DAYS, peakVolumeCap,
} from '../src/core/periodization.js'

import { check, near, summary } from './harness.mjs'

// =========================================================================
console.log('\n=== VDOT CALCULATION ===')
// =========================================================================

check('vo2AtVelocity / velocityForVo2 are inverses',
  near(velocityForVo2(vo2AtVelocity(250)), 250, 0.001))

// Anchor: VDOT 50 is, by definition, roughly a 19:57 5K.
const v50 = vdotFromRace(5, 19.95)
check(`5K in 19:57 → VDOT ≈ 50 (got ${v50.toFixed(1)})`, near(v50, 50, 1))
// Anchor: VDOT 30 is roughly a 30:40 5K.
const v30 = vdotFromRace(5, 30.67)
check(`5K in 30:40 → VDOT ≈ 30 (got ${v30.toFixed(1)})`, near(v30, 30, 1.5))
// Anchor: a sub-3 marathon is about VDOT 54.
const vM = vdotFromRace(42.195, 179)
check(`marathon in 2:59 → VDOT ≈ 54 (got ${vM.toFixed(1)})`, near(vM, 54, 2))

check('faster over the same distance → higher VDOT', vdotFromRace(10, 40) > vdotFromRace(10, 50))
check('garbage input → null', vdotFromRace(0, 20) === null && vdotFromRace(5, 0) === null)

console.log('\n  from logged training runs:')
const runs = [
  { date: '2026-09-17', distance: 8, duration: 48, effort: 3 },
  { date: '2026-09-14', distance: 16, duration: 104, effort: 4 },
  { date: '2026-09-11', distance: 6, duration: 35, effort: 2 },
]
const est = estimateVdot(runs, 'intermediate')
check(`estimates from runs, not the level (${est.vdot})`, est.source === 'runs')
check('lands in a plausible band for 6:00/km training', est.vdot > 35 && est.vdot < 55)
check('records which run it used', est.basedOn !== null)

check('an easy effort implies MORE fitness than the same pace all-out',
  estimateVdot([{ distance: 10, duration: 60, effort: 1 }]).vdot >
  estimateVdot([{ distance: 10, duration: 60, effort: 5 }]).vdot)
check('no runs → falls back to the level',
  estimateVdot([], 'advanced').source === 'level' && estimateVdot([], 'advanced').vdot === 52)
check('sub-1.5km runs ignored (formula unreliable)',
  estimateVdot([{ distance: 0.5, duration: 2, effort: 5 }], 'beginner').source === 'level')
check('unusable rows ignored',
  estimateVdot([{ distance: 'x', duration: null, effort: 3 }], 'beginner').source === 'level')
check('absurd input clamped below VDOT_MAX',
  estimateVdot([{ distance: 42.195, duration: 100, effort: 5 }]).vdot <= 85)

// =========================================================================
console.log('\n=== TRAINING PACES ===')
// =========================================================================
const p50 = pacesFromVdot(50)
console.log('    VDOT 50 →',
  Object.entries(p50).map(([k, v]) => `${k} ${formatPace(v)}`).join(', '))

check('paces strictly ordered easy > marathon > threshold > interval > repetition',
  p50.easy > p50.marathon && p50.marathon > p50.threshold &&
  p50.threshold > p50.interval && p50.interval > p50.repetition)
check(`easy pace for VDOT 50 inside Daniels' 5:02-5:37 range (${formatPace(p50.easy)})`,
  p50.easy >= 5.03 && p50.easy <= 5.62)
check(`threshold for VDOT 50 is 4:10-4:30 (${formatPace(p50.threshold)})`,
  p50.threshold > 4.16 && p50.threshold < 4.5)
check(`interval for VDOT 50 is 3:45-4:10 (${formatPace(p50.interval)})`,
  p50.interval > 3.75 && p50.interval < 4.17)
check('fitter runner gets faster paces', pacesFromVdot(60).easy < pacesFromVdot(40).easy)
check('formatPace rounds 5.999 to 6:00', formatPace(5.999) === '6:00')

// =========================================================================
console.log('\n=== PHASES ===')
// =========================================================================
const p16 = assignPhases(16, { hasEvent: true })
console.log('    16-week event plan:', p16.join(' '))
check('16 weeks → all four phases present',
  ['base', 'build', 'sharpen', 'taper'].every((x) => p16.includes(x)))
check('final 2 weeks are taper', p16.slice(-2).join() === 'taper,taper')
check('starts in base', p16[0] === 'base')
check('phases never go backwards', (() => {
  const order = { base: 0, build: 1, sharpen: 2, taper: 3 }
  return p16.every((ph, i) => i === 0 || order[ph] >= order[p16[i - 1]])
})())
check('one phase entry per week', p16.length === 16)

for (const n of [1, 2, 3, 4, 5, 6, 8, 10, 12, 20, 24]) {
  const ph = assignPhases(n, { hasEvent: true })
  const ok = ph.length === n && (n <= 2 ? true : ph.slice(-2).join() === 'taper,taper')
  check(`${n}-week event plan is well formed`, ok)
}
check('1-week plan is just a taper', assignPhases(1, { hasEvent: true }).join() === 'taper')
check('0 weeks → empty', assignPhases(0, { hasEvent: true }).length === 0)

const gen = assignPhases(12, { hasEvent: false })
console.log('    12-week general plan:', gen.join(' '))
check('general fitness never tapers', !gen.includes('taper'))
check('general fitness rolls base→build', gen[0] === 'base' && gen[4] === 'build' && gen[8] === 'base')

// =========================================================================
console.log('\n=== RECOVERY WEEK PLACEMENT ===')
// =========================================================================
const rec16 = assignRecoveryWeeks(p16)
console.log('    recovery weeks:', rec16.map((r, i) => (r ? i + 1 : null)).filter(Boolean).join(', '))
check('weeks 4, 8, 12 are recovery', rec16[3] && rec16[7] && rec16[11])
check('week 1 is never recovery', !rec16[0])
check('no recovery week inside the taper',
  p16.every((ph, i) => !(ph === 'taper' && rec16[i])))
check('recovery lands only on multiples of 4',
  rec16.every((r, i) => !r || (i + 1) % 4 === 0))
const recGen = assignRecoveryWeeks(assignPhases(12, { hasEvent: false }))
check('general plan also recovers every 4th week', recGen[3] && recGen[7] && recGen[11])

// =========================================================================
console.log('\n=== VOLUME PROGRESSION ===')
// =========================================================================
const phases = assignPhases(16, { hasEvent: true })
const recovery = assignRecoveryWeeks(phases)
const vol = buildVolumeCurve({
  totalWeeks: 16, phases, recoveryWeeks: recovery, startVolumeKm: 30, fitnessLevel: 'intermediate',
})
console.log('    volumes:', vol.join(' → '))

check('one volume per week', vol.length === 16)
check('every volume is a positive number', vol.every((v) => Number.isFinite(v) && v > 0))
check('week 1 equals the starting volume', vol[0] === 30)

// The 10% rule applies to the build trend (progressive weeks), not to the
// step back up out of a recovery dip.
const progressive = vol.map((v, i) => ({ v, i })).filter(({ i }) => !recovery[i] && phases[i] !== 'taper')
let tenPctOk = true
for (let k = 1; k < progressive.length; k++) {
  const prev = progressive[k - 1].v
  const cur = progressive[k].v
  // +1 km of slack: volumes are whole kilometres, so 36 -> 40 is the
  // rounding of 39.6, not an 11% overload.
  if (cur > prev * MAX_WEEKLY_INCREASE + 1.01) {
    tenPctOk = false
    console.log(`      week ${progressive[k].i + 1}: ${prev} → ${cur} exceeds +10%`)
  }
}
check('no progressive week rises more than 10%', tenPctOk)
check('volume is non-decreasing across progressive weeks',
  progressive.every((x, k) => k === 0 || x.v >= progressive[k - 1].v - 0.05))

for (let i = 0; i < 16; i++) {
  if (!recovery[i]) continue
  const ratio = vol[i] / vol[i - 1]
  check(`week ${i + 1} recovery ≈70% of week ${i} (${vol[i]}/${vol[i - 1]} = ${ratio.toFixed(2)})`,
    near(ratio, RECOVERY_VOLUME_FACTOR, 0.06))
}

console.log('\n  taper:')
const peak = Math.max(...vol.filter((_, i) => phases[i] !== 'taper'))
check(`week 15 ≈70% of peak ${peak} (${vol[14]})`, near(vol[14] / peak, 0.7, 0.05))
check(`week 16 ≈50% of peak ${peak} (${vol[15]})`, near(vol[15] / peak, 0.5, 0.05))
check('taper reduces volume from the peak', vol[14] < peak && vol[15] < vol[14])

check('beginner volume is capped (goal-aware ceiling)',
  Math.max(...buildVolumeCurve({
    totalWeeks: 30, phases: assignPhases(30, {}), recoveryWeeks: assignRecoveryWeeks(assignPhases(30, {})),
    startVolumeKm: 15, fitnessLevel: 'beginner', targetDistanceKm: 10,
  })) <= peakVolumeCap('beginner', 10) + 0.1)

console.log('\n  starting volume from logs:')
const today = new Date('2026-09-19T12:00:00')
const recentRuns = [
  { date: '2026-09-18', distance: 10, effort: 3 },
  { date: '2026-09-16', distance: 8, effort: 3 },
  { date: '2026-09-14', distance: 12, effort: 3 },
  { date: '2026-06-01', distance: 99, effort: 3 }, // old, must be ignored
]
check(`last 7 days only (got ${currentWeeklyVolume(recentRuns, 'intermediate', today)})`,
  currentWeeklyVolume(recentRuns, 'intermediate', today) === 30)
check('no runs → level default', currentWeeklyVolume([], 'beginner', today) === 15)
check('one huge week cannot blow up the plan',
  currentWeeklyVolume([{ date: '2026-09-18', distance: 500, effort: 3 }], 'beginner', today) <= 30)

// =========================================================================
console.log('\n=== CONSTRAINTS FROM COACH MEMORY ===')
// =========================================================================
const c1 = deriveConstraints([
  { category: 'injury', content: 'Knee flares up on back-to-back running days' },
  { category: 'schedule', content: 'Only runs early mornings before work' },
])
check('back-to-back injury detected', c1.noBackToBack === true)
check('morning preference detected', c1.timeOfDay === 'morning')
check('memories kept as notes for the AI', c1.notes.length === 2)
check('"4 times a week" parsed',
  deriveConstraints([{ category: 'schedule', content: 'Runs 4 times a week' }]).maxRunDays === 4)
check('Slovenian consecutive-days phrasing detected',
  deriveConstraints([{ category: 'injury', content: 'Kolena ne prenesejo dva dni zapored' }]).noBackToBack)
check('no memories → no constraints',
  deriveConstraints([]).noBackToBack === false && deriveConstraints([]).availableDays === null)

console.log('\n  run-day selection:')
const b2b = chooseRunDays({ count: 4, availableDays: null, noBackToBack: true })
console.log('    no-back-to-back, 4 days:', b2b.join(', '))
check('never two adjacent days',
  b2b.every((d, i) => i === 0 || DAYS.indexOf(d) - DAYS.indexOf(b2b[i - 1]) >= 2))
const five = chooseRunDays({ count: 5, availableDays: null, noBackToBack: false })
check(`5 unrestricted days picked (${five.length})`, five.length === 5)
check('days come back in weekday order',
  five.every((d, i) => i === 0 || DAYS.indexOf(d) > DAYS.indexOf(five[i - 1])))
const only = chooseRunDays({ count: 3, availableDays: ['Tuesday', 'Thursday', 'Saturday'], noBackToBack: false })
check('honours explicit availability', only.join() === 'Tuesday,Thursday,Saturday')

// =========================================================================
console.log('\n=== WEEK LAYOUT / 80-20 POLARIZED ===')
// =========================================================================
const paces = pacesFromVdot(45)
const week = layOutWeek({ volumeKm: 50, phase: 'build', isRecovery: false, paces, fitnessLevel: 'intermediate' })
console.log('   ', week.map((d) => `${d.day.slice(0, 3)}:${d.type}${d.distance_km || ''}`).join(' '))

check('always 7 days, Monday..Sunday', week.length === 7 && week.map((d) => d.day).join() === DAYS.join())
// Distances are whole kilometres now, so the sum lands within rounding
// distance of the target rather than exactly on it.
check('total distance ≈ the target volume',
  near(week.reduce((s, d) => s + d.distance_km, 0), 50, 2.5))
check('every prescribed distance is a whole number of km',
  week.filter((d) => d.type !== 'rest').every((d) => Number.isInteger(d.distance_km)))
const hard = week.reduce((s, d) => s + (d.hard_km || 0), 0)
check(`hard volume ≈20% (got ${(hard / 50 * 100).toFixed(0)}%)`, near(hard / 50, HARD_VOLUME_SHARE, 0.09))
check('there is exactly one long run', week.filter((d) => d.type === 'long').length === 1)
check('the long run is the longest run of the week', (() => {
  const long = week.find((d) => d.type === 'long')
  return week.filter((d) => d.type !== 'rest' && d !== long).every((d) => d.distance_km <= long.distance_km)
})())
check('at least one rest day', week.some((d) => d.type === 'rest'))
check('every running day has a pace and an intensity',
  week.filter((d) => d.type !== 'rest').every((d) => d.pace && d.pace.includes('/km') && d.intensity))
check('every day carries a duration', week.every((d) => Number.isFinite(d.duration_min)))
check('rest days are zeroed', week.filter((d) => d.type === 'rest').every((d) => d.distance_km === 0 && d.duration_min === 0))

const recWeek = layOutWeek({ volumeKm: 35, phase: 'build', isRecovery: true, paces, fitnessLevel: 'intermediate' })
check('recovery week drops all hard sessions', !recWeek.some((d) => d.intensity === 'hard'))

const injuryWeek = layOutWeek({
  volumeKm: 40, phase: 'build', isRecovery: false, paces, fitnessLevel: 'intermediate',
  constraints: { noBackToBack: true },
})
const runIdx = injuryWeek.filter((d) => d.type !== 'rest').map((d) => DAYS.indexOf(d.day))
check('injury constraint → no back-to-back running days',
  runIdx.every((x, i) => i === 0 || x - runIdx[i - 1] >= 2))

// =========================================================================
console.log('\n=== FULL SKELETON ===')
// =========================================================================
const skeleton = buildPlanSkeleton({
  profile: { fitness_level: 'intermediate', goal: 'event', target_distance_km: 42.2, event_date: '2026-12-13' },
  totalWeeks: 12,
  runs,
  memories: [{ category: 'injury', content: 'Knee flares up on back-to-back running days' }],
  today,
})
console.log('    VDOT', skeleton.vdot, '| paces', Object.entries(skeleton.paces).map(([k, v]) => `${k} ${v.label}`).join(', '))
console.log('    weeks:', skeleton.weeks.map((w) => `${w.week_number}${w.is_recovery ? 'R' : ''}:${w.phase}:${w.target_volume_km}`).join(' '))

check('12 weeks produced', skeleton.weeks.length === 12)
check('every week has a phase', skeleton.weeks.every((w) => w.phase))
check('every week has 7 days', skeleton.weeks.every((w) => w.days.length === 7))
check('every day has type, distance, pace, intensity',
  skeleton.weeks.every((w) => w.days.every((d) =>
    d.type && d.distance_km !== undefined && d.pace && d.intensity)))
check('skeleton exposes VDOT and paces', skeleton.vdot > 0 && skeleton.paces.easy.label)
check('goal distance carried through as a NUMBER', skeleton.target_distance_km === 42.2)
check('race day keeps the REAL distance, not a rounded one',
  skeleton.weeks[11].days.find((d) => d.type === 'race')?.distance_km === 42.2)
check('event date carried through', skeleton.event_date === '2026-12-13')
check('constraint respected across every week', skeleton.weeks.every((w) => {
  const idx = w.days.filter((d) => d.type !== 'rest').map((d) => DAYS.indexOf(d.day))
  return idx.every((x, i) => i === 0 || x - idx[i - 1] >= 2)
}))
check('peak volume reported', skeleton.peak_volume_km > 0)
// Race week's total is dominated by the race itself, so compare TRAINING
// volume (everything that is not race day).
const trainingKm = (w) =>
  w.days.filter((d) => d.type !== 'race').reduce((s, d) => s + d.distance_km, 0)
check('taper training volume is the lightest in the plan',
  trainingKm(skeleton.weeks[11]) < Math.max(...skeleton.weeks.slice(0, 10).map(trainingKm)))
check('race day is scheduled in the final week at the goal distance',
  skeleton.weeks[11].days.some((d) => d.type === 'race' && d.distance_km === 42.2))
check('race lands on the event weekday (2026-12-13 is a Sunday)',
  skeleton.weeks[11].days.find((d) => d.type === 'race')?.day === 'Sunday')
check('no race day in a plan with no event date',
  !buildPlanSkeleton({ profile: { fitness_level: 'beginner', target_distance_km: 10 }, totalWeeks: 8, runs: [], today })
    .weeks.some((w) => w.days.some((d) => d.type === 'race')))

console.log('\n  degenerate inputs do not throw:')
for (const [label, opts] of [
  ['no runs, no memories, 1 week', { profile: { fitness_level: 'beginner' }, totalWeeks: 1 }],
  ['general fitness, 8 weeks', { profile: { fitness_level: 'beginner', goal: 'general' }, totalWeeks: 8 }],
  ['empty profile', { profile: {}, totalWeeks: 6 }],
  ['advanced, 24 weeks', { profile: { fitness_level: 'advanced', goal: 'general' }, totalWeeks: 24 }],
]) {
  let ok = true
  try {
    const s = buildPlanSkeleton({ runs: [], memories: [], today, ...opts })
    ok = s.weeks.length === opts.totalWeeks && s.weeks.every((w) => w.days.length === 7)
  } catch (e) { ok = false; console.log('      threw:', e.message) }
  check(label, ok)
}

export default summary('periodization')
