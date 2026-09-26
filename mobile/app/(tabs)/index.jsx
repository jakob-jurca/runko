import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, RefreshControl, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useAuth } from '../../context/AuthContext'
import {
  getWorkouts, addWorkout, startOfWeekISO, addDaysISO, weekStartISO, currentWeekNumber, todayISO,
} from '../../../src/core/db'
import { plannedWorkoutRow } from '../../../src/core/logging'
import { motivationalMessage } from '../../../src/core/ai'
import { adaptCurrentWeekIfNeeded, getHydratedPlans } from '../../../src/core/plan'
import { PHASE_INTENT } from '../../../src/core/periodization'
import { hasPremium, trialDaysLeft, isTrialActive } from '../../../src/core/subscription'
import { goalProgress, repeatParams } from '../../../src/core/goal-progress'
import { t } from '../../../src/core/strings'
import ProgressRing from '../../components/ProgressRing'
import WorkoutCard from '../../components/WorkoutCard'
import Logo from '../../components/Logo'
import { GoalProgressCard, BlockEndCard } from '../../components/GoalProgress'
import { Button, Card, FullScreenSpinner, Screen, SectionTitle, Text } from '../../components/ui'
import { phaseStyle } from '../../lib/phase'
import { cacheGet, cacheSet } from '../../lib/daily-cache'
import { colors } from '../../lib/theme'
import { rescheduleReminders } from '../../lib/notifications'

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

function shortDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

const NOTICE_TONES = {
  error: { box: 'border-rose-500/25 bg-rose-500/10', text: 'text-rose-200', icon: '#FECDD3', name: 'warning-outline' },
  warn: { box: 'border-amber-500/25 bg-amber-500/10', text: 'text-amber-100', icon: '#FEF3C7', name: 'information-circle-outline' },
  neutral: { box: 'border-surface-line bg-surface', text: 'text-zinc-300', icon: '#D4D4D8', name: 'checkmark-circle-outline' },
}

function Notice({ tone, children }) {
  const s = NOTICE_TONES[tone]
  return (
    <View className={`mt-3 flex-row items-start gap-2.5 rounded-xl border p-3.5 ${s.box}`}>
      <Ionicons name={s.name} size={18} color={s.icon} style={{ marginTop: 2 }} />
      <Text className={`flex-1 text-sm leading-5 ${s.text}`}>{children}</Text>
    </View>
  )
}

