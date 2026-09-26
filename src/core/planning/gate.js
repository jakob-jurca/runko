/**
 * Step 2b — SAFETY GATE.
 *
 * Runs after the assessment and before anything is classified or built. It
 * decides whether Runko may build a running plan for this person at all:
 *
 *   block     no plan; a kind explanation and whom to see instead
 *   restrict  a plan, with limits (e.g. no hard sessions until a doctor
 *             has cleared a known condition)
 *   notices   a plan, plus things the runner should know (see a doctor
 *             first, limited support for this goal)
 *
 * Rules come from runko-research (b01 rules 1-8, p03, p05, p08) and the
 * product decisions: no plan in pregnancy, Runko starts at 15.
 *
 * Missing answers never unlock anything: onboarding asks every question the
 * gate blocks on, and optional health-profile data that is missing simply
 * adds no restriction it could only add on a "yes".
 */
import { t } from '../strings.js'

/** Slovenian digital-consent age; younger users get no plan (product decision). */
export const MIN_AGE = 15

const G = t.planning.gate

const block = (reason, message, rules) => ({ outcome: 'block', reason, message, rules })

/**
 * @param {object} inputs - from collectInputs()
 * @param {object} assessment - from assessFitness()
 * @returns {{outcome: 'clear'|'block', reason?: string, message?: string, rules: string[],
 *   restrictions: object, notices: Array<{id: string, text: string, rule: string}>}}
 */
export function safetyGate(inputs, assessment) {
  const { safety, health, goal } = inputs
  const age = inputs.age

  // --- no plan at all -------------------------------------------------------
  if (age !== null && age < MIN_AGE) {
    return withDefaults(block('under_15', G.under15, ['decision: minimum age 15', 'p08 r1']))
  }
  if (safety.pregnancyStatus === 'pregnant') {
    return withDefaults(block('pregnant', G.pregnant, ['decision: no plan in pregnancy', 'b01 r8']))
  }
  if (safety.pregnancyStatus === 'postpartum') {
    const weeks = safety.weeksPostpartum
    // Unknown weeks count as the earliest case: nothing is unlocked on a guess.
    if (weeks === null || weeks < 6) {
      return withDefaults(block('postpartum_early', G.postpartumEarly, ['p03 r18']))
    }
    if (weeks < 12 && health.postpartumCleared !== true) {
      return withDefaults(block('postpartum_not_cleared', G.postpartumNotCleared(12 - weeks), ['p03 r19']))
    }
    // r21: after a caesarean the default start is week 16 (12 at the earliest,
    // with the scar healed and a provider's clearance).
    if (health.caesarean === true && weeks < 16 && health.postpartumCleared !== true) {
      return withDefaults(block('caesarean_wait', G.caesareanWait(16 - weeks), ['p03 r21']))
    }
    // r22: a grade 3-4 tear needs a pelvic-health physiotherapist first.
    if (health.severeTear === true && health.postpartumCleared !== true) {
      return withDefaults(block('postpartum_tear', G.severeTear, ['p03 r22']))
    }
    // r23: symptoms with running stop it until a physiotherapist has seen her.
    if (health.pelvicFloorSymptoms === true) {
      return withDefaults(block('pelvic_floor', G.pelvicFloor, ['p03 r23']))
    }
  }
  if (safety.painAtRest === true) {
    return withDefaults(block('pain_at_rest', G.painAtRest, ['b01 r7', 'p06 r1']))
  }
  if (health.cardiacSymptoms === true && health.medicalClearance !== true) {
    return withDefaults(block('cardiac_symptoms', G.cardiacSymptoms, ['b01 r2', 'p04 r1']))
  }
  // Known disease and not exercising now: clearance first (b01 r3).
  if (health.knownCondition === true && health.medicalClearance !== true && assessment.band === 'none') {
    return withDefaults(block('known_condition_inactive', G.knownConditionInactive, ['b01 r3', 'p01 r2']))
  }

  // --- a plan, with restrictions and notices --------------------------------
  const result = withDefaults({ outcome: 'clear', rules: [] })

  // Known disease, already exercising, no clearance: nothing above steady
  // effort until a doctor has said so (b01 r4).
  if (health.knownCondition === true && health.medicalClearance !== true) {
    result.restrictions.noHardSessions = true
    result.rules.push('b01 r4')
    result.notices.push({ id: 'known_condition', text: G.knownConditionActive, rule: 'b01 r4' })
  }
  // p05 r4: no running prescription at BMI 40+ until a clinician agrees; a
  // walking programme is built instead.
  if (health.bmi !== null && health.bmi >= 40 && health.medicalClearance !== true) {
    result.restrictions.walkOnly = true
    result.rules.push('p05 r4')
    result.notices.push({ id: 'bmi_40', text: G.bmi40, rule: 'p05 r4' })
  } else if (health.bmi !== null && health.bmi >= 35) {
    result.notices.push({ id: 'bmi_35', text: G.bmi35, rule: 'p05 r5' })
  }
  // p03 r17, r21: pelvic-floor training is prompted for a year after birth; the
  // delivery type is optional, so an unknown one gets the conservative advice.
  if (safety.pregnancyStatus === 'postpartum') {
    result.notices.push({ id: 'pelvic_floor_training', text: G.pelvicFloorTraining, rule: 'p03 r17' })
    if (health.caesarean === null && (safety.weeksPostpartum ?? 0) < 16) {
      result.notices.push({ id: 'caesarean_unknown', text: G.caesareanUnknown, rule: 'p03 r21' })
    }
  }
  // p07 r4, r22: one or two runs a week still count, and cross-training fills the gaps.
  const offered = inputs.constraints?.maxRunDays ?? inputs.daysPerWeek ?? null
  if (offered !== null && offered <= 2) {
    result.notices.push({ id: 'few_days', text: G.fewDays, rule: 'p07 r4' })
  }
  if ((goal.distanceKm ?? 0) > 42.2) {
    result.notices.push({ id: 'ultra_limited', text: G.ultraLimited, rule: 'decision: road races only' })
  }
  return result
}

function withDefaults(r) {
  return { restrictions: {}, notices: [], ...r }
}
