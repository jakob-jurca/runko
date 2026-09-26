/**
 * Intensity and placement rules (Group B), on hand-made weeks: quality caps
 * by level, phase and population, the gap between hard sessions, the
 * low-intensity floor, race week, easy-run limits, strides, marathon-pace
 * long runs, strength notes and the post-race clocks.
 */
import { makeDay, enrichDays } from '../src/core/periodization.js'
import {
  qualityCap, hardGapDays, lastQualityDaysBeforeRace, postRaceClocks, applyIntensityRules, HARD_TYPES,
} from '../src/core/planning/intensity.js'
import { check, summary } from './harness.mjs'

console.log('\n=== INTENSITY AND PLACEMENT ===')

const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const paces = { easy: 6, marathon: 5.3, threshold: 5, interval: 4.6, repetition: 4.3 }
const day = (name, type, km, hard = 0, paceKey = 'easy') =>
  enrichDays([makeDay({
    day: name, type, distanceKm: km, hardKm: hard, paceKey, paces,
    intensity: type === 'easy' || type === 'long' ? 'easy' : 'hard',
  })], paces, 40)[0]
const rest = (name) => ({ day: name, type: 'rest', distance_km: 0, duration_min: 0, segments: [] })
const week = (days, phase = 'build', n = 1) => ({ week_number: n, phase, is_recovery: false, unit: 'distance', allow_hard: true, days })
const ctx = (over = {}) => ({ level: 'intermediate', age: 35, runDays: 5, distanceKm: 10, paces, hardGapHours: 48, ...over })
const run = (w, over) => applyIntensityRules([w], ctx(over))[0]
const hardOf = (w) => w.days.filter((d) => HARD_TYPES.has(d.type))
const idx = (d) => NAMES.indexOf(d.day)
const kmOf = (w) => w.days.reduce((s, d) => s + d.distance_km, 0)

// -- quality caps (b05 section 2 and the population caps) ---------------------
check('none: never quality', qualityCap({ level: 'none', phase: 'build' }) === 0)
check('beginner: 0 in base, 1 in build', qualityCap({ level: 'beginner', phase: 'base' }) === 0 && qualityCap({ level: 'beginner', phase: 'build' }) === 1)
check('intermediate: 1 / 2 / 2', [qualityCap({ level: 'intermediate', phase: 'base' }), qualityCap({ level: 'intermediate', phase: 'build' }), qualityCap({ level: 'intermediate', phase: 'sharpen' })].join() === '1,2,2')
check('advanced on 6 days: 3 in build', qualityCap({ level: 'advanced', phase: 'build', runDays: 6 }) === 3)
check('advanced on 4 days: 2', qualityCap({ level: 'advanced', phase: 'build', runDays: 4 }) === 2)
check('50+: 2 in build at most', qualityCap({ level: 'advanced', phase: 'build', age: 55, runDays: 6 }) === 2)
check('70+: 1 at most', qualityCap({ level: 'advanced', phase: 'build', age: 72, runDays: 6 }) === 1)
check('teenagers: 2 at most', qualityCap({ level: 'elite', phase: 'build', age: 16, runDays: 6 }) === 2)
check('3 run days: 1 with a recent injury, 2 without (p07 r8)',
  qualityCap({ level: 'advanced', phase: 'build', runDays: 3 }) === 1 &&
  qualityCap({ level: 'advanced', phase: 'build', runDays: 3, injuryFree: true }) === 2 &&
  qualityCap({ level: 'novice', phase: 'build', runDays: 3, injuryFree: true }) === 1)
check('2 run days: none below intermediate, one from intermediate (p07 r6-7)',
  qualityCap({ level: 'novice', phase: 'build', runDays: 2 }) === 0 && qualityCap({ level: 'intermediate', phase: 'build', runDays: 2 }) === 1)

// -- gaps, race week, clocks ----------------------------------------------------
check('gap: 48 h = 2 days, 60 h = 3, 72 h = 3', hardGapDays(48) === 2 && hardGapDays(60) === 3 && hardGapDays(72) === 3)
check('last quality 4 days out for 5-10 km, 6 for a half and a marathon',
  lastQualityDaysBeforeRace(10) === 4 && lastQualityDaysBeforeRace(21.1) === 6 && lastQualityDaysBeforeRace(42.2) === 6)
