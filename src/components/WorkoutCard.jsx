import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, CaretDown, LockSimple, PencilSimple } from '@phosphor-icons/react'
import { t } from '../core/strings'
import { prefillFromPlan } from '../core/logging'

/**
 * Muted semantic tints per workout type: a thin rail on the card and the
 * colour of the type label. Orange stays reserved for the brand accent
 * (today, the primary action) and the tempo sessions it already marked.
 */
const TYPE_STYLES = {
  easy: { rail: 'bg-emerald-400/70', text: 'text-emerald-300' },
  tempo: { rail: 'bg-primary', text: 'text-primary-light' },
  long: { rail: 'bg-sky-400/70', text: 'text-sky-300' },
  interval: { rail: 'bg-rose-400/80', text: 'text-rose-300' },
  repetition: { rail: 'bg-rose-400/80', text: 'text-rose-300' },
  cross: { rail: 'bg-violet-400/70', text: 'text-violet-300' },
  race: { rail: 'bg-amber-400', text: 'text-amber-300' },
  rest: { rail: 'bg-zinc-700', text: 'text-zinc-500' },
  walk_run: { rail: 'bg-amber-400/70', text: 'text-amber-300' },
  walk: { rail: 'bg-teal-400/70', text: 'text-teal-300' },
  time_trial: { rail: 'bg-rose-400/80', text: 'text-rose-300' },
}

/** "12 km" -> ["12", "km"], "5:25-5:40/km" -> ["5:25-5:40", "/km"]. Text without a unit stays whole. */
function splitUnit(value) {
  const m = /^(.*?\d)\s*(km|min|bpm|\/km)$/.exec(String(value))
  return m ? [m[1], m[2]] : [String(value), null]
}

