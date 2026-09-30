/**
 * ai-proxy — the only thing that ever sees the Groq API key.
 *
 * The key used to live in VITE_GROQ_API_KEY, which Vite inlines into the
 * browser bundle: anyone who opened devtools could read it and spend against
 * the account. It now lives as a Supabase secret, readable only here.
 *
 * What this function does, in order:
 *   1. Requires a valid Supabase auth JWT — signed-out callers get 401.
 *   2. Checks the caller is on a live trial or an active subscription, so the
 *      paywall is enforced where the money is spent rather than only in the
 *      UI — free callers get 402.
 *   3. Counts the caller's AI calls in the last hour and refuses past the
 *      limit, with a message the UI can show verbatim.
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
const fail = (status: number, message: string, code: string) =>
  json({ error: { message, code } }, status)

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
  // they can SPEND. Without it, any signed-in free user can skip the app
  // entirely and post here directly — which is the one thing the paywall
  // exists to prevent, since every AI call costs real money.
  //
  // This mirrors hasPremium() in src/core/subscription.js. The duplication is
  // deliberate: a Deno function cannot import the app's bundle, and a rule
  // the client could supply is not a rule. If the trial model changes, both
  // sides change. The service-role client reads the row directly, so the
  // columns are not ones the caller can forge (migration_v6.sql also revokes
  // write access to them).
  const { data: profile, error: profileErr } = await admin
    .from('users')
    .select('trial_end, subscription_status')
    .eq('id', user.id)
    .maybeSingle()

  if (profileErr) {
    console.error('ai-proxy: entitlement lookup failed', profileErr.message)
    // Fail CLOSED, as with the rate limit: if we cannot establish that the
    // caller has paid, we do not spend on their behalf.
    return fail(503, 'Storitev je trenutno preobremenjena. Poskusi čez nekaj minut.', 'entitlement_check_failed')
  }

  const trialActive = profile?.trial_end ? new Date(profile.trial_end) > new Date() : false
  const subscribed = profile?.subscription_status === 'active'
  if (!trialActive && !subscribed) {
    return fail(
      402,
      'Tvoj brezplačni preizkus se je iztekel. AI trener je del paketa Premium.',
      'not_premium'
    )
  }

  // --- 3. rate limit ------------------------------------------------------
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

  if ((count ?? 0) >= RATE_LIMIT) {
    return fail(
      429,
      `Dosegel si omejitev ${RATE_LIMIT} zahtev na uro. Poskusi znova čez kakšno uro.`,
      'rate_limited'
    )
  }

  // --- 4. validate the request --------------------------------------------
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail(400, 'Neveljavna zahteva.', 'bad_request')
  }

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
  const maxTokens = cappedMaxTokens(body.max_tokens, { kind: String(body.kind ?? ''), json: jsonMode })
  const temperature = Math.min(Math.max(Number(body.temperature) || 0, 0), 2)

  const upstreamBody: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  }
  if (jsonMode) upstreamBody.response_format = { type: 'json_object' }

  // --- 5. record the call, then forward -----------------------------------
  // Recorded BEFORE the call so a failure upstream still counts against the
  // limit; otherwise an error loop is free.
  const { error: usageErr } = await admin
    .from('ai_usage')
    .insert({ user_id: user.id, kind: String(body.kind ?? '').slice(0, 32) || null })
  if (usageErr) {
    console.error('ai-proxy: could not record usage', usageErr.message)
    return fail(503, 'Storitev je trenutno preobremenjena. Poskusi čez nekaj minut.', 'usage_write_failed')
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
    return fail(502, 'Trenerja trenutno ni bilo mogoče doseči.', 'upstream_unreachable')
  }

  const text = await upstream.text()

  // Pass the upstream status through so the client's existing handling
  // (404 → next model, 429 → wait, 413 → smaller budget) keeps working, but
  // never forward upstream headers.
  return new Response(text, {
    status: upstream.status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
