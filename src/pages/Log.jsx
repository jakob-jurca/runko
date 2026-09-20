import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { addWorkout, getPlans, getWorkouts, currentWeekNumber, todayISO } from '../core/db'
import { coachReaction } from '../core/ai'
import { maybeAdaptPlan } from '../core/plan'
import { hasPremium } from '../core/subscription'
import Spinner from '../components/Spinner'
import { t } from '../core/strings'
import { validateLogDate, DEFAULT_EFFORT } from '../core/logging'

const EFFORTS = t.log.efforts

/**
 * Manual workout logging. Quick-log from the dashboard pre-fills distance and
 * duration via query params. After saving:
 *  1. the coach reacts (AI, premium) and
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
  const [notes, setNotes] = useState('')
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
        duration: missed ? 0 : Number(duration),
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
      const premium = hasPremium(profile)
      if (premium) {
        const [reactionRes, adaptedRes] = await Promise.allSettled([
          coachReaction(profile, plan, { distance: workout.distance, duration: workout.duration, effort: workout.effort, notes }),
          maybeAdaptPlan(profile, plans, workout, recent),
        ])
        if (reactionRes.status === 'fulfilled') reaction = reactionRes.value.trim()
        if (adaptedRes.status === 'fulfilled') adapted = adaptedRes.value
      }
      // `premium` travels with the result so the confirmation screen can say
      // why the coach is quiet, instead of showing a canned line under his
      // name as though he had replied.
      setDone({ reaction, adapted: Boolean(adapted), premium })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center animate-fade-up">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
          <svg viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" className="h-8 w-8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold">{t.log.doneTitle}</h1>

        <div className="card mt-6 text-left">
          {done.premium && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">{t.chat.title}</p>
          )}
          <p className={`leading-relaxed text-zinc-200 ${done.premium ? 'mt-2' : ''}`}>{done.reaction}</p>
          {!done.premium && (
            <p className="mt-3 text-xs text-zinc-500">
              {t.paywall.logLocked}{' '}
              <Link to="/chat" className="text-primary underline">
                {t.paywall.ended}
              </Link>
            </p>
          )}
        </div>

        {done.adapted && (
          <p className="mt-4 text-sm text-primary">
            {t.log.adapted}
          </p>
        )}

        <Link to="/" className="btn-primary mt-8 w-full">
          {t.log.backToDashboard}
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-md px-6 py-8">
      <h1 className="text-2xl font-extrabold animate-fade-up">{t.log.title}</h1>
      {plannedDay && (
        <p className="mt-1 text-sm text-zinc-400 animate-fade-up">
          {t.log.fromPlan}: <span className="text-primary">{params.get('title') || plannedDay}</span>
        </p>
      )}

      <form onSubmit={submit} className="mt-8 space-y-6 animate-fade-up" style={{ animationDelay: '80ms' }}>
        <label className="card flex cursor-pointer items-center justify-between">
          <div>
            <p className="font-semibold">{t.log.missed}</p>
            <p className="text-sm text-zinc-500">{t.log.subtitle}</p>
          </div>
          <input
            type="checkbox"
            checked={missed}
            onChange={(e) => setMissed(e.target.checked)}
            className="h-5 w-5 accent-primary"
          />
        </label>

        {!missed && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">{t.log.date}</label>
                <input
                  type="date"
                  className="input"
                  value={date}
                  max={todayISO()}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <label className="label">{t.log.distance}</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  required
                  className="input"
                  placeholder="5.0"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                />
              </div>
              <div>
                <label className="label">{t.log.duration}</label>
                <input
                  type="number"
                  min="1"
                  required
                  className="input"
                  placeholder="30"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="label">{t.log.effort}</label>
              <div className="grid grid-cols-5 gap-2">
                {EFFORTS.map((ef) => (
                  <button
                    type="button"
                    key={ef.v}
                    onClick={() => setEffort(ef.v)}
                    className={`flex flex-col items-center gap-1 rounded-xl border py-3 transition active:scale-95 ${
                      effort === ef.v
                        ? 'border-primary bg-primary-faint'
                        : 'border-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    <span className="text-lg">{ef.emoji}</span>
                    <span className="text-[9px] font-medium text-zinc-400">{ef.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div>
          <label className="label">{t.log.notes}</label>
          <textarea
            rows={3}
            className="input resize-none"
            placeholder={t.log.notesPlaceholder}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-rose-400">{error}</p>}

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
