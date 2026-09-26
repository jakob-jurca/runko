/**
 * The planning pipeline — how a plan is made, step by step.
 *
 *   1. collectInputs      everything the runner told us, normalised
 *   2. assessFitness      where they are today
 *   3. classifyRunner     which of the seven scenarios they are
 *   4. checkFeasibility   feasible / stretch / unsafe, and the adopted goal
 *   5. clarifyQuestions   at most 3 questions — STOP here if any
 *   6. buildPlan          the scenario's own builder
 *   7. explainPlan        scenario, verdict, priorities
 *
 * Pure: no network, no AI, no storage. core/plan.js wraps it with the data
 * it needs, the single AI call for descriptions, and persistence. Steps 2-4
 * (and the explanation) are stored on every week's plan_json under
 * `planning`, so why a plan looks the way it does is always on record.
 */
import { collectInputs, inputsSummary, withGoal } from './collect.js'
import { assessFitness } from './assess.js'
import { classifyRunner } from './classify.js'
import { checkFeasibility } from './feasibility.js'
import { clarifyQuestions } from './clarify.js'
import { buildPlan } from './build.js'
import { explainPlan } from './explain.js'
import { SCENARIO_RULES } from './rules.js'
import { computeLimits } from './limits.js'
import { formatPace } from '../periodization.js'
import { maxHeartRate, heartRateZones } from '../heart-rate.js'

export const PIPELINE_VERSION = 1

/**
 * Conservative stand-ins for questions the budget no longer allows asking.
 * Each is recorded as an assumption on the plan.
 */
const DEFAULT_ANSWERS = {
  event_date: () => 'no_date',
  current_volume: () => '5',
  returning: () => 'break',
  longest_run: (inputs) => String(Math.max(3, Math.round((inputs.statedWeeklyKm ?? 10) * 0.35))),
  intent: () => 'maintain',
}

/**
 * @param {object} opts
 * @param {object} opts.profile
 * @param {Array}  [opts.runs]
 * @param {Array}  [opts.memories]
 * @param {object} [opts.answers] - clarify answers, {questionId: value}
 * @param {Date}   [opts.today]
 * @returns {object} either {status:'needs_answers', questions, ...} or the plan
 */
export function runPlanningPipeline({ profile = {}, runs = [], memories = [], answers = {}, today = new Date() } = {}) {
  // 1-3
  let inputs = collectInputs({ profile, runs, memories, answers, today })
  let assessment = assessFitness(inputs)
  let classification = classifyRunner(inputs, assessment)

  // 5 (before building anything): missing or contradictory essentials.
  const { questions, assumptions, unasked } = clarifyQuestions(inputs, assessment, classification)
  if (questions.length) {
    return {
      status: 'needs_answers',
      questions,
      assumptions,
      scenario: classification.scenario,
      planning: { inputs: inputsSummary(inputs), assessment, classification },
    }
  }
  // Questions we were not allowed to ask: fill with conservative defaults.
  if (unasked.length) {
    const filled = { ...answers }
    for (const id of unasked) filled[id] = DEFAULT_ANSWERS[id](inputs)
    inputs = collectInputs({ profile, runs, memories, answers: filled, today })
    assessment = assessFitness(inputs)
    classification = classifyRunner(inputs, assessment)
  }

  // 4
  const feasibility = checkFeasibility(inputs, assessment, classification)

  // An unsafe goal is never built. If the adopted (safer) goal changes what
  // kind of plan this is — a 10 km instead of a marathon — the scenario is
  // re-derived for it, and both are recorded.
  let buildClassification = classification
  if (feasibility.verdict === 'unsafe') {
    const adopted = feasibility.adopted_goal
    const adoptedInputs = withGoal(inputs, {
      distanceKm: adopted.distance_km, eventDate: adopted.event_date, targetTimeMin: null,
    })
    const again = classifyRunner(adoptedInputs, assessment)
    if (again.scenario !== classification.scenario) {
      buildClassification = {
        ...again,
        reasons: [
          ...classification.reasons,
          `Goal unsafe; plan built for the safer goal, which makes it: ${again.scenario}.`,
          ...again.reasons,
        ],
        original_scenario: classification.scenario,
      }
    }
  }
  const scenario = buildClassification.scenario

  // The caps and gaps every research rule sets for this runner, resolved by
  // precedence (limits.js), with the rule behind each value.
  const limits = computeLimits(inputs, assessment)

  // 6
  const plan = buildPlan(scenario, inputs, assessment, feasibility)

  // 7
  const explain = explainPlan({ classification: buildClassification, feasibility, plan })

  const planning = {
    version: PIPELINE_VERSION,
    inputs: inputsSummary(inputs),
    assessment,
    classification: buildClassification,
    feasibility,
    clarify: { answers: { ...answers }, assumptions },
    rules: SCENARIO_RULES[scenario],
    limits: { values: limits.values, rules: Object.fromEntries(Object.entries(limits.sources).map(([k, v]) => [k, v.rule])) },
    explain,
  }

  const adopted = feasibility.adopted_goal
  const weeks = plan.weeks.map((w) => ({
    ...w,
    scenario,
    feasibility_verdict: feasibility.verdict,
    planning,
  }))

  return {
    status: 'ready',
    questions: [],
    scenario,
    verdict: feasibility.verdict,
    unit: plan.unit,
    startDate: inputs.startDate,
    goal: adopted,
    originalGoal: feasibility.original_goal,
    proposal: feasibility.verdict === 'unsafe' ? { alternatives: feasibility.alternatives, adopted } : null,
    fallbackTarget: feasibility.fallback_target,
    explain,
    planning,
    weeks,
    // What the AI description call and the plan page read (the old skeleton shape).
    skeleton: {
      scenario,
      verdict: feasibility.verdict,
      unit: plan.unit,
      explain,
      vdot: assessment.vdot,
      vdot_source: assessment.vdot_source,
      paces: Object.fromEntries(
        Object.entries(plan.paces).map(([k, v]) => [k, { min_per_km: Math.round(v * 100) / 100, label: formatPace(v) }])
      ),
      total_weeks: weeks.length,
      target_distance_km: adopted.distance_km,
      event_date: adopted.event_date,
      race_day: plan.race_day,
      goal_assessment: adopted.distance_km === feasibility.original_goal.distance_km ? feasibility.time_goal : null,
      start_volume_km: assessment.weekly_km,
      peak_volume_km: Math.max(0, ...weeks.map((w) => w.target_volume_km || 0)),
      hr_max: maxHeartRate(inputs.age),
      hr_zones: heartRateZones(inputs.age),
      constraints: { ...inputs.constraints, noBackToBack: plan.no_back_to_back },
      weeks,
    },
  }
}

export { collectInputs, assessFitness, classifyRunner, checkFeasibility, clarifyQuestions, buildPlan, explainPlan }
