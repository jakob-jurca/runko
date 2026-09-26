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

function alternativeText(a) {
  if (a.kind === 'no_event') return P.alternative.no_event
  if (a.kind === 'more_days') return P.alternative.more_days(goalText(a), a.run_days)
  return goalText(a)
}

/**
 * @returns {object} explanation, stored with the plan (plan_json.planning.explain)
 */
export function explainPlan({ classification, feasibility, plan, notices = [] }) {
  const scenario = classification.scenario
  const verdict = feasibility.verdict
  const priorities = P.priorities[scenario] || []
  const adopted = feasibility.adopted_goal
  const original = feasibility.original_goal
  const others = feasibility.alternatives.filter((a) => a.id !== adopted.alternative_id)

  const parts = [P.intro.opening(P.scenarios[scenario], plan.weeks.length)]
  if (!original.distance_km) parts.push(P.intro.noGoal)
  else if (verdict === 'feasible') parts.push(P.intro.feasible)
  else if (verdict === 'stretch') parts.push(P.intro.stretch(fallbackText(feasibility.fallback_target)))
  else {
    parts.push(P.intro.unsafe(goalText({ ...original, walk_breaks: false }), goalText(adopted)))
    if (others.length) parts.push(P.intro.otherOption(alternativeText(others[0])))
  }
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
