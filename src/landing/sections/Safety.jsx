import { ChatCircleText, IdentificationCard, LockKey, Info } from '@phosphor-icons/react'
import { safety } from '../content'
import Reveal from '../ui/Reveal'

const ICON = { questions: ChatCircleText, profile: IdentificationCard, gdpr: LockKey }

/**
 * Calm on purpose: no tiles, no motion beyond the reveal. A statement on the
 * left, three plain commitments on the right, and the medical note last.
 */
export default function Safety() {
  return (
    <section className="l-section">
      <div className="grid gap-14 lg:grid-cols-12 lg:gap-10">
        <Reveal className="lg:sticky lg:top-28 lg:col-span-5 lg:self-start">
          <h2 className="l-h2">{safety.title}</h2>
          <p className="l-lead">{safety.intro}</p>
        </Reveal>

        <div className="lg:col-span-6 lg:col-start-7">
          <ul className="space-y-12">
            {safety.items.map((item, i) => {
              const Icon = ICON[item.key]
              return (
                <Reveal as="li" key={item.key} delay={i * 80} className="flex gap-5">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-zinc-200 ring-1 ring-inset ring-white/10">
                    <Icon size={22} />
                  </span>
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight text-zinc-50">{item.title}</h3>
                    <p className="mt-2 leading-relaxed text-zinc-400">{item.text}</p>
                  </div>
                </Reveal>
              )
            })}
          </ul>
          <Reveal className="mt-14 flex gap-3 rounded-[1.5rem] bg-white/[0.03] p-5 text-sm leading-relaxed text-zinc-400 ring-1 ring-inset ring-white/[0.06]">
            <Info size={20} className="mt-0.5 shrink-0 text-zinc-500" />
            <p>{safety.note}</p>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
