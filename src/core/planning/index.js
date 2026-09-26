/**
 * The planning pipeline — how a plan is made, step by step.
 *
 *   1. collectInputs      everything the runner told us, normalised
 *   2. assessFitness      where they are today
 *   2b. safetyGate        may Runko build a running plan at all? (block /
 *                         restrict / notices) — before any question is asked
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
import { classifyRunner, effectiveRunDays } from './classify.js'
import { adjustGoalPlan, goalMetric, readyForKm } from './goals.js'
import { checkFeasibility } from './feasibility.js'
import { clarifyQuestions } from './clarify.js'
import { buildPlan } from './build.js'
import { explainPlan } from './explain.js'
import { SCENARIO_RULES } from './rules.js'
import { computeLimits } from './limits.js'
import { safetyGate } from './gate.js'
import { formatPace } from '../periodization.js'
import { maxHeartRate, heartRateZones, formulaAge } from '../heart-rate.js'
import { planPopulations } from '../research-select.js'

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
 * A goal the runner's safety rules or level do not allow as asked becomes the
 * nearest one that they do (goals.js); the scenario is then classified again.
 */
function settleGoal(inputs, assessment, limits, classification, restrictions) {
  if (!inputs.goalPlan) return { inputs, classification }
  const { goalPlan, changed } = adjustGoalPlan({
    goalPlan: inputs.goalPlan, assessment, limits: limits.values, restrictions, scenario: classification.scenario,
    runDays: effectiveRunDays(inputs, classification.scenario, limits.values),
  })
  if (!changed) return { inputs, classification }
  const next = { ...inputs, goalPlan }
  return { inputs: next, classification: classifyRunner(next, assessment, limits.values) }
}

