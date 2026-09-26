import { Check, Gift } from '@phosphor-icons/react'
import { pricing } from '../content'
import { SignupButton } from '../ui/Buttons'
import Reveal from '../ui/Reveal'

function Tier({ tier }) {
  return (
    <div className={`l-shell h-full ${tier.featured ? '!bg-primary/[0.08] !ring-primary/30' : ''}`}>
      <div className="l-core flex flex-col p-7 md:p-9">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold tracking-tight text-zinc-50">{tier.name}</h3>
          {tier.badge && <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">{tier.badge}</span>}
        </div>
        <div className="mt-8 flex items-baseline gap-2">
          <span className={`font-semibold tracking-tight text-zinc-50 ${tier.featured ? 'text-6xl' : 'text-5xl'}`}>{tier.price}</span>
          <span className="text-zinc-400">{tier.period}</span>
        </div>
        <p className="mt-2 text-sm text-zinc-500">{tier.note}</p>
        <ul className="mb-10 mt-8 space-y-3">
          {tier.features.map((f) => (
            <li key={f} className="flex items-start gap-3 text-zinc-300">
              <Check size={18} weight="bold" className="mt-0.5 shrink-0 text-primary" />
              {f}
            </li>
          ))}
        </ul>
        <SignupButton className="mt-auto justify-between self-stretch sm:self-start" />
      </div>
    </div>
  )
}

/**
 * The free month runs across the top as a band; the two paid tiers sit under
 * it at unequal widths, the featured one wider. Prices live in content.js.
 */
export default function Pricing() {
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

      <div className="mt-4 grid gap-4 md:grid-cols-5">
        {pricing.tiers.map((tier, i) => (
          <Reveal key={tier.key} delay={i * 90} className={tier.featured ? 'md:col-span-3' : 'md:col-span-2'}>
            <Tier tier={tier} />
          </Reveal>
        ))}
      </div>
    </section>
  )
}
