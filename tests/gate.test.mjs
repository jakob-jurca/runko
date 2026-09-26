/**
 * Safety gate edge cases (core/planning/gate.js) that the personas do not
 * reach: unknown answers, boundaries, and notices on the intro.
 */
import { safetyGate, MIN_AGE } from '../src/core/planning/gate.js'
import { collectInputs } from '../src/core/planning/collect.js'
import { assessFitness } from '../src/core/planning/assess.js'
import { withNotices } from '../src/core/planning/explain.js'
import { TODAY } from './personas/personas.mjs'
import { check, summary } from './harness.mjs'

console.log('\n=== SAFETY GATE ===')

const gateFor = (profile) => {
  const inputs = collectInputs({ profile: { weekly_volume_km: 20, experience_months: 24, ...profile }, today: TODAY })
  return safetyGate(inputs, assessFitness(inputs))
}

check('minimum age is 15', MIN_AGE === 15)
check('15-year-old is not blocked for age', gateFor({ age: 15 }).outcome === 'clear')
check('14-year-old is blocked', gateFor({ age: 14 }).reason === 'under_15')
check('unknown age is not blocked (onboarding requires it)', gateFor({}).outcome === 'clear')

// Caesarean, tear, pelvic floor (p03 r21-23) and the delivery-type default.
const pp = (weeks, extra = {}) => ({ pregnancy_status: 'postpartum', weeks_postpartum: weeks, postpartum_cleared: false, ...extra })
check('caesarean at 14 weeks, no clearance → wait until 16',
  gateFor(pp(14, { caesarean: true })).reason === 'caesarean_wait')
check('caesarean at 14 weeks, cleared → plan', gateFor(pp(14, { caesarean: true, postpartum_cleared: true })).outcome === 'clear')
check('caesarean at 16 weeks → plan', gateFor(pp(16, { caesarean: true })).outcome === 'clear')
check('delivery type unknown at 13 weeks → plan, with the conservative note',
  (() => { const g = gateFor(pp(13)); return g.outcome === 'clear' && g.notices.some((n) => n.id === 'caesarean_unknown') })())
check('a grade 3-4 tear without clearance → physiotherapist first', gateFor(pp(20, { severe_tear: true })).reason === 'postpartum_tear')
check('pelvic-floor symptoms → stop running, see a physiotherapist', gateFor(pp(30, { pelvic_floor_symptoms: true })).reason === 'pelvic_floor')
check('unknown tear and symptoms unlock nothing but block nothing', gateFor(pp(30)).outcome === 'clear')
check('postpartum: a daily pelvic-floor prompt in the notices', gateFor(pp(30)).notices.some((n) => n.id === 'pelvic_floor_training'))
check('one or two run days: the health message and cross-training',
  gateFor({ days_per_week: 2 }).notices.some((n) => n.id === 'few_days') && !gateFor({ days_per_week: 4 }).notices.some((n) => n.id === 'few_days'))

// Postpartum boundaries (p03 r18-20). Unknown weeks = the earliest case.
check('postpartum, weeks unknown → blocked as early', gateFor({ pregnancy_status: 'postpartum' }).reason === 'postpartum_early')
check('postpartum 5 weeks → blocked even if cleared',
  gateFor({ pregnancy_status: 'postpartum', weeks_postpartum: 5, postpartum_cleared: true }).reason === 'postpartum_early')
check('postpartum 6 weeks, cleared → plan',
  gateFor({ pregnancy_status: 'postpartum', weeks_postpartum: 6, postpartum_cleared: true }).outcome === 'clear')
check('postpartum 11 weeks, clearance unknown → blocked',
  gateFor({ pregnancy_status: 'postpartum', weeks_postpartum: 11 }).reason === 'postpartum_not_cleared')
check('postpartum 12 weeks, clearance unknown → plan',
  gateFor({ pregnancy_status: 'postpartum', weeks_postpartum: 12 }).outcome === 'clear')
check('weeks_postpartum is ignored unless postpartum',
  gateFor({ pregnancy_status: 'none', weeks_postpartum: 2 }).outcome === 'clear')

// Optional health data only ever restricts on a "yes".
check('no health profile → no restriction', Object.keys(gateFor({}).restrictions).length === 0)
check('cardiac symptoms with clearance → plan', gateFor({ cardiac_symptoms: true, medical_clearance: true }).outcome === 'clear')
check('pain_at_rest false → plan', gateFor({ pain_at_rest: false }).outcome === 'clear')

// BMI needs both height and weight; boundaries 35 and 40.
check('BMI without height → no BMI rule', gateFor({ weight: 140 }).outcome === 'clear')
check('BMI 39.9 → plan with a doctor notice',
  (() => { const g = gateFor({ weight: 122.2, height_cm: 175 }); return g.outcome === 'clear' && g.notices.some((n) => n.id === 'bmi_35') })())
check('BMI 40 → a walking plan, no running',
  (() => { const g = gateFor({ weight: 122.5, height_cm: 175 }); return g.outcome === 'clear' && g.restrictions.walkOnly === true && g.notices.some((n) => n.id === 'bmi_40') })())
check('BMI 40 with clinician agreement → the ordinary beginner path',
  (() => { const g = gateFor({ weight: 122.5, height_cm: 175, medical_clearance: true }); return g.outcome === 'clear' && !g.restrictions.walkOnly })())

// Marathon is road; only above it is "limited support".
check('marathon has no ultra notice', !gateFor({ target_distance_km: 42.2 }).notices.length)
check('50 km has the ultra notice', gateFor({ target_distance_km: 50 }).notices[0]?.id === 'ultra_limited')

// Notices are closed onto an AI intro exactly once.
const n = [{ id: 'x', text: 'Pojdi k zdravniku.' }]
check('notice appended to an AI intro', withNotices('Dober načrt.', n) === 'Dober načrt. Pojdi k zdravniku.')
check('notice not duplicated', withNotices('Dober načrt. Pojdi k zdravniku.', n) === 'Dober načrt. Pojdi k zdravniku.')

export default summary('gate')
