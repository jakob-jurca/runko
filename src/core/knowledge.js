/**
 * knowledge.js — loads the Markdown coaching knowledge base into prompts.
 *
 * Everything in /knowledge is bundled at BUILD time (Vite's import.meta.glob
 * with ?raw), so there is no runtime fetch and no loading state. The trade-off
 * is that a newly added file needs a dev-server restart to appear.
 *
 * The documents all start empty on purpose — frontmatter plus an HTML comment
 * describing what belongs in them. An empty document is skipped entirely, so
 * the knowledge base costs nothing until someone actually writes it.
 *
 * See /knowledge/README.md for the file format and the situation vocabulary.
 */
import { IS_DEV } from './env'
import { scenarioSection, documentForScenario } from './knowledge-scenarios.js'
import { parseFrontmatter, contentOf, estimateTokens } from './frontmatter.js'
import { SITUATIONS, detectSituations } from './situations.js'
import {
  parseResearchDoc, selectPlanResearch, selectChatResearch, RESEARCH_BUDGETS,
} from './research-select.js'

export { estimateTokens }

// Situations (the vocabulary and the keyword matching) live in situations.js so
// they can be tested without the bundler.
export { SITUATIONS, detectSituations }

// ---------------------------------------------------------------------------
// Loading + parsing
// ---------------------------------------------------------------------------

// Bundled at build time. `?raw` gives us the file as a string.
const RAW_FILES = import.meta.glob('../../knowledge/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 }

/** Parse every bundled file once, at module load. */
const DOCUMENTS = Object.entries(RAW_FILES)
  .map(([path, raw]) => {
    const name = path.split('/').pop()
    const { meta, body } = parseFrontmatter(raw)
    const content = contentOf(body)
    return {
      name,
      path,
      topic: meta.topic || name.replace(/\.md$/, ''),
      loadWhen: Array.isArray(meta.load_when) ? meta.load_when : [],
      // Runner scenarios this file owns (core/planning). See buildScenarioKnowledgeBlock.
      scenarios: Array.isArray(meta.scenarios) ? meta.scenarios : [],
      priority: PRIORITY_RANK[meta.priority] !== undefined ? meta.priority : 'medium',
      content,
      isEmpty: content.length === 0,
      tokens: estimateTokens(content),
    }
  })
  // README.md documents the format for humans; it is not knowledge.
  .filter((d) => d.name.toLowerCase() !== 'readme.md')
  .sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.topic.localeCompare(b.topic)
  )

