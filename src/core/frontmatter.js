/**
 * frontmatter.js — the tiny document format the knowledge base uses.
 *
 * Only the three shapes our files need: `key: value`, and a `key:` followed by
 * `  - item` lines. Deliberately not a general YAML parser; the format is
 * documented in knowledge/README.md and enforced by review and tests.
 *
 * Pure string handling (no bundler), so tests can use it under plain node.
 */

/** ~4 characters per token. Deliberately conservative. */
export function estimateTokens(text) {
  return Math.ceil((text || '').length / 4)
}

export function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (!match) return { meta: {}, body: raw }

  const meta = {}
  let currentListKey = null

  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue
    const listItem = /^\s+-\s+(.*)$/.exec(line)
    if (listItem && currentListKey) {
      meta[currentListKey].push(listItem[1].trim())
      continue
    }
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (!pair) continue
    const [, key, value] = pair
    if (value === '') {
      currentListKey = key
      meta[key] = []
    } else {
      currentListKey = null
      meta[key] = value.trim()
    }
  }
  return { meta, body: raw.slice(match[0].length) }
}

/**
 * The document body with HTML comments removed. The templates ship with a
 * comment explaining what to write, and that must not reach the model or
 * count as content.
 */
export function contentOf(body) {
  return body.replace(/<!--[\s\S]*?-->/g, '').trim()
}
