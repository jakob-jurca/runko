/**
 * ai-limits.js — how long an AI reply may be, per kind of call.
 *
 * The client asks for these budgets and tags each request with its kind; the
 * ai-proxy Edge Function enforces its own ceiling for that kind whatever the
 * request says (supabase/functions/ai-proxy/limits.js). The proxy's copy is
 * the one that counts: a Deno function cannot import the app's bundle, and a
 * limit the client could raise is not a limit. tests/ai-limits.test.mjs
 * checks that no budget here asks for more than the proxy allows.
 *
 * Pure data. See ./README.md for the core rules.
 */
export const OUTPUT_TOKENS = {
  /** A chat reply: two or three sentences, a race plan walked through at most. */
  chat: 1024,
  /** One or two sentences after a logged run. */
  reaction: 512,
  /** One line on the dashboard. */
  motd: 512,
  /** A handful of facts as JSON, usually none. */
  memory: 400,
  /** One rewritten week as JSON. */
  adapt: 2048,
  /** The words for a whole plan as JSON; the stricter retry asks for a little more. */
  plan: 5000,
  plan_retry: 6000,
  /** The weekly progress review as JSON: a few short lines. */
  review: 700,
}