const c10 = postRaceClocks(10)
check('post-race: no intensity ceil(10/3) = 4 days, load back ceil(10/1.609) = 7', c10.no_intensity_days === 4 && c10.load_back_days === 7)
const c10old = postRaceClocks(10, 55)
check('post-race from 50: clocks x 1.25, rounded up', c10old.no_intensity_days === 5 && c10old.load_back_days === 9)
const cm = postRaceClocks(42.2)
check('post-marathon: 2 days off, weeks at 30/50/70/85%', cm.no_running_days === 2 && cm.week_fractions.join() === '0.3,0.5,0.7,0.85')

// -- placement --------------------------------------------------------------------
{
  const w = week([rest('Monday'), day('Tuesday', 'interval', 9, 4, 'interval'), day('Wednesday', 'tempo', 9, 5, 'threshold'), day('Thursday', 'easy', 8), day('Friday', 'easy', 8), day('Saturday', 'long', 14), rest('Sunday')])
  const out = run(w, { runDays: 5 })
  const hard = hardOf(out)
  check('back-to-back quality days are separated (moved, not lost)', hard.length === 2 && idx(hard[1]) - idx(hard[0]) >= 2)
  check('...and the week keeps its kilometres', kmOf(out) === kmOf(w))
}
{
  const w = week([rest('Monday'), day('Tuesday', 'interval', 9, 4, 'interval'), day('Wednesday', 'easy', 8), day('Thursday', 'tempo', 9, 5, 'threshold'), day('Friday', 'easy', 8), day('Saturday', 'long', 14), rest('Sunday')])
  check('a 3-run-day runner with a recent injury keeps one quality session', hardOf(run(w, { runDays: 3 })).length === 1)
  check('a 72-year-old keeps one', hardOf(run(w, { age: 72, level: 'advanced' })).length === 1)
  check('a 16-year-old keeps at most two', hardOf(run(w, { age: 16, level: 'advanced', runDays: 6 })).length <= 2)
}
{
  // 60+: 72 h between hard sessions. A hard long run (>= 30% of the week) on
  // Friday and quality on Wednesday are only two days apart.
  const w = week([rest('Monday'), rest('Tuesday'), day('Wednesday', 'tempo', 8, 4, 'threshold'), day('Thursday', 'easy', 6), day('Friday', 'long', 16), rest('Saturday'), rest('Sunday')])
  const out = run(w, { age: 62, hardGapHours: 72, runDays: 4 })
  const stillTooClose = hardOf(out).some((d) => 4 - idx(d) < 3)
  check('60+: quality closer than 72 h to a hard long run is moved or dropped', !stillTooClose)
}
{
  const raced = week([rest('Monday'), day('Tuesday', 'tempo', 8, 4, 'threshold'), rest('Wednesday'), day('Thursday', 'tempo', 8, 4, 'threshold'), rest('Friday'), day('Saturday', 'easy', 4), day('Sunday', 'race', 10)], 'taper')
  const out = run(raced, { distanceKm: 10, runDays: 4 })
  check('race week 10 km: nothing hard inside the last 4 days', hardOf(out).every((d) => idx(d) <= 2))
  const half = run(raced, { distanceKm: 21.1, runDays: 4 })
  check('race week half: nothing hard inside the last 6 days', hardOf(half).every((d) => idx(d) === 0))
}
{
  const w = week([rest('Monday'), day('Tuesday', 'interval', 8, 6, 'interval'), day('Wednesday', 'easy', 6), day('Thursday', 'tempo', 8, 6, 'threshold'), day('Friday', 'easy', 6), day('Saturday', 'long', 10), rest('Sunday')])
  const out = run(w, { runDays: 5, level: 'advanced' })
  const low = 1 - out.days.reduce((s, d) => s + (d.hard_km || 0), 0) / kmOf(out)
  check('low-intensity floor: at least 75% easy', low >= 0.75)
  const three = run(w, { runDays: 3, level: 'advanced' })
  const low3 = 1 - three.days.reduce((s, d) => s + (d.hard_km || 0), 0) / kmOf(three)
  check('...70% on 3 runs or fewer', low3 >= 0.7)
}

