import { CalendarBlank, Flag, Gauge, Timer } from '@phosphor-icons/react'
import { cta, hero, how, slots } from '../content'
import { SignupButton } from '../ui/Buttons'
import PhoneFrame from '../ui/PhoneFrame'
import { PlanWeekScreen } from '../ui/screens'

const INPUT_ICON = { goal: Flag, date: CalendarBlank, fitness: Gauge, time: Timer }

/**
 * Where each input card floats.
 *
 * Small screens: the wrapper has vertical padding and the cards sit in that
 * padding, two above the phone and two below, overlapping only its empty
 * status bar and empty bottom edge, so the whole plan stays readable.
 * lg: a loose cascade around the phone with small tilts.
 *
 * --dx / --dy: where this card's data packet travels, from the card's centre
 * to the middle of the phone (pixels, measured for each layout).
 */
const INPUT_POS = {
  goal: 'left-0 top-0 lg:-left-24 lg:top-[2%] lg:-rotate-3 [--dx:77px] [--dy:282px] lg:[--dx:261px] lg:[--dy:265px]',
  date: 'right-0 top-[30px] lg:-right-4 lg:top-[26%] lg:rotate-2 [--dx:-91px] [--dy:252px] lg:[--dx:-179px] lg:[--dy:123px]',
  fitness:
    'bottom-[30px] left-0 lg:bottom-auto lg:-left-6 lg:top-[58%] lg:rotate-2 [--dx:77px] [--dy:-252px] lg:[--dx:200px] lg:[--dy:-76px]',
  time: 'bottom-0 right-0 lg:bottom-auto lg:-right-2 lg:top-[76%] lg:-rotate-2 [--dx:-91px] [--dy:-282px] lg:[--dx:-173px] lg:[--dy:-187px]',
}

function InputCard({ item, index }) {
  const Icon = INPUT_ICON[item.key]
  return (
    <div
      data-anim="hero-input"
      data-input={item.key}
      style={{ '--i': index }}
      className={`absolute z-10 ${INPUT_POS[item.key]}`}
    >
      {/* Inner layer drifts, so the entry animation and the tilt above stay untouched. */}
      <div data-anim="hero-float" style={{ '--i': index, '--fx': index % 2 ? '-5px' : '5px' }} className="relative">
        <div className="l-shell !rounded-[1.25rem] !p-1">
          <div className="flex items-center gap-2.5 rounded-[1rem] bg-surface-raised/95 py-2 pl-2 pr-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_20px_40px_-12px_rgba(0,0,0,0.8)] sm:py-2.5 sm:pr-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-faint text-primary">
              <Icon size={16} weight="regular" />
            </span>
            <span>
              <span className="block text-[10px] font-medium text-zinc-500 sm:text-[11px]">{item.label}</span>
              <span className="block whitespace-nowrap text-[12px] font-semibold text-zinc-100 sm:text-sm">{item.value}</span>
            </span>
          </div>
        </div>
        {/* The data packet: leaves the card once it has landed and flows into the phone. */}
        <span
          aria-hidden
          style={{ '--i': index }}
          className="l-packet pointer-events-none absolute left-1/2 top-1/2 -ml-1 -mt-1 h-2 w-2 rounded-full bg-primary opacity-0 shadow-[0_0_12px_2px_rgba(249,115,22,0.6)]"
        />
      </div>
    </div>
  )
}

export default function Hero() {
  return (
    <section id="top" className="relative mx-auto w-full max-w-page px-4 pb-20 pt-28 sm:px-6 md:pb-28 lg:px-10 lg:pt-32">
      <div className="grid items-center gap-4 lg:grid-cols-[1.1fr_1fr] lg:gap-8">
        <div data-anim="hero-copy">
          <h1
            style={{ '--i': 0 }}
            className="text-[2.6rem] font-semibold leading-[1.02] tracking-tight text-zinc-50 sm:text-5xl lg:text-6xl xl:text-[4.25rem]"
          >
            {hero.titleStart} <span className="text-primary">{hero.titleAccent}</span>
          </h1>
          <p style={{ '--i': 1 }} className="mt-6 max-w-[44ch] text-lg leading-relaxed text-zinc-400 md:text-xl">
            {hero.subtitle}
          </p>
          <div style={{ '--i': 2 }} className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <SignupButton className="justify-between sm:justify-start" />
            <a href={`#${how.id}`} className="l-btn-ghost">
              {cta.howItWorks}
            </a>
          </div>
        </div>

        {/* Phone + floating inputs. Vertical padding below lg makes room for the cards. */}
        <div className="relative mx-auto w-full max-w-[400px] py-16 lg:max-w-[540px] lg:py-0">
          <div data-anim="hero-phone" className="mx-auto w-[236px] sm:w-[270px] lg:w-[300px]">
            <PhoneFrame label={hero.phoneLabel} src={slots.heroPhone} className="aspect-[300/620]">
              <PlanWeekScreen />
            </PhoneFrame>
          </div>
          {hero.inputs.map((item, i) => (
            <InputCard key={item.key} item={item} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
