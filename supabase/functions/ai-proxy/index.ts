/**
 * ai-proxy — the only thing that ever sees the Groq API key.
 *
 * The key used to live in VITE_GROQ_API_KEY, which Vite inlines into the
 * browser bundle: anyone who opened devtools could read it and spend against
 * the account. It now lives as a Supabase secret, readable only here.
 *
 * What this function does, in order:
 *   1. Requires a valid Supabase auth JWT — signed-out callers get 401.
 *   2. Checks the caller's entitlement (_shared/entitlements.js: trial, Start,
 *      Pro or comped), so the paywall is enforced where the money is spent
 *      rather than only in the UI — callers without access get 402.
 *   3. Counts the caller's AI calls in the last hour and today (midnight
 *      Europe/Ljubljana), and refuses past the limits, with a message the UI
 *      can show verbatim. Coach chat: Start 10 a day, Pro and trial 50.
 *   4. Validates the request (allow-listed model, capped payload, and a reply
 *      length capped per kind of call — see limits.js) so an authenticated
 *      user cannot turn the proxy into a free general-purpose LLM endpoint.
 *   5. Forwards to Groq with the secret key and returns the response.
 *
 * Deploy and configure: see README.md next to this file.
 */

// @ts-ignore — resolved by Deno at deploy time, not by the app's toolchain.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore — plain JS, shared with the app's test suite.
import { cappedMaxTokens } from './limits.js'
// @ts-ignore — plain JS, shared with the app and its tests.
import {
  AI_KINDS, dailyLimit, dailyLimitRefusal, planBuildUsable, reviewAllowed, startOfLocalDay, previousLocalWeekKey, unlimited,
} from '../_shared/entitlements.js'
import { loadAccess } from '../_shared/access.ts'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

/** Calls per user per rolling hour. */
const RATE_LIMIT = 30
const RATE_WINDOW_MS = 60 * 60 * 1000

/**
 * Only models the app actually uses. Without this, a signed-in user could
 * ask the proxy for any model on the account.
 */
const ALLOWED_MODELS = new Set([
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
])

/**
 * Hard ceilings, independent of whatever the client asks for. The reply
 * length ceiling lives in limits.js: it depends on the kind of call.
 */
const MAX_MESSAGES = 40
const MAX_PAYLOAD_CHARS = 60_000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

