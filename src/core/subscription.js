/**
 * subscription.js — trial + subscription skeleton.
 *
 * Model: every signup gets a 1-month free trial (users.trial_end is set by a
 * DB default). While the trial is active — or subscription_status is
 * 'active' — the user has premium: AI chat, AI plans, plan adaptation.
 * After the trial, free tier = manual logging + static plan.
 *
 * STRIPE INTEGRATION POINT:
 * startCheckout() is where Stripe Checkout plugs in later:
 *   1. Call a backend (Supabase Edge Function) that creates a Checkout Session.
 *   2. Redirect to session.url.
 *   3. A Stripe webhook sets users.subscription_status = 'active'.
 * Nothing else in the app needs to change — all gating goes through hasPremium().
 */
import { IS_DEV } from './env'

export function isTrialActive(profile) {
  return Boolean(profile?.trial_end && new Date(profile.trial_end) > new Date())
}

export function hasActiveSubscription(profile) {
  return profile?.subscription_status === 'active'
}

/**
 * DEV ONLY — the paywall is bypassed while running `npm run dev` so premium
 * features (AI chat, AI plans, plan adaptation) are always reachable without
 * a live trial. Vite inlines import.meta.env.DEV as a literal, so this branch
 * is dead-code-eliminated from production bundles: `npm run build` restores
 * the real gating with no code change.
 */
const DEV_BYPASS_PAYWALL = IS_DEV

if (DEV_BYPASS_PAYWALL) {
  console.log('[subscription] DEV build — paywall bypassed, hasPremium() always true.')
}

/** Single source of truth for premium gating across the app. */
export function hasPremium(profile) {
  if (DEV_BYPASS_PAYWALL) return true
  return isTrialActive(profile) || hasActiveSubscription(profile)
}

export function trialDaysLeft(profile) {
  if (!profile?.trial_end) return 0
  const ms = new Date(profile.trial_end) - new Date()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

export const PLANS = [
  {
    id: 'premium_monthly',
    name: 'Runko Premium',
    price: '€7.99 / month',
    features: [
      'Unlimited AI coach chat',
      'Personalized weekly training plans',
      'Automatic plan adaptation',
      'Priority access to integrations',
    ],
  },
]

/**
 * Stripe placeholder — replace with a real Checkout Session redirect.
 *
 * Returns a result for the UI to render rather than calling alert(): core is
 * platform-agnostic and must not assume a DOM. When this becomes real it will
 * return `{ ok: true, url }` and the caller does the navigation, which is also
 * how a React Native port would open the checkout sheet.
 *
 * @returns {Promise<{ok: boolean, reason?: string, message: string}>}
 */
export async function startCheckout(planId = 'premium_monthly') {
  // STRIPE INTEGRATION POINT — see file header.
  return {
    ok: false,
    reason: 'coming_soon',
    message: `Payments are almost ready! (${planId}) Stripe checkout will be enabled in an upcoming release.`,
  }
}
