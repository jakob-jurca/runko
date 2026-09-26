import { useRef } from 'react'
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  Medal,
  PersonSimpleRun,
  SneakerMove,
  Trophy,
} from '@phosphor-icons/react'
import { audience } from '../content'
import Reveal from '../ui/Reveal'

const ICON = {
  beginner: SneakerMove,
  recreational: PersonSimpleRun,
  firstlong: Medal,
  competitive: Trophy,
  returning: ArrowCounterClockwise,
}

function Card({ item }) {
  const Icon = ICON[item.key]
  return (
    <li className="w-[82vw] max-w-[320px] shrink-0 snap-start lg:w-auto lg:max-w-none">
      <div className="l-shell l-lift h-full">
        <div className="l-core flex min-h-[380px] flex-col p-6">
          {/* Phase 3 hook: set `image` in content.js (4:5 portrait). */}
          {item.image ? (
            <img src={item.image} alt="" className="-mx-2 -mt-2 mb-6 aspect-[4/5] rounded-[1.5rem] object-cover" loading="lazy" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-faint text-primary">
              <Icon size={24} />
            </span>
          )}
          <h3 className="mt-8 text-2xl font-semibold tracking-tight text-zinc-50">{item.title}</h3>
          <p className="mb-6 mt-3 leading-relaxed text-zinc-400">{item.text}</p>
          <div className="mt-auto border-t border-white/[0.06] pt-4">
            <div className="text-xs font-medium text-zinc-500">{audience.exampleLabel}</div>
            <p className="mt-1 text-sm font-medium leading-snug text-zinc-200">{item.example}</p>
          </div>
        </div>
      </div>
    </li>
  )
}

/** Five runner types. Below lg a swipeable rail (arrow buttons from md); at lg all five fit in a row. */
export default function Audience() {
  const rail = useRef(null)

  const scroll = (dir) => {
    const el = rail.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 340), behavior: reduce ? 'auto' : 'smooth' })
  }

  return (
    <section className="l-section">
      <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <Reveal className="max-w-2xl">
          <h2 className="l-h2">{audience.title}</h2>
          <p className="l-lead">{audience.intro}</p>
        </Reveal>
        <div className="hidden gap-2 md:flex lg:hidden">
          <button type="button" onClick={() => scroll(-1)} aria-label={audience.prev} className="l-btn-ghost !w-12 !px-0">
            <ArrowLeft size={18} />
          </button>
          <button type="button" onClick={() => scroll(1)} aria-label={audience.next} className="l-btn-ghost !w-12 !px-0">
            <ArrowRight size={18} />
          </button>
        </div>
      </div>

      <Reveal>
        <ul ref={rail} className="l-rail mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 lg:grid lg:snap-none lg:grid-cols-5 lg:overflow-visible lg:pb-0">
          {audience.items.map((item) => (
            <Card key={item.key} item={item} />
          ))}
        </ul>
      </Reveal>
    </section>
  )
}
