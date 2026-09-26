import { BatteryHigh, CalendarBlank, Check, CellSignalFull, Lightning, PencilSimple, WifiHigh } from '@phosphor-icons/react'
import { mock } from '../content'

/**
 * Mini versions of real app screens, drawn with the app's own visual
 * language (workout rails, mono figures, the same phase colours as
 * pages/Plan.jsx) so the jump from page to app feels like one product.
 * All text comes from content.js → mock.
 */

/** Same tints as components/WorkoutCard.jsx. */
export const TYPE_RAIL = {
  easy: 'bg-emerald-400/70',
  tempo: 'bg-primary',
  long: 'bg-sky-400/70',
  rest: 'bg-zinc-700',
}
export const TYPE_TEXT = {
  easy: 'text-emerald-300',
  tempo: 'text-primary-light',
  long: 'text-sky-300',
  rest: 'text-zinc-500',
}
/** Same tints as PHASE_STYLES in pages/Plan.jsx. */
export const PHASE_BAR = {
  base: 'bg-emerald-500',
  build: 'bg-primary',
  sharpen: 'bg-rose-500',
  taper: 'bg-sky-500',
}
export const PHASE_TEXT = {
  base: 'text-emerald-400',
  build: 'text-primary',
  sharpen: 'text-rose-400',
  taper: 'text-sky-400',
}

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[11px] font-semibold text-zinc-300">
      <span className="font-mono">7:42</span>
      <span className="flex items-center gap-1">
        <CellSignalFull size={12} weight="fill" />
        <WifiHigh size={12} weight="bold" />
        <BatteryHigh size={14} weight="fill" />
      </span>
    </div>
  )
}

function Screen({ children }) {
  return (
    <div className="flex h-full flex-col">
      <StatusBar />
      <div className="flex-1 overflow-hidden px-3.5 pb-4 pt-3">{children}</div>
    </div>
  )
}

/** The dashboard's week: the hero screen. */
export function PlanWeekScreen() {
  const w = mock.week
  return (
    <Screen>
      <div className="flex items-end justify-between px-1">
        <div>
          <div className="text-[11px] text-zinc-500">{w.label}</div>
          <div className="mt-0.5 text-[17px] font-semibold tracking-tight text-zinc-50">{w.phase}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[17px] font-semibold text-zinc-50">{w.total}</div>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {w.days.map((d, i) => (
          <li
            key={d.day}
            data-anim="hero-row"
            style={{ '--i': i }}
            className={`relative flex items-center gap-2.5 overflow-hidden rounded-xl py-2 pl-3.5 pr-2.5 ${
              d.today ? 'bg-surface-raised ring-1 ring-inset ring-primary/40' : d.type === 'rest' ? '' : 'bg-surface'
            }`}
          >
            {d.today && (
              <span
                data-anim="hero-ping"
                className="pointer-events-none absolute inset-0 rounded-xl opacity-0 ring-2 ring-inset ring-primary"
              />
            )}
            <span className={`absolute inset-y-2 left-1 w-[3px] rounded-full ${TYPE_RAIL[d.type]}`} />
            <span className="w-7 shrink-0 text-[10px] font-medium text-zinc-500">{d.day}</span>
            <div className="min-w-0 flex-1">
              <div className={`truncate text-[12px] font-medium ${d.type === 'rest' ? 'text-zinc-500' : 'text-zinc-100'}`}>
                {d.title}
              </div>
              {d.pace && <div className="truncate font-mono text-[10px] text-zinc-500">{d.pace}</div>}
            </div>
            {d.km && <span className="font-mono text-[12px] font-semibold text-zinc-200">{d.km}</span>}
            {d.done && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                <Check size={10} weight="bold" />
              </span>
            )}
            {d.today && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-white">{w.today}</span>
            )}
          </li>
        ))}
      </ul>
    </Screen>
  )
}

