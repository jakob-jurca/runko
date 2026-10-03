// Reply-length caps: what the app asks for, and what the ai-proxy will pay
// for whatever it is asked. Both files are plain JS, so Node can import the
// proxy's own limits (no Deno, no network).
import fs from 'node:fs'
import { OUTPUT_TOKENS } from '../src/core/ai-limits.js'
import {
  outputTokenCap, cappedMaxTokens, TEXT_MAX_OUTPUT_TOKENS, JSON_MAX_OUTPUT_TOKENS, JSON_DEFAULT_OUTPUT_TOKENS,
} from '../supabase/functions/ai-proxy/limits.js'
import { check, summary } from './harness.mjs'

console.log('\nai-proxy reply caps:')
check('prose is capped at a chat reply', TEXT_MAX_OUTPUT_TOKENS <= 1024)
check('a chat request for 8000 tokens gets the chat cap', cappedMaxTokens(8000, { kind: 'chat', json: false }) === TEXT_MAX_OUTPUT_TOKENS)
check('claiming kind "plan" does not lift the cap on prose', cappedMaxTokens(8000, { kind: 'plan', json: false }) === TEXT_MAX_OUTPUT_TOKENS)
check('no kind at all: prose cap', cappedMaxTokens(8000, {}) === TEXT_MAX_OUTPUT_TOKENS)
check('a plan in JSON mode keeps its room', cappedMaxTokens(6000, { kind: 'plan', json: true }) === 6000)
check('but never more than the plan cap', cappedMaxTokens(50_000, { kind: 'plan', json: true }) === JSON_MAX_OUTPUT_TOKENS.plan)
check('an unknown JSON kind gets the small default', outputTokenCap({ kind: 'whatever', json: true }) === JSON_DEFAULT_OUTPUT_TOKENS)
check('an object-prototype name is not a kind', outputTokenCap({ kind: 'constructor', json: true }) === JSON_DEFAULT_OUTPUT_TOKENS)
check('a smaller request is left alone', cappedMaxTokens(300, { kind: 'chat', json: false }) === 300)
for (const bad of [undefined, null, 'abc', 0, -5, NaN]) {
  const got = cappedMaxTokens(bad, { json: false })
  check(`max_tokens ${String(bad)} → a sane default within the cap`, got > 0 && got <= TEXT_MAX_OUTPUT_TOKENS)
}

console.log('\nThe app never asks for more than the proxy allows:')
const JSON_KINDS = { memory: 'memory', adapt: 'adapt', plan: 'plan', plan_retry: 'plan' }
for (const [name, tokens] of Object.entries(OUTPUT_TOKENS)) {
  const json = name in JSON_KINDS
  const cap = outputTokenCap({ kind: JSON_KINDS[name] ?? name, json })
  check(`${name}: ${tokens} ≤ ${cap}`, tokens <= cap)
}

console.log('\nThe proxy and the client use them:')
const proxy = fs.readFileSync('supabase/functions/ai-proxy/index.ts', 'utf8')
check('index.ts caps max_tokens through limits.js', /cappedMaxTokens\(body\.max_tokens,/.test(proxy) && proxy.includes("from './limits.js'"))
check('no other ceiling is left in index.ts', !/MAX_OUTPUT_TOKENS/.test(proxy))
const ai = fs.readFileSync('src/core/ai.js', 'utf8')
const calls = ai.match(/(?<!function )callAi\(\{/g) || []
const kinds = ai.match(/\n\s+kind: '\w+',\n(\s+extra: [^\n]+\n)?\s+\}\)/g) || []
check(`every AI call names its kind (${kinds.length} of ${calls.length})`, calls.length >= 7 && kinds.length === calls.length)
check('chat short-circuits off-topic messages before callAi', /classifyCoachMessage\(lastUser\) === 'out'[\s\S]{0,120}return offTopicReply/.test(ai))
check('memory extraction skips off-topic messages', /classifyCoachMessage\(userMessage\) === 'out'\) return \[\]/.test(ai))

export default summary('ai-limits')
