import { useState } from 'react'
import { PLANS, startCheckout } from '../core/subscription'
import { Check, LockKey } from '@phosphor-icons/react'
import { t } from '../core/strings'

/**
 * Shown when the free trial has expired and the user opens a premium feature
 * (AI coach chat, plan adaptation). Stripe-ready: the button calls
 * startCheckout(), the future Stripe redirect point.
 */
export default function Paywall({ feature = t.paywall.featureDefault }) {
  const plan = PLANS[0]
  const [notice, setNotice] = useState('')

  // core/subscription has no DOM access, so it hands back a message to show.
  const handleCheckout = async () => {
    const result = await startCheckout(plan.id)
    setNotice(result.message)
  }
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-12 animate-fade-up sm:px-6">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-faint text-primary">
        <LockKey size={28} />
      </div>

      <h1 className="text-2xl font-bold tracking-tight">{t.paywall.title}</h1>
      <p className="mt-2 max-w-[60ch] leading-relaxed text-zinc-400">{t.paywall.body(feature, plan.name)}</p>

      <div className="card mt-8 w-full text-left">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">{plan.name}</h2>
          <span className="font-mono text-lg font-semibold text-primary-light">{plan.price}</span>
        </div>
        <ul className="mt-4 space-y-2">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm leading-relaxed text-zinc-300">
              <Check size={16} weight="bold" className="mt-0.5 shrink-0 text-primary" />
              {f}
            </li>
          ))}
        </ul>
        <button onClick={handleCheckout} className="btn-primary mt-6 w-full">
          {t.paywall.subscribe}
        </button>
        {notice ? (
          <p className="mt-3 text-center text-xs text-primary-light animate-fade-in">{notice}</p>
        ) : (
          <p className="mt-3 text-center text-xs text-zinc-500">
            {t.paywall.freeNote}
          </p>
        )}
      </div>
    </div>
  )
}
