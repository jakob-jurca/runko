/**
 * memory.js — durable facts the coach remembers about a runner.
 *
 * The point is CONTINUITY: a runner should not have to re-explain their knee,
 * their shift work, or that they only run mornings. After each chat exchange a
 * cheap AI call looks for anything worth keeping, and every later chat reply
 * and plan generation gets the whole list injected.
 *
 * The bar for storing something is deliberately high — see MEMORY_RULES. This
 * is long-term memory, not a transcript: "my knee hurts on back-to-back days"
 * is a fact, "my knee hurt today" is weather.
 *
 * Platform-agnostic (see ./README.md): no React, no DOM.
 */
import { supabase } from './supabase'
import { IS_DEV } from './env'

/** The only categories a memory may have (enforced by a DB check constraint). */
export const MEMORY_CATEGORIES = [
  'injury',
  'schedule',
  'preference',
  'life_context',
  'goal_change',
]

/** Hard cap so the prompt cannot grow without bound. */
export const MAX_MEMORIES = 40

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** All remembered facts, newest first. */
export async function getMemories(userId, { limit = MAX_MEMORIES } = {}) {
  const { data, error } = await supabase
    .from('coach_memory')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function addMemory(userId, { content, category }) {
  if (!MEMORY_CATEGORIES.includes(category)) {
    throw new Error(`Unknown memory category "${category}".`)
  }
  const { data, error } = await supabase
    .from('coach_memory')
    .insert({ user_id: userId, content: content.trim(), category })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Persist the facts an extraction produced. Capped per exchange so one
 * talkative message cannot flood the runner's memory, and failures are
 * swallowed per-row: a memory that does not save is not worth an error.
 */
export async function saveExtractedMemories(userId, facts, { max = 3 } = {}) {
  const saved = []
  for (const fact of facts.slice(0, max)) {
    try {
      saved.push(await addMemory(userId, fact))
    } catch (err) {
      if (IS_DEV) console.warn('[memory] could not save a fact (ignored):', err.message)
    }
  }
  return saved
}

export async function deleteMemory(id) {
  const { error } = await supabase.from('coach_memory').delete().eq('id', id)
  if (error) throw error
}

/** Mark memories as used, so a future cleanup can retire stale ones. */
export async function touchMemories(ids) {
  if (!ids?.length) return
  const { error } = await supabase
    .from('coach_memory')
    .update({ last_referenced_at: new Date().toISOString() })
    .in('id', ids)
  if (error && IS_DEV) console.warn('[memory] could not touch memories:', error.message)
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

const MEMORY_RULES = `Store a fact ONLY if it will still be true in a month and changes how
training should be planned.

STORE (examples):
- "Knee pain flares up when running on consecutive days" -> injury
- "Can only run before work, early mornings" -> schedule
- "Travels for work about one week every month" -> life_context
- "Hates treadmills, runs outdoors in any weather" -> preference
- "Switched target from the 10K to the spring marathon" -> goal_change
- "Has a 5K PB of 21:40 from last autumn" -> preference

DO NOT STORE (examples):
- "Felt tired today" — transient
- "Ran 8 km this morning" — that is in the workout log already
- "Asked how to pace a long run" — a question, not a fact
- "Is excited about the race" — a mood
- Anything already covered by an existing memory, even in different words

Categories: ${MEMORY_CATEGORIES.join(', ')}.

Most exchanges contain NOTHING worth storing. Returning an empty list is the
normal, correct outcome — do not invent facts to seem useful.`

/**
 * Build the extraction prompt for one exchange. Exported so it can be tested
 * without an API call.
 */
export function buildExtractionPrompt({ userMessage, coachReply, existing = [] }) {
  return `A runner and their coach just exchanged these messages.

RUNNER: ${userMessage}
COACH: ${coachReply}

FACTS YOU ALREADY REMEMBER ABOUT THIS RUNNER:
${existing.length ? existing.map((m) => `- [${m.category}] ${m.content}`).join('\n') : '- (none yet)'}

${MEMORY_RULES}

Respond with JSON only:
{"memories": [{"content": "<the fact, one short sentence, written in English in the third person>", "category": "<category>"}]}
Return {"memories": []} if there is nothing durable to store.`
}

/**
 * Parse and sanity-check the extraction response. Anything malformed, empty,
 * over-long, or in an unknown category is dropped silently — a bad memory is
 * worse than no memory, because it persists and shapes every later reply.
 */
export function parseExtractedMemories(text, { existing = [] } = {}) {
  let parsed
  try {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) return []
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed?.memories)) return []

  const seen = new Set(existing.map((m) => normalizeFact(m.content)))
  const out = []
  for (const m of parsed.memories) {
    const content = typeof m?.content === 'string' ? m.content.trim() : ''
    const category = typeof m?.category === 'string' ? m.category.trim() : ''
    if (!content || content.length > 200) continue
    if (!MEMORY_CATEGORIES.includes(category)) continue
    const key = normalizeFact(content)
    if (seen.has(key)) continue // already known, or a duplicate within this batch
    seen.add(key)
    out.push({ content, category })
  }
  return out
}

/**
 * Fingerprint for duplicate detection. Punctuation becomes a SPACE rather than
 * vanishing, so "back-to-back" and "back to back" collapse to the same key —
 * restating a fact with different hyphenation is exactly how a model produces
 * an accidental duplicate.
 */
function normalizeFact(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
