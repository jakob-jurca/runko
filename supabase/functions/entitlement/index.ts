/**
 * entitlement — what the signed-in runner may use, for the app to SHOW.
 *
 *   POST {}                              -> the runner's access (below)
 *   POST { action: 'start_plan_build' }  -> reserve one plan build (Stage 4)
 *
 * The app never decides access itself: it renders what this returns, and the
 * ai-proxy enforces the same rules (_shared/entitlements.js) on every call.
 *
 * Deploy: npx supabase@latest functions deploy entitlement
 */

// @ts-ignore — resolved by Deno at deploy time.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors, json, fail, BUSY, UNAVAILABLE } from '../_shared/http.ts'
import { loadAccess, userFromRequest } from '../_shared/access.ts'
// @ts-ignore — plain JS, shared with the app.
import { chatLimit, planBuildStatus, reviewAllowed, startOfLocalDay, startOfNextLocalDay } from '../_shared/entitlements.js'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST' && req.method !== 'GET') return fail(405, 'Method not allowed.', 'method_not_allowed')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error('entitlement misconfigured: missing Supabase env')
    return fail(500, UNAVAILABLE, 'server_misconfigured')
  }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const user = await userFromRequest(admin, req)
  if (!user) return fail(401, 'Seja je potekla. Prijavi se znova.', 'unauthenticated')

  let body: Record<string, unknown> = {}
  if (req.method === 'POST') {
    try {
      body = (await req.json()) ?? {}
    } catch {
      body = {}
    }
  }

  const now = new Date()
  let access
  try {
    access = await loadAccess(admin, user, now)
  } catch (err) {
    console.error('entitlement: lookup failed', (err as Error).message)
    return fail(503, BUSY, 'entitlement_check_failed')
  }
  const { sub, ent } = access

  const builds = await admin
    .from('plan_builds')
    .select('created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)
  if (builds.error) {
    console.error('entitlement: plan_builds lookup failed', builds.error.message)
    return fail(503, BUSY, 'entitlement_check_failed')
  }
  const planBuild = planBuildStatus({
    tier: ent.tier,
    builds: builds.data ?? [],
    trialStartedAt: ent.source === 'stripe' ? sub?.trial_start ?? null : null,
    trialEndsAt: ent.trialEndsAt,
    source: ent.source,
    now,
  })

  if (body.action === 'start_plan_build') {
    if (!planBuild.allowed) {
      return fail(403, planLimitMessage(planBuild), 'plan_limit', { reason: planBuild.reason, nextAt: planBuild.nextAt })
    }
    const { data, error } = await admin
      .from('plan_builds')
      .insert({ user_id: user.id, tier: ent.tier })
      .select('id')
      .single()
    if (error) {
      console.error('entitlement: could not record the build', error.message)
      return fail(503, BUSY, 'build_write_failed')
    }
    return json({ buildId: data.id })
  }

  // Chat messages used today (Ljubljana), for the "X left today" line.
  const chat = await admin
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('kind', 'chat')
    .eq('billable', true)
    .gte('created_at', startOfLocalDay(now).toISOString())
  if (chat.error) {
    console.error('entitlement: usage lookup failed', chat.error.message)
    return fail(503, BUSY, 'entitlement_check_failed')
  }

  return json({
    ...ent,
    // The creator's limit is Infinity, sent as null: "no limit".
    chat: { used: chat.count ?? 0, limit: Number.isFinite(chatLimit(ent.tier)) ? chatLimit(ent.tier) : null, resetsAt: startOfNextLocalDay(now).toISOString() },
    planBuild,
    review: reviewAllowed(ent.tier),
  })
})

/** Slovenian, for the runner: why no new plan now, and from when. */
function planLimitMessage({ reason, nextAt }: { reason: string | null; nextAt: string | null }) {
  const when = nextAt
    ? new Date(nextAt).toLocaleDateString('sl-SI', { day: 'numeric', month: 'long', timeZone: 'Europe/Ljubljana' })
    : null
  if (reason === 'trial_used') {
    return 'Med preizkusom lahko sestaviš en načrt. Ko se naročnina začne, lahko sestaviš novega.'
  }
  if (reason === 'monthly') return `S paketom Start lahko nov načrt sestaviš enkrat na mesec. Naslednjič ${when}.`
  if (reason === 'fair_use') return 'Danes si sestavil že veliko načrtov. Nov načrt lahko sestaviš jutri.'
  return 'Za sestavo načrta potrebuješ aktivno naročnino.'
}
