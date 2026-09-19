import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { addWorkout, getPlans, getWorkouts, currentWeekNumber } from '../core/db'
import { coachReaction } from '../core/ai'
import { maybeAdaptPlan } from '../core/plan'
import { hasPremium } from '../core/subscription'
import Spinner from '../components/Spinner'

const EFFORTS = [
  { v: 1, label: 'Very easy', emoji: '😌' },
  { v: 2, label: 'Easy', emoji: '🙂' },
  { v: 3, label: 'Moderate', emoji: '😅' },
  { v: 4, label: 'Hard', emoji: '🥵' },
  { v: 5, label: 'All out', emoji: '💀' },
]

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

  const [distance, setDistance] = useState(params.get('distance') || '')
  const [duration, setDuration] = useState(params.get('duration') || '')
  const [effort, setEffort] = useState(3)
  const [notes, setNotes] = useState('')
  const [missed, setMissed] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null) // { reaction, adapted }

  const plannedDay = params.get('day')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const workout = await addWorkout({
        user_id: profile.id,
        date: new Date().toISOString().slice(0, 10),
        distance: missed ? 0 : Number(distance),
        duration: missed ? 0 : Number(duration),
        effort: missed ? 1 : effort,
        notes: missed ? `Missed planned workout${plannedDay ? ` (${plannedDay})` : ''}. ${notes}`.trim() : notes,
        source: 'manual',
      })

      const [plans, recent] = await Promise.all([
        getPlans(profile.id),
        getWorkouts(profile.id, { limit: 8 }),
      ])
      const plan = plans.find((p) => p.week_number === currentWeekNumber(plans)) ?? null

      // AI INTEGRATION POINT — coach reaction + plan adaptation.
      let reaction = missed
        ? 'Logged. One missed run never broke a runner — we adjust and move on.'
        : 'Workout logged. Keep it up! 💪'
      let adapted = null
      if (hasPremium(profile)) {
        const [reactionRes, adaptedRes] = await Promise.allSettled([
          coachReaction(profile, plan, { distance: workout.distance, duration: workout.duration, effort: workout.effort, notes }),
          maybeAdaptPlan(profile, plans, workout, recent),
        ])
        if (reactionRes.status === 'fulfilled') reaction = reactionRes.value.trim()
        if (adaptedRes.status === 'fulfilled') adapted = adaptedRes.value
      }
      setDone({ reaction, adapted: Boolean(adapted) })
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
        <h1 className="text-2xl font-extrabold">Run logged!</h1>

        <div className="card mt-6 text-left">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Coach Runko</p>
          <p className="mt-2 leading-relaxed text-zinc-200">{done.reaction}</p>
        </div>

        {done.adapted && (
          <p className="mt-4 text-sm text-primary">
            📋 Your coach noticed and adjusted next week’s plan.
          </p>
        )}

        <Link to="/" className="btn-primary mt-8 w-full">
          Back to dashboard
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-md px-6 py-8">
      <h1 className="text-2xl font-extrabold animate-fade-up">Log a run</h1>
      {plannedDay && (
        <p className="mt-1 text-sm text-zinc-400">
          Logging your <span className="text-primary">{plannedDay}</span> workout
        </p>
      )}

      <form onSubmit={submit} className="mt-8 space-y-6 animate-fade-up" style={{ animationDelay: '80ms' }}>
        <label className="card flex cursor-pointer items-center justify-between">
          <div>
            <p className="font-semibold">I missed this workout</p>
            <p className="text-sm text-zinc-500">Your coach will adapt, not judge.</p>
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
              <div>
                <label className="label">Distance (km)</label>
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
                <label className="label">Duration (min)</label>
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
              <label className="label">Perceived effort</label>
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
          <label className="label">Notes (optional)</label>
          <textarea
            rows={3}
            className="input resize-none"
            placeholder="How did it feel?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? (
            <>
              <Spinner className="h-5 w-5 text-white" /> Saving…
            </>
          ) : missed ? (
            'Log missed workout'
          ) : (
            'Save run'
          )}
        </button>
      </form>
    </main>
  )
}
