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

// ---------------------------------------------------------------------------
// Situations — the vocabulary a `load_when:` list draws from
// ---------------------------------------------------------------------------

export const SITUATIONS = [
  'always',
  'chat',
  'plan_generation',
  'onboarding',
  'injury_mention',
  'nutrition_question',
  'pace_question',
  'workout_question',
  'motivation',
]

/**
 * Keywords that infer a situation from what the runner actually wrote.
 * English and Slovenian, because the coach answers in both. Matching is
 * accent- and case-insensitive (see `normalize`), so "bolecina" finds
 * "bolečina" and a runner who types without diacritics is still understood.
 */
const SITUATION_KEYWORDS = {
  injury_mention: [
    // en
    'pain', 'painful', 'hurt', 'hurts', 'sore', 'soreness', 'injury', 'injured',
    'knee', 'ankle', 'achilles', 'shin', 'splints', 'plantar', 'fascia',
    'it band', 'itb', 'calf', 'hamstring', 'quad', 'hip', 'groin', 'foot',
    'heel', 'strain', 'sprain', 'niggle', 'swollen', 'swelling', 'stress fracture',
    'tendon', 'tendinitis', 'tendinopathy', 'limp',
    // sl
    'bolecina', 'bolecine', 'boli', 'bolece', 'poskodba', 'poskodoval',
    'koleno', 'kolena', 'glezen', 'ahilova', 'golen', 'meca',
    'misica', 'misice', 'stegno', 'stopalo', 'peta', 'kolk', 'dimlje', 'hrbet',
    'oteklina', 'otekel', 'zvin', 'nateg',
  ],
  nutrition_question: [
    // en
    'eat', 'eating', 'ate', 'food', 'diet', 'nutrition', 'fuel', 'fuelling',
    'fueling', 'gel', 'gels', 'carb', 'carbs', 'carbohydrate', 'protein',
    'hydration', 'hydrate', 'water', 'drink', 'drinking', 'electrolyte',
    'breakfast', 'dinner', 'lunch', 'snack', 'caffeine', 'supplement',
    // sl
    'hrana', 'hrano', 'jesti', 'jem', 'pojesti', 'prehrana', 'prehrano',
    'gorivo', 'ogljikovi', 'hidrati', 'beljakovine', 'hidracija', 'piti',
    'voda', 'vodo', 'zajtrk', 'kosilo', 'vecerja', 'elektroliti', 'kofein',
  ],
  pace_question: [
    // en
    'pace', 'paces', 'vdot', 'how fast', 'too fast', 'too slow', 'speed',
    'min/km', 'per km', 'threshold', 'race time', 'personal best', 'pb',
    'splits', 'heart rate', 'hr zone', 'zone 2', 'target time', 'finish time',
    // sl
    'tempo', 'tempu', 'hitrost', 'hitro', 'pocasi', 'pocasneje', 'cas',
    'osebni rekord', 'rekord', 'prag', 'srcni utrip', 'utrip', 'cona',
    'minut na kilometer',
  ],
  workout_question: [
    // en
    'workout', 'session', 'interval', 'intervals', 'rep', 'reps', 'repetition',
    'long run', 'tempo run', 'fartlek', 'track', 'hill', 'hills', 'strides',
    'warm up', 'warm-up', 'cool down', 'cross training', 'easy run',
    // sl
    'trening', 'treningu', 'intervali', 'intervale', 'ponovitve', 'serija',
    'dolgi tek', 'lahkoten tek', 'klanec', 'klanci', 'ogrevanje', 'raztezanje',
    'vaja', 'vaje',
  ],
  motivation: [
    // en
    'motivation', 'motivated', 'unmotivated', 'lazy', 'skipped', 'missed',
    'give up', 'quitting', 'burnt out', 'burned out', 'consistency',
    "can't be bothered", 'no energy', 'demotivated',
    // sl
    'motivacija', 'motivacije', 'volja', 'nimam volje', 'preskocil',
    'izpustil', 'obupal', 'obupujem', 'lenoba', 'utrujen', 'izgorel',
    'vztrajnost',
  ],
}

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

/** ~4 characters per token. Deliberately conservative. */
export function estimateTokens(text) {
  return Math.ceil((text || '').length / 4)
}

/** Strip diacritics and case so "bolečina" and "bolecina" both match. */
function normalize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    // \p{M} = every combining mark, i.e. exactly what NFD just split off.
    .replace(/\p{M}/gu, '')
}

/**
 * Minimal YAML frontmatter reader — only the three shapes our format uses:
 * `key: value`, and a `key:` followed by `  - item` lines. Deliberately not a
 * general YAML parser; the format is documented and enforced by review.
 */
function parseFrontmatter(raw) {
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
function contentOf(body) {
  return body.replace(/<!--[\s\S]*?-->/g, '').trim()
}

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
 * Keywords are matched at a WORD BOUNDARY but allowed to run on past the end,
 * so "knee" finds "knees" and "bolecina" finds "bolecine" — while "ate" no
 * longer fires on "water" and "rep" no longer fires on "prepare". Compiled
 * once at module load.
 */
const SITUATION_MATCHERS = Object.entries(SITUATION_KEYWORDS).map(([situation, keywords]) => [
  situation,
  keywords.map((k) => new RegExp('\\b' + normalize(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
])

/**
 * Infer situations from free text (the runner's message). Always additive —
 * callers pass the situations they know for certain, this finds the rest.
 * @returns {string[]}
 */
export function detectSituations(text) {
  if (!text) return []
  const haystack = normalize(text)
  const found = []
  for (const [situation, matchers] of SITUATION_MATCHERS) {
    if (matchers.some((re) => re.test(haystack))) found.push(situation)
  }
  return found
}

/**
 * Token budgets per call site. A plan generation prompt can carry far more
 * knowledge than a one-line chat reply, so they are not the same number.
 */
export const KNOWLEDGE_BUDGETS = {
  chat: 1200,
  plan_generation: 2500,
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
 * The knowledge block to append to a system prompt. Returns '' when nothing
 * is selected — every caller must handle that, and with the templates empty
 * that is the normal case today.
 *
 * @param {object} opts - same shape as selectKnowledge
 * @returns {string}
 */
export function buildKnowledgeBlock(opts = {}) {
  const { docs, skipped, tokens } = selectKnowledge(opts)

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

  if (!docs.length) return ''

  return [
    '# COACHING KNOWLEDGE BASE',
    'Reference material written by the Runko team. Treat it as authoritative',
    'and follow it over your own defaults. Do not quote it verbatim at the',
    'runner — use it to be specific and correct.',
    '',
    ...docs.map((d) => `## ${d.topic}\n\n${d.content}`),
  ].join('\n')
}
