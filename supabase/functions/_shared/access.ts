/**
 * access.ts — read a runner's entitlement on the server.
 *
 * Both columns it reads are out of the runner's reach: users.trial_end is
 * read-only to clients since migration_v6, and public.subscriptions has no
 * client write access at all (migration_v9). The rule itself is
 * entitlements.js, shared with the app.
 */
// @ts-ignore — plain JS, shared with the app and its tests.
import { entitlementOf } from './entitlements.js'

// deno-lint-ignore no-explicit-any
type Client = any

/**
 * PAYMENTS_ENABLED (Supabase secret), off unless exactly "true". While off:
 * no Stripe calls, every signup gets the 1-month no-card trial, and the app
 * shows "paid plans are coming" where the paywall would be.
 */
export const paymentsEnabled = () => Deno.env.get('PAYMENTS_ENABLED') === 'true'

/**
 * The subscriptions row and the entitlement it gives. Throws on a read error
 * (callers fail closed).
 * @param user - the auth user ({ id, created_at })
 */
export async function loadAccess(admin: Client, user: { id: string; created_at?: string }, now = new Date()) {
  const [userRes, subRes] = await Promise.all([
    admin.from('users').select('trial_end').eq('id', user.id).maybeSingle(),
    admin.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
  ])
  if (userRes.error) throw new Error(`users: ${userRes.error.message}`)
  if (subRes.error) throw new Error(`subscriptions: ${subRes.error.message}`)
  const sub = subRes.data ?? null
  const ent = entitlementOf(
    {
      trialEnd: userRes.data?.trial_end ?? null,
      sub,
      paymentsEnabled: paymentsEnabled(),
      profileExists: Boolean(userRes.data),
      signedUpAt: user.created_at ?? null,
    },
    now
  )
  return { sub, ent }
}

/** The signed-in user behind the request's bearer token, or null. */
export async function userFromRequest(admin: Client, req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  return error || !data?.user ? null : data.user
}
