import { useEffect, useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../context/AuthContext'
import { currentWeekNumber, weekStartISO } from '../../../src/core/db'
import { PHASE_INTENT, goalLabel } from '../../../src/core/periodization'
import { getHydratedPlans } from '../../../src/core/plan'
import { t } from '../../../src/core/strings'
import BackBar from '../../components/ScreenHeader'
import { Button, Card, FullScreenSpinner, Screen, Text } from '../../components/ui'
import { PHASE_STYLES, phaseStyle } from '../../lib/phase'

const VERDICT_STYLES = { feasible: 'text-emerald-400', stretch: 'text-amber-400', unsafe: 'text-rose-400' }

const shortDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function Line({ label, children, valueClass = '' }) {
  return (
    <Text className="text-xs leading-5 text-zinc-400">
      <Text className="text-xs font-semibold text-zinc-300">{label}:</Text> <Text className={`text-xs ${valueClass || 'text-zinc-400'}`}>{children}</Text>
    </Text>
  )
}

/** What kind of plan this is, how the goal was judged, and what was built instead if it was unsafe. */
function VerdictCard({ explain }) {
  return (
    <View className="mt-3 gap-1 rounded-xl bg-zinc-950/60 p-3">
      <Line label={t.plan.scenarioLabel}>{explain.scenario_label}</Line>
      {!!explain.verdict_label && (
        <Line label={t.plan.verdictLabel} valueClass={`font-semibold ${VERDICT_STYLES[explain.verdict] || ''}`}>
          {explain.verdict_label}
        </Line>
      )}
      {explain.verdict === 'unsafe' && !!explain.original_goal_text && (
        <>
          <Line label={t.plan.originalGoal}>{explain.original_goal_text}</Line>
          <Line label={t.plan.builtFor}>{explain.adopted_goal_text}</Line>
          {!!explain.other_options?.[0] && <Line label={t.plan.otherOption}>{explain.other_options[0]}</Line>}
        </>
      )}
      {explain.verdict === 'stretch' && !!explain.fallback_text && <Line label={t.plan.fallbackLabel}>{explain.fallback_text}</Line>}
    </View>
  )
}

/** Plan overview: every week with its phase, the volume curve and what each phase builds toward. */
export default function Plan() {
  const { profile } = useAuth()
  const router = useRouter()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [openWeek, setOpenWeek] = useState(null)

  useEffect(() => {
    let cancelled = false
    getHydratedPlans(profile)
      .then((rows) => !cancelled && setPlans(rows))
      .catch((err) => console.error(err))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [profile])

  const currentWeek = useMemo(() => currentWeekNumber(plans), [plans])
  const timeBased = plans.length > 0 && plans.every((row) => row.plan_json?.unit === 'time')
  const weeks = useMemo(
    () =>
      plans.map((row) => {
        const j = row.plan_json || {}
        const inMinutes = j.unit === 'time'
        const minutes = j.target_minutes ?? (j.days || []).reduce((s, d) => s + (d.type === 'race' ? 0 : Number(d.duration_min) || 0), 0)
        const km = j.target_volume_km ?? (j.days || []).reduce((s, d) => s + (Number(d.distance_km) || 0), 0)
        const volume = timeBased ? minutes : km
        return {
          number: row.week_number,
          phase: j.phase || 'base',
          isRecovery: Boolean(j.is_recovery),
          focus: j.focus || '',
          intent: j.intent || '',
          volume: Math.round(volume * 10) / 10,
          ownVolume: Math.round((inMinutes ? minutes : km) * 10) / 10,
          ownUnit: inMinutes ? t.common.min : t.common.km,
          days: j.days || [],
          start: weekStartISO(plans, row.week_number),
        }
      }),
    [plans, timeBased],
  )

  if (loading) return <FullScreenSpinner />

  if (!weeks.length) {
    return (
      <Screen>
        <BackBar />
        <Text className="text-2xl font-extrabold">{t.plan.title}</Text>
        <Card className="mt-6 items-center">
          <Text className="text-center text-zinc-400">{t.plan.noPlan}</Text>
          <Button className="mt-4" title={t.dashboard.createPlan} onPress={() => router.push({ pathname: '/onboarding', params: { rebuild: '1' } })} />
        </Card>
      </Screen>
    )
  }

  const peak = Math.max(1, ...weeks.map((w) => w.volume))
  const totalKm = Math.round(weeks.reduce((s, w) => s + w.volume, 0))
  const vdot = plans[0]?.plan_json?.vdot
  const paces = plans[0]?.plan_json?.paces
  const intro = plans[0]?.plan_json?.intro
  const explain = plans[0]?.plan_json?.planning?.explain
  const unit = timeBased ? t.common.min : t.common.km
  const hasWalkRun = plans.some((row) => row.plan_json?.unit === 'time')
  const genericWording = plans[0]?.plan_json?.ai_described === false

  const blocks = []
  for (const w of weeks) {
    const last = blocks[blocks.length - 1]
    if (last && last.phase === w.phase) last.count++
    else blocks.push({ phase: w.phase, count: 1 })
  }

  return (
    <Screen>
      <BackBar />
      <Text className="text-2xl font-extrabold">{t.plan.title}</Text>
      <Text className="mt-1 text-sm text-zinc-500">
        {timeBased ? t.plan.summaryTime(weeks.length, Math.round(totalKm / 60)) : t.plan.summary(weeks.length, totalKm)}
        {vdot && !hasWalkRun ? ` · VDOT ${vdot}` : ''}
      </Text>
      <Text className="mt-1 text-sm font-medium text-primary">
        {explain?.goal_plan ? explain.adopted_goal_text : explain?.verdict === 'unsafe' ? explain.adopted_goal_text : goalLabel(profile)}
      </Text>

      {genericWording && (
        <Text className="mt-4 rounded-xl bg-zinc-950/60 p-3 text-xs leading-5 text-zinc-400">
          {t.paywall.planLocked}{' '}
          <Text className="text-xs text-primary underline" onPress={() => router.push('/paywall')}>
            {t.paywall.ended}
          </Text>
        </Text>
      )}

      {!!intro && (
        <Card className="mt-6">
          <Text className="text-xs font-semibold text-primary-light">Coach Runko</Text>
          <Text className="mt-1.5 text-sm leading-5 text-zinc-200">{intro}</Text>
          {explain && <VerdictCard explain={explain} />}
        </Card>
      )}

      <Text className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-xs leading-5 text-zinc-400">{t.plan.rangeNote}</Text>

      {paces && !hasWalkRun && (
        <Card className="mt-6">
          <Text className="mb-3 text-base font-semibold">{t.plan.yourPaces}</Text>
          <View className="flex-row flex-wrap">
            {Object.entries(paces).map(([name, p]) => (
              <View key={name} className="w-1/2 flex-row items-baseline justify-between gap-2 py-1 pr-4">
                <Text className="text-xs capitalize text-zinc-500">{name}</Text>
                <Text className="text-sm font-semibold tabular-nums">{p.label}/km</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      <Card className="mt-4">
        <View className="mb-1 flex-row items-baseline justify-between">
          <Text className="text-base font-semibold">{t.plan.weeklyVolume}</Text>
          <Text className="text-xs text-zinc-500">{t.plan.peak(peak, unit)}</Text>
        </View>
        <View className="mb-2 h-1.5 flex-row gap-0.5 overflow-hidden rounded-full">
          {blocks.map((b, i) => (
            <View key={i} className={`h-1.5 opacity-70 ${phaseStyle(b.phase).bar}`} style={{ flexGrow: b.count }} />
          ))}
        </View>
        <View className="h-36 flex-row items-end gap-1">
          {weeks.map((w) => {
            const s = phaseStyle(w.phase)
            const isNow = w.number === currentWeek
            return (
              <Pressable
                key={w.number}
                onPress={() => setOpenWeek(openWeek === w.number ? null : w.number)}
                accessibilityLabel={t.plan.weekTooltip(w.number, w.volume, w.isRecovery, unit)}
                className="h-full flex-1 justify-end"
              >
                <View
                  className={`w-full rounded-t ${s.bar} ${w.isRecovery ? 'opacity-40' : 'opacity-85'} ${isNow ? 'border-2 border-white/70' : ''}`}
                  style={{ height: `${Math.max(4, (w.volume / peak) * 100)}%` }}
                />
                <Text className={`mt-1 text-center text-[9px] ${isNow ? 'font-bold text-primary' : 'text-zinc-600'}`}>{w.number}</Text>
              </Pressable>
            )
          })}
        </View>
        <View className="mt-3 flex-row flex-wrap gap-x-4 gap-y-1">
          {Object.entries(PHASE_STYLES)
            .filter(([phase]) => blocks.some((b) => b.phase === phase))
            .map(([phase, s]) => (
              <View key={phase} className="flex-row items-center gap-1.5">
                <View className={`h-2 w-2 rounded-full ${s.bar}`} />
                <Text className="text-[10px] text-zinc-500">{s.label}</Text>
              </View>
            ))}
          <View className="flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-full bg-zinc-500 opacity-40" />
            <Text className="text-[10px] text-zinc-500">{t.plan.recoveryWeekLegend}</Text>
          </View>
        </View>
      </Card>

      <Text className="mb-3 mt-6 text-base font-semibold">{t.plan.weekByWeek}</Text>
      <View className="gap-2">
        {weeks.map((w) => {
          const s = phaseStyle(w.phase)
          const isNow = w.number === currentWeek
          const open = openWeek === w.number
          return (
            <View key={w.number} className={`overflow-hidden rounded-card border bg-surface ${isNow ? 'border-primary/50' : 'border-surface-line'}`}>
              <Pressable onPress={() => setOpenWeek(open ? null : w.number)} accessibilityState={{ expanded: open }} className="flex-row items-center gap-3 p-4">
                <View className="w-9 items-center">
                  <Text className={`text-lg font-extrabold ${isNow ? 'text-primary' : ''}`}>{w.number}</Text>
                  <Text className="text-[9px] uppercase text-zinc-600">{t.common.week}</Text>
                </View>
                <View className="flex-1">
                  <View className="flex-row flex-wrap items-center gap-2">
                    <View className={`rounded-md px-1.5 py-0.5 ${s.chip}`}>
                      <Text className={`text-[11px] font-semibold ${s.chipText}`}>{s.label}</Text>
                    </View>
                    {w.isRecovery && (
                      <View className="rounded-full bg-zinc-700/40 px-2 py-0.5">
                        <Text className="text-[10px] font-bold uppercase text-zinc-400">{t.plan.recoveryShort}</Text>
                      </View>
                    )}
                    {isNow && <Text className="text-[10px] font-bold uppercase text-primary">{t.common.current}</Text>}
                  </View>
                  <Text numberOfLines={1} className="mt-1 text-sm text-zinc-300">{w.focus || s.label}</Text>
                  <Text className="mt-0.5 text-xs text-zinc-600">
                    {shortDate(w.start)} · {w.ownVolume} {w.ownUnit}
                  </Text>
                </View>
                <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color="#52525B" />
              </Pressable>
              {open && (
                <View className="border-t border-zinc-800 px-4 py-3">
                  {!!w.intent && <Text className="mb-3 text-xs italic text-zinc-500">{w.intent}</Text>}
                  <View className="gap-1.5">
                    {w.days.map((d) => (
                      <View key={d.day} className="flex-row items-baseline gap-2">
                        <Text className="w-9 text-xs text-zinc-600">{d.day.slice(0, 3)}</Text>
                        <View className="flex-1">
                          <Text className={`text-xs ${d.type === 'rest' ? 'text-zinc-600' : 'text-zinc-200'}`}>
                            {d.title || d.type}
                            {d.time_based && d.type !== 'race' && d.duration_min > 0 ? (
                              <Text className="text-xs text-zinc-500"> — {d.duration_min} min</Text>
                            ) : d.distance_km > 0 ? (
                              <Text className="text-xs text-zinc-500">
                                {' '}— {d.distance_km} km{d.pace ? ` @ ${d.pace}` : ''}
                              </Text>
                            ) : null}
                          </Text>
                          {!!d.purpose && <Text className="text-[11px] italic text-zinc-600">{d.purpose}</Text>}
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )
        })}
      </View>

      <View className="mt-6 rounded-xl bg-zinc-950/60 p-4">
        <Text className="mb-1 text-xs font-semibold text-zinc-400">{t.plan.howBuilt}</Text>
        <Text className="text-xs leading-5 text-zinc-500">
          {t.plan.howBuiltBody}{' '}
          {Object.entries(PHASE_INTENT)
            .filter(([p]) => blocks.some((b) => b.phase === p))
            .map(([p, intent]) => `${phaseStyle(p).label.toLowerCase()} — ${intent}`)
            .join('; ')}
          .
        </Text>
      </View>
    </Screen>
  )
}
