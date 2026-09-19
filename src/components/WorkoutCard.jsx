import { useNavigate } from 'react-router-dom'

const TYPE_STYLES = {
  easy: 'bg-emerald-500/15 text-emerald-400',
  tempo: 'bg-primary-faint text-primary',
  long: 'bg-sky-500/15 text-sky-400',
  interval: 'bg-rose-500/15 text-rose-400',
  cross: 'bg-violet-500/15 text-violet-400',
  rest: 'bg-zinc-700/30 text-zinc-400',
}

/**
 * One day of a plan week on the dashboard, pinned to a calendar date.
 * `completed` = a workout was logged on that date; quick-log jumps to the Log
 * page pre-filled with the planned distance/duration. Future weeks render
 * `locked` (visible but not loggable); `canLog` is true only for the current
 * week.
 */
export default function WorkoutCard({ day, date, completed, isToday, locked, canLog, index }) {
  const navigate = useNavigate()
  const isRest = day.type === 'rest'

  // "Mon" + "14 Jul" from the ISO date; falls back to the plan's weekday name.
  const d = date ? new Date(date + 'T00:00:00') : null
  const weekday = d
    ? d.toLocaleDateString('en-GB', { weekday: 'short' })
    : day.day.slice(0, 3)
  const dateLabel = d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null

  const quickLog = () => {
    const params = new URLSearchParams({
      day: day.day,
      type: day.type,
      distance: day.distance_km ?? '',
      duration: day.duration_min ?? '',
    })
    navigate(`/log?${params}`)
  }

  return (
    <div
      className={`card flex items-center gap-4 animate-fade-up ${
        isToday ? 'border-primary/50 ring-1 ring-primary/30' : ''
      } ${completed ? 'opacity-70' : ''} ${locked ? 'opacity-60' : ''}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="w-14 shrink-0 text-center">
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
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TYPE_STYLES[day.type] || TYPE_STYLES.easy}`}>
            {day.type}
          </span>
          <h3 className="truncate font-semibold">{day.title}</h3>
        </div>
        <p className="mt-1 truncate text-sm text-zinc-400">{day.description}</p>
        {!isRest && (day.distance_km > 0 || day.duration_min > 0 || day.pace) && (
          <p className="mt-1 text-xs font-medium text-zinc-500">
            {[
              day.distance_km > 0 && `${day.distance_km} km`,
              day.duration_min > 0 && `~${day.duration_min} min`,
              day.pace && `🎯 ${day.pace}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        {day.purpose && (
          <p className="mt-1 truncate text-xs italic text-zinc-600">{day.purpose}</p>
        )}
      </div>

      {locked ? (
        !isRest && (
          <span className="shrink-0 text-lg text-zinc-600" title="Unlocks when this week arrives">
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
            onClick={quickLog}
            className="shrink-0 rounded-full bg-primary-faint px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary hover:text-white active:scale-95"
          >
            Log
          </button>
        )
      )}
    </div>
  )
}
