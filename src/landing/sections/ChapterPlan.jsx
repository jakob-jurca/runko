import { plan, mock } from '../content'
import Reveal from '../ui/Reveal'
import { Play } from '../ui/motion'
import { PhaseBars, TYPE_RAIL } from '../ui/screens'

/** A point on the gauge's half circle, t = 0 (left) .. 1 (right). */
function arcPoint(t, r = 80) {
  const a = Math.PI * t
  return [100 - r * Math.cos(a), 100 - r * Math.sin(a)]
}
function arcPath(t0, t1) {
  const [x0, y0] = arcPoint(t0)
  const [x1, y1] = arcPoint(t1)
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A 80 80 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

/** Zone colours match the verdict colours in the app (pages/Plan.jsx). */
const ZONES = [
  { from: 0, to: 0.58, stroke: 'stroke-emerald-400' },
  { from: 0.61, to: 0.8, stroke: 'stroke-amber-400' },
  { from: 0.83, to: 1, stroke: 'stroke-rose-400' },
]
const NEEDLE_AT = 0.36 // example: comfortably feasible

function FeasibilityGauge() {
  return (
    <svg viewBox="0 0 200 112" className="w-full max-w-[280px]" aria-hidden>
      {ZONES.map((z, i) => (
        <path
          key={z.from}
          d={arcPath(z.from, z.to)}
          pathLength="1"
          style={{ '--i': i }}
          className={`${z.stroke} l-draw fill-none`}
          strokeWidth="14"
          opacity="0.9"
        />
      ))}
      {/* The needle starts pointing left and swings to its angle (--r) once in view. */}
      <line
        x1="100"
        y1="100"
        x2="38"
        y2="100"
        style={{ '--r': `${NEEDLE_AT * 180}deg` }}
        className="l-needle stroke-zinc-50"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="100" cy="100" r="7" className="fill-zinc-50" />
    </svg>
  )
}

/** The week as seven small columns: bar height is the day's km. */
function WeekColumns() {
  const days = mock.week.days
  const km = (d) => parseFloat(d.km) || 0
  const max = Math.max(...days.map(km))
  return (
    <div className="flex h-32 items-end gap-2">
      {days.map((d, i) => (
        <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
          <div className="flex h-24 w-full items-end">
            {d.type === 'rest' ? (
              <div style={{ '--i': i }} className="l-tick mx-auto h-1.5 w-1.5 rounded-full bg-zinc-700" />
            ) : (
              <div
                style={{ height: `${(km(d) / max) * 100}%`, '--i': i, '--d': '150ms' }}
                className={`l-grow w-full rounded-md ${TYPE_RAIL[d.type]}`}
              />
            )}
          </div>
          <span style={{ '--i': i }} className={`l-tick text-[11px] font-medium ${d.today ? 'text-primary' : 'text-zinc-500'}`}>
            {d.day}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Bento: four tiles, four cells. lg is a 6-column grid: the phases chart
 * runs wide, the feasibility gauge stands tall on the right, effort and the
 * week sit under the chart. md: 2 columns (chart and gauge full width).
 * Below md: one column.
 */
export default function ChapterPlan() {
  return (
    <section id={plan.id} className="l-section">
      <Reveal className="max-w-3xl">
        <span className="l-eyebrow">{plan.eyebrow}</span>
        <h2 className="l-h2">{plan.title}</h2>
        <p className="l-lead">{plan.intro}</p>
      </Reveal>

      <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-6 lg:grid-rows-[auto_auto]">
        {/* Phases chart: dot-grid texture behind the bars. */}
        <Reveal className="l-shell md:col-span-2 lg:col-span-4">
          <Play
            amount={0.3}
            className="l-core p-6 md:p-8"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
          >
            <h3 className="text-xl font-semibold tracking-tight text-zinc-50">{plan.phases.title}</h3>
            <p className="mt-1.5 text-sm text-zinc-400">{plan.phases.text}</p>
            <div className="mt-8">
              <PhaseBars height="h-40 md:h-48" gap="gap-1 md:gap-1.5" showLabels />
            </div>
            <div className="mt-3 text-right font-mono text-[11px] text-zinc-600">{plan.phases.axis}</div>
          </Play>
        </Reveal>

        {/* Feasibility: the one orange-tinted tile. */}
        <Reveal delay={90} className="l-shell md:col-span-2 lg:col-span-2 lg:row-span-2">
          <Play amount={0.3} className="l-core flex flex-col bg-[linear-gradient(160deg,rgba(249,115,22,0.16),rgba(249,115,22,0.03)_55%,transparent)] p-6 md:flex-row md:items-center md:gap-10 md:p-8 lg:flex-col lg:items-start lg:gap-0">
            <div className="md:flex-1 lg:flex-none">
              <h3 className="text-xl font-semibold tracking-tight text-zinc-50">{plan.feasibility.title}</h3>
              <p className="mt-1.5 text-sm text-zinc-400">{plan.feasibility.text}</p>
            </div>
            <div className="mt-10 flex flex-col items-center md:mt-0 md:flex-1 lg:mt-auto lg:w-full lg:pt-10">
              <FeasibilityGauge />
              <div style={{ '--d': '1600ms' }} className="l-tick mt-4 text-4xl font-semibold tracking-tight text-emerald-400">{plan.feasibility.verdict}</div>
              <div className="mt-1 text-center text-sm text-zinc-400">{plan.feasibility.detail}</div>
              <div className="mt-6 flex gap-4 text-[11px] font-medium">
                <span className="text-emerald-400">{plan.feasibility.zones[0]}</span>
                <span className="text-amber-400">{plan.feasibility.zones[1]}</span>
                <span className="text-rose-400">{plan.feasibility.zones[2]}</span>
              </div>
            </div>
          </Play>
        </Reveal>

        {/* Effort by feel: RPE scale and the talk test. */}
        <Reveal delay={60} className="l-shell lg:col-span-2">
          <Play amount={0.3} className="l-core p-6">
            <h3 className="text-lg font-semibold tracking-tight text-zinc-50">{plan.effort.title}</h3>
            <p className="mt-1.5 text-sm text-zinc-400">{plan.effort.text}</p>
            <div className="mt-6 text-[11px] font-medium text-zinc-500">{plan.effort.scaleLabel}</div>
            <div className="mt-2 grid grid-cols-10 gap-1">
              {Array.from({ length: 10 }, (_, i) => (
                <div
                  key={i}
                  className="l-tick h-2 rounded-full bg-primary"
                  style={{ opacity: 0.15 + (i / 9) * 0.85, '--i': i }}
                />
              ))}
            </div>
            <ul className="mt-5 space-y-2.5">
              {plan.effort.levels.map((l) => (
                <li key={l.range} className="flex gap-3 text-sm">
                  <span className="w-8 shrink-0 font-mono font-semibold text-zinc-100">{l.range}</span>
                  <span className="text-zinc-400">{l.talk}</span>
                </li>
              ))}
            </ul>
          </Play>
        </Reveal>

        {/* The week at a glance. */}
        <Reveal delay={120} className="l-shell lg:col-span-2">
          <Play amount={0.3} className="l-core p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-zinc-50">{plan.week.title}</h3>
                <p className="mt-1.5 text-sm text-zinc-400">{plan.week.text}</p>
              </div>
              <div className="shrink-0 font-mono text-2xl font-semibold text-zinc-50">{mock.week.total}</div>
            </div>
            <div className="mt-6">
              <WeekColumns />
            </div>
          </Play>
        </Reveal>
      </div>
    </section>
  )
}
