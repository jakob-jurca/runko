import { useState } from 'react'
import { ArrowUpRight, CalendarCheck, Check, CreditCard, HandWaving, Minus, Sparkle } from '@phosphor-icons/react'
import { pricing, cta } from '../content'
import { PLANS, FEATURES, displayPrice, FOUNDING_NOTE } from '../../core/pricing'
import Reveal from '../ui/Reveal'

const FACT_ICONS = { trial: CalendarCheck, card: CreditCard, cancel: HandWaving }

/**
 * Yearly / monthly as one pill with a sliding thumb. The thumb moves with
 * transform only, on the page's one easing curve (landing.css .l-thumb).
 */
function IntervalSwitch({ value, onChange }) {
  const options = [
    { id: 'year', label: pricing.yearly, hint: pricing.yearlyHint },
    { id: 'month', label: pricing.monthly },
  ]
  return (
    <div
      role="radiogroup"
      aria-label={pricing.toggleLabel}
      className="relative grid w-full grid-cols-2 rounded-full bg-white/[0.04] p-1 ring-1 ring-inset ring-white/[0.08] sm:w-auto"
    >
      <span
        aria-hidden
        className="l-thumb pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-zinc-50 shadow-[0_8px_24px_-12px_rgba(249,115,22,0.45)]"
        style={{ transform: value === 'month' ? 'translateX(100%)' : 'translateX(0)' }}
      />
      {options.map((o) => {
        const on = value === o.id
        return (
          <button
            key={o.id}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={`relative z-[1] flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-semibold transition-colors duration-500 sm:px-7 ${
              on ? 'text-canvas' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {o.label}
            {o.hint && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${on ? 'bg-primary text-white' : 'bg-primary-faint text-primary-light'}`}>
                {o.hint}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** One feature line: a check, the feature, and its amount for this plan. */
function FeatureRow({ feature, tier, featured }) {
  const v = feature[tier]
  const included = Boolean(v)
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          included ? (featured ? 'bg-primary text-white' : 'bg-white/[0.08] text-zinc-200') : 'bg-transparent text-zinc-600 ring-1 ring-inset ring-white/10'
        }`}
      >
        {included ? <Check size={12} weight="bold" /> : <Minus size={12} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={included ? 'text-zinc-200' : 'text-zinc-500'}>{feature.label}</span>
        {typeof v === 'string' && (
          <span className={`mt-0.5 block text-sm font-medium ${featured ? 'text-primary-light' : 'text-zinc-400'}`}>{v}</span>
        )}
        {!included && <span className="mt-0.5 block text-sm text-zinc-600">{pricing.notIncluded}</span>}
      </span>
    </li>
  )
}

function PlanCard({ plan, interval }) {
  const price = displayPrice(plan.tier, interval)
  const featured = Boolean(plan.featured)
  return (
    <div
      className={`l-lift h-full rounded-[2rem] p-1.5 ring-1 ring-inset ${
        featured ? 'bg-primary/[0.09] ring-primary/30' : 'bg-white/[0.025] ring-white/[0.06]'
      }`}
    >
      <div className="relative flex h-full flex-col overflow-hidden rounded-[calc(2rem-0.375rem)] bg-surface p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:p-9">
        {/* Pro is the recommendation: a warm light from the top corner, not a glow around the card. */}
        {featured && (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgba(249,115,22,0.22),transparent)]"
          />
        )}

        <div className="relative flex items-center justify-between gap-3">
          <h3 className="text-2xl font-semibold tracking-tight text-zinc-50">{plan.name}</h3>
          {featured && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
              <Sparkle size={12} weight="fill" />
              {pricing.featuredBadge}
            </span>
          )}
        </div>
        <p className="relative mt-2 max-w-[38ch] text-sm leading-relaxed text-zinc-400">{plan.tagline}</p>

        {/* Keyed on the interval so the number settles in again when it changes. */}
        <div key={interval} className="l-swap relative mt-8">
          <p className="flex items-baseline gap-2">
            <span className={`font-semibold tracking-tight text-zinc-50 ${featured ? 'text-6xl md:text-7xl' : 'text-5xl md:text-6xl'}`}>
              {price.main.replace(' €', '')}
              <span className="ml-1 text-[0.45em] font-medium text-zinc-300">€</span>
            </span>
            <span className="text-zinc-400">{pricing.perMonth}</span>
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            {interval === 'year' ? pricing.billedYearly(price.billed.replace(' letno', ''), price.saving) : pricing.billedMonthly}
          </p>
        </div>

        <ul className="relative mb-9 mt-7 border-t border-white/[0.06] pt-3">
          {FEATURES.map((f) => (
            <FeatureRow key={f.key} feature={f} tier={plan.tier} featured={featured} />
          ))}
        </ul>

        <a
          href={cta.signupHref}
          className={`group relative mt-auto ${featured ? 'l-btn-primary' : 'l-btn-ghost !pr-1.5'} w-full justify-between sm:w-auto sm:self-start`}
        >
          {pricing.trialCta}
          <span className={featured ? 'l-btn-primary-icon' : 'flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] transition duration-500 group-hover:-translate-y-px group-hover:translate-x-0.5 group-hover:scale-105'} aria-hidden>
            <ArrowUpRight size={18} weight="bold" />
          </span>
        </a>
      </div>
    </div>
  )
}

/**
 * Pricing. Headline stacked over its lead; then the interval switch with the
 * founding note beside it; then Start and Pro in an asymmetric pair, Pro the
 * wider and first on phones; then what the trial means, in three facts.
 * Prices and features come from src/core/pricing.js, shared with the app's
 * paywall.
 */
export default function Pricing() {
  const [interval, setBillingInterval] = useState('year')
  const ordered = [...PLANS].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))

  return (
    <section id={pricing.id} className="l-section">
      <Reveal className="max-w-3xl">
        <h2 className="l-h2">{pricing.title}</h2>
        <p className="l-lead">{pricing.intro}</p>
      </Reveal>

      <Reveal delay={80} className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <IntervalSwitch value={interval} onChange={setBillingInterval} />
        <p className="inline-flex items-center gap-2.5 self-start rounded-full bg-white/[0.03] py-2 pl-2 pr-4 text-sm text-zinc-300 ring-1 ring-inset ring-white/[0.07] sm:self-auto">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-faint text-primary-light">
            <Sparkle size={14} weight="fill" />
          </span>
          {FOUNDING_NOTE}
        </p>
      </Reveal>

      {/* Phones and tablets: Pro first, stacked. lg+: Start narrow on the left, Pro wide on the right. */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-stretch">
        {ordered.map((plan, i) => (
          <Reveal
            key={plan.tier}
            delay={140 + i * 90}
            className={plan.featured ? 'lg:order-2 lg:col-span-7' : 'lg:order-1 lg:col-span-5'}
          >
            <PlanCard plan={plan} interval={interval} />
          </Reveal>
        ))}
      </div>

      <Reveal delay={200} className="mt-4 grid grid-cols-1 rounded-[2rem] bg-white/[0.025] ring-1 ring-inset ring-white/[0.06] lg:grid-cols-3">
        {pricing.facts.map((f, i) => {
          const Icon = FACT_ICONS[f.key]
          return (
            <div key={f.key} className={`flex items-start gap-4 p-6 lg:p-7 ${i > 0 ? 'border-t border-white/[0.06] lg:border-l lg:border-t-0' : ''}`}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-primary-light">
                <Icon size={20} weight="light" />
              </span>
              <div>
                <p className="font-semibold text-zinc-100">{f.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">{f.text}</p>
              </div>
            </div>
          )
        })}
      </Reveal>
    </section>
  )
}
