import { useState } from 'react'
import { PLANS, startCheckout } from '../core/subscription'

/**
 * Shown when the free trial has expired and the user opens a premium feature
 * (AI coach chat, plan adaptation). Stripe-ready: the button calls
 * startCheckout(), the future Stripe redirect point.
 */
export default function Paywall({ feature = 'This feature' }) {
  const plan = PLANS[0]
  const [notice, setNotice] = useState('')

  // core/subscription has no DOM access, so it hands back a message to show.
  const handleCheckout = async () => {
    const result = await startCheckout(plan.id)
    setNotice(result.message)
  }
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center animate-fade-up">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-faint">
        <svg viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" className="h-8 w-8">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      </div>

      <h1 className="text-2xl font-extrabold">Your free trial has ended</h1>
      <p className="mt-2 text-zinc-400">
        {feature} is part of <span className="font-semibold text-primary">{plan.name}</span>. Keep
        your AI coach in your corner.
      </p>

      <div className="card mt-8 w-full text-left">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold">{plan.name}</h2>
          <span className="text-lg font-extrabold text-primary">{plan.price}</span>
        </div>
        <ul className="mt-4 space-y-2">
          {plan.features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-zinc-300">
              <svg viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2.5" className="h-4 w-4 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {f}
            </li>
          ))}
        </ul>
        <button onClick={handleCheckout} className="btn-primary mt-6 w-full">
          Subscribe — coming soon
        </button>
        {notice ? (
          <p className="mt-3 text-center text-xs text-primary animate-fade-in">{notice}</p>
        ) : (
          <p className="mt-3 text-center text-xs text-zinc-500">
            You keep manual logging and your current plan on the free tier.
          </p>
        )}
      </div>
    </div>
  )
}