/** Errors the client may show a user. Never leaks internals. */
const fail = (status: number, message: string, code: string, extra: Record<string, unknown> = {}) =>
  json({ error: { message, code, ...extra } }, status)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return fail(405, 'Method not allowed.', 'method_not_allowed')

  const groqKey = Deno.env.get('GROQ_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!groqKey || !supabaseUrl || !serviceKey) {
    // Misconfiguration is our problem, not the runner's — say nothing useful
    // to an attacker, but log it for us.
    console.error('ai-proxy misconfigured: missing GROQ_API_KEY or Supabase env')
    return fail(500, 'Storitev trenutno ni na voljo.', 'server_misconfigured')
  }

  // --- 1. authentication --------------------------------------------------
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return fail(401, 'Za uporabo trenerja se je treba prijaviti.', 'unauthenticated')

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  const user = userData?.user
  if (userErr || !user) {
    return fail(401, 'Seja je potekla. Prijavi se znova.', 'unauthenticated')
  }

  // --- 2. entitlement -----------------------------------------------------
  // The paywall in the UI decides what a runner is SHOWN. This decides what
  // they can SPEND. Without it, any signed-in user without access could skip
  // the app entirely and post here directly — which is the one thing the
  // paywall exists to prevent, since every AI call costs real money.
  //
  // The rule is _shared/entitlements.js, the same file the app reads, and
  // the rows it reads are ones the caller cannot write (users.trial_end is
  // read-only since migration_v6, subscriptions has no client write access).
  let ent
  try {
    ;({ ent } = await loadAccess(admin, user.id))
  } catch (err) {
    console.error('ai-proxy: entitlement lookup failed', (err as Error).message)
    // Fail CLOSED, as with the rate limit: if we cannot establish that the
    // caller has paid, we do not spend on their behalf.
    return fail(503, 'Storitev je trenutno preobremenjena. Poskusi čez nekaj minut.', 'entitlement_check_failed')
  }

  if (ent.tier === 'none') {
    return fail(
      402,
      'Tvoj dostop se je iztekel. Za trenerja izberi paket Start ali Pro.',
      'not_premium'
    )
  }

  // The request body is read here, before the limits, because the limit
  // that applies depends on what kind of call it is.
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail(400, 'Neveljavna zahteva.', 'bad_request')
  }
  const kind = String(body.kind ?? '')
  // `kind` is written by the client, so it may only pick among kinds that
  // each have their own ceiling; an unknown one is refused.
  if (!AI_KINDS.includes(kind)) return fail(400, 'Neveljavna zahteva.', 'bad_kind')

  // --- 3. rate limits -----------------------------------------------------
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count, error: countErr } = await admin
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since)

  if (countErr) {
    console.error('ai-proxy: rate-limit lookup failed', countErr.message)
    // Fail CLOSED: if we cannot count, we do not spend.
    return fail(503, 'Storitev je trenutno preobremenjena. Poskusi čez nekaj minut.', 'rate_check_failed')
  }

  // The creator has no limits at all, this one included.
  if ((count ?? 0) >= RATE_LIMIT && !unlimited(ent.tier)) {
    return fail(
      429,
      `Dosegel si omejitev ${RATE_LIMIT} zahtev na uro. Poskusi znova čez kakšno uro.`,
      'rate_limited'
    )
  }

  // Today's calls of this kind, since midnight in Ljubljana. Only billable
  // ones: a call the provider refused (and the app retried on another
  // model) is not a message the runner sent twice.
  const perDay = dailyLimit(kind, ent.tier)
  if (Number.isFinite(perDay)) {
    const { count: today, error: todayErr } = await admin
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('kind', kind)
      .eq('billable', true)
      .gte('created_at', startOfLocalDay().toISOString())
    if (todayErr) {
      console.error('ai-proxy: daily-limit lookup failed', todayErr.message)
      return fail(503, 'Storitev je trenutno preobremenjena. Poskusi čez nekaj minut.', 'rate_check_failed')
    }
    const refusal = dailyLimitRefusal({ kind, tier: ent.tier, usedToday: today ?? 0 })
    if (refusal) return fail(refusal.status, refusal.message, refusal.code, { limit: refusal.limit })
  }

  // --- 4. validate the request --------------------------------------------
  const model = String(body.model ?? '')
  if (!ALLOWED_MODELS.has(model)) {
    return fail(400, 'Neveljavna zahteva.', 'model_not_allowed')
  }

  const messages = Array.isArray(body.messages) ? body.messages : null
  if (!messages || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return fail(400, 'Neveljavna zahteva.', 'bad_messages')
  }
  for (const m of messages) {
    const role = (m as Record<string, unknown>)?.role
    const content = (m as Record<string, unknown>)?.content
    if (!['system', 'user', 'assistant'].includes(String(role)) || typeof content !== 'string') {
      return fail(400, 'Neveljavna zahteva.', 'bad_messages')
    }
  }

  const totalChars = messages.reduce(
    (n: number, m: Record<string, unknown>) => n + String(m.content ?? '').length,
    0
  )
  if (totalChars > MAX_PAYLOAD_CHARS) {
    return fail(413, 'Zahteva je prevelika.', 'payload_too_large')
  }

  // Only the one response_format we use; nothing else is passed through.
  const jsonMode = (body.response_format as Record<string, unknown>)?.type === 'json_object'
  // Prose is capped at a chat reply's length whatever the request asks for,
  // so a coach prompt that was talked off topic cannot produce pages of it.
  const maxTokens = cappedMaxTokens(body.max_tokens, { kind, json: jsonMode })
  const temperature = Math.min(Math.max(Number(body.temperature) || 0, 0), 2)

  const upstreamBody: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  }
  if (jsonMode) upstreamBody.response_format = { type: 'json_object' }

  // --- 4b. a plan is described only under a build the server reserved ----
  // The plan-build limits (Start once a month, Pro 5 a day, trial one plan)
  // are decided when the `entitlement` function reserves the build; here a
  // plan call must name that build, recent and with calls left (the app's
  // model fallbacks and one stricter retry).
  if (kind === 'plan') {
    const buildId = String(body.build_id ?? '')
    const refused = () =>
      fail(403, 'Za nov načrt ga je treba sestaviti znova. Poskusi še enkrat.', 'plan_build_required')
    if (!/^[0-9a-f-]{36}$/i.test(buildId)) return refused()
    const { data: build, error: buildErr } = await admin
      .from('plan_builds')
      .select('id, created_at, ai_calls')
      .eq('id', buildId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (buildErr) {
      console.error('ai-proxy: plan build lookup failed', buildErr.message)
      return fail(503, 'Storitev je trenutno preobremenjena. Poskusi čez nekaj minut.', 'rate_check_failed')
    }
    if (!planBuildUsable(build)) return refused()
    // Counted only if nobody else counted it in between (two tabs).
    const { data: bumped } = await admin
      .from('plan_builds')
      .update({ ai_calls: build.ai_calls + 1 })
      .eq('id', build.id)
      .eq('ai_calls', build.ai_calls)
      .select('id')
    if (!bumped?.length) return refused()
  }

  // --- 4c. the weekly review: one per runner per week ---------------------
  // Claimed BEFORE the call: the row's primary key (runner, week) means a
  // second request for the same week, from any tab or device, is refused
  // instead of paid for. The week is the server's (Ljubljana), not the app's.
  let reviewWeek: string | null = null
  if (kind === 'review') {
    if (!reviewAllowed(ent.tier)) {
      return fail(403, 'Tedenski pregled napredka je del paketa Pro.', 'review_locked')
    }
    if (!jsonMode) return fail(400, 'Neveljavna zahteva.', 'bad_request')
    reviewWeek = previousLocalWeekKey()
    const { error: claimErr } = await admin
      .from('weekly_reviews')
      .insert({ user_id: user.id, week_start: reviewWeek, status: 'pending' })
    if (claimErr) {
      if (claimErr.code === '23505') return fail(409, 'Pregled tega tedna je že pripravljen.', 'review_exists')
      console.error('ai-proxy: could not claim the weekly review', claimErr.message)
      return fail(503, 'Storitev je trenutno preobremenjena. Poskusi čez nekaj minut.', 'review_claim_failed')
    }
  }
  // Nothing was generated (the call failed before or at the provider): let
  // the app try again later. A review that WAS generated is never redone.
  const releaseReview = async () => {
    if (!reviewWeek) return
    await admin.from('weekly_reviews').delete().eq('user_id', user.id).eq('week_start', reviewWeek).eq('status', 'pending')
  }

  // --- 5. record the call, then forward -----------------------------------
  // Recorded BEFORE the call so a failure upstream still counts against the
  // limit; otherwise an error loop is free.
  const { data: usage, error: usageErr } = await admin
    .from('ai_usage')
    .insert({ user_id: user.id, kind })
    .select('id')
    .single()
  if (usageErr) {
    console.error('ai-proxy: could not record usage', usageErr.message)
    await releaseReview()
    return fail(503, 'Storitev je trenutno preobremenjena. Poskusi čez nekaj minut.', 'usage_write_failed')
  }
  const notBillable = async () => {
    const { error: markErr } = await admin.from('ai_usage').update({ billable: false }).eq('id', usage.id)
    if (markErr) console.error('ai-proxy: could not mark a failed call', markErr.message)
  }

  let upstream: Response
  try {
    upstream = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(upstreamBody),
    })
  } catch (err) {
    console.error('ai-proxy: upstream fetch failed', err)
    await notBillable()
    await releaseReview()
    return fail(502, 'Trenerja trenutno ni bilo mogoče doseči.', 'upstream_unreachable')
  }

  const text = await upstream.text()

  // Refused upstream: the hourly limit still counts it, the daily one does not.
  if (!upstream.ok) {
    await notBillable()
    await releaseReview()
  } else if (reviewWeek) {
    // Stored here, by the server, so the app never needs to ask twice.
    let content: unknown = null
    try {
      content = JSON.parse(JSON.parse(text)?.choices?.[0]?.message?.content ?? 'null')
    } catch {
      content = null
    }
    const { error: saveErr } = await admin
      .from('weekly_reviews')
      .update({ status: 'ready', content: content ?? {} })
      .eq('user_id', user.id)
      .eq('week_start', reviewWeek)
    if (saveErr) console.error('ai-proxy: could not store the weekly review', saveErr.message)
  }

  // Pass the upstream status through so the client's existing handling
  // (404 → next model, 429 → wait, 413 → smaller budget) keeps working, but
  // never forward upstream headers.
  return new Response(text, {
    status: upstream.status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
