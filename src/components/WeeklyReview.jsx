import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChartLineUp, LockSimple, Sparkle, Target } from '@phosphor-icons/react'
import { loadWeeklyReview } from '../core/plan'
import { previousLocalWeekKey } from '../core/subscription'
import { addDaysISO } from '../core/dates'
import { t } from '../core/strings'

const dayMonth = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('sl-SI', { day: 'numeric', month: 'numeric' })

/**
 * Last week, reviewed: what was done against the plan (counted by code),
 * a highlight or two and one focus for this week (written by the AI once a
 * week, stored by the server). Pro and trial; Start sees a locked teaser.
 */
export default function WeeklyReview({ access, profile, plans, workouts, healthBreak }) {
  const R = t.review
  const [state, setState] = useState({ status: 'idle', data: null })
  const allowed = Boolean(access?.review)
  const weekStart = previousLocalWeekKey()

  useEffect(() => {
    if (!allowed || !plans.length) return
    let cancelled = false
    setState({ status: 'loading', data: null })
    loadWeeklyReview({ profile, plans, workouts, weekStart, healthBreak })
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      // A review is a bonus: if it cannot be had now, the card stays away.
      .catch(() => !cancelled && setState({ status: 'failed', data: null }))
    return () => {
      cancelled = true
    }
    // Once per week and runner; plans and runs changing later do not redo it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, profile.id, weekStart, plans.length > 0])

  if (!plans.length) return null

  if (!allowed) {
    return (
      <section className="mt-3 rounded-card bg-surface/60 p-5 ring-1 ring-inset ring-surface-line animate-fade-up">
        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <LockSimple size={16} className="text-zinc-500" />
          {R.title}
        </p>
        <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-zinc-400">{R.teaser}</p>
        <Link to="/settings" className="mt-3 inline-block text-sm font-semibold text-primary-light underline underline-offset-4">
          {R.upgrade}
        </Link>
      </section>
    )
  }

  if (state.status === 'failed' || (state.status === 'ready' && !state.data)) return null

  const { stats, review } = state.data || {}
  return (
    <section className="mt-3 rounded-card bg-surface/60 p-5 ring-1 ring-inset ring-surface-line animate-fade-up" aria-busy={state.status === 'loading'}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <ChartLineUp size={16} className="text-primary" />
          {R.title}
        </p>
        <span className="font-mono text-xs text-zinc-500">
          {dayMonth(weekStart)} – {dayMonth(addDaysISO(weekStart, 6))}
        </span>
      </div>

      {stats && (
        <p className="mt-2 font-mono text-xs text-zinc-400">
          {R.stats(stats.doneRuns, stats.plannedRuns, stats.doneKm, stats.plannedKm)}
        </p>
      )}

      {!review ? (
        <p className="mt-3 animate-pulse-dot text-sm text-zinc-500">{R.writing}</p>
      ) : (
        <>
          {review.summary && <p className="mt-3 text-sm leading-relaxed text-zinc-200">{review.summary}</p>}
          {review.highlights.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {review.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2 text-sm leading-relaxed text-zinc-300">
                  <Sparkle size={14} className="mt-1 shrink-0 text-amber-300" />
                  {h}
                </li>
              ))}
            </ul>
          )}
          {review.focus && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-primary-faint p-3 text-sm leading-relaxed text-zinc-100">
              <Target size={16} className="mt-0.5 shrink-0 text-primary" />
              <span>
                <span className="font-semibold text-primary-light">{R.focus}</span> {review.focus}
              </span>
            </p>
          )}
        </>
      )}
    </section>
  )
}