/** What the dashboard needs to measure and report a goal block; stored on every week. */
function goalRecord(inputs, assessment, scenario, plan) {
  const gp = inputs.goalPlan
  if (!gp) return null
  const meta = plan.goal_meta ?? {}
  const runs = plan.weeks.flatMap((w) => w.days.filter((d) => d.type !== 'rest' && d.type !== 'time_trial'))
  const metrics = [goalMetric(gp.main)]
  const second = gp.secondary ? goalMetric(gp.secondary) : null
  if (second && !metrics.includes(second) && (second !== 'time_trial' || meta.trial_weeks?.length)) metrics.push(second)
  const usesBase = gp.main === 'baza' || gp.secondary === 'baza'
  return {
    main: gp.main,
    secondary: gp.secondary,
    block_weeks: plan.weeks.length,
    level: gp.level,
    scenario,
    metrics,
    trial_weeks: meta.trial_weeks ?? [],
    target_continuous_min: meta.target_continuous_min ?? null,
    baseline: {
      continuous_min: assessment.continuous_min ?? 0,
      weekly_km: assessment.weekly_km ?? 0,
      longest_km: assessment.longest_km ?? 0,
    },
    ready_for_km: usesBase && plan.unit === 'distance'
      ? readyForKm(
          Math.max(0, ...plan.weeks.filter((w) => !w.is_recovery).map((w) => w.target_volume_km || 0)),
          Math.max(0, ...runs.map((d) => d.distance_km || 0)),
        )
      : null,
    adjustments: gp.adjustments.map(({ id, from, to }) => ({ id, from, to })),
  }
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
  // 2b. No plan for someone the safety gate turns away — and no questions
  // either: asking a pregnant runner about her weekly kilometres first would
  // be both pointless and unkind.
  const gate = safetyGate(inputs, assessment)
  if (gate.outcome === 'block') {
    return {
      status: 'blocked',
      questions: [],
      weeks: [],
      block: { reason: gate.reason, message: gate.message, rules: gate.rules },
      planning: { version: PIPELINE_VERSION, inputs: inputsSummary(inputs), assessment, gate },
    }
  }

  // A walking-only programme has no distance and no date to be ready for.
  if (gate.restrictions.walkOnly) inputs = withGoal(inputs, { distanceKm: null, eventDate: null })

  // The caps and gaps every research rule sets for this runner, resolved by
  // precedence (limits.js), with the rule behind each value. Classification,
  // feasibility and the builder all read the same values.
  let limits = computeLimits(inputs, assessment)
  let classification = classifyRunner(inputs, assessment, limits.values)
  ;({ inputs, classification } = settleGoal(inputs, assessment, limits, classification, gate.restrictions))

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
    limits = computeLimits(inputs, assessment)
    classification = classifyRunner(inputs, assessment, limits.values)
    ;({ inputs, classification } = settleGoal(inputs, assessment, limits, classification, gate.restrictions))
  }

  // 4
  const feasibility = checkFeasibility(inputs, assessment, classification, limits.values)

  // An unsafe goal is never built. If the adopted (safer) goal changes what
  // kind of plan this is — a 10 km instead of a marathon — the scenario is
  // re-derived for it, and both are recorded.
  let buildClassification = classification
  if (feasibility.verdict === 'unsafe') {
    const adopted = feasibility.adopted_goal
    const adoptedInputs = withGoal(inputs, {
      distanceKm: adopted.distance_km, eventDate: adopted.event_date, targetTimeMin: null,
    })
    const again = classifyRunner(adoptedInputs, assessment, limits.values)
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

  // The plan is built for the ADOPTED goal, whose limits may differ (a
  // marathon's 3-hour long-run cap is not a 10 km's).
  const adoptedGoal = feasibility.adopted_goal
  const buildLimits = adoptedGoal.distance_km === inputs.goal.distanceKm
    ? limits
    : computeLimits(withGoal(inputs, { distanceKm: adoptedGoal.distance_km, eventDate: adoptedGoal.event_date }), assessment)

  // 6
  const plan = buildPlan(scenario, inputs, assessment, feasibility, gate.restrictions, buildLimits.values)
  // A week that cannot hold the time trials inside its limits: ask again
  // without them (the goal then becomes kondicija, and says so).
  if (plan.trial_failed) {
    return runPlanningPipeline({
      profile: { ...profile, goal_plan: { ...profile.goal_plan, retry: 'no_trials' } }, runs, memories, answers, today,
    })
  }
  const goal = goalRecord(inputs, assessment, scenario, plan)

  // 7
  const explain = explainPlan({
    classification: buildClassification, feasibility, plan, notices: gate.notices, goalPlan: inputs.goalPlan,
  })

  const planning = {
    version: PIPELINE_VERSION,
    inputs: inputsSummary(inputs),
    assessment,
    classification: buildClassification,
    feasibility,
    clarify: { answers: { ...answers }, assumptions },
    rules: SCENARIO_RULES[scenario],
    gate: { restrictions: gate.restrictions, notices: gate.notices, rules: gate.rules },
    limits: { values: buildLimits.values, rules: Object.fromEntries(Object.entries(buildLimits.sources).map(([k, v]) => [k, v.rule])) },
    explain,
    ...(goal ? { goal_plan: goal } : {}),
  }

  const adopted = feasibility.adopted_goal
  const weeks = plan.weeks.map((w) => ({
    ...w,
    scenario,
    feasibility_verdict: feasibility.verdict,
    ...(goal ? { goal_plan: goal } : {}),
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
    notices: gate.notices,
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
      goal_plan: goal,
      goal_assessment: adopted.distance_km === feasibility.original_goal.distance_km ? feasibility.time_goal : null,
      start_volume_km: assessment.weekly_km,
      peak_volume_km: Math.max(0, ...weeks.map((w) => w.target_volume_km || 0)),
      hr_max: maxHeartRate(formulaAge(inputs.age, inputs.health?.sex)),
      hr_zones: heartRateZones(formulaAge(inputs.age, inputs.health?.sex)),
      constraints: { ...inputs.constraints, noBackToBack: plan.no_back_to_back },
      // Which research population notes the plan call may load: age and
      // schedule only, never health data (research-select.js).
      populations: planPopulations({
        age: inputs.age, daysPerWeek: inputs.constraints?.maxRunDays ?? inputs.daysPerWeek ?? null,
      }),
      weeks,
    },
  }
}

export { collectInputs, assessFitness, classifyRunner, checkFeasibility, clarifyQuestions, buildPlan, explainPlan }