// The 35 runtime summaries of the research files (knowledge/research/). They
// are not part of the ordinary documents above: plan generation and chat pick
// from them with the rules in research-select.js.
const RESEARCH_FILES = import.meta.glob('../../knowledge/research/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const RESEARCH = Object.entries(RESEARCH_FILES).map(([path, raw]) => parseResearchDoc(raw, path.split('/').pop()))

/** Every parsed document, including the empty ones. For diagnostics/tests. */
export function allDocuments() {
  return DOCUMENTS.map((d) => ({ ...d }))
}

/** What the knowledge base currently holds — used by the dev log below. */
export function knowledgeStats() {
  const written = DOCUMENTS.filter((d) => !d.isEmpty)
  return {
    total: DOCUMENTS.length,
    written: written.length,
    empty: DOCUMENTS.length - written.length,
    tokens: written.reduce((sum, d) => sum + d.tokens, 0),
    emptyTopics: DOCUMENTS.filter((d) => d.isEmpty).map((d) => d.topic),
  }
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * Token budgets per call site. A plan generation prompt can carry far more
 * knowledge than a one-line chat reply, so they are not the same number.
 */
export const KNOWLEDGE_BUDGETS = {
  chat: 1200,
  plan_generation: 700, // shares one request with a large structured prompt
  onboarding: 800,
  default: 1000,
}

/**
 * Pick the documents to inject.
 *
 * @param {object} opts
 * @param {string[]} [opts.situations] - situations the caller knows for sure
 * @param {string} [opts.text] - runner's message, scanned for more situations
 * @param {number} [opts.budgetTokens]
 * @returns {{docs: Array, tokens: number, skipped: Array, situations: string[]}}
 */
export function selectKnowledge({ situations = [], text = '', budgetTokens } = {}) {
  const budget = budgetTokens ?? KNOWLEDGE_BUDGETS.default
  const active = new Set(['always', ...situations, ...detectSituations(text)])

  const candidates = DOCUMENTS.filter(
    (d) => !d.isEmpty && d.loadWhen.some((s) => active.has(s))
  )

  // Already sorted high → medium → low. Fill greedily; a document that does
  // not fit is skipped rather than truncated, so the model never reads half
  // a sentence about an injury.
  const docs = []
  const skipped = []
  let tokens = 0
  for (const doc of candidates) {
    if (tokens + doc.tokens <= budget) {
      docs.push(doc)
      tokens += doc.tokens
    } else {
      skipped.push(doc)
    }
  }

  return { docs, tokens, skipped, situations: [...active] }
}

/**
 * The knowledge block for plan generation: ONLY the `## Scenario: <id>`
 * section of the one file that owns the runner's scenario. Everything else
 * in the knowledge base stays out of the plan call.
 *
 * @param {string} scenario
 * @param {object} [opts]
 * @param {number} [opts.budgetTokens]
 * @returns {string} '' when the scenario has no guidance or it is over budget
 */
export function buildScenarioKnowledgeBlock(scenario, { budgetTokens = KNOWLEDGE_BUDGETS.plan_generation } = {}) {
  const doc = documentForScenario(DOCUMENTS, scenario)
  const section = doc ? scenarioSection(doc.content, scenario) : null
  if (!section) {
    if (IS_DEV) console.warn(`[knowledge] no scenario guidance for "${scenario}"`)
    return ''
  }
  const tokens = estimateTokens(section)
  if (tokens > budgetTokens) {
    // Never truncate guidance mid-rule; the tests keep every section in budget.
    if (IS_DEV) console.warn(`[knowledge] ${doc.name} "${scenario}" section is ~${tokens} tokens, over the ${budgetTokens} budget — skipped`)
    return ''
  }
  if (IS_DEV) console.log(`[knowledge] plan generation: ${doc.name} → Scenario: ${scenario} (~${tokens} tokens)`)
  return [
    '# COACHING GUIDANCE FOR THIS KIND OF RUNNER',
    'Written by the Runko team. Follow it over your own defaults; do not quote it verbatim.',
    '',
    section,
  ].join('\n')
}

/**
 * The knowledge block to append to a system prompt. Returns '' when nothing
 * is selected — every caller must handle that, and with the templates empty
 * that is the normal case today.
 *
 * @param {object} opts - same shape as selectKnowledge
 * @returns {string}
 */
export function buildKnowledgeBlock(opts = {}) {
  const { docs, skipped, tokens, situations } = selectKnowledge(opts)
  // Chat also gets the research summaries that match what the runner wrote
  // (at most two, their own budget); other call sites get none.
  const research = (opts.situations || []).includes('chat')
    ? selectChatResearch(RESEARCH, situations).docs
    : []

  if (IS_DEV) {
    if (docs.length) {
      console.log(
        `[knowledge] injected ${docs.length} doc(s) (~${tokens} tokens): ` +
          docs.map((d) => d.topic).join(', ') +
          (skipped.length ? ` — over budget, skipped: ${skipped.map((d) => d.topic).join(', ')}` : '')
      )
    } else {
      const stats = knowledgeStats()
      console.log(
        `[knowledge] nothing injected — ${stats.empty}/${stats.total} documents are still empty` +
          (stats.emptyTopics.length ? ` (${stats.emptyTopics.join(', ')})` : '')
      )
    }
  }

  if (!docs.length && !research.length) return ''

  return [
    '# COACHING KNOWLEDGE BASE',
    'Reference material written by the Runko team. Treat it as authoritative',
    'and follow it over your own defaults. Do not quote it verbatim at the',
    'runner — use it to be specific and correct.',
    '',
    ...docs.map((d) => `## ${d.topic}\n\n${d.content}`),
    ...research.map((d) => `## ${d.source}\n\n${d.content}`),
  ].join('\n')
}

/**
 * The research block for the plan call: the summary of the runner's scenario
 * plus at most two population notes (age and schedule only; health data never
 * goes to the AI). Pure text: the plan call stays ONE request.
 *
 * @param {{scenario: string, populations?: string[]}} opts
 * @returns {string} '' when the scenario has no summary
 */
export function buildResearchPlanBlock({ scenario, populations = [] } = {}) {
  const { docs, tokens } = selectPlanResearch(RESEARCH, { scenario, populations }, { budgetTokens: RESEARCH_BUDGETS.plan })
  if (!docs.length) return ''
  if (IS_DEV) console.log(`[knowledge] plan research: ${docs.map((d) => d.source).join(', ')} (~${tokens} tokens)`)
  return [
    '# RESEARCH BEHIND THE ENGINE',
    'Short summaries of the training research the app follows. The plan is already calculated by',
    'these rules; use them to explain it correctly. Do not quote them and do not contradict the plan.',
    '',
    ...docs.map((d) => `## ${d.source}\n\n${d.content}`),
  ].join('\n')
}
