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
import {
  ArrowsClockwise, CaretLeft, CaretRight, CheckCircle, Info, LockSimple, MapTrifold, Plus, WarningCircle,
} from '@phosphor-icons/react'
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

  if (loading) return <DashboardSkeleton />

  return (
    <main className="mx-auto max-w-2xl px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6">
      {/* header */}
      <header className="flex items-start justify-between gap-4 animate-fade-up">
        <div className="min-w-0">
          <p className="text-sm text-zinc-500">{greeting()},</p>
          <h1 className="mt-0.5 truncate text-[1.75rem] font-bold leading-tight tracking-tight">
            {profile.name?.split(' ')[0] || t.dashboard.runnerFallback}
          </h1>
          {isTrialActive(profile) ? (
            <p className="mt-1 text-xs font-medium text-primary-light">
              {t.dashboard.trialLeft(trialDaysLeft(profile))}
            </p>
          ) : (
            // The trial countdown's slot, once it has run out. Without this the
            // free tier is indistinguishable from a broken premium one.
            !premium && (
              <Link to="/chat" className="mt-1 inline-block text-xs font-medium text-zinc-500 underline underline-offset-4">
                {t.paywall.ended}
              </Link>
            )
          )}
        </div>
        <img src="/runko.svg" alt="Runko" className="mt-1 h-9 w-9 shrink-0 md:hidden" />
      </header>

      {/* coach message + progress ring */}
      <section className="card mt-5 flex items-center gap-5 animate-fade-up" style={{ animationDelay: '60ms' }}>
        <ProgressRing percent={percent} size={92} stroke={8} />
        <div className="min-w-0 flex-1">
          {/* A free user gets a static quote here. Labelling it "Coach Runko
              says" would pass it off as the AI coach and make the tier look
              broken rather than free, so the kicker tells the truth. */}
          <p className="text-xs font-semibold text-primary-light">
            {premium ? t.dashboard.coachSays : t.paywall.thoughtOfDay}
          </p>
          <p className="mt-1 text-[15px] leading-relaxed text-zinc-100">
            {message || <span className="animate-pulse-dot text-zinc-500">{t.common.thinking}</span>}
          </p>
          {!premium && <p className="mt-2 text-xs text-zinc-500">{t.paywall.dashboardLocked}</p>}
        </div>
      </section>

      {logError && (
        <Notice tone="error" icon={WarningCircle}>
          {logError}
        </Notice>
      )}

      {planEnded && (
        <Notice tone="warn" icon={Info}>
          {t.dashboard.planEnded}
        </Notice>
      )}

      {todaysRunUnshown && (
        <Notice tone="neutral" icon={CheckCircle}>
          {t.dashboard.loggedOutsidePlan(`${todaysRun.distance} km`)}
        </Notice>
      )}

      {adaptedNote && <p className="mt-3 text-xs text-primary-light animate-fade-up">{t.dashboard.adaptedNote}</p>}

      {/* Which phase the runner is in, and what it is for */}
      {currentPlan?.plan_json?.phase && (
        <section className="mt-3 rounded-card bg-surface/60 p-5 ring-1 ring-inset ring-surface-line animate-fade-up" style={{ animationDelay: '100ms' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className={`text-sm font-semibold ${phaseStyle(currentPlan.plan_json.phase).text}`}>
                  {t.plan.phases[currentPlan.plan_json.phase]} {t.dashboard.phaseSuffix}
                </span>
                {currentPlan.plan_json.is_recovery && (
                  <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[11px] font-medium text-zinc-300">
                    {t.dashboard.recoveryWeek}
                  </span>
                )}
                <span className="text-xs text-zinc-500">{t.dashboard.weekOf(currentWeek, lastWeek).toLowerCase()}</span>
              </div>
              <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-zinc-300">
                {currentPlan.plan_json.intent || PHASE_INTENT[currentPlan.plan_json.phase] || ''}
              </p>
              {currentPlan.plan_json.target_volume_km > 0 && (
                <p className="mt-1.5 font-mono text-xs text-zinc-500">
                  {currentPlan.plan_json.unit === 'time'
                    ? t.dashboard.targetThisWeekTime(currentPlan.plan_json.target_minutes)
                    : t.dashboard.targetThisWeek(currentPlan.plan_json.target_volume_km)}
                </p>
              )}
            </div>
            <Link
              to="/plan"
              className="flex min-h-[36px] shrink-0 items-center gap-1 rounded-full bg-surface-raised px-3 text-xs font-medium text-zinc-300 ring-1 ring-inset ring-white/10 transition hover:text-white"
            >
              {t.dashboard.fullPlan}
              <CaretRight size={12} />
            </Link>
          </div>
        </section>
      )}

      {/* No plan yet — the runner skipped onboarding. Logging still works. */}
      {plans.length === 0 ? (
        <section className="mt-8 animate-fade-up" style={{ animationDelay: '120ms' }}>
          <div className="card px-6 py-9">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-faint text-primary">
              <MapTrifold size={26} />
            </span>
            <h2 className="mt-5 text-xl font-semibold">{t.dashboard.noPlanTitle}</h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-400">{t.dashboard.noPlanBody}</p>

            <button onClick={() => navigate('/onboarding?rebuild=1')} className="btn-primary mt-6 w-full sm:w-auto">
              {t.dashboard.createPlan}
            </button>

            <Link
              to="/log"
              className="mt-4 block text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-300"
            >
              {t.dashboard.orLogRun}
            </Link>
          </div>

          {workouts.length > 0 && (
            <div className="mt-8">
              <h3 className="section-title mb-3">{t.dashboard.recentRuns}</h3>
              <ul className="overflow-hidden rounded-card bg-surface ring-1 ring-inset ring-surface-line">
                {workouts.slice(0, 5).map((w) => (
                  <li
                    key={w.id}
                    className="flex items-center justify-between gap-4 border-b border-surface-line px-5 py-3.5 text-sm last:border-b-0"
                  >
                    <span className="text-zinc-400">{shortDate(w.date)}</span>
                    <span className="font-mono font-medium">
                      {Number(w.distance) > 0 ? `${w.distance} km · ${w.duration} min` : t.dashboard.missedWorkout}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : (
        /* weekly plan */
        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{isCurrentWeek ? t.dashboard.thisWeek : t.dashboard.trainingPlan}</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSelectedWeek(Math.max(1, viewWeek - 1))}
                disabled={viewWeek <= 1}
                className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition enabled:hover:bg-surface-raised enabled:hover:text-primary enabled:active:scale-90 disabled:opacity-30"
                aria-label={t.common.back}
              >
                <CaretLeft size={18} />
              </button>
              <span className="min-w-[6.5rem] text-center text-xs text-zinc-400">
                {t.dashboard.weekOf(viewWeek, lastWeek)}
                {isCurrentWeek && <span className="block text-[11px] text-primary-light">{t.common.current}</span>}
              </span>
              <button
                onClick={() => setSelectedWeek(Math.min(lastWeek, viewWeek + 1))}
                disabled={viewWeek >= lastWeek}
                className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition enabled:hover:bg-surface-raised enabled:hover:text-primary enabled:active:scale-90 disabled:opacity-30"
                aria-label={t.common.continue}
              >
                <CaretRight size={18} />
              </button>
            </div>
          </div>

          <div className="mb-4 mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm text-zinc-500">
            <span className="min-w-0">
              <span className="font-mono text-xs">
                {shortDate(viewWeekStart)} - {shortDate(dayDates[6])}
              </span>
              {plan?.plan_json?.focus ? <span className="block text-zinc-400">{plan.plan_json.focus}</span> : null}
            </span>
            {isFutureWeek && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-surface-raised px-2 py-1 text-xs text-zinc-400">
                <LockSimple size={12} />
                {t.dashboard.unlocks(shortDate(viewWeekStart))}
              </span>
            )}
          </div>

          {days.length === 0 ? (
            <div className="card text-center text-sm text-zinc-400">{t.dashboard.emptyWeek}</div>
          ) : (
            <div className="space-y-2.5">
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
            <button onClick={() => setSelectedWeek(currentWeek)} className="btn-ghost mt-4 w-full text-sm">
              {t.dashboard.backToThisWeek}
            </button>
          )}

          {/* Something that was not in the plan. */}
          <button onClick={() => navigate('/log')} className="btn-ghost mt-3 w-full text-sm">
            <Plus size={16} weight="bold" />
            {t.dashboard.logSomethingElse}
          </button>

          {/* Rebuilding is a first-class action, not something buried in
              Settings — goals and circumstances change often. */}
          <div className="mt-10 border-t border-surface-line pt-6">
            <p className="text-sm font-semibold">{t.dashboard.goalChanged}</p>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-zinc-500">{t.dashboard.goalChangedBody}</p>
            <button
              onClick={() => navigate('/onboarding?rebuild=1')}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full px-1 text-sm font-semibold text-primary-light transition hover:text-primary"
            >
              <ArrowsClockwise size={16} />
              {t.dashboard.createNewPlan}
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

const NOTICE_TONES = {
  error: 'bg-rose-500/10 text-rose-200 ring-rose-500/25',
  warn: 'bg-amber-500/10 text-amber-100 ring-amber-500/25',
  neutral: 'bg-surface text-zinc-300 ring-surface-line',
}

/** An inline message under the summary: an icon and one short paragraph. */
function Notice({ tone, icon: Icon, children }) {
  return (
    <p className={`mt-3 flex items-start gap-2.5 rounded-xl p-3.5 text-sm leading-relaxed ring-1 ring-inset animate-fade-in ${NOTICE_TONES[tone]}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/** The dashboard's shape while it loads, instead of a spinner. */
function DashboardSkeleton() {
  return (
    <main className="mx-auto max-w-2xl px-4 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6" aria-busy="true">
      <div className="skeleton h-4 w-24" />
      <div className="skeleton mt-2 h-8 w-40" />
      <div className="skeleton mt-5 h-[124px] rounded-card" />
      <div className="skeleton mt-8 h-6 w-32" />
      <div className="mt-4 space-y-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-40 rounded-card" />
        ))}
      </div>
    </main>
  )
}
