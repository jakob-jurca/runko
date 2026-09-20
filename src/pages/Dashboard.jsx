import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getWorkouts,
  addWorkout,
  startOfWeekISO,
  addDaysISO,
  weekStartISO,
  currentWeekNumber,
  todayISO,
} from '../core/db'
import { plannedWorkoutRow } from '../core/logging'
import { motivationalMessage } from '../core/ai'
import { adaptCurrentWeekIfNeeded, getHydratedPlans } from '../core/plan'
import { PHASE_INTENT } from '../core/periodization'
import { phaseStyle } from './Plan'
import { hasPremium, trialDaysLeft, isTrialActive } from '../core/subscription'
import ProgressRing from '../components/ProgressRing'
import WorkoutCard from '../components/WorkoutCard'
import { FullScreenSpinner } from '../components/Spinner'
import { t } from '../core/strings'

const FALLBACK_QUOTES = [
  'Vsak tek je opeka v zidu. Danes položi svojo.',
  'Počasi je gladko, gladko je hitro. Se vidiva zunaj.',
  'Najtežji korak je tisti skozi vrata.',
  'Doslednost premaga intenzivnost. Kar pojavljaj se.',
]

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return t.dashboard.greetingEarly
  if (h < 12) return t.dashboard.greetingMorning
  if (h < 18) return t.dashboard.greetingAfternoon
  return t.dashboard.greetingEvening
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
  const [quickLoggingDay, setQuickLoggingDay] = useState(null)
  const [logError, setLogError] = useState('')

  // Drives both the daily message and how the free tier is labelled below.
  const premium = hasPremium(profile)

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
      getHydratedPlans(profile),
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

  /**
   * Re-read the runs whenever the page becomes visible again.
   *
   * Navigating back from the log form normally remounts this page, but the
   * browser's back button and bfcache can restore it without remounting —
   * and then a freshly logged run is missing from `workouts` and its card
   * shows no checkmark. This is the belt to that braces.
   */
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      getWorkouts(profile.id, { limit: 100 })
        .then(setWorkouts)
        .catch(() => {})
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [profile.id])

  /**
   * One tap: log the planned session exactly as prescribed.
   *
   * The saved row goes straight into local state, so the checkmark appears
   * immediately rather than waiting for a round trip — and because it is a
   * real row, it survives a refresh.
   */
  const quickLog = async (day, date) => {
    const row = plannedWorkoutRow(day, { userId: profile.id, date })
    if (!row) return
    setQuickLoggingDay(day.day)
    setLogError('')
    try {
      const saved = await addWorkout(row)
      setWorkouts((prev) => [saved, ...prev])
    } catch (err) {
      setLogError(err.message)
    } finally {
      setQuickLoggingDay(null)
    }
  }

  // AI INTEGRATION POINT — daily motivational message.
  // Cached in sessionStorage per day so we call the AI at most once a day
  // per session; static quotes cover free users, API failures and runners
  // who skipped onboarding and have no plan to talk about yet.
  useEffect(() => {
    if (loading) return
    const cacheKey = `runko_motd_${todayISO()}`
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
  const today = todayISO()

  // A planned (non-rest) day counts as completed when a run was logged on
  // that calendar date. Works for any viewed week; ring tracks current week.
  const loggedDates = useMemo(
    () => new Set(workouts.filter((w) => Number(w.distance) > 0).map((w) => w.date)),
    [workouts]
  )
  const completedFlags = dayDates.map((d) => loggedDates.has(d))

  // A plan whose last week is behind us: the grid necessarily shows a
  // historical week, so a run logged today can never line up with a card.
  // Say so instead of letting it look like the save failed.
  const planEnded = plans.length > 0 && weekStartISO(plans, lastWeek) < startOfWeekISO()

  // Any run logged today that the visible grid does not cover. Without this
  // the runner logs something, sees no checkmark anywhere, and concludes the
  // app lost it.
  const todaysRun = workouts.find((w) => w.date === today && Number(w.distance) > 0)
  const todaysRunUnshown = Boolean(todaysRun) && !dayDates.includes(today)

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
          {profile.name?.split(' ')[0] || t.dashboard.runnerFallback} 🏃
        </h1>
        {isTrialActive(profile) ? (
          <p className="mt-1 text-xs font-medium text-primary">
            {t.dashboard.trialLeft(trialDaysLeft(profile))}
          </p>
        ) : (
          // The trial countdown's slot, once it has run out. Without this the
          // free tier is indistinguishable from a broken premium one.
          !premium && (
            <Link to="/chat" className="mt-1 inline-block text-xs font-medium text-zinc-500 underline">
              {t.paywall.ended}
            </Link>
          )
        )}
      </header>

      {/* coach message + progress ring */}
      <section className="card mt-6 flex items-center gap-5 animate-fade-up" style={{ animationDelay: '80ms' }}>
        <ProgressRing percent={percent} />
        <div className="min-w-0 flex-1">
          {/* A free user gets a static quote here. Labelling it "Coach Runko
              says" would pass it off as the AI coach and make the tier look
              broken rather than free, so the kicker tells the truth. */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
            {premium ? t.dashboard.coachSays : t.paywall.thoughtOfDay}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-200">
            {message || <span className="animate-pulse-dot text-zinc-500">{t.common.thinking}</span>}
          </p>
          {!premium && (
            <p className="mt-2 text-xs text-zinc-500">{t.paywall.dashboardLocked}</p>
          )}
        </div>
      </section>

      {logError && (
        <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300 animate-fade-in">
          {logError}
        </p>
      )}

      {planEnded && (
        <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200 animate-fade-up">
          {t.dashboard.planEnded}
        </p>
      )}

      {todaysRunUnshown && (
        <p className="mt-3 rounded-xl border border-zinc-700 bg-zinc-900/60 p-3 text-xs leading-relaxed text-zinc-300 animate-fade-in">
          ✓ {t.dashboard.loggedOutsidePlan(`${todaysRun.distance} km`)}
        </p>
      )}

      {adaptedNote && (
        <p className="mt-3 text-xs text-primary animate-fade-up">
          {t.dashboard.adaptedNote}
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
                  {t.plan.phases[currentPlan.plan_json.phase]} {t.dashboard.phaseSuffix}
                </span>
                {currentPlan.plan_json.is_recovery && (
                  <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                    {t.dashboard.recoveryWeek}
                  </span>
                )}
                <span className="text-[10px] text-zinc-600">
                  {t.dashboard.weekOf(currentWeek, lastWeek).toLowerCase()}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">
                {currentPlan.plan_json.intent ||
                  PHASE_INTENT[currentPlan.plan_json.phase] ||
                  ''}
              </p>
              {currentPlan.plan_json.target_volume_km > 0 && (
                <p className="mt-1 text-xs text-zinc-600">
                  {t.dashboard.targetThisWeek(currentPlan.plan_json.target_volume_km)}
                </p>
              )}
            </div>
            <Link
              to="/plan"
              className="shrink-0 rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-700"
            >
              {t.dashboard.fullPlan}
            </Link>
          </div>
        </section>
      )}

      {/* No plan yet — the runner skipped onboarding. Logging still works. */}
      {plans.length === 0 ? (
        <section className="mt-8 animate-fade-up" style={{ animationDelay: '120ms' }}>
          <div className="card flex flex-col items-center px-6 py-10 text-center">
            <p className="text-4xl">🗺️</p>
            <h2 className="mt-4 text-xl font-bold">{t.dashboard.noPlanTitle}</h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-400">
              {t.dashboard.noPlanBody}
            </p>

            <button
              onClick={() => navigate('/onboarding?rebuild=1')}
              className="btn-primary mt-6 w-full max-w-xs"
            >
              {t.dashboard.createPlan}
            </button>

            <Link to="/log" className="mt-3 text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-300">
              {t.dashboard.orLogRun}
            </Link>
          </div>

          {workouts.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-zinc-500">
                {t.dashboard.recentRuns}
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
                        : t.dashboard.missedWorkout}
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
          <h2 className="text-lg font-bold">{isCurrentWeek ? t.dashboard.thisWeek : t.dashboard.trainingPlan}</h2>
          {plans.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedWeek(Math.max(1, viewWeek - 1))}
                disabled={viewWeek <= 1}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 transition enabled:hover:border-primary enabled:hover:text-primary disabled:opacity-30"
                aria-label={t.common.back}
              >
                ‹
              </button>
              <span className="min-w-[7rem] text-center text-xs text-zinc-400">
                {t.dashboard.weekOf(viewWeek, lastWeek)}
                {isCurrentWeek && <span className="text-primary"> · {t.common.current}</span>}
              </span>
              <button
                onClick={() => setSelectedWeek(Math.min(lastWeek, viewWeek + 1))}
                disabled={viewWeek >= lastWeek}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 transition enabled:hover:border-primary enabled:hover:text-primary disabled:opacity-30"
                aria-label={t.common.continue}
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
              {t.dashboard.unlocks(shortDate(viewWeekStart))}
            </span>
          )}
        </div>

        {days.length === 0 ? (
          <div className="card text-center text-zinc-400">
            {t.dashboard.emptyWeek}
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
                isToday={dayDates[i] === today}
                locked={isFutureWeek}
                canLog={isCurrentWeek}
                onQuickLog={quickLog}
                quickLogging={quickLoggingDay === day.day}
              />
            ))}
          </div>
        )}

        {!isCurrentWeek && days.length > 0 && (
          <button
            onClick={() => setSelectedWeek(currentWeek)}
            className="btn-ghost mt-4 w-full text-sm"
          >
            {t.dashboard.backToThisWeek}
          </button>
        )}

        {/* Something that was not in the plan. */}
        <button
          onClick={() => navigate('/log')}
          className="btn-ghost mt-4 w-full text-sm"
        >
          + {t.dashboard.logSomethingElse}
        </button>

        {/* Rebuilding is a first-class action, not something buried in
            Settings — goals and circumstances change often. */}
        <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 text-center">
          <p className="text-sm font-semibold">{t.dashboard.goalChanged}</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">
            {t.dashboard.goalChangedBody}
          </p>
          <button
            onClick={() => navigate('/onboarding?rebuild=1')}
            className="btn-primary mt-4 w-full max-w-xs"
          >
            {t.dashboard.createNewPlan}
          </button>
        </div>
      </section>
      )}
    </main>
  )
}
