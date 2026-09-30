/**
 * Step 7 — EXPLAIN.
 *
 * A short, structured statement of why the plan looks the way it does: the
 * scenario, the feasibility verdict, and what the plan prioritises. The AI
 * turns this into the coach's intro (one call, together with the workout
 * descriptions); the built-in Slovenian intro below is used when it does not,
 * so a plan is never missing its explanation.
 */
import { t } from '../strings.js'
import { adjustmentText } from './goals.js'

const P = t.planning

function goalText(g) {
  if (!g || !g.distance_km) return P.alternative.no_event
  return P.goal(g.distance_km, g.event_date, g.walk_breaks)
}

function fallbackText(f) {
  if (!f) return null
  if (f.kind === 'time') return P.fallback.time(P.time(f.time_min))
  if (f.kind === 'walk_breaks') return P.fallback.walk_breaks(f.distance_km)
  return P.fallback.finish(f.distance_km)
}

/** Why the goal is unsafe, in the runner's language: one sentence per risk. */
function riskTexts(feasibility) {
  return (feasibility.risks || []).map((r) => {
    if (r.kind === 'time') return P.risk.time(r.weeks_available, r.weeks_needed, r.long_run_km, r.weekly_km)
    if (r.kind === 'days') return P.risk.days(r.run_days, r.run_days_min)
    return P.risk.ceiling(r.max_km)
  })
}

/**
 * What a plan built against advice does and does not reach, read from the
 * weeks that were actually built: the longest training run against the race
 * distance. "Short" is the engine's own bar for finishing safely, the minimum
 * readiness long run (feasibility.requirements).
 *
 * @returns {object} stored as plan_json.planning.against_advice
 */
export function againstAdviceRecord(feasibility, plan) {
  const raceKm = feasibility.original_goal.distance_km
  const runs = plan.weeks.flatMap((w) => w.days.filter((d) => d.type !== 'rest' && d.type !== 'race'))
  const longestKm = Math.max(0, ...runs.map((d) => Number(d.distance_km) || 0))
  const needKm = feasibility.requirements?.long_run_min_km ?? null
  return {
    confirmed: true,
    race_km: raceKm,
    event_date: feasibility.original_goal.event_date,
    has_race: plan.weeks.some((w) => w.days.some((d) => d.type === 'race')),
    longest_run_km: longestKm,
    long_run_needed_km: needKm,
    long_run_share: raceKm ? Math.round((longestKm / raceKm) * 100) / 100 : null,
    long_run_short: needKm !== null && longestKm < needKm - 0.5,
    risks: feasibility.risks || [],
  }
}

/** The against-advice sentences as one notice: it closes every intro, the AI's too (withNotices). */
function againstAdviceNotices(record, original) {
  if (!record) return []
  const parts = [P.intro.againstAdvice(goalText({ ...original, walk_breaks: false }))]
  if (record.long_run_short) {
    parts.push(P.intro.longRunShort(record.longest_run_km, record.race_km, Math.round(record.long_run_share * 100)))
  }
  if (record.has_race) parts.push(P.intro.raceDayRunWalk)
  return [{ id: 'against_advice', text: parts.join(' '), rule: 'runner override' }]
}

function alternativeText(a) {
  if (a.kind === 'no_event') return P.alternative.no_event
  if (a.kind === 'more_days') return P.alternative.more_days(goalText(a), a.run_days)
  return goalText(a)
}

/**
 * @returns {object} explanation, stored with the plan (plan_json.planning.explain)
 */