/** Onboarding: the "tell us your goal" step. */
export function OnboardingScreen() {
  const o = mock.onboarding
  return (
    <Screen>
      <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full w-2/5 rounded-full bg-primary" />
      </div>
      <div className="mt-6 px-1 text-[19px] font-semibold leading-tight tracking-tight text-zinc-50">{o.question}</div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {o.options.map((opt) => (
          <div
            key={opt}
            className={`rounded-full py-2.5 text-center text-[12px] font-medium ${
              opt === o.selected ? 'bg-primary text-white' : 'bg-surface-raised text-zinc-300 ring-1 ring-inset ring-white/10'
            }`}
          >
            {opt}
          </div>
        ))}
      </div>
      <div className="mt-5 px-1 text-[11px] font-medium text-zinc-400">{o.dateLabel}</div>
      <div className="mt-1.5 flex items-center justify-between rounded-xl bg-surface-raised px-3 py-2.5 ring-1 ring-inset ring-white/10">
        <span className="font-mono text-[13px] text-zinc-100">{o.date}</span>
        <CalendarBlank size={14} className="text-zinc-500" />
      </div>
      <div className="mt-4 px-1 text-[11px] font-medium text-zinc-400">{o.daysLabel}</div>
      <div className="mt-1.5 grid grid-cols-4 gap-1.5">
        {o.days.map((d) => (
          <div
            key={d}
            className={`rounded-full py-2 text-center font-mono text-[12px] ${
              d === o.daysSelected ? 'bg-primary font-semibold text-white' : 'bg-surface-raised text-zinc-400'
            }`}
          >
            {d}
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-full bg-primary py-2.5 text-center text-[12px] font-semibold text-white">{o.next}</div>
    </Screen>
  )
}

/** Index of a phase's first week, so the bars can grow left to right in one sweep. */
const offset = (key) => {
  let n = 0
  for (const p of mock.phases) {
    if (p.key === key) return n
    n += p.weeks.length
  }
  return n
}

/** Weekly km bars coloured by phase. Shared by the plan screen and the bento tile. */
export function PhaseBars({ height = 'h-24', showLabels = false, gap = 'gap-[3px]' }) {
  const max = Math.max(...mock.phases.flatMap((p) => p.weeks))
  return (
    <div>
      <div className={`flex items-end ${gap} ${height}`}>
        {mock.phases.flatMap((p) =>
          p.weeks.map((km, i) => (
            <div
              key={`${p.key}-${i}`}
              className={`l-grow flex-1 rounded-t-[3px] ${PHASE_BAR[p.key]} opacity-90`}
              style={{ height: `${(km / max) * 100}%`, '--i': i + offset(p.key) }}
              title={`${km} km`}
            />
          ))
        )}
      </div>
      {showLabels && (
        <div className="mt-3 flex">
          {mock.phases.map((p) => (
            <div key={p.key} style={{ flex: p.weeks.length }} className="min-w-0 pr-1">
              <div className={`h-px w-full ${PHASE_BAR[p.key]} opacity-50`} />
              <div className={`mt-1.5 truncate text-[11px] font-medium ${PHASE_TEXT[p.key]}`}>{p.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Plan overview: the whole block, by phase. */
export function PlanOverviewScreen() {
  const p = mock.planOverview
  return (
    <Screen>
      <div className="px-1">
        <div className="text-[19px] font-semibold tracking-tight text-zinc-50">{p.title}</div>
        <div className="mt-0.5 text-[11px] text-zinc-500">{p.subtitle}</div>
      </div>
      <div className="mt-4 rounded-2xl bg-surface p-3">
        <PhaseBars height="h-28" gap="gap-[2px]" />
        <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1">
          {mock.phases.map((ph) => (
            <span key={ph.key} className={`text-[10px] font-medium ${PHASE_TEXT[ph.key]}`}>
              {ph.label}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-2xl bg-surface px-3 py-3">
        <span className="text-[11px] text-zinc-500">{p.goalLabel}</span>
        <span className="font-mono text-[15px] font-semibold text-zinc-50">{p.goal}</span>
      </div>
      <div className="mt-3 space-y-1.5">
        {mock.week.days
          .filter((d) => d.type !== 'rest')
          .map((d) => (
            <div key={d.day} className="relative flex items-center gap-2 rounded-xl bg-surface py-2 pl-3.5 pr-3">
              <span className={`absolute inset-y-2 left-1 w-[3px] rounded-full ${TYPE_RAIL[d.type]}`} />
              <span className="flex-1 truncate text-[11px] text-zinc-200">{d.title}</span>
              <span className="font-mono text-[11px] text-zinc-400">{d.km}</span>
            </div>
          ))}
      </div>
    </Screen>
  )
}

/** Quick log after a run. */
export function LogScreen() {
  const l = mock.log
  return (
    <Screen>
      <div className="px-1 text-[19px] font-semibold tracking-tight text-zinc-50">{l.title}</div>
      <div className="mt-1 px-1 text-[11px] font-medium text-sky-300">{l.workout}</div>
      <div className="mt-4 space-y-2">
        {l.fields.map((f) => (
          <div key={f.label} className="rounded-xl bg-surface-raised px-3 py-2 ring-1 ring-inset ring-white/10">
            <div className="text-[10px] text-zinc-500">{f.label}</div>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-[16px] font-semibold text-zinc-50">{f.value}</span>
              {f.unit && <span className="text-[10px] text-zinc-500">{f.unit}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 px-1 text-[11px] font-medium text-zinc-400">{l.effortLabel}</div>
      <div className="mt-1.5 grid grid-cols-10 gap-[3px]">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className={`rounded-md py-1.5 text-center font-mono text-[10px] ${
              i + 1 === l.effort ? 'bg-primary font-semibold text-white' : 'bg-surface-raised text-zinc-500'
            }`}
          >
            {i + 1}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-surface px-3 py-2.5">
        <span className="text-[11px] text-zinc-300">{l.asPlanned}</span>
        <span className="flex h-[18px] w-8 items-center rounded-full bg-primary p-0.5">
          <span className="ml-auto h-[14px] w-[14px] rounded-full bg-white" />
        </span>
      </div>
      <div className="mt-4 rounded-full bg-primary py-2.5 text-center text-[12px] font-semibold text-white">{l.save}</div>
    </Screen>
  )
}

/** The coach adjusting next week after a hard run. */
export function AdaptScreen() {
  const a = mock.adapt
  return (
    <Screen>
      <div className="flex items-center gap-2 px-1">
        <img src="/runko.svg" alt="" className="h-7 w-7" />
        <span className="text-[13px] font-semibold text-zinc-100">{a.coachName}</span>
      </div>
      <div className="mt-4 rounded-2xl rounded-tl-md bg-surface-raised px-3 py-2.5 text-[12px] leading-relaxed text-zinc-200">
        {a.message}
      </div>
      <div className="mt-4 rounded-2xl bg-surface p-3 ring-1 ring-inset ring-primary/25">
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-primary-light">
          <PencilSimple size={11} weight="bold" />
          {a.changeLabel}
        </div>
        <div className="relative mt-2.5 flex items-center gap-2 rounded-xl bg-canvas py-2 pl-3.5 pr-3">
          <span className={`absolute inset-y-2 left-1 w-[3px] rounded-full ${TYPE_RAIL.long}`} />
          <span className="flex-1 text-[11px] text-zinc-200">{a.workout}</span>
          <span className="font-mono text-[11px] text-zinc-600 line-through">{a.from}</span>
          <span className="font-mono text-[12px] font-semibold text-zinc-50">{a.to}</span>
        </div>
      </div>
      <div className="mt-4 space-y-1.5 opacity-60">
        {mock.week.days.slice(1, 5).map((d) => (
          <div key={d.day} className="relative flex items-center gap-2 rounded-xl bg-surface py-2 pl-3.5 pr-3">
            <span className={`absolute inset-y-2 left-1 w-[3px] rounded-full ${TYPE_RAIL[d.type]}`} />
            <span className="w-6 text-[10px] text-zinc-500">{d.day}</span>
            <span className="flex-1 truncate text-[11px] text-zinc-300">{d.title}</span>
            {d.km && <span className="font-mono text-[11px] text-zinc-400">{d.km}</span>}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-1.5 px-1 text-[10px] text-zinc-500">
        <Lightning size={11} weight="fill" className="text-primary" />
        {a.updated}
      </div>
    </Screen>
  )
}