// -- easy runs ---------------------------------------------------------------------
{
  const w = week([rest('Monday'), day('Tuesday', 'easy', 12), day('Wednesday', 'easy', 6), rest('Thursday'), day('Friday', 'easy', 6), day('Saturday', 'long', 14), rest('Sunday')], 'base')
  const out = run(w, { runDays: 4 })
  const easyMax = Math.max(...out.days.filter((d) => d.type === 'easy').map((d) => d.distance_km))
  check('an easy run is at most 0.75 x the long run', easyMax <= Math.floor(0.75 * 14))
  check('...and the kilometres are kept', kmOf(out) === kmOf(w))
}
{
  const w = week([rest('Monday'), day('Tuesday', 'easy', 2), day('Wednesday', 'easy', 6), rest('Thursday'), day('Friday', 'easy', 6), day('Saturday', 'long', 12), rest('Sunday')], 'base')
  const out = run(w, { runDays: 4 })
  check('no easy run under 20 minutes when its kilometres can move', out.days.filter((d) => d.type === 'easy' && d.distance_km * paces.easy < 20).length === 0)
  check('...the kilometres moved with it', kmOf(out) === kmOf(w))
}

// -- strides, marathon pace, strength -----------------------------------------------
{
  const w = week([rest('Monday'), day('Tuesday', 'easy', 8), day('Wednesday', 'easy', 8), day('Thursday', 'easy', 8), day('Friday', 'easy', 6), day('Saturday', 'long', 14), rest('Sunday')], 'base', 3)
  const twice = applyIntensityRules([w, w, w], ctx({ runDays: 5 }))[2]
  check('strides: two easy runs a week on 4+ run days',
    twice.days.filter((d) => d.variant === 'strides').length === 2)
  check('...never the day before the long run', !twice.days.find((d) => d.day === 'Friday' && d.variant === 'strides'))
  const beginner = applyIntensityRules([w, w, w], ctx({ runDays: 5, level: 'beginner' }))[2]
  check('beginners: no strides before the fourth week of running', beginner.days.filter((d) => d.variant === 'strides').length === 0)
}
{
  const w = week([rest('Monday'), day('Tuesday', 'easy', 12), day('Wednesday', 'easy', 12), day('Thursday', 'easy', 12), rest('Friday'), day('Saturday', 'long', 32), rest('Sunday')], 'sharpen', 4)
  const out = run(w, { distanceKm: 42.2, runDays: 4, level: 'advanced' })
  const long = out.days.find((d) => d.type === 'long')
  check('marathon long run carries marathon-pace kilometres', long.variant === 'mp_segments' && long.mp_km >= 5)
  check('...at most 110 minutes, 20% of the week and 29 km of them',
    long.mp_km * paces.marathon <= 110 + 0.01 && long.mp_km <= 0.2 * kmOf(w) && long.mp_km <= 29)
  const beginnerMarathon = run(w, { distanceKm: 42.2, runDays: 4, level: 'beginner' })
  check('...only for trained runners', beginnerMarathon.days.find((d) => d.type === 'long').variant !== 'mp_segments')
}
{
  const w = week([rest('Monday'), day('Tuesday', 'tempo', 8, 4, 'threshold'), rest('Wednesday'), day('Thursday', 'easy', 8), rest('Friday'), rest('Saturday'), day('Sunday', 'long', 14)], 'base')
  const out = applyIntensityRules([w], ctx({ runDays: 3, strength: true, age: 66 }))[0]
  const noted = out.days.filter((d) => d.strength_note)
  check('strength: optional notes, two in base', noted.length === 2)
  // Hard days are Tuesday (1) and Sunday (6): nothing on Monday or Friday/Saturday.
  check('...never within 48 h before a hard session', noted.every((d) => ![0, 4, 5].includes(idx(d))))
  check('...balance work from 65', noted.every((d) => /ravnotežje/.test(d.strength_note)))
  const young = applyIntensityRules([w], ctx({ runDays: 3, strength: true, age: 30 }))[0]
  check('...no balance work under 65', young.days.filter((d) => d.strength_note).every((d) => !/ravnotežje/.test(d.strength_note)))
}

export default summary('intensity')
