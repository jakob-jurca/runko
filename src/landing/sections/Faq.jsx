import { Plus } from '@phosphor-icons/react'
import { faq } from '../content'
import Reveal from '../ui/Reveal'

/**
 * Native <details>: keyboard and screen-reader support for free, works
 * without JS. Phase 2 can animate the open state on top of it.
 */
export default function Faq() {
  return (
    <section id={faq.id} className="l-section">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
        <Reveal className="lg:sticky lg:top-28 lg:col-span-4 lg:self-start">
          <h2 className="l-h2">{faq.title}</h2>
        </Reveal>

        <Reveal className="lg:col-span-7 lg:col-start-6">
          <div className="divide-y divide-white/[0.07]">
            {faq.items.map((item) => (
              <details key={item.q} className="group py-2">
                <summary className="flex min-h-[64px] cursor-pointer list-none items-center justify-between gap-6 rounded-2xl py-3 text-left text-lg font-medium text-zinc-100 [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-zinc-300 ring-1 ring-inset ring-white/10 transition duration-500 ease-out group-open:rotate-45 group-open:bg-primary group-open:text-white group-open:ring-primary">
                    <Plus size={16} weight="bold" />
                  </span>
                </summary>
                <p className="max-w-[60ch] pb-5 pr-12 leading-relaxed text-zinc-400">{item.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
