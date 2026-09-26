import { useEffect, useRef, useState } from 'react'
import { Flag, ListChecks, NotePencil, ArrowsClockwise } from '@phosphor-icons/react'
import { how, slots } from '../content'
import PhoneFrame from '../ui/PhoneFrame'
import Reveal from '../ui/Reveal'
import { AdaptScreen, LogScreen, OnboardingScreen, PlanOverviewScreen } from '../ui/screens'

const STEP_ICON = { goal: Flag, plan: ListChecks, log: NotePencil, adapt: ArrowsClockwise }
const STEP_SCREEN = { goal: OnboardingScreen, plan: PlanOverviewScreen, log: LogScreen, adapt: AdaptScreen }

/** Desktop pinned section: how far you scroll per step, in viewport heights. */
const VH_PER_STEP = 42

/**
 * Below lg: plain stacked steps, each with a cropped view of its screen (the
 * step nearest the middle of the screen is lit).
 *
 * lg and up: one pinned stage. The text column and the phone stay put while
 * the page scrolls; each step takes VH_PER_STEP of scrolling, and the phone
 * cross-fades to that step's screen. Invisible sentinels along the track tell
 * an IntersectionObserver which step owns the middle of the viewport.
 */
export default function HowItWorks() {
  // Below lg
  const [active, setActive] = useState(0)
  const stepRefs = useRef([])
  // lg and up
  const [stage, setStage] = useState(0)
  const sentinelRefs = useRef([])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number(e.target.dataset.step))
        }
      },
      { rootMargin: '-45% 0px -45% 0px' }
    )
    stepRefs.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setStage(Number(e.target.dataset.stage))
        }
      },
      { rootMargin: '-49.5% 0px -49.5% 0px' }
    )
    sentinelRefs.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [])

  const n = how.steps.length
  const half = VH_PER_STEP / 2

  return (
    <section id={how.id} className="l-section">
      <Reveal className="max-w-3xl">
        <h2 className="l-h2">{how.title}</h2>
        <p className="l-lead">{how.intro}</p>
      </Reveal>

      {/* Below lg */}
      <div className="mt-16 grid gap-16 lg:hidden">
        <ol>
          {how.steps.map((step, i) => {
            const Icon = STEP_ICON[step.key]
            const Screen = STEP_SCREEN[step.key]
            const on = active === i
            return (
              <li key={step.key} ref={(el) => (stepRefs.current[i] = el)} data-step={i} className="py-8">
                <div className="max-w-md transition duration-700 ease-out">
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-full ring-1 ring-inset transition duration-700 ease-out ${
                      on ? 'bg-primary text-white ring-primary' : 'bg-white/[0.04] text-zinc-300 ring-white/10'
                    }`}
                  >
                    <Icon size={22} />
                  </span>
                  <h3 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-50 md:text-3xl">{step.title}</h3>
                  <p className="mt-3 text-lg leading-relaxed text-zinc-400">{step.text}</p>
                </div>

                <div className="relative mt-8 h-[380px] overflow-hidden">
                  <div className="mx-auto w-[250px]">
                    <PhoneFrame
                      label={`${how.phoneLabel}: ${step.title}`}
                      src={slots.howPhones[step.key]}
                      className="aspect-[300/620]"
                    >
                      <Screen />
                    </PhoneFrame>
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-canvas to-transparent" />
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      {/* lg and up: pinned stage */}
      <div data-desktop className="relative mt-10 hidden lg:block" style={{ height: `calc(100dvh + ${(n - 1) * VH_PER_STEP}vh)` }}>
        {/* Sentinels: step i owns the viewport middle while it sits in its band. */}
        {how.steps.map((step, i) => (
          <div
            key={step.key}
            ref={(el) => (sentinelRefs.current[i] = el)}
            data-stage={i}
            aria-hidden
            className="pointer-events-none absolute inset-x-0"
            style={{
              top: i === 0 ? 0 : `${50 + (i - 0.5) * VH_PER_STEP}vh`,
              height: i === 0 ? `${50 + half}vh` : i === n - 1 ? `${50 + half}vh` : `${VH_PER_STEP}vh`,
            }}
          />
        ))}

        <div className="sticky top-0 flex h-[100dvh] items-center">
          <div className="grid w-full grid-cols-2 items-center gap-16">
            <ol className="justify-self-end">
              {how.steps.map((step, i) => {
                const Icon = STEP_ICON[step.key]
                const on = stage === i
                return (
                  <li
                    key={step.key}
                    className={`flex max-w-md gap-6 border-l-2 py-6 pl-8 transition duration-700 ease-out ${
                      on ? 'border-primary opacity-100' : 'border-white/10 opacity-30'
                    }`}
                  >
                    <span
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-1 ring-inset transition duration-700 ease-out ${
                        on ? 'bg-primary text-white ring-primary' : 'bg-white/[0.04] text-zinc-300 ring-white/10'
                      }`}
                    >
                      <Icon size={22} />
                    </span>
                    <div>
                      <h3 className="text-2xl font-semibold tracking-tight text-zinc-50 xl:text-3xl">{step.title}</h3>
                      <p className="mt-2 text-lg leading-relaxed text-zinc-400">{step.text}</p>
                    </div>
                  </li>
                )
              })}
            </ol>

            <div className="justify-self-start">
              <div className="w-[300px]">
                <PhoneFrame label={`${how.phoneLabel}: ${how.steps[stage].title}`} className="aspect-[300/620]">
                  {how.steps.map((step, i) => {
                    const Screen = STEP_SCREEN[step.key]
                    const src = slots.howPhones[step.key]
                    return (
                      <div
                        key={step.key}
                        data-screen={step.key}
                        className={`absolute inset-0 transition duration-700 ease-out ${
                          stage === i ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-[0.98] opacity-0'
                        }`}
                      >
                        {src ? <img src={src} alt="" className="h-full w-full object-cover object-top" /> : <Screen />}
                      </div>
                    )
                  })}
                </PhoneFrame>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
