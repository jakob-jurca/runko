import { CaretRight } from '@phosphor-icons/react'
import { t } from '../core/strings'
import { formatTrialTime, blockSummary } from '../core/goal-progress'
import { adjustmentText } from '../core/planning/goals'

const G = t.goals

/** A thin bar, 0-100. */
function Bar({ percent }) {
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-raised" aria-hidden>
      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  )
}

function Figure({ label, value, hint }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-0.5 font-mono text-xl font-semibold leading-tight tracking-tight text-zinc-50">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
    </div>
  )
}

function TimeTrial({ metric }) {
  const T = G.trial
  const a = metric.first
  const b = metric.last
  const change = metric.changeMinutes
  return (
    <div>
      <p className="text-sm font-semibold text-zinc-200">{T.title}</p>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <Figure
          label={T.first}
          value={a?.result ? formatTrialTime(a.result.minutes) : '–'}
          hint={a?.result ? null : a ? T.notYet : null}
        />
        {b && (
          <Figure
            label={T.last}
            value={b.result ? formatTrialTime(b.result.minutes) : '–'}
            hint={b.result ? null : T.planned(b.week)}
          />
        )}
      </div>
      {change !== null && (
        <p className="mt-3 text-sm text-primary-light">
          {Math.abs(change) < 1 / 60 ? T.same : T.change(change < 0, formatTrialTime(Math.abs(change)))}
        </p>
      )}
    </div>
  )
}

function LongestRun({ metric }) {
  const L = G.longest
  const { startMinutes: start, bestMinutes: best, targetMinutes: target } = metric
  const span = target && target > start ? target - start : 0
  return (
    <div>
      <p className="text-sm font-semibold text-zinc-200">{L.title}</p>
      {best > 0 ? (
        <>
          <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-zinc-50">{L.minutes(best)}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {L.start(start)}
            {target ? ` · ${L.target(target)}` : ''}
          </p>
          {span > 0 && <Bar percent={((best - start) / span) * 100} />}
        </>
      ) : (
        <p className="mt-2 text-sm text-zinc-400">{L.none}</p>
      )}
    </div>
  )
}

function Completion({ metric }) {
  const C = G.completion
  return (
    <div>
      <p className="text-sm font-semibold text-zinc-200">{C.title}</p>
      {metric.planned > 0 ? (
        <>
          <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-zinc-50">
            {C.of(metric.done, metric.planned)}
          </p>
          <Bar percent={metric.percent} />
        </>
      ) : (
        <p className="mt-2 text-sm text-zinc-400">{C.none}</p>
      )}
    </div>
  )
}

const METRICS = { time_trial: TimeTrial, longest_run: LongestRun, completion: Completion }

/** The goal's progress metric (and the secondary goal's), under the phase card. */
export function GoalProgressCard({ progress }) {
  const { goal } = progress
  return (
    <section className="mt-3 rounded-card bg-surface/60 p-5 ring-1 ring-inset ring-surface-line animate-fade-up" style={{ animationDelay: '110ms' }}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-primary-light">
          {t.goals.items[goal.main].label} · {G.progressTitle}
        </h2>
        <span className="text-xs text-zinc-500">{G.blockWeek(progress.week, progress.totalWeeks)}</span>
      </div>
      <div className="mt-4 space-y-5">
        {progress.metrics.map((m) => {
          const Metric = METRICS[m.kind]
          return <Metric key={m.kind} metric={m} />
        })}
      </div>
      {goal.adjustments?.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-surface-line pt-3 text-xs leading-relaxed text-zinc-500">
          {goal.adjustments.map((a) => (
            <p key={a.id}>{adjustmentText(a)}</p>
          ))}
        </div>
      )}
    </section>
  )
}

/** The last week of the block: how it went, and where to go next. */
export function BlockEndCard({ progress, onNext }) {
  const N = G.next
  const options = [
    { id: 'repeat', label: N.repeat, hint: N.repeatHint },
    { id: 'switch', label: N.switch, hint: N.switchHint },
    { id: 'race', label: N.race, hint: N.raceHint },
  ]
  return (
    <section className="card mt-3 animate-fade-up" style={{ animationDelay: '90ms' }}>
      <p className="text-xs font-semibold text-primary-light">{G.endTitle}</p>
      <h2 className="mt-1 text-lg font-semibold">{G.endSummaryTitle}</h2>
      <div className="mt-2 space-y-1.5 text-sm leading-relaxed text-zinc-300">
        {blockSummary(progress).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <p className="mt-5 text-sm font-semibold">{N.title}</p>
      <div className="mt-2 space-y-2">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onNext(o.id)}
            className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-left ring-1 ring-inset ring-surface-line transition hover:ring-primary/50 active:scale-[0.99]"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium text-zinc-100">{o.label}</span>
              <span className="block text-xs text-zinc-500">{o.hint}</span>
            </span>
            <CaretRight size={16} className="shrink-0 text-zinc-500" />
          </button>
        ))}
      </div>
    </section>
  )
}
