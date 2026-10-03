import { useState } from 'react'
import { Check, Gift, Minus, Sparkle } from '@phosphor-icons/react'
import { pricing } from '../content'
import { PLANS, FEATURES, displayPrice, FOUNDING_NOTE } from '../../core/pricing'
import { SignupButton } from '../ui/Buttons'
import Reveal from '../ui/Reveal'

function Tier({ plan, interval }) {
  const price = displayPrice(plan.tier, interval)
  return (
    <div className={`l-shell h-full ${plan.featured ? '!bg-primary/[0.08] !ring-primary/30' : ''}`}>
      <div className="l-core flex h-full flex-col p-7 md:p-9">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold tracking-tight text-zinc-50">{plan.name}</h3>
          {plan.featured && <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">{pricing.featuredBadge}</span>}
        </div>
        <p className="mt-2 text-sm text-zinc-400">{plan.tagline}</p>
        <div className="mt-8 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={`font-semibold tracking-tight text-zinc-50 ${plan.featured ? 'text-6xl' : 'text-5xl'}`}>{price.main}</span>
          <span className="text-zinc-400">{pricing.perMonth}</span>
          {price.saving && (
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">{price.saving}</span>
          )}
        </div>
        <p className="mt-2 text-sm text-zinc-500">{interval === 'year' ? pricing.billedYearly(price.billed) : pricing.billedMonthly}</p>
        <ul className="mb-10 mt-8 space-y-3">
          {FEATURES.map((f) => {
            const v = f[plan.tier]
            return (
              <li key={f.key} className={`flex items-start gap-3 ${v ? 'text-zinc-300' : 'text-zinc-600'}`}>
                {v ? (
                  <Check size={18} weight="bold" className="mt-0.5 shrink-0 text-primary" />
                ) : (
                  <Minus size={18} className="mt-0.5 shrink-0" />
                )}
                <span>
                  {f.label}
                  {typeof v === 'string' && <span className="text-zinc-500">: {v}</span>}
                </span>
              </li>
            )
          })}
        </ul>
        <SignupButton className="mt-auto justify-between self-stretch sm:self-start" />
      </div>
    </div>
  )
}

/**
 * The 14-day trial as a band across the top, a yearly / monthly switch
 * (yearly first and selected), then Start and Pro, Pro the wider one.
 * Prices and features come from src/core/pricing.js, the same file the
 * app's paywall uses.
 */
export default function Pricing() {
  const [interval, setBillingInterval] = useState('year')
  return (
    <section id={pricing.id} className="l-section">
      <Reveal className="max-w-3xl">
        <h2 className="l-h2">{pricing.title}</h2>
        <p className="l-lead">{pricing.intro}</p>
      </Reveal>

      <Reveal className="mt-14 flex flex-col gap-5 rounded-[2rem] bg-white/[0.03] p-6 ring-1 ring-inset ring-white/[0.07] sm:flex-row sm:items-center md:p-8">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-faint text-primary">
          <Gift size={26} />
        </span>
        <div>
          <h3 className="text-2xl font-semibold tracking-tight text-zinc-50">{pricing.trial.title}</h3>
          <p className="mt-1 text-zinc-400">{pricing.trial.text}</p>
        </div>
      </Reveal>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <div role="radiogroup" aria-label={pricing.toggleLabel} className="inline-flex rounded-full bg-white/[0.04] p-1 ring-1 ring-inset ring-white/[0.08]">
          {[
            { id: 'year', label: pricing.yearly },
            { id: 'month', label: pricing.monthly },
          ].map((o) => (
            <button
              key={o.id}
              role="radio"
              aria-checked={interval === o.id}
              onClick={() => setBillingInterval(o.id)}
              className={`min-h-[44px] rounded-full px-6 text-sm font-semibold transition ${
                interval === o.id ? 'bg-primary text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="flex items-center gap-2 text-sm text-zinc-300">
          <Sparkle size={16} className="shrink-0 text-amber-300" />
          {FOUNDING_NOTE}
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-5">
        {PLANS.map((plan, i) => (
          <Reveal key={plan.tier} delay={i * 90} className={plan.featured ? 'md:col-span-3' : 'md:col-span-2'}>
            <Tier plan={plan} interval={interval} />
          </Reveal>
        ))}
      </div>
    </section>
  )
}
