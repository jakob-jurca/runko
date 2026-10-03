import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, Hourglass, LockKey, Minus } from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext'
import { startCheckout, openPortal } from '../core/subscription'
import { PLANS, FEATURES, displayPrice, trialCopy } from '../core/pricing'
import { t } from '../core/strings'

/**
 * The paywall: the ONLY screen a runner without access sees (tier `none`),
 * and the plan picker for anyone who wants to subscribe early (/paket).
 *
 * Two plans, yearly preselected, monthly the second option. Choosing one
 * opens Stripe Checkout (14-day trial when the account has not had one,
 * card required); a failed payment leads to the Stripe portal instead,
 * because a second Checkout would bill twice.
 *
 * Nothing is deleted when access ends: the runner's plan, runs and chats
 * are all there again once they pay.
 */
export default function Paywall() {
  const P = t.billing.paywall
  const { access, profile, signOut } = useAuth()
  const [params] = useSearchParams()
  const [interval, setBillingInterval] = useState('year')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  const a = access || {}

  // Payments switched off (PAYMENTS_ENABLED): no plans to buy yet, so no
  // Checkout buttons. A calm word that paid plans are coming, data kept.
  if (!a.paymentsEnabled) return <ComingSoon ended={a.tier === 'none'} onSignOut={signOut} />

  const fixPayment = a.paymentFailed && a.hasCustomer
  // Someone who had access before (old trial, a cancelled plan): their data waits for them.
  const returning = Boolean(profile) || Boolean(a.status)
  const title = fixPayment ? P.titlePayment : a.tier !== 'none' ? P.titleChoose : returning ? P.titleEnded : P.titleNew
  const cancelled = params.get('checkout') === 'cancel'

  const go = async (key, action) => {
    setBusy(key)
    setError('')
    const result = await action()
    if (result.ok) {
      window.location.assign(result.url)
      return
    }
    setBusy(null)
    setError(result.message)
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] animate-fade-up sm:px-6">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-faint text-primary">
        <LockKey size={24} />
      </div>
      <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{title}</h1>
      <p className="mt-2 max-w-[60ch] leading-relaxed text-zinc-400">
        {fixPayment ? P.bodyPayment : returning ? P.bodyEnded : P.bodyNew}
      </p>
      {cancelled && <p className="mt-3 text-sm text-amber-200">{P.checkoutCancelled}</p>}

      {fixPayment ? (
        <button onClick={() => go('portal', openPortal)} disabled={Boolean(busy)} className="btn-primary mt-8 w-full sm:w-auto">
          {busy ? t.billing.opening : P.updatePayment}
        </button>
      ) : (
        <>
          {/* Yearly first and preselected, monthly the second option. */}
          <div role="radiogroup" aria-label={P.intervalLabel} className="mt-8 inline-flex self-start rounded-full bg-surface p-1 ring-1 ring-inset ring-surface-line">
            {[
              { id: 'year', label: P.yearly },
              { id: 'month', label: P.monthly },
            ].map((o) => (
              <button
                key={o.id}
                role="radio"
                aria-checked={interval === o.id}
                onClick={() => setBillingInterval(o.id)}
                className={`min-h-[40px] rounded-full px-5 text-sm font-semibold transition ${
                  interval === o.id ? 'bg-primary text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {PLANS.map((plan) => {
              const price = displayPrice(plan.tier, interval)
              const key = `${plan.tier}-${interval}`
              return (
                <section
                  key={plan.tier}
                  className={`card flex flex-col ${plan.featured ? 'ring-1 ring-inset ring-primary/40' : ''}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold">{plan.name}</h2>
                    {price.saving && (
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                        {price.saving}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-zinc-400">{plan.tagline}</p>
                  <p className="mt-5 flex items-baseline gap-1">
                    <span className="font-mono text-3xl font-semibold text-zinc-50">{price.main}</span>
                    <span className="text-sm text-zinc-400">{price.unit}</span>
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{interval === 'year' ? P.billedYearly(price.billed) : P.billedMonthly}</p>
                  <ul className="mb-6 mt-5 space-y-2.5">
                    {FEATURES.map((f) => {
                      const v = f[plan.tier]
                      return (
                        <li key={f.key} className={`flex items-start gap-2.5 text-sm leading-relaxed ${v ? 'text-zinc-200' : 'text-zinc-600'}`}>
                          {v ? (
                            <Check size={16} weight="bold" className="mt-0.5 shrink-0 text-primary" />
                          ) : (
                            <Minus size={16} className="mt-0.5 shrink-0" />
                          )}
                          <span>
                            {f.label}
                            {typeof v === 'string' && <span className="text-zinc-400">: {v}</span>}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                  <button
                    onClick={() => go(key, () => startCheckout(plan.tier, interval))}
                    disabled={Boolean(busy)}
                    className={`${plan.featured ? 'btn-primary' : 'btn-ghost'} mt-auto w-full`}
                  >
                    {busy === key ? t.billing.opening : a.trialAvailable ? P.startTrial : P.choose(plan.name)}
                  </button>
                </section>
              )
            })}
          </div>

          <p className="mt-5 max-w-[65ch] text-sm leading-relaxed text-zinc-300">
            {a.trialAvailable ? trialCopy(true).line : P.noTrialLine}
          </p>
          <p className="mt-2 text-xs text-zinc-500">{P.promoHint}</p>
        </>
      )}

      {error && <p className="mt-4 text-sm text-rose-300" role="alert">{error}</p>}

      <button onClick={signOut} className="mt-10 self-start text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-300">
        {t.settings.signOut}
      </button>
    </main>
  )
}

/**
 * While payments are off: the trial has ended (or someone opened /paket),
 * paid plans are not on sale yet. Nothing to click but sign out.
 */
function ComingSoon({ ended, onSignOut }) {
  const C = t.billing.comingSoon
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4 py-10 animate-fade-up sm:px-6">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-faint text-primary">
        <Hourglass size={24} />
      </div>
      <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight">{ended ? C.titleEnded : C.title}</h1>
      <p className="mt-3 leading-relaxed text-zinc-400">{C.body}</p>
      {ended && <p className="mt-3 leading-relaxed text-zinc-400">{C.data}</p>}
      <button onClick={onSignOut} className="mt-10 self-start text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-300">
        {t.settings.signOut}
      </button>
    </main>
  )
}
