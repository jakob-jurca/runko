import { trust } from '../content'
import Reveal from '../ui/Reveal'

/**
 * Three proof points directly under the hero. Hairline columns, not cards:
 * nothing here is elevated above anything else.
 */
export default function TrustStrip() {
  return (
    <section aria-label={trust.label} className="mx-auto w-full max-w-page px-4 sm:px-6 lg:px-10">
      <ul className="grid border-y border-white/[0.07] md:grid-cols-3">
        {trust.items.map((item, i) => (
          <Reveal
            as="li"
            key={item.key}
            delay={i * 90}
            className={`py-8 md:px-8 md:py-10 ${i > 0 ? 'border-t border-white/[0.07] md:border-l md:border-t-0' : 'md:pl-0'}`}
          >
            <div className="text-xl font-semibold tracking-tight text-zinc-50 md:text-2xl">{item.value}</div>
            <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-zinc-400">{item.text}</p>
          </Reveal>
        ))}
      </ul>
    </section>
  )
}
