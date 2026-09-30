/**
 * limits.js — how long a reply the proxy will pay for.
 *
 * Plain JavaScript on purpose: index.ts imports it under Deno, and the app's
 * test suite imports the same file under Node (tests/ai-limits.test.mjs).
 *
 * The ceiling depends on what is being asked for, not on what the request
 * says it wants:
 *
 *   text      Anything that is not JSON mode is prose a runner reads: a chat
 *             reply, a one-line reaction, the daily message. It gets the chat
 *             ceiling whatever `kind` and `max_tokens` claim, so a prompt that
 *             was talked into writing an essay is cut off at a chat's length.
 *   JSON      The app's structured calls. Each kind has its own ceiling; a
 *             JSON call with no known kind gets the smallest useful one.
 *
 * `kind` is sent by the client, so it only ever selects among ceilings that
 * are all acceptable, and the large ones are reachable only in JSON mode,
 * where the provider returns a JSON object and nothing else.
 */

/** Non-JSON replies. Matches the app's chat budget (src/core/ai-limits.js). */
export const TEXT_MAX_OUTPUT_TOKENS = 1024

/** JSON-mode replies, by kind. */
export const JSON_MAX_OUTPUT_TOKENS = {
  memory: 400,
  adapt: 2048,
  plan: 6000,
}

/** A JSON call that does not say what it is. */
export const JSON_DEFAULT_OUTPUT_TOKENS = 1024

/** Tokens requested when the client sends no usable max_tokens. */
export const DEFAULT_OUTPUT_TOKENS = 1024

/** The ceiling for one request. */
export function outputTokenCap({ kind = '', json = false } = {}) {
  if (!json) return TEXT_MAX_OUTPUT_TOKENS
  // Own keys only: `kind` is the caller's text, and "constructor" is not a kind.
  return Object.hasOwn(JSON_MAX_OUTPUT_TOKENS, String(kind)) ? JSON_MAX_OUTPUT_TOKENS[String(kind)] : JSON_DEFAULT_OUTPUT_TOKENS
}

/** What is actually sent upstream: the request's max_tokens, never above the ceiling. */
export function cappedMaxTokens(requested, opts) {
  const cap = outputTokenCap(opts)
  const n = Math.floor(Number(requested))
  return Math.min(Number.isFinite(n) && n > 0 ? n : DEFAULT_OUTPUT_TOKENS, cap)
}