function explainGoalPlan({ goalPlan, classification, feasibility, plan, notices }) {
  const G = t.goals
  const main = G.items[goalPlan.main]
  const priorities = main.priorities
  const adjustments = goalPlan.adjustments.map(adjustmentText)
  const parts = [G.opening(main.label, plan.weeks.length), main.intro]
  if (goalPlan.secondary) parts.push(G.secondary(G.items[goalPlan.secondary].label))
  parts.push(...adjustments)
  if (plan.walk_only) parts.push(P.intro.walkOnly)
  if (plan.walk_base_weeks) parts.push(P.intro.walkBase(plan.walk_base_weeks))
  parts.push(P.intro.priorities(priorities))
  for (const n of notices) parts.push(n.text)
  return {
    scenario: classification.scenario,
    scenario_label: main.label,
    verdict: feasibility.verdict,
    verdict_label: null,
    priorities,
    original_goal: feasibility.original_goal,
    adopted_goal: feasibility.adopted_goal,
    original_goal_text: null,
    adopted_goal_text: main.desc,
    fallback_text: null,
    other_options: [],
    notices: notices.map((n) => ({ id: n.id, text: n.text })),
    reasons: [...classification.reasons, ...feasibility.reasons],
    goal_plan: { main: goalPlan.main, secondary: goalPlan.secondary, adjustments: adjustments },
    intro: parts.join(' '),
  }
}

export function explainPlan({ classification, feasibility, plan, notices = [], goalPlan = null, againstAdvice = null }) {
  if (goalPlan) return explainGoalPlan({ goalPlan, classification, feasibility, plan, notices })
  const scenario = classification.scenario
  const verdict = feasibility.verdict
  // Against advice every plan has the same priorities: finish safely, no speed work.
  const priorities = P.priorities[againstAdvice ? 'beginner_with_deadline' : scenario] || []
  const adopted = feasibility.adopted_goal
  const original = feasibility.original_goal
  const others = feasibility.alternatives.filter((a) => a.id !== adopted.alternative_id)
  notices = [...notices, ...againstAdviceNotices(againstAdvice, original)]

  const parts = [P.intro.opening(P.scenarios[scenario], plan.weeks.length)]
  if (!original.distance_km) parts.push(P.intro.noGoal)
  else if (verdict === 'feasible') parts.push(P.intro.feasible)
  else if (verdict === 'stretch') parts.push(P.intro.stretch(fallbackText(feasibility.fallback_target)))
  else if (!againstAdvice) {
    parts.push(P.intro.unsafe(goalText({ ...original, walk_breaks: false }), goalText(adopted)))
    if (others.length) parts.push(P.intro.otherOption(alternativeText(others[0])))
  }
  if (plan.walk_only) parts.push(P.intro.walkOnly)
  if (plan.walk_base_weeks) parts.push(P.intro.walkBase(plan.walk_base_weeks))
  if (plan.distance_from_week) parts.push(P.intro.timeThenDistance(plan.distance_from_week))
  if (plan.foundation_weeks) {
    parts.push(P.intro.foundation(plan.foundation_weeks, plan.weeks.length - plan.foundation_weeks))
  }
  parts.push(P.intro.priorities(priorities))
  // Safety notices (see a doctor first, limited support) close the intro.
  for (const n of notices) parts.push(n.text)

  return {
    scenario,
    scenario_label: P.scenarios[scenario],
    verdict,
    verdict_label: P.verdicts[verdict],
    priorities,
    original_goal: original,
    adopted_goal: adopted,
    original_goal_text: original.distance_km ? goalText({ ...original, walk_breaks: false }) : null,
    adopted_goal_text: goalText(adopted),
    fallback_text: fallbackText(feasibility.fallback_target),
    other_options: others.map(alternativeText),
    // Why an unsafe goal is unsafe, and whether the runner may build it anyway.
    risk_texts: verdict === 'unsafe' ? riskTexts(feasibility) : [],
    override_allowed: Boolean(feasibility.override_allowed),
    against_advice: Boolean(againstAdvice),
    notices: notices.map((n) => ({ id: n.id, text: n.text })),
    reasons: [...classification.reasons, ...feasibility.reasons],
    intro: parts.join(' '),
  }
}

/**
 * The safety gate's notices ("see a doctor first", "limited support") closed
 * onto the intro in code. They are never put in the AI prompt — some reveal
 * health data (a known condition, a high BMI) that must not go to the AI
 * provider — so an AI-written intro would otherwise lack them. The built-in
 * intro already contains them; nothing is added twice.
 */
export function withNotices(intro, notices = []) {
  let text = String(intro || '').trim()
  for (const n of notices) if (!text.includes(n.text)) text = `${text} ${n.text}`.trim()
  return text
}
