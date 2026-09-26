import { useCallback, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, Switch, View } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useAuth } from '../../context/AuthContext'
import { addWorkout, getPlans, getWorkouts, currentWeekNumber, todayISO } from '../../../src/core/db'
import { coachReaction } from '../../../src/core/ai'
import { maybeAdaptPlan } from '../../../src/core/plan'
import { hasPremium } from '../../../src/core/subscription'
import { validateLogDate, DEFAULT_EFFORT } from '../../../src/core/logging'
import { t } from '../../../src/core/strings'
import DateField from '../../components/DateField'
import { Button, Card, ErrorText, Input, Label, Screen, Text } from '../../components/ui'
import { parseDecimal, parseWhole } from '../../lib/parse'
import { colors } from '../../lib/theme'

const EFFORTS = t.log.efforts

/** A number field with its unit inside, on the right. */
function UnitInput({ unit, ...props }) {
  return (
    <View>
      <Input {...props} className="pr-14 text-lg tabular-nums" />
      <View pointerEvents="none" className="absolute inset-y-0 right-4 justify-center">
        <Text className="text-sm text-zinc-500">{unit}</Text>
      </View>
    </View>
  )
}

/**
 * Manual logging. Opened from a workout card it arrives prefilled; opened from
 * the tab or "Vpiši nekaj drugega" it is empty (unplanned run). Time trials
 * take minutes and seconds. Dates: today or earlier, never the future.
 * After saving: the coach reacts and the plan may adapt (premium only).
 */
