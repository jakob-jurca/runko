/**
 * knowledge-scenarios.js — pick the scenario guidance out of a document.
 *
 * Each runner scenario (see core/planning/rules.js) has exactly one knowledge
 * file that declares it in its frontmatter (`scenarios:`) and holds a section
 * headed `## Scenario: <id>`. Plan generation injects ONLY that section, so
 * the single AI call carries the guidance for this runner and nothing else.
 *
 * Pure string handling, kept apart from knowledge.js (which depends on the
 * bundler) so it can be tested under plain node.
 */

/**
 * The `## Scenario: <id>` section of a document body, heading included, up to
 * the next `## ` heading. Null when the document has no such section.
 */
export function scenarioSection(content, scenario) {
  const lines = String(content || '').split(/\r?\n/)
  const start = lines.findIndex((l) => l.trim() === `## Scenario: ${scenario}`)
  if (start === -1) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n').trim()
}

/**
 * Among parsed documents ({name, scenarios, content}), the one that owns a
 * scenario. Throws on a scenario claimed twice — "load only the file for the
 * runner's scenario" only works if there is exactly one.
 */
export function documentForScenario(documents, scenario) {
  const owners = documents.filter((d) => (d.scenarios || []).includes(scenario))
  if (owners.length > 1) {
    throw new Error(`Scenario "${scenario}" is claimed by ${owners.map((d) => d.name).join(' and ')}`)
  }
  return owners[0] || null
}
