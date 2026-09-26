/**
 * Returning runners, race gating and marathon prediction (Group A):
 * Daniels' categories and fitness-loss factor, the beginner race gate, the
 * minimum plan weeks and the volume-dependent marathon exponent.
 */
import { fvdot, breakCategory, returnStartFactor, easyOnlyWeeks } from '../src/core/planning/returning.js'
import { minPlanWeeks, beginnerRaceGateWeeks } from '../src/core/planning/rules.js'
import { predictRaceTime, raceTimeForVdot } from '../src/core/periodization.js'
import { check, summary } from './harness.mjs'

console.log('\n=== RETURNING, RACE GATING, PREDICTION ===')

check('5 days off or fewer: category I, no change', breakCategory(5) === 'I' && fvdot(5) === 1 && returnStartFactor(3) === 1)
check('6-28 days: category II', breakCategory(6) === 'II' && breakCategory(28) === 'II')
check('29-56 days: category III', breakCategory(29) === 'III' && breakCategory(56) === 'III')
check('over 56 days: category IV', breakCategory(57) === 'IV')
check('FVDOT-1 at 10 days is 0.985 (b07)', fvdot(10) === 0.985)
check('FVDOT-1 interpolates: 12 days between 0.985 and 0.973', fvdot(12) > 0.973 && fvdot(12) < 0.985)
check('FVDOT-1 floor 0.800 at 72+ days', fvdot(100) === 0.8)
check('FVDOT-2 (cross-trained) floor 0.900', fvdot(100, true) === 0.9)
check('start at 50% for 6-28 days, 33% beyond', returnStartFactor(14) === 0.5 && returnStartFactor(40) === 0.33 && returnStartFactor(90) === 0.33)
check('easy-only for the return period (14 days = 2 weeks)', easyOnlyWeeks(14) === 2)
check('easy-only after an injury until half the old volume', easyOnlyWeeks(3, { injury: true }) >= 2)

check('min plan: 5 km from none 9, else 6', minPlanWeeks(5, 'none') === 9 && minPlanWeeks(5, 'novice') === 6)
check('min plan: 10 km 8', minPlanWeeks(10, 'intermediate') === 8)
check('min plan: half novice 10, intermediate 8', minPlanWeeks(21.1, 'novice') === 10 && minPlanWeeks(21.1, 'intermediate') === 8)
check('min plan: marathon novice 16, intermediate 12', minPlanWeeks(42.2, 'beginner') === 16 && minPlanWeeks(42.2, 'advanced') === 12)

check('beginner half: waits until six months of running', beginnerRaceGateWeeks(21.1, 'beginner', 2) === Math.ceil(4 * 4.345))
check('beginner marathon: at least 26 weeks', beginnerRaceGateWeeks(42.2, 'beginner', 5) === 26)
check('no gate for a 10 km or for six months of running', beginnerRaceGateWeeks(10, 'beginner', 0) === 0 && beginnerRaceGateWeeks(42.2, 'intermediate', 12) === 0)
check('a novice under six months also waits for a half', beginnerRaceGateWeeks(21.1, 'novice', 3) === Math.ceil(3 * 4.345))

const v = 45
const half = raceTimeForVdot(v, 21.0975)
check('marathon prediction uses exponent 1.12 below 40 km/week', Math.abs(predictRaceTime(v, 42.195, 30) - half * (42.195 / 21.0975) ** 1.12) < 0.02)
check('marathon prediction uses exponent 1.06 from 90 km/week', Math.abs(predictRaceTime(v, 42.195, 95) - half * (42.195 / 21.0975) ** 1.06) < 0.02)
check('low volume predicts a slower marathon than high volume', predictRaceTime(v, 42.195, 30) > predictRaceTime(v, 42.195, 95))
check('shorter distances ignore the volume', predictRaceTime(v, 10, 30) === raceTimeForVdot(v, 10))

export default summary('returning')
