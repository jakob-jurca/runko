import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getPlans, getWorkouts, startOfWeekISO, addDaysISO, weekStartISO, currentWeekNumber } from '../core/db'
import { motivationalMessage } from '../core/ai'
import { adaptCurrentWeekIfNeeded } from '../core/plan'
import { PHASE_INTENT } from '../core/periodization'
import { phaseStyle } from './Plan'
import { hasPremium, trialDaysLeft, isTrialActive } from '../core/subscription'
import ProgressRing from '../components/ProgressRing'
import WorkoutCard from '../components/WorkoutCard'
import { FullScreenSpinner } from '../components/Spinner'

const FALLBACK_QUOTES = [
  'Every run is a brick in the wall. Lay today’s.',
  'Slow is smooth, smooth is fast. See you out there.',
  'The hardest step is the one out the door.',
  'Consistency beats intensity. Keep showing up.',
]

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Up early'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/** "Mon 14 Jul" from an ISO date. */
function shortDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export default function Dashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [plans, setPlans] = useState([])
  const [workouts, setWorkouts] = useState([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [adaptedNote, setAdaptedNote] = useState(false)

  const currentWeek = useMemo(() => currentWeekNumber(plans), [plans])
  const lastWeek = plans.length ? plans[plans.length - 1].week_number : 1
  const viewWeek = selectedWeek ?? currentWeek
  const plan = plans.find((p) => p.week_number === viewWeek) ?? null
  const currentPlan = plans.find((p) => p.week_number === currentWeek) ?? null

  const isCurrentWeek = viewWeek === currentWeek
  const isFutureWeek = viewWeek > currentWeek

  // Calendar Monday of the viewed week; each day card is pinned to a date.
  const viewWeekStart = useMemo(() => weekStartISO(plans, viewWeek), [plans, viewWeek])
  const dayDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysISO(viewWeekStart, i)),
    [viewWeekStart]
  )

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getPlans(profile.id),
      getWorkouts(profile.id, { limit: 100 }),
    ])
      .then(async ([p, w]) => {
        if (cancelled) return
        setPlans(p)
        setWorkouts(w)
        // A new week started: quietly re-fit its plan to last week's logs.
        const adapted = await adaptCurrentWeekIfNeeded(profile, p, w).catch(() => null)
        if (adapted && !cancelled) {
          setPlans((prev) => prev.map((row) => (row.week_number === adapted.week_number ? adapted : row)))
          setAdaptedNote(true)
        }
      })
      .catch((err) => console.error(err))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [profile])

  // AI INTEGRATION POINT — daily motivational message.
  // Cached in sessionStorage per day so we call the AI at most once a day
  // per session; static quotes cover free users, API failures and runners
  // who skipped onboarding and have no plan to talk about yet.
  useEffect(() => {
    if (loading) return
    const cacheKey = `runko_motd_${new Date().toISOString().slice(0, 10)}`
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) {
      setMessage(cached)
      return
    }
    const fallback = FALLBACK_QUOTES[new Date().getDate() % FALLBACK_QUOTES.length]
    if (!hasPremium(profile) || !currentPlan) {
      setMessage(fallback)
      return
    }
    motivationalMessage(profile, currentPlan, workouts.filter((w) => w.date >= startOfWeekISO()))
      .then((m) => {
        setMessage(m.trim())
        sessionStorage.setItem(cacheKey, m.trim())
      })
      .catch(() => setMessage(fallback))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlan?.id, loading])

  const days = plan?.plan_json?.days ?? []
  const todayISO = new Date().toISOString().slice(0, 10)

  // A planned (non-rest) day counts as completed when a run was logged on
  // that calendar date. Works for any viewed week; ring tracks current week.
  const loggedDates = useMemo(
    () => new Set(workouts.filter((w) => Number(w.distance) > 0).map((w) => w.date)),
    [workouts]
  )
  const completedFlags = dayDates.map((d) => loggedDates.has(d))

  const percent = useMemo(() => {
    const currentDays = currentPlan?.plan_json?.days ?? []
    const start = weekStartISO(plans, currentWeek)
    const flags = currentDays.map((_, i) => loggedDates.has(addDaysISO(start, i)))
    const planned = currentDays.filter((d) => d.type !== 'rest').length || 1
    const done = currentDays.filter((d, i) => d.type !== 'rest' && flags[i]).length
    return (done / planned) * 100
  }, [plans, currentWeek, currentPlan, loggedDates])

  if (loading) return <FullScreenSpinner />

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      {/* header */}
      <header className="animate-fade-up">
        <p className="text-sm font-medium text-zinc-500">{greeting()},</p>
        <h1 className="text-3xl font-extrabold tracking-tight">
          {profile.name?.split(' ')[0] || 'runner'} 🏃
        </h1>
        {isTrialActive(profile) && (
          <p className="mt-1 text-xs font-medium text-primary">
            Premium trial — {trialDaysLeft(profile)} days left
          </p>
        )}
      </header>

      {/* coach message + progress ring */}
      <section className="card mt-6 flex items-center gap-5 animate-fade-up" style={{ animationDelay: '80ms' }}>
        <ProgressRing percent={percent} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Coach Runko says</p>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-200">
            {message || <span className="animate-pulse-dot text-zinc-500">Thinking…</span>}
          </p>
        </div>
      </section>

      {adaptedNote && (
        <p className="mt-3 text-xs text-primary animate-fade-up">
          📋 Your coach reviewed last week’s runs and adjusted this week’s plan.
        </p>
      )}

      {/* Which phase the runner is in, and what it is for */}
      {currentPlan?.plan_json?.phase && (
        <section
          className="card mt-4 animate-fade-up"
          style={{ animationDelay: '100ms' }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    phaseStyle(currentPlan.plan_json.phase).chip
                  }`}
                >
                  {phaseStyle(currentPlan.plan_json.phase).label} phase
                </span>
                {currentPlan.plan_json.is_recovery && (
                  <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                    Recovery week
                  </span>
                )}
                <span className="text-[10px] text-zinc-600">
                  week {currentWeek} of {lastWeek}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">
                {currentPlan.plan_json.intent ||
                  PHASE_INTENT[currentPlan.plan_json.phase] ||
                  ''}
              </p>
              {currentPlan.plan_json.target_volume_km > 0 && (
                <p className="mt-1 text-xs text-zinc-600">
                  Target this week: {currentPlan.plan_json.target_volume_km} km
                </p>
              )}
            </div>
            <Link
              to="/plan"
              className="shrink-0 rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-700"
            >
              Full plan
            </Link>
          </div>
        </section>
      )}

      {/* No plan yet — the runner skipped onboarding. Logging still works. */}
      {plans.length === 0 ? (
        <section className="mt-8 animate-fade-up" style={{ animationDelay: '120ms' }}>
          <div className="card flex flex-col items-center px-6 py-10 text-center">
            <p className="text-4xl">🗺️</p>
            <h2 className="mt-4 text-xl font-bold">No plan yet</h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-400">
              Tell your coach a bit about your running and he’ll build a training plan around
              your goal, your pace and your week.
            </p>

            <button
              onClick={() => navigate('/onboarding?rebuild=1')}
              className="btn-primary mt-6 w-full max-w-xs"
            >
              Create my plan
            </button>

            <Link to="/log" className="mt-3 text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-300">
              Or just log a run — that works right now
            </Link>
          </div>

          {workouts.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-zinc-500">
                Your recent runs
              </h3>
              <div className="space-y-2">
                {workouts.slice(0, 5).map((w) => (
                  <div
                    key={w.id}
                    className="card flex items-center justify-between gap-4 py-3 text-sm"
                  >
                    <span className="text-zinc-400">{shortDate(w.date)}</span>
                    <span className="font-medium">
                      {Number(w.distance) > 0
                        ? `${w.distance} km · ${w.duration} min`
                        : 'Missed workout'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : (
      /* weekly plan */
      <section className="mt-8">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{isCurrentWeek ? 'This week’s plan' : 'Training plan'}</h2>
          {plans.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedWeek(Math.max(1, viewWeek - 1))}
                disabled={viewWeek <= 1}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 transition enabled:hover:border-primary enabled:hover:text-primary disabled:opacity-30"
                aria-label="Previous week"
              >
                ‹
              </button>
              <span className="min-w-[7rem] text-center text-xs text-zinc-400">
                Week {viewWeek} of {lastWeek}
                {isCurrentWeek && <span className="text-primary"> · current</span>}
              </span>
              <button
                onClick={() => setSelectedWeek(Math.min(lastWeek, viewWeek + 1))}
                disabled={viewWeek >= lastWeek}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 transition enabled:hover:border-primary enabled:hover:text-primary disabled:opacity-30"
                aria-label="Next week"
              >
                ›
              </button>
            </div>
          )}
        </div>

        <div className="mb-4 flex items-center justify-between gap-3 text-sm text-zinc-500">
          <span>
            {shortDate(viewWeekStart)} – {shortDate(dayDates[6])}
            {plan?.plan_json?.focus ? ` · ${plan.plan_json.focus}` : ''}
          </span>
          {isFutureWeek && (
            <span className="shrink-0 rounded-full bg-zinc-800 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
              🔒 Unlocks {shortDate(viewWeekStart)}
            </span>
          )}
        </div>

        {days.length === 0 ? (
          <div className="card text-center text-zinc-400">
            This week has no workouts — pick another week above, or log a run to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {days.map((day, i) => (
              <WorkoutCard
                key={`${viewWeek}-${day.day}`}
                day={day}
                date={dayDates[i]}
                index={i}
                completed={!isFutureWeek && completedFlags[i]}
                isToday={dayDates[i] === todayISO}
                locked={isFutureWeek}
                canLog={isCurrentWeek}
              />
            ))}
          </div>
        )}

        {!isCurrentWeek && days.length > 0 && (
          <button
            onClick={() => setSelectedWeek(currentWeek)}
            className="btn-ghost mt-4 w-full text-sm"
          >
            Back to this week
          </button>
        )}

        {/* Rebuilding is a first-class action, not something buried in
            Settings — goals and circumstances change often. */}
        <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 text-center">
          <p className="text-sm font-semibold">Goal changed?</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">
            Build a fresh plan around a new distance, date or target time. Your coach starts
            again from your latest runs.
          </p>
          <button
            onClick={() => navigate('/onboarding?rebuild=1')}
            className="btn-primary mt-4 w-full max-w-xs"
          >
            Create new plan
          </button>
        </div>
      </section>
      )}
    </main>
  )
}
