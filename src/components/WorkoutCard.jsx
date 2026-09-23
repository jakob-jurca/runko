import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '../core/strings'
import { prefillFromPlan } from '../core/logging'

const TYPE_STYLES = {
  easy: 'bg-emerald-500/15 text-emerald-400',
  tempo: 'bg-primary-faint text-primary',
  long: 'bg-sky-500/15 text-sky-400',
  interval: 'bg-rose-500/15 text-rose-400',
  repetition: 'bg-rose-500/15 text-rose-400',
  cross: 'bg-violet-500/15 text-violet-400',
  race: 'bg-amber-500/20 text-amber-400',
  rest: 'bg-zinc-700/30 text-zinc-400',
  walk_run: 'bg-amber-500/15 text-amber-400',
}

/** One row of the spec block: LABEL on the left, value on the right. */
function Spec({ label, value }) {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      <span className="text-right font-mono text-sm font-semibold text-zinc-100">{value}</span>
    </div>
  )
}

/** One segment of a varying-intensity workout. */
function Segment({ segment }) {
  const hr = segment.hr ? `${segment.hr.min}-${segment.hr.max} bpm` : null
  return (
    <div className="py-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          {segment.label}
        </span>
        <span className="text-right font-mono text-sm font-semibold text-zinc-100">
          {segment.text ||
            (segment.reps
              ? segment.reps.summary
              : `${segment.distance_km} km @ ${segment.pace_range || segment.pace}`)}
        </span>
      </div>
      {hr && <p className="mt-0.5 text-right font-mono text-[11px] text-zinc-500">{hr}</p>}
    </div>
  )
}

/**
 * One day of a plan week, pinned to a calendar date.
 *
 * Renders entirely from stored data — distances, paces, heart rates,
 * segments and both prose sections are computed or generated once when the
 * plan is built. Opening a card costs nothing.
 *
 * Collapsed it is a scannable spec: what, how far, how long, how fast, at
 * what heart rate. Workouts whose intensity varies (tempo, intervals,
 * repetitions) never show a single averaged pace — that was meaningless —
 * they list their segments instead. "Podrobnosti" opens the how and the why.
 */
export default function WorkoutCard({
  day,
  date,
  completed,
  isToday,
  locked,
  canLog,
  index,
  onQuickLog,
  quickLogging,
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const isRest = day.type === 'rest'

  // "Mon" + "14 Jul" from the ISO date; falls back to the plan's weekday name.
  const d = date ? new Date(date + 'T00:00:00') : null
  const weekday = d ? d.toLocaleDateString('en-GB', { weekday: 'short' }) : day.day.slice(0, 3)
  const dateLabel = d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null

  /** Open the form already filled in with what was planned for this day. */
  const openPrefilledForm = () => {
    const pre = prefillFromPlan(day, date)
    const params = new URLSearchParams({
      day: day.day,
      type: day.type,
      title: day.title || '',
      distance: pre.distance,
      duration: pre.duration,
      effort: String(pre.effort),
      date: pre.date,
    })
    navigate(`/log?${params}`)
  }

  const segments = day.segments || []
  const hasSegments = segments.length > 0
  const time = day.duration_range
    ? `${day.duration_range.min}-${day.duration_range.max} min`
    : day.duration_min
      ? `${day.duration_min} min`
      : null
  const hr = day.hr ? `${day.hr.min}-${day.hr.max} bpm` : null
  const hasDetail = Boolean(day.how || day.why)

  return (
    <div
      className={`card animate-fade-up ${isToday ? 'border-primary/50 ring-1 ring-primary/30' : ''} ${
        completed ? 'opacity-70' : ''
      } ${locked ? 'opacity-60' : ''}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* header: date, type, title, action */}
      <div className="flex items-start gap-4">
        <div className="w-12 shrink-0 text-center">
          <div className={`text-xs font-bold uppercase ${isToday ? 'text-primary' : 'text-zinc-500'}`}>
            {weekday}
          </div>
          {dateLabel && (
            <div className={`mt-0.5 text-[10px] font-medium ${isToday ? 'text-primary' : 'text-zinc-600'}`}>
              {dateLabel}
            </div>
          )}
          {isToday && <div className="mx-auto mt-1 h-1.5 w-1.5 rounded-full bg-primary" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                TYPE_STYLES[day.type] || TYPE_STYLES.easy
              }`}
            >
              {t.workout.types[day.type] || day.type}
            </span>
            <h3 className="truncate font-semibold">{day.title}</h3>
          </div>
          {isRest && day.purpose && (
            <p className="mt-1 text-sm text-zinc-500">{day.purpose}</p>
          )}
        </div>

        {locked ? (
          !isRest && (
            <span className="shrink-0 text-lg text-zinc-600" title={t.workout.lockedHint}>
              🔒
            </span>
          )
        ) : completed ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
        ) : (
          !isRest &&
          canLog && (
            <button
              onClick={openPrefilledForm}
              className="shrink-0 rounded-full bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-700 active:scale-95"
            >
              {t.workout.adjust}
            </button>
          )
        )}
      </div>

      {/* spec block — the scannable part */}
      {!isRest && (
        <div className="mt-3 divide-y divide-zinc-800/70 border-t border-zinc-800/70 pt-2">
          {/* Minute-based sessions carry only an estimated distance. */}
          <Spec
            label={t.workout.distance}
            value={day.distance_km > 0 ? `${day.time_based && day.type !== 'race' ? '~' : ''}${day.distance_km} km` : null}
          />
          <Spec label={t.workout.time} value={time} />

          {hasSegments ? (
            segments.map((segment, i) => <Segment key={i} segment={segment} />)
          ) : (
            <>
              <Spec label={t.workout.pace} value={day.pace_range || day.pace} />
              <Spec label={t.workout.heartRate} value={hr} />
            </>
          )}
        </div>
      )}

      {/* One tap logs the session exactly as prescribed — no form, no typing.
          This is the path almost everyone wants; "Prilagodi" opens the form
          pre-filled for the days that did not go to plan. */}
      {!isRest && canLog && !completed && !locked && onQuickLog && (
        <button
          onClick={() => onQuickLog(day, date)}
          disabled={quickLogging}
          className="mt-3 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 active:scale-[0.99] disabled:opacity-60"
        >
          {quickLogging ? t.workout.logging : `✓ ${t.workout.doneAsPlanned}`}
        </button>
      )}

      {/* the how and the why, folded away by default */}
      {hasDetail && (
        <>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-500 transition hover:bg-zinc-800/50 hover:text-zinc-300"
          >
            {t.workout.details}
            <span className={`text-sm transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
          </button>

          {open && (
            <div className="mt-1 space-y-4 rounded-xl bg-zinc-950/60 p-4 animate-fade-in">
              {day.how && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
                    {t.workout.howTo}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-200">{day.how}</p>
                </div>
              )}
              {day.why && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
                    {t.workout.why}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">{day.why}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
