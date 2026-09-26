/**
 * research-select.js — which research summaries reach a prompt.
 *
 * knowledge/research/ holds 35 short runtime summaries of the runko-research
 * files (at most 350 tokens each). Each declares in its frontmatter
 *
 *   role          scenario | population | reference
 *   scenarios     (role: scenario) the runner scenarios it is THE summary for
 *   populations   who it is about: teen, masters, time_crunched, overweight,
 *                 postpartum, returning_injury, female
 *   situations    what a runner may bring up in chat (see situations.js)
 *
 * Plan generation loads the scenario summary plus at most two population
 * notes — and still makes exactly ONE AI call. Chat loads the situational
 * ones through detectSituations.
 *
 * Health data is a GDPR special category and never reaches the AI provider
 * from the plan call: BMI, pregnancy and injury populations exist here for
 * chat (where the runner has said it themselves) but the plan call is only
 * offered PLAN_POPULATIONS (age and schedule).
 *
 * Pure functions over parsed documents; the bundler-dependent loading lives
 * in knowledge.js.
 */
import { parseFrontmatter, contentOf, estimateTokens } from './frontmatter.js'

/** Hard limits: one summary is at most this many tokens. */
export const RESEARCH_SUMMARY_MAX_TOKENS = 350

export const RESEARCH_BUDGETS = {
  plan: 900, // the scenario summary + up to two population notes
  chat: 700, // situational summaries, two at most
}
export const MAX_POPULATION_NOTES = 2
export const MAX_CHAT_NOTES = 2

/** Most safety-relevant first: this is the order population notes win the two slots. */
export const POPULATION_ORDER = [
  'teen', 'postpartum', 'overweight', 'masters', 'returning_injury', 'time_crunched', 'female',
]

/** The populations the plan call may be told about (no health data). */
export const PLAN_POPULATIONS = ['teen', 'masters', 'time_crunched']

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 }

/** Parse one summary. */
export function parseResearchDoc(raw, name = '') {
  const { meta, body } = parseFrontmatter(raw)
  const content = contentOf(body)
  return {
    name,
    topic: meta.topic || name.replace(/\.md$/, ''),
    source: meta.source || null,
    role: meta.role || 'reference',
    priority: PRIORITY_RANK[meta.priority] !== undefined ? meta.priority : 'medium',
    scenarios: Array.isArray(meta.scenarios) ? meta.scenarios : [],
    populations: Array.isArray(meta.populations) ? meta.populations : [],
    situations: Array.isArray(meta.situations) ? meta.situations : [],
    content,
    tokens: estimateTokens(content),
  }
}

/**
 * The populations a runner belongs to, most safety-relevant first.
 * @param {object} p
 * @param {number|null} [p.age]
 * @param {string|null} [p.sex]
 * @param {number|null} [p.bmi]
 * @param {string|null} [p.pregnancyStatus]
 * @param {boolean} [p.injury]
 * @param {number|null} [p.daysPerWeek] - run days a week the runner offered
 */
export function detectPopulations({ age = null, sex = null, bmi = null, pregnancyStatus = null, injury = false, daysPerWeek = null } = {}) {
  const found = new Set()
  if (age !== null && age < 18) found.add('teen')
  if (pregnancyStatus === 'postpartum' || pregnancyStatus === 'pregnant') found.add('postpartum')
  if (bmi !== null && bmi >= 30) found.add('overweight')
  if (age !== null && age >= 40) found.add('masters')
  if (injury) found.add('returning_injury')
  if (daysPerWeek !== null && daysPerWeek <= 3) found.add('time_crunched')
  if (sex === 'female') found.add('female')
  return POPULATION_ORDER.filter((p) => found.has(p))
}

/** The populations the plan call may carry: age and schedule only. */
export function planPopulations(profile) {
  return detectPopulations(profile).filter((p) => PLAN_POPULATIONS.includes(p))
}

/**
 * The research summaries for the plan call: the ONE scenario summary, then up
 * to two population notes (never the scenario's own file again), inside the
 * budget. A note that does not fit is skipped, never truncated.
 *
 * @param {Array} docs - parsed summaries
 * @param {{scenario: string, populations?: string[]}} opts
 * @returns {{docs: Array, tokens: number}}
 */
export function selectPlanResearch(docs, { scenario, populations = [] } = {}, { budgetTokens = RESEARCH_BUDGETS.plan } = {}) {
  const owners = docs.filter((d) => d.role === 'scenario' && d.scenarios.includes(scenario))
  if (owners.length > 1) {
    throw new Error(`Scenario "${scenario}" has ${owners.length} research summaries: ${owners.map((d) => d.name).join(', ')}`)
  }
  const picked = []
  let tokens = 0
  const add = (doc) => {
    if (!doc || picked.includes(doc) || tokens + doc.tokens > budgetTokens) return false
    picked.push(doc)
    tokens += doc.tokens
    return true
  }
  add(owners[0])
  let notes = 0
  for (const population of POPULATION_ORDER.filter((p) => populations.includes(p))) {
    if (notes >= MAX_POPULATION_NOTES) break
    const doc = docs
      .filter((d) => d.populations.includes(population))
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])[0]
    if (add(doc)) notes++
  }
  return { docs: picked, tokens }
}

/**
 * The research summaries for a chat message: those whose `situations` match
 * what the runner wrote, best match first, at most two, inside the budget.
 *
 * @param {Array} docs - parsed summaries
 * @param {string[]} active - situations found by detectSituations
 */
export function selectChatResearch(docs, active, { budgetTokens = RESEARCH_BUDGETS.chat, max = MAX_CHAT_NOTES } = {}) {
  const set = new Set(active)
  const scored = docs
    .map((d) => ({ d, hits: d.situations.filter((s) => set.has(s)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || PRIORITY_RANK[a.d.priority] - PRIORITY_RANK[b.d.priority] || a.d.topic.localeCompare(b.d.topic))
  const picked = []
  let tokens = 0
  for (const { d } of scored) {
    if (picked.length >= max) break
    if (tokens + d.tokens > budgetTokens) continue
    picked.push(d)
    tokens += d.tokens
  }
  return { docs: picked, tokens }
}