function LogForm({ params, onDone }) {
  const { profile } = useAuth()
  const router = useRouter()
  const isTrial = params.type === 'time_trial'
  const plannedDay = params.day

  const [distance, setDistance] = useState(params.distance || '')
  const [duration, setDuration] = useState(params.duration || '')
  const [effort, setEffort] = useState(Number(params.effort) || DEFAULT_EFFORT)
  const [date, setDate] = useState(params.date || todayISO())
  const [seconds, setSeconds] = useState('')
  const [notes, setNotes] = useState(isTrial ? params.title || '' : '')
  const [missed, setMissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  const submit = async () => {
    const dateCheck = validateLogDate(date)
    if (!dateCheck.ok) return setError(dateCheck.reason === 'future' ? t.log.futureDate : t.log.invalidDate)

    const km = missed ? 0 : parseDecimal(distance)
    const min = missed ? 0 : parseDecimal(duration)
    const sec = missed || !isTrial ? 0 : parseWhole(seconds)
    if (!missed && (!(km > 0) || !(min > 0) || Number.isNaN(sec) || sec > 59)) return setError(t.log.invalidNumbers)

    setBusy(true)
    setError('')
    try {
      const workout = await addWorkout({
        user_id: profile.id,
        date,
        distance: km,
        duration: isTrial ? Math.round((min + sec / 60) * 100) / 100 : min,
        effort: missed ? 1 : effort,
        notes: missed ? `Izpuščen trening${plannedDay ? ` (${plannedDay})` : ''}. ${notes}`.trim() : notes,
        source: 'manual',
      })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})

      const [plans, recent] = await Promise.all([getPlans(profile.id), getWorkouts(profile.id, { limit: 8 })])
      const plan = plans.find((p) => p.week_number === currentWeekNumber(plans)) ?? null

      let reaction = missed ? t.log.fallbackMissed : t.log.fallbackReaction
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
      setDone({ reaction, adapted: Boolean(adapted), premium })
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Screen>
        <View className="mt-8 h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15">
          <Ionicons name="checkmark" size={28} color="#6EE7B7" />
        </View>
        <Text className="mt-6 text-2xl font-bold">{t.log.doneTitle}</Text>
        <Card className="mt-6">
          {done.premium && <Text className="text-xs font-semibold text-primary-light">{t.chat.title}</Text>}
          <Text className={`text-[15px] leading-6 ${done.premium ? 'mt-1.5' : ''}`}>{done.reaction}</Text>
          {!done.premium && (
            <Text className="mt-3 text-xs leading-5 text-zinc-500">
              {t.paywall.logLocked}{' '}
              <Text className="text-xs text-primary-light underline" onPress={() => router.push('/paywall')}>
                {t.paywall.ended}
              </Text>
            </Text>
          )}
        </Card>
        {done.adapted && <Text className="mt-4 text-sm text-primary-light">{t.log.adapted}</Text>}
        <Button className="mt-8" title={t.log.backToDashboard} onPress={() => router.replace('/(tabs)')} />
      </Screen>
    )
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-canvas">
      <Screen>
        <Text className="text-[28px] font-bold">{t.log.title}</Text>
        {!!plannedDay && (
          <Text className="mt-1 text-sm text-zinc-400">
            {t.log.fromPlan}: <Text className="text-sm font-medium text-primary-light">{params.title || plannedDay}</Text>
          </Text>
        )}

        <View className="mt-6 gap-6">
          <Card className="flex-row items-center justify-between gap-4 py-4">
            <View className="flex-1">
              <Text className="font-medium">{t.log.missed}</Text>
              <Text className="mt-0.5 text-sm text-zinc-500">{t.log.subtitle}</Text>
            </View>
            <Switch
              value={missed}
              onValueChange={setMissed}
              trackColor={{ false: '#3F3F46', true: colors.primary }}
              thumbColor="#fff"
            />
          </Card>

          {!missed && (
            <>
              <View>
                <Label>{t.log.date}</Label>
                <DateField value={date} onChange={setDate} max={todayISO()} />
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Label>{t.log.distance}</Label>
                  <UnitInput unit="km" value={distance} onChangeText={setDistance} keyboardType="decimal-pad" placeholder="5,0" />
                </View>
                <View className="flex-1">
                  <Label>{t.log.duration}</Label>
                  <UnitInput
                    unit={isTrial ? t.goals.logMinutes : 'min'}
                    value={duration}
                    onChangeText={setDuration}
                    keyboardType={isTrial ? 'number-pad' : 'decimal-pad'}
                    placeholder={isTrial ? '25' : '30'}
                  />
                </View>
              </View>
              {isTrial && (
                <View>
                  <Label>{t.goals.logSeconds}</Label>
                  <UnitInput unit={t.goals.logSeconds} value={seconds} onChangeText={setSeconds} keyboardType="number-pad" placeholder="30" />
                  <Text className="mt-1.5 text-xs text-zinc-500">{t.goals.logTrialHint}</Text>
                </View>
              )}

              <View>
                <Label>{t.log.effort}</Label>
                <View className="flex-row gap-1.5 rounded-2xl border border-surface-line bg-surface p-1.5">
                  {EFFORTS.map((ef) => (
                    <Pressable
                      key={ef.v}
                      onPress={() => setEffort(ef.v)}
                      accessibilityState={{ selected: effort === ef.v }}
                      className={`min-h-[64px] flex-1 items-center justify-center gap-1 rounded-xl px-1 ${
                        effort === ef.v ? 'border border-primary/60 bg-primary-faint' : ''
                      }`}
                    >
                      <Text className="text-lg">{ef.emoji}</Text>
                      <Text className={`text-center text-[10px] font-medium leading-3 ${effort === ef.v ? 'text-primary-light' : 'text-zinc-400'}`}>
                        {ef.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </>
          )}

          <View>
            <Label>{t.log.notes}</Label>
            <Input
              value={notes}
              onChangeText={setNotes}
              placeholder={t.log.notesPlaceholder}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              className="min-h-[88px]"
            />
          </View>

          {!!error && (
            <View className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-3">
              <ErrorText>{error}</ErrorText>
            </View>
          )}

          <Button busy={busy} onPress={submit} title={missed ? t.log.missed : t.log.submit} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  )
}

export default function Log() {
  const params = useLocalSearchParams()
  const [resetKey, setResetKey] = useState(0)
  const finished = useRef(false)

  // A tab keeps its state when you leave it. Once a run is saved, leaving the
  // screen resets the form so the next visit starts empty.
  useFocusEffect(
    useCallback(
      () => () => {
        if (finished.current) {
          finished.current = false
          setResetKey((k) => k + 1)
        }
      },
      [],
    ),
  )
  const sig = JSON.stringify(params)
  return <LogForm key={`${resetKey}:${sig}`} params={params} onDone={() => (finished.current = true)} />
}