export default function Dashboard() {
  const { profile } = useAuth()
  const router = useRouter()
  const [plans, setPlans] = useState([])
  const [workouts, setWorkouts] = useState([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [adaptedNote, setAdaptedNote] = useState(false)
  const [quickLoggingDay, setQuickLoggingDay] = useState(null)
  const [logError, setLogError] = useState('')
  const loaded = useRef(false)

  const premium = hasPremium(profile)
  const currentWeek = useMemo(() => currentWeekNumber(plans), [plans])
  const lastWeek = plans.length ? plans[plans.length - 1].week_number : 1
  const viewWeek = selectedWeek ?? currentWeek
  const plan = plans.find((p) => p.week_number === viewWeek) ?? null
  const currentPlan = plans.find((p) => p.week_number === currentWeek) ?? null
  const isCurrentWeek = viewWeek === currentWeek
  const isFutureWeek = viewWeek > currentWeek

  const viewWeekStart = useMemo(() => weekStartISO(plans, viewWeek), [plans, viewWeek])
  const dayDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(viewWeekStart, i)), [viewWeekStart])

  /** Load plans and runs; quietly re-fit a new week's plan to last week's logs. */
  const load = useCallback(async () => {
    const [p, w] = await Promise.all([getHydratedPlans(profile), getWorkouts(profile.id, { limit: 100 })])
    setPlans(p)
    setWorkouts(w)
    const adapted = await adaptCurrentWeekIfNeeded(profile, p, w).catch(() => null)
    if (adapted) {
      setPlans((prev) => prev.map((row) => (row.week_number === adapted.week_number ? adapted : row)))
      setAdaptedNote(true)
    }
  }, [profile])

  useEffect(() => {
    let cancelled = false
    load()
      .catch((err) => console.error(err))
      .finally(() => {
        if (!cancelled) {
          loaded.current = true
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [load])

  // Coming back from the log screen: re-read the runs so the checkmark shows.
  useFocusEffect(
    useCallback(() => {
      if (!loaded.current) return
      getWorkouts(profile.id, { limit: 100 }).then(setWorkouts).catch(() => {})
    }, [profile.id]),
  )

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await load()
    } catch (err) {
      console.error(err)
    } finally {
      setRefreshing(false)
    }
  }

  /** One tap: log the planned session exactly as prescribed. */
  const quickLog = async (day, date) => {
    const row = plannedWorkoutRow(day, { userId: profile.id, date })
    if (!row) return
    setQuickLoggingDay(day.day)
    setLogError('')
    try {
      const saved = await addWorkout(row)
      setWorkouts((prev) => [saved, ...prev])
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch (err) {
      setLogError(err.message)
    } finally {
      setQuickLoggingDay(null)
    }
  }

  // Daily message: AI at most once a day per device (cached), a static quote for free users.
  useEffect(() => {
    if (loading) return
    let cancelled = false
    ;(async () => {
      const cacheKey = `runko_motd_${todayISO()}`
      const cached = await cacheGet(cacheKey)
      if (cancelled) return
      if (cached) return setMessage(cached)
      const fallback = FALLBACK_QUOTES[new Date().getDate() % FALLBACK_QUOTES.length]
      if (!hasPremium(profile) || !currentPlan) return setMessage(fallback)
      try {
        const m = await motivationalMessage(profile, currentPlan, workouts.filter((w) => w.date >= startOfWeekISO()))
        if (cancelled) return
        setMessage(m.trim())
        cacheSet(cacheKey, m.trim())
      } catch {
        if (!cancelled) setMessage(fallback)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlan?.id, loading])

  // Keep local reminders in step with the plan (no-op unless the runner opted in).
  useEffect(() => {
    if (!loading && plans.length) rescheduleReminders(plans).catch(() => {})
  }, [plans, loading])

  const days = plan?.plan_json?.days ?? []
  const today = todayISO()
  const loggedDates = useMemo(() => new Set(workouts.filter((w) => Number(w.distance) > 0).map((w) => w.date)), [workouts])
  const completedFlags = dayDates.map((d) => loggedDates.has(d))
  const planEnded = plans.length > 0 && weekStartISO(plans, lastWeek) < startOfWeekISO()
  const todaysRun = workouts.find((w) => w.date === today && Number(w.distance) > 0)
  const todaysRunUnshown = Boolean(todaysRun) && !dayDates.includes(today)

  const progress = useMemo(() => (plans.length ? goalProgress({ plans, workouts }) : null), [plans, workouts])
  const showBlockEnd = progress && (progress.inLastWeek || progress.ended)
  const nextBlock = (choice) => {
    const params = { rebuild: '1' }
    if (choice === 'repeat') {
      // repeatParams gives a query string ("goal=..&weeks=.."), the router wants an object.
      for (const [k, v] of new URLSearchParams(repeatParams(progress.goal))) params[k] = v
    } else params.next = choice
    router.push({ pathname: '/onboarding', params })
  }

  const percent = useMemo(() => {
    const currentDays = currentPlan?.plan_json?.days ?? []
    const start = weekStartISO(plans, currentWeek)
    const flags = currentDays.map((_, i) => loggedDates.has(addDaysISO(start, i)))
    const planned = currentDays.filter((d) => d.type !== 'rest').length || 1
    const done = currentDays.filter((d, i) => d.type !== 'rest' && flags[i]).length
    return (done / planned) * 100
  }, [plans, currentWeek, currentPlan, loggedDates])

  if (loading) return <FullScreenSpinner />

  const phase = currentPlan?.plan_json?.phase
  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1">
          <Text className="text-sm text-zinc-500">{greeting()},</Text>
          <Text numberOfLines={1} className="mt-0.5 text-[28px] font-bold leading-9">
            {profile.name?.split(' ')[0] || t.dashboard.runnerFallback}
          </Text>
          {isTrialActive(profile) ? (
            <Text className="mt-1 text-xs font-medium text-primary-light">{t.dashboard.trialLeft(trialDaysLeft(profile))}</Text>
          ) : (
            !premium && (
              <Pressable onPress={() => router.push('/paywall')} hitSlop={8}>
                <Text className="mt-1 text-xs font-medium text-zinc-500 underline">{t.paywall.ended}</Text>
              </Pressable>
            )
          )}
        </View>
        <Logo size={36} />
      </View>

      <Card className="mt-5 flex-row items-center gap-5">
        <ProgressRing percent={percent} size={92} stroke={8} />
        <View className="flex-1">
          <Text className="text-xs font-semibold text-primary-light">{premium ? t.dashboard.coachSays : t.paywall.thoughtOfDay}</Text>
          <Text className="mt-1 text-[15px] leading-6 text-zinc-100">{message || t.common.thinking}</Text>
          {!premium && <Text className="mt-2 text-xs text-zinc-500">{t.paywall.dashboardLocked}</Text>}
        </View>
      </Card>

      {!!logError && <Notice tone="error">{logError}</Notice>}
      {planEnded && <Notice tone="warn">{t.dashboard.planEnded}</Notice>}
      {todaysRunUnshown && <Notice tone="neutral">{t.dashboard.loggedOutsidePlan(`${todaysRun.distance} km`)}</Notice>}
      {adaptedNote && <Text className="mt-3 text-xs text-primary-light">{t.dashboard.adaptedNote}</Text>}

      {showBlockEnd && <BlockEndCard progress={progress} onNext={nextBlock} />}

      {!!phase && (
        <View className="mt-3 rounded-card border border-surface-line bg-surface/60 p-5">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <View className="flex-row flex-wrap items-baseline gap-x-2 gap-y-1">
                <Text className={`text-sm font-semibold ${phaseStyle(phase).text}`}>
                  {t.plan.phases[phase]} {t.dashboard.phaseSuffix}
                </Text>
                {currentPlan.plan_json.is_recovery && (
                  <View className="rounded-md bg-zinc-800 px-1.5 py-0.5">
                    <Text className="text-[11px] font-medium text-zinc-300">{t.dashboard.recoveryWeek}</Text>
                  </View>
                )}
                <Text className="text-xs text-zinc-500">{t.dashboard.weekOf(currentWeek, lastWeek).toLowerCase()}</Text>
              </View>
              <Text className="mt-1.5 text-sm leading-5 text-zinc-300">
                {currentPlan.plan_json.intent || PHASE_INTENT[phase] || ''}
              </Text>
              {currentPlan.plan_json.target_volume_km > 0 && (
                <Text className="mt-1.5 text-xs tabular-nums text-zinc-500">
                  {currentPlan.plan_json.unit === 'time'
                    ? t.dashboard.targetThisWeekTime(currentPlan.plan_json.target_minutes)
                    : t.dashboard.targetThisWeek(currentPlan.plan_json.target_volume_km)}
                </Text>
              )}
            </View>
            <Pressable
              onPress={() => router.push('/plan')}
              className="min-h-[36px] flex-row items-center gap-1 rounded-full border border-white/10 bg-surface-raised px-3 active:opacity-70"
            >
              <Text className="text-xs font-medium text-zinc-300">{t.dashboard.fullPlan}</Text>
              <Ionicons name="chevron-forward" size={12} color="#D4D4D8" />
            </Pressable>
          </View>
        </View>
      )}

      {progress && <GoalProgressCard progress={progress} />}

      {plans.length === 0 ? (
        <View className="mt-8">
          <Card className="px-6 py-9">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary-faint">
              <Ionicons name="map-outline" size={26} color={colors.primary} />
            </View>
            <Text className="mt-5 text-xl font-semibold">{t.dashboard.noPlanTitle}</Text>
            <Text className="mt-2 text-sm leading-5 text-zinc-400">{t.dashboard.noPlanBody}</Text>
            <Button className="mt-6" title={t.dashboard.createPlan} onPress={() => router.push({ pathname: '/onboarding', params: { rebuild: '1' } })} />
            <Pressable onPress={() => router.push({ pathname: '/log', params: { fresh: String(Date.now()) } })} className="mt-4 self-start py-1">
              <Text className="text-sm text-zinc-500 underline">{t.dashboard.orLogRun}</Text>
            </Pressable>
          </Card>
          {workouts.length > 0 && (
            <View className="mt-8">
              <SectionTitle className="mb-3">{t.dashboard.recentRuns}</SectionTitle>
              <View className="overflow-hidden rounded-card border border-surface-line bg-surface">
                {workouts.slice(0, 5).map((w, i, arr) => (
                  <View
                    key={w.id}
                    className={`flex-row items-center justify-between gap-4 px-5 py-3.5 ${i < arr.length - 1 ? 'border-b border-surface-line' : ''}`}
                  >
                    <Text className="text-sm text-zinc-400">{shortDate(w.date)}</Text>
                    <Text className="text-sm font-medium tabular-nums">
                      {Number(w.distance) > 0 ? `${w.distance} km · ${w.duration} min` : t.dashboard.missedWorkout}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      ) : (
        <View className="mt-8">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-xl font-semibold">{isCurrentWeek ? t.dashboard.thisWeek : t.dashboard.trainingPlan}</Text>
            <View className="flex-row items-center gap-1">
              <Pressable
                onPress={() => setSelectedWeek(Math.max(1, viewWeek - 1))}
                disabled={viewWeek <= 1}
                accessibilityLabel={t.common.back}
                className={`h-11 w-11 items-center justify-center rounded-full ${viewWeek <= 1 ? 'opacity-30' : 'active:bg-surface-raised'}`}
              >
                <Ionicons name="chevron-back" size={18} color="#D4D4D8" />
              </Pressable>
              <View className="min-w-[100px] items-center">
                <Text className="text-xs text-zinc-400">{t.dashboard.weekOf(viewWeek, lastWeek)}</Text>
                {isCurrentWeek && <Text className="text-[11px] text-primary-light">{t.common.current}</Text>}
              </View>
              <Pressable
                onPress={() => setSelectedWeek(Math.min(lastWeek, viewWeek + 1))}
                disabled={viewWeek >= lastWeek}
                accessibilityLabel={t.common.continue}
                className={`h-11 w-11 items-center justify-center rounded-full ${viewWeek >= lastWeek ? 'opacity-30' : 'active:bg-surface-raised'}`}
              >
                <Ionicons name="chevron-forward" size={18} color="#D4D4D8" />
              </Pressable>
            </View>
          </View>

          <View className="mb-4 mt-1 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <View className="flex-1">
              <Text className="text-xs tabular-nums text-zinc-500">
                {shortDate(viewWeekStart)} - {shortDate(dayDates[6])}
              </Text>
              {!!plan?.plan_json?.focus && <Text className="text-sm text-zinc-400">{plan.plan_json.focus}</Text>}
            </View>
            {isFutureWeek && (
              <View className="flex-row items-center gap-1.5 rounded-md bg-surface-raised px-2 py-1">
                <Ionicons name="lock-closed-outline" size={12} color={colors.zinc400} />
                <Text className="text-xs text-zinc-400">{t.dashboard.unlocks(shortDate(viewWeekStart))}</Text>
              </View>
            )}
          </View>

          {days.length === 0 ? (
            <Card>
              <Text className="text-center text-sm text-zinc-400">{t.dashboard.emptyWeek}</Text>
            </Card>
          ) : (
            <View className="gap-2.5">
              {days.map((day, i) => (
                <WorkoutCard
                  key={`${viewWeek}-${day.day}`}
                  day={day}
                  date={dayDates[i]}
                  completed={!isFutureWeek && completedFlags[i]}
                  isToday={dayDates[i] === today}
                  locked={isFutureWeek}
                  canLog={isCurrentWeek}
                  onQuickLog={quickLog}
                  quickLogging={quickLoggingDay === day.day}
                />
              ))}
            </View>
          )}

          {!isCurrentWeek && days.length > 0 && (
            <Button variant="ghost" className="mt-4" title={t.dashboard.backToThisWeek} onPress={() => setSelectedWeek(currentWeek)} />
          )}

          <Button variant="ghost" className="mt-3" onPress={() => router.push({ pathname: '/log', params: { fresh: String(Date.now()) } })}>
            <Ionicons name="add" size={16} color="#E4E4E7" />
            <Text className="text-sm font-semibold text-zinc-200">{t.dashboard.logSomethingElse}</Text>
          </Button>

          <View className="mt-10 border-t border-surface-line pt-6">
            <Text className="text-sm font-semibold">{t.dashboard.goalChanged}</Text>
            <Text className="mt-1 text-sm leading-5 text-zinc-500">{t.dashboard.goalChangedBody}</Text>
            <Pressable
              onPress={() => router.push({ pathname: '/onboarding', params: { rebuild: '1' } })}
              className="mt-4 min-h-[44px] flex-row items-center gap-2 self-start"
            >
              <Ionicons name="refresh" size={16} color="#FB923C" />
              <Text className="text-sm font-semibold text-primary-light">{t.dashboard.createNewPlan}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Screen>
  )
}
