import { CheckCircle, NotePencil, ChartBar, FlagCheckered } from '@phosphor-icons/react'
import { progress, mock } from '../content'
import Reveal from '../ui/Reveal'
import { CountUp, Play } from '../ui/motion'

function CardHead({ Icon, title, text }) {
  return (
    <div>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-zinc-200 ring-1 ring-inset ring-white/10">
        <Icon size={20} />
      </span>
      <h3 className="mt-5 text-lg font-semibold tracking-tight text-zinc-50">{title}</h3>
      <p className="mt-1 text-sm text-zinc-400">{text}</p>
    </div>
  )
}

function QuickLog() {
  const l = mock.log
  return (
    <div className="mt-6 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {l.fields.slice(0, 2).map((f) => (
          <div key={f.label} className="rounded-2xl bg-canvas px-3.5 py-3">
            <div className="text-[11px] text-zinc-500">{f.label}</div>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="font-mono text-lg font-semibold text-zinc-50">{f.value}</span>
              {f.unit && <span className="text-xs text-zinc-500">{f.unit}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-canvas px-3.5 py-3">
        <span className="text-[11px] text-zinc-500">{l.effortLabel}</span>
        <span className="font-mono text-lg font-semibold text-primary">
          <CountUp value={l.effort} duration={900} />/10
        </span>
      </div>
      <div className="flex items-center gap-2 px-1 pt-2 text-sm text-emerald-300">
        <CheckCircle size={18} weight="fill" />
        {l.asPlanned}
      </div>
    </div>
  )
}

function WeeklyChart() {
  const max = Math.max(...mock.weeklyKm.map((w) => w.km))
  const s = mock.weeklySummary
  return (
    <div className="mt-6">
      <div className="flex items-baseline gap-1.5">
        <CountUp value={s.number} decimals={1} className="font-mono text-4xl font-semibold tracking-tight text-zinc-50" />
        <span className="text-sm text-zinc-500">
          {s.unit} {s.label}
        </span>
      </div>
      <div className="text-sm text-zinc-400">{s.runs}</div>
      <div className="mt-6 flex items-end gap-2">
        {mock.weeklyKm.map((w, i) => {
          const last = i === mock.weeklyKm.length - 1
          return (
            <div key={w.label} className="flex flex-1 flex-col items-center gap-2">
              {/* Fixed-height lane: a percentage height needs a parent with a real height. */}
              <div className="flex h-20 w-full items-end">
                <div
                  className={`l-grow w-full rounded-md ${last ? 'bg-primary' : 'bg-zinc-700'}`}
                  style={{ height: `${(w.km / max) * 100}%`, '--i': i }}
                />
              </div>
              <span style={{ '--i': i }} className={`l-tick text-[11px] ${last ? 'text-primary' : 'text-zinc-500'}`}>
                {w.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GoalRing() {
  const g = mock.goalProgress
  const r = 52
  const share = g.weeksDone / g.weeksTotal
  return (
    <div className="mt-6 flex items-center gap-6">
      <svg viewBox="0 0 128 128" className="h-32 w-32 shrink-0 -rotate-90" aria-hidden>
        <circle cx="64" cy="64" r={r} className="fill-none stroke-white/[0.06]" strokeWidth="10" />
        <circle
          cx="64"
          cy="64"
          r={r}
          pathLength="1"
          style={{ '--p': share }}
          className="l-ring fill-none stroke-primary"
          strokeWidth="10"
          strokeLinecap="round"
        />
      </svg>
      <div>
        <div className="font-mono text-3xl font-semibold text-zinc-50">
          <CountUp value={g.weeksDone} duration={1200} />
          <span className="text-lg text-zinc-500">/{g.weeksTotal}</span>
        </div>
        <div className="mt-1 text-sm font-medium text-zinc-200">{g.left}</div>
        <div className="mt-0.5 text-sm text-zinc-500">{g.race}</div>
      </div>
    </div>
  )
}

/**
 * Z-axis cascade on lg: three plates overlapping with small tilts, the
 * middle one lifted. Below lg: a plain stack, no tilt, no overlap.
 */
const CASCADE = [
  'lg:-rotate-2 lg:translate-y-8',
  'lg:-mx-6 lg:rotate-1 lg:-translate-y-2',
  'lg:-rotate-1 lg:translate-y-12',
]

export default function ChapterProgress() {
  const cards = [
    { key: 'log', Icon: NotePencil, ...progress.quickLog, body: <QuickLog /> },
    { key: 'weekly', Icon: ChartBar, ...progress.weekly, body: <WeeklyChart /> },
    { key: 'goal', Icon: FlagCheckered, ...progress.goal, body: <GoalRing /> },
  ]
  return (
    <section className="l-section">
      <Reveal className="max-w-3xl">
        <span className="l-eyebrow">{progress.eyebrow}</span>
        <h2 className="l-h2">{progress.title}</h2>
        <p className="l-lead">{progress.intro}</p>
      </Reveal>

      <div className="mt-14 grid gap-4 md:grid-cols-2 lg:mt-10 lg:grid-cols-3 lg:gap-0 lg:pb-12">
        {cards.map((card, i) => (
          <Reveal key={card.key} delay={i * 110} className={`relative ${i === 1 ? 'lg:z-10' : ''} ${i === 2 ? 'md:col-span-2 lg:col-span-1' : ''}`}>
            <div className={`l-shell transition duration-700 ease-out ${CASCADE[i]} lg:hover:rotate-0`}>
              <div className="l-core p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_40px_80px_-30px_rgba(0,0,0,0.9)] md:p-7">
                <CardHead Icon={card.Icon} title={card.title} text={card.text} />
                <Play amount={0.5}>{card.body}</Play>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
