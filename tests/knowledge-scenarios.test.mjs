/**
 * Scenario knowledge: every runner scenario has exactly one knowledge file,
 * that file holds a `## Scenario: <id>` section, and the section fits the
 * plan-generation budget — so the single plan call carries this runner's
 * guidance and nothing else.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scenarioSection, documentForScenario } from '../src/core/knowledge-scenarios.js'
import { SCENARIOS } from '../src/core/planning/rules.js'
import { check, summary } from './harness.mjs'

// Mirrors KNOWLEDGE_BUDGETS.plan_generation in src/core/knowledge.js, which
// cannot be imported here (it depends on Vite's import.meta.glob).
const PLAN_BUDGET_TOKENS = 700

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'knowledge')

/** The `scenarios:` list from a file's frontmatter (same format knowledge.js reads). */
function scenariosOf(raw) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
  if (!fm) return []
  const out = []
  let inList = false
  for (const line of fm[1].split(/\r?\n/)) {
    if (/^scenarios:\s*$/.test(line)) { inList = true; continue }
    const item = /^\s+-\s+(.*)$/.exec(line)
    if (inList && item) out.push(item[1].trim())
    else if (/^\S/.test(line)) inList = false
  }
  return out
}

const documents = fs.readdirSync(dir)
  .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
  .map((name) => {
    const raw = fs.readFileSync(path.join(dir, name), 'utf8')
    return { name, scenarios: scenariosOf(raw), content: raw.replace(/<!--[\s\S]*?-->/g, '') }
  })

console.log('\n=== SCENARIO KNOWLEDGE ===')
for (const scenario of SCENARIOS) {
  let doc = null
  try {
    doc = documentForScenario(documents, scenario)
  } catch (err) {
    check(`${scenario}: exactly one file — ${err.message}`, false)
    continue
  }
  check(`${scenario}: owned by one file (${doc?.name ?? 'none'})`, Boolean(doc))
  const section = doc && scenarioSection(doc.content, scenario)
  check(`${scenario}: has a "## Scenario: ${scenario}" section`, Boolean(section))
  const tokens = Math.ceil((section || '').length / 4)
  check(`${scenario}: section ~${tokens} tokens ≤ ${PLAN_BUDGET_TOKENS}`, tokens > 0 && tokens <= PLAN_BUDGET_TOKENS)
  // Only this scenario's section: no other scenario's heading leaks in.
  check(`${scenario}: section contains no other scenario`,
    !SCENARIOS.filter((s) => s !== scenario).some((s) => (section || '').includes(`## Scenario: ${s}`)))
}

const unknown = documents.flatMap((d) => d.scenarios.filter((s) => !SCENARIOS.includes(s)).map((s) => `${d.name}: ${s}`))
check(`no file claims an unknown scenario${unknown.length ? ` (${unknown.join(', ')})` : ''}`, !unknown.length)

export default summary('knowledge-scenarios')