/** One figure in the metric grid: the number large, its unit and label small. */
function Metric({ label, value }) {
  if (!value) return null
  const [number, unit] = splitUnit(value)
  const numeric = unit !== null
  return (
    <div className="min-w-0">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-0.5 flex items-baseline gap-1 ${numeric ? '' : 'pt-0.5'}`}>
        <span
          className={
            numeric
              ? 'truncate font-mono text-xl font-semibold leading-tight tracking-tight text-zinc-50'
              : 'text-sm font-medium leading-snug text-zinc-200'
          }
        >
          {number}
        </span>
        {unit && <span className="shrink-0 text-xs font-medium text-zinc-500">{unit}</span>}
      </div>
    </div>
  )
}

/** One segment of a varying-intensity workout: a row on a thin timeline. */
function Segment({ segment, last }) {
  const hr = segment.hr ? `${segment.hr.min}-${segment.hr.max} bpm` : null
  const text =
    segment.text ||
    (segment.reps ? segment.reps.summary : `${segment.distance_km} km @ ${segment.pace_range || segment.pace}`)
  const main = segment.kind === 'main'
  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      {!last && <span className="absolute left-[5px] top-3 h-full w-px bg-zinc-800" aria-hidden />}
      <span
        className={`relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-2 ring-canvas ${
          main ? 'bg-primary' : 'bg-zinc-600'
        }`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="inline-block text-xs text-zinc-500 lowercase first-letter:uppercase">{segment.label}</div>
        <div className={`font-mono text-sm leading-snug ${main ? 'font-semibold text-zinc-50' : 'text-zinc-300'}`}>
          {text}
        </div>
        {hr && <div className="font-mono text-xs text-zinc-500">{hr}</div>}
      </div>
    </li>
  )
}

function DateBlock({ weekday, dateLabel, isToday }) {
  return (
    <div className="w-11 shrink-0">
      <div className={`text-sm font-semibold ${isToday ? 'text-primary' : 'text-zinc-300'}`}>{weekday}</div>
      {dateLabel && (
        <div className={`font-mono text-[11px] ${isToday ? 'text-primary/80' : 'text-zinc-600'}`}>{dateLabel}</div>
      )}
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
 * what heart rate, as large figures in a two-column grid so a runner reads
 * it in a glance. Workouts whose intensity varies (tempo, intervals,
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
  const isTrial = day.type === 'time_trial'
  const style = TYPE_STYLES[day.type] || TYPE_STYLES.easy

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
  // Minute-based sessions carry only an estimated distance.
  const distance =
    day.distance_km > 0 ? `${day.time_based && day.type !== 'race' ? '~' : ''}${day.distance_km} km` : null

  // A rest day is a quiet one-line row: nothing to scan, nothing to do.
  if (isRest) {
    return (
      <article
        className="flex items-center gap-4 rounded-card px-5 py-3 animate-fade-up"
        style={{ animationDelay: `${index * 40}ms` }}
      >
        <DateBlock weekday={weekday} dateLabel={dateLabel} isToday={isToday} />
        <div className="min-w-0 flex-1 pl-1">
          <p className="text-sm font-medium text-zinc-400">{day.title || t.workout.types.rest}</p>
          {day.purpose && <p className="text-xs leading-relaxed text-zinc-600">{day.purpose}</p>}
        </div>
      </article>
    )
  }

  return (
    <article
      className={`relative overflow-hidden rounded-card bg-surface ring-1 ring-inset transition animate-fade-up ${
        isToday ? 'ring-primary/50' : 'ring-surface-line'
      } ${completed || locked ? 'opacity-60' : ''}`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${style.rail}`} aria-hidden />

      <div className="p-5 pl-6">
        {/* header: date, type, title, state */}
        <div className="flex items-start gap-4">
          <DateBlock weekday={weekday} dateLabel={dateLabel} isToday={isToday} />

          <div className="min-w-0 flex-1">
            <p className={`text-xs font-semibold ${style.text}`}>{t.workout.types[day.type] || day.type}</p>
            <h3 className="mt-0.5 text-base font-semibold leading-snug text-zinc-50">{day.title}</h3>
          </div>

          {locked ? (
            <span className="mt-0.5 shrink-0 text-zinc-600" title={t.workout.lockedHint} aria-label={t.workout.lockedHint}>
              <LockSimple size={20} />
            </span>
          ) : completed ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
              <Check size={18} weight="bold" />
            </span>
          ) : (
            canLog && (
              <button
                onClick={openPrefilledForm}
                className="flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full bg-surface-raised px-3 text-xs font-medium text-zinc-300 ring-1 ring-inset ring-white/10 transition hover:text-white active:scale-95"
              >
                <PencilSimple size={14} />
                {isTrial ? t.goals.trial.logIt : t.workout.adjust}
              </button>
            )
          )}
        </div>

        {/* the figures: distance and time always, then pace and HR or the segments */}
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <Metric label={t.workout.distance} value={distance} />
          <Metric label={t.workout.time} value={time} />
          {!hasSegments && (
            <>
              <Metric label={t.workout.pace} value={day.pace_range || day.pace} />
              <Metric label={t.workout.heartRate} value={hr} />
            </>
          )}
        </div>

        {hasSegments && (
          <ol className="mt-4 rounded-xl bg-canvas/70 p-4">
            {segments.map((segment, i) => (
              <Segment key={i} segment={segment} last={i === segments.length - 1} />
            ))}
          </ol>
        )}

        {/* notes the engine adds: pospeški, tempo maratona, krepilna vadba */}
        {(day.strides || day.note || day.strength_note) && (
          <div className="mt-4 space-y-1.5 border-l-2 border-zinc-800 pl-3 text-xs leading-relaxed text-zinc-400">
            {day.strides && <p>Pospeški: {day.strides}</p>}
            {day.note && <p>{day.note}</p>}
            {day.strength_note && <p>{day.strength_note}</p>}
          </div>
        )}

        {/* One tap logs the session exactly as prescribed — no form, no typing.
            This is the path almost everyone wants; "Prilagodi" opens the form
            pre-filled for the days that did not go to plan. */}
        {canLog && !completed && !locked && onQuickLog && !isTrial && (
          <button
            onClick={() => onQuickLog(day, date)}
            disabled={quickLogging}
            className={`mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-60 ${
              isToday
                ? 'bg-primary text-white hover:bg-primary-dark'
                : 'bg-surface-raised text-zinc-100 ring-1 ring-inset ring-white/10 hover:bg-zinc-800'
            }`}
          >
            {quickLogging ? (
              t.workout.logging
            ) : (
              <>
                <Check size={18} weight="bold" />
                {t.workout.doneAsPlanned}
              </>
            )}
          </button>
        )}

        {/* A trial's result is typed in, never assumed. */}
        {canLog && !completed && !locked && isTrial && (
          <button
            onClick={openPrefilledForm}
            className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-dark active:scale-[0.99]"
          >
            <PencilSimple size={18} weight="bold" />
            {t.goals.trial.logIt}
          </button>
        )}

        {/* the how and the why, folded away by default */}
        {hasDetail && (
          <>
            <button
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="mt-2 flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-zinc-500 transition hover:text-zinc-200"
            >
              {t.workout.details}
              <CaretDown size={14} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
              <div className="mt-1 space-y-4 rounded-xl bg-canvas/70 p-4 animate-fade-in">
                {day.how && (
                  <div>
                    <p className="text-xs font-semibold text-primary-light">{t.workout.howTo}</p>
                    <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-zinc-200">{day.how}</p>
                  </div>
                )}
                {day.why && (
                  <div>
                    <p className="text-xs font-semibold text-primary-light">{t.workout.why}</p>
                    <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-zinc-300">{day.why}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  )
}
