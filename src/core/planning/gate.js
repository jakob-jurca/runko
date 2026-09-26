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
  if (health.bmi !== null && health.bmi >= 40) {
    return withDefaults(block('bmi_40', G.bmi40, ['p05 r4']))
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
  if (health.bmi !== null && health.bmi >= 35) {
    result.notices.push({ id: 'bmi_35', text: G.bmi35, rule: 'p05 r5' })
  }
  if ((goal.distanceKm ?? 0) > 42.2) {
    result.notices.push({ id: 'ultra_limited', text: G.ultraLimited, rule: 'decision: road races only' })
  }
  return result
}

function withDefaults(r) {
  return { restrictions: {}, notices: [], ...r }
}
