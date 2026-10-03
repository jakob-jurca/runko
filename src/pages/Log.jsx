import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { addWorkout, getPlans, getWorkouts, currentWeekNumber, todayISO } from '../core/db'
import { coachReaction } from '../core/ai'
import { maybeAdaptPlan } from '../core/plan'
import Spinner from '../components/Spinner'
import { Check, WarningCircle } from '@phosphor-icons/react'
import { t } from '../core/strings'
import { friendlyError } from '../core/errors'
import { validateLogDate, DEFAULT_EFFORT } from '../core/logging'

const EFFORTS = t.log.efforts

/**
 * Manual workout logging. Quick-log from the dashboard pre-fills distance and
 * duration via query params. After saving:
 *  1. the coach reacts (AI) and
 *  2. the plan engine checks whether next week needs adapting
 *     (missed = distance 0, or effort >= 4).
 */
export default function Log() {
  const { profile } = useAuth()
  const [params] = useSearchParams()

  // Opened from a workout card, these arrive already filled in.
  const [distance, setDistance] = useState(params.get('distance') || '')
  const [duration, setDuration] = useState(params.get('duration') || '')
  const [effort, setEffort] = useState(Number(params.get('effort')) || DEFAULT_EFFORT)
  // Today by default, and never later than today — see validateLogDate.
  const [date, setDate] = useState(params.get('date') || todayISO())
  const isTrial = params.get('type') === 'time_trial'
  const [seconds, setSeconds] = useState('')
  const [notes, setNotes] = useState(isTrial ? params.get('title') || '' : '')
  const [missed, setMissed] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null) // { reaction, adapted }

  const plannedDay = params.get('day')

  const submit = async (e) => {
    e.preventDefault()
    // A run in the future has not happened. Refuse it with a reason rather
    // than storing a row the dashboard will not show as done until that day.
    const dateCheck = validateLogDate(date)
    if (!dateCheck.ok) {
      setError(dateCheck.reason === 'future' ? t.log.futureDate : t.log.invalidDate)
      return
    }
    setBusy(true)
    setError('')
    try {
      const workout = await addWorkout({
        user_id: profile.id,
        date,
        distance: missed ? 0 : Number(distance),
        // A time trial is typed as minutes and seconds.
        duration: missed ? 0 : isTrial ? Math.round((Number(duration) + Number(seconds || 0) / 60) * 100) / 100 : Number(duration),
        effort: missed ? 1 : effort,
        notes: missed ? `Izpuščen trening${plannedDay ? ` (${plannedDay})` : ''}. ${notes}`.trim() : notes,
        source: 'manual',
      })

      const [plans, recent] = await Promise.all([
        getPlans(profile.id),
        getWorkouts(profile.id, { limit: 8 }),
      ])
      const plan = plans.find((p) => p.week_number === currentWeekNumber(plans)) ?? null

      // AI INTEGRATION POINT — coach reaction + plan adaptation.
      let reaction = missed
        ? t.log.fallbackMissed
        : t.log.fallbackReaction
      let adapted = null
      const [reactionRes, adaptedRes] = await Promise.allSettled([
        coachReaction(profile, plan, { distance: workout.distance, duration: workout.duration, effort: workout.effort, notes }),
        maybeAdaptPlan(profile, plans, workout, recent),
      ])
      if (reactionRes.status === 'fulfilled') reaction = reactionRes.value.trim()
      if (adaptedRes.status === 'fulfilled') adapted = adaptedRes.value
      // A canned line is not shown under the coach's name as though he had replied.
      const fromCoach = reactionRes.status === 'fulfilled'
      setDone({ reaction, adapted: Boolean(adapted), fromCoach })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <main className="mx-auto max-w-md px-4 pb-10 pt-[max(3rem,env(safe-area-inset-top))] animate-fade-up sm:px-6">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
          <Check size={28} weight="bold" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{t.log.doneTitle}</h1>

        <div className="card mt-6">
          {done.fromCoach && <p className="text-xs font-semibold text-primary-light">{t.chat.title}</p>}
          <p className={`text-[15px] leading-relaxed text-zinc-100 ${done.fromCoach ? 'mt-1.5' : ''}`}>{done.reaction}</p>
        </div>

        {done.adapted && <p className="mt-4 text-sm text-primary-light">{t.log.adapted}</p>}

        <Link to="/" className="btn-primary mt-8 w-full">
          {t.log.backToDashboard}
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
      <h1 className="text-[1.75rem] font-bold tracking-tight animate-fade-up">{t.log.title}</h1>
      {plannedDay && (
        <p className="mt-1 text-sm text-zinc-400 animate-fade-up">
          {t.log.fromPlan}: <span className="font-medium text-primary-light">{params.get('title') || plannedDay}</span>
        </p>
      )}

      <form onSubmit={submit} className="mt-6 space-y-6 animate-fade-up" style={{ animationDelay: '60ms' }}>
        {/* Missed: a switch, not a bare checkbox. */}
        <label className="card flex cursor-pointer items-center justify-between gap-4 py-4">
          <div className="min-w-0">
            <p className="font-medium">{t.log.missed}</p>
            <p className="mt-0.5 text-sm text-zinc-500">{t.log.subtitle}</p>
          </div>
          <input
            type="checkbox"
            checked={missed}
            onChange={(e) => setMissed(e.target.checked)}
            className="peer sr-only"
            role="switch"
            aria-checked={missed}
          />
          <span
            aria-hidden
            className="relative h-7 w-12 shrink-0 rounded-full bg-zinc-700 transition peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/60
              after:absolute after:left-0.5 after:top-0.5 after:h-6 after:w-6 after:rounded-full after:bg-white after:transition-transform after:duration-200 peer-checked:after:translate-x-5"
          />
        </label>

        {!missed && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label htmlFor="log-date" className="label">
                  {t.log.date}
                </label>
                <input
                  id="log-date"
                  type="date"
                  className="input"
                  value={date}
                  max={todayISO()}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="log-distance" className="label">
                  {t.log.distance}
                </label>
                <UnitInput
                  id="log-distance"
                  unit="km"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0.1"
                  required
                  placeholder="5.0"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="log-duration" className="label">
                  {t.log.duration}
                </label>
                <UnitInput
                  id="log-duration"
                  unit={isTrial ? t.goals.logMinutes : 'min'}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  required
                  placeholder={isTrial ? '25' : '30'}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
              {isTrial && (
                <div className="col-span-2">
                  <label htmlFor="log-seconds" className="label">
                    {t.goals.logSeconds}
                  </label>
                  <UnitInput
                    id="log-seconds"
                    unit={t.goals.logSeconds}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="59"
                    step="1"
                    placeholder="30"
                    value={seconds}
                    onChange={(e) => setSeconds(e.target.value)}
                  />
                  <p className="mt-1.5 text-xs text-zinc-500">{t.goals.logTrialHint}</p>
                </div>
              )}
            </div>

            <fieldset>
              <legend className="label">{t.log.effort}</legend>
              <div className="grid grid-cols-5 gap-1.5 rounded-2xl bg-surface p-1.5 ring-1 ring-inset ring-surface-line">
                {EFFORTS.map((ef) => (
                  <button
                    type="button"
                    key={ef.v}
                    onClick={() => setEffort(ef.v)}
                    aria-pressed={effort === ef.v}
                    className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl px-1 transition active:scale-95 ${
                      effort === ef.v ? 'bg-primary-faint ring-1 ring-inset ring-primary/60' : 'hover:bg-surface-raised'
                    }`}
                  >
                    <span className="text-lg leading-none">{ef.emoji}</span>
                    <span
                      className={`text-center text-[10px] font-medium leading-tight ${
                        effort === ef.v ? 'text-primary-light' : 'text-zinc-400'
                      }`}
                    >
                      {ef.label}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          </>
        )}

        <div>
          <label htmlFor="log-notes" className="label">
            {t.log.notes}
          </label>
          <textarea
            id="log-notes"
            rows={3}
            className="input resize-none"
            placeholder={t.log.notesPlaceholder}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && (
          <p className="flex items-start gap-2 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200 ring-1 ring-inset ring-rose-500/25">
            <WarningCircle size={18} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? (
            <>
              <Spinner className="h-5 w-5 text-white" /> {t.log.saving}
            </>
          ) : missed ? (
            t.log.missed
          ) : (
            t.log.submit
          )}
        </button>
      </form>
    </main>
  )
}

/** A number input with its unit set inside the field, on the right. */
function UnitInput({ unit, ...props }) {
  return (
    <div className="relative">
      <input {...props} className="input pr-12 font-mono text-lg" />
      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-zinc-500">
        {unit}
      </span>
    </div>
  )
}
