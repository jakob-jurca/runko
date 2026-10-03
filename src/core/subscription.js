/**
 * subscription.js — the runner's access, as the SERVER sees it.
 *
 * Access is never worked out here. The `entitlement` Edge Function computes
 * it with supabase/functions/_shared/entitlements.js and the ai-proxy
 * enforces the same rules on every AI call; the app only fetches the result
 * and renders it:
 *
 *   tier  none | trial | start | pro      (comped testers read as pro)
 *   chat  { used, limit, resetsAt }       coach messages today
 *   planBuild { allowed, reason, nextAt } may a new plan be built now
 *   review  weekly progress review included
 *
 * Checkout and the customer portal are Stripe pages; the billing function
 * creates them and this module hands the URL back for the caller to open.
 * Core never touches the DOM, so a React Native port opens the same URL in
 * its own browser sheet.
 */
import { supabase } from './supabase'
import { IS_DEV } from './env'
import { t } from './strings'
import { hasAccess } from '../../supabase/functions/_shared/entitlements.js'

export {
  CHAT_PER_DAY,
  PLAN_BUILDS,
  hasAccess,
  reviewAllowed,
  localWeekKey,
  previousLocalWeekKey,
} from '../../supabase/functions/_shared/entitlements.js'

/**
 * Call one of Runko's Edge Functions. Throws an Error whose message is safe
 * to show (the function's own Slovenian message when it sent one), with the
 * function's `code` and any extra fields attached.
 */
export async function callFunction(name, body = {}) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (!error) return data
  let payload = null
  try {
    payload = await error.context?.json?.()
  } catch {
    /* not JSON: a gateway or network failure */
  }
  const info = payload?.error ?? {}
  const err = new Error(info.message || t.errors.network)
  Object.assign(err, info, { status: error.context?.status ?? null })
  throw err
}

/**
 * DEV ONLY — when the entitlement function cannot be reached from
 * `npm run dev` (not deployed yet, offline), the app shows Pro so every
 * screen stays reachable. The proxy still enforces the real rules. Vite
 * inlines IS_DEV as a literal, so this is dead code in production builds.
 */
const DEV_FALLBACK = IS_DEV
  ? {
      tier: 'pro', comped: true, source: 'dev', status: null, chosenTier: null, interval: null,
      trialEndsAt: null, renewsAt: null, cancelAtPeriodEnd: false, paymentFailed: false,
      trialAvailable: true, hasCustomer: false,
      chat: { used: 0, limit: 50, resetsAt: null },
      planBuild: { allowed: true, reason: null, nextAt: null },
      review: true,
    }
  : null

/** The signed-in runner's access. Throws when it cannot be established. */
export async function fetchAccess() {
  try {
    return await callFunction('entitlement')
  } catch (err) {
    if (DEV_FALLBACK && err.status !== 401) {
      console.warn('[subscription] entitlement function unreachable in dev; showing Pro.', err.message)
      return DEV_FALLBACK
    }
    throw err
  }
}

/** True while the runner may use the app (anything but the paywall). */
export const canUseApp = (access) => hasAccess(access?.tier)

export const isTrial = (access) => access?.tier === 'trial'

/** Whole days left in the trial (0 when not in one). */
export function trialDaysLeft(access) {
  if (!isTrial(access) || !access.trialEndsAt) return 0
  return Math.max(0, Math.ceil((new Date(access.trialEndsAt) - new Date()) / 86_400_000))
}

/** "3. oktobra 2026" */
export function formatDateSl(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('sl-SI', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ---------------------------------------------------------------------------
// Stripe: Checkout, the Customer Portal, and the return from Checkout
// ---------------------------------------------------------------------------

/**
 * A Stripe Checkout page for this plan: 14-day trial when the account has
 * not had one, card required, founding-member code accepted.
 * @param {'start'|'pro'} tier
 * @param {'month'|'year'} interval
 * @returns {Promise<{ok: true, url: string} | {ok: false, message: string, code?: string}>}
 */
export async function startCheckout(tier, interval) {
  try {
    const { url } = await callFunction('billing', { action: 'checkout', tier, interval })
    return { ok: true, url }
  } catch (err) {
    return { ok: false, message: err.message, code: err.code }
  }
}

/** The Stripe Customer Portal: change plan, cancel, card, invoices. */
export async function openPortal() {
  try {
    const { url } = await callFunction('billing', { action: 'portal' })
    return { ok: true, url }
  } catch (err) {
    return { ok: false, message: err.message, code: err.code }
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Back from Checkout: ask the server to read the finished session (so access
 * starts even before Stripe's webhook arrives), then the access. Retries for
 * a few seconds while it still reads "none".
 */
export async function finishCheckout(sessionId) {
  if (sessionId) await callFunction('billing', { action: 'sync', sessionId }).catch(() => null)
  let access = await fetchAccess()
  for (let i = 0; i < 5 && !canUseApp(access); i++) {
    await wait(2000)
    access = await fetchAccess()
  }
  return access
}

// ---------------------------------------------------------------------------
// Kept for mobile/, which still calls these with the profile row. They read
// the retired no-card trial only; mobile moves to fetchAccess() later (see
// mobile/PROGRESS.md, "To catch up"). The web app does not use them.
// ---------------------------------------------------------------------------

/** @deprecated use fetchAccess() */
export function isTrialActive(profile) {
  return Boolean(profile?.trial_end && new Date(profile.trial_end) > new Date())
}

/** @deprecated use fetchAccess() */
export function hasActiveSubscription(profile) {
  return profile?.subscription_status === 'active'
}

/** @deprecated use canUseApp(access) */
export function hasPremium(profile) {
  return isTrialActive(profile) || hasActiveSubscription(profile)
}

/** @deprecated the retired single "Premium" plan; kept so mobile still imports. */
export const PLANS = [
  { id: 'premium_monthly', name: t.subscription.planName, price: t.subscription.price, features: t.subscription.features },
]
