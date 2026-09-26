import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../context/AuthContext'
import { isTrialActive, trialDaysLeft, hasActiveSubscription, startCheckout } from '../../../src/core/subscription'
import { getMemories, deleteMemory } from '../../../src/core/memory'
import { goalLabel } from '../../../src/core/periodization'
import { maxHeartRate } from '../../../src/core/heart-rate'
import { t } from '../../../src/core/strings'
import { Button, Card, Screen, Text } from '../../components/ui'
import NotificationSettings from '../../components/NotificationSettings'
import { colors } from '../../lib/theme'

function Row({ label, value, last }) {
  return (
    <View className={`flex-row justify-between gap-4 py-2.5 ${last ? '' : 'border-b border-surface-line'}`}>
      <Text className="text-sm text-zinc-500">{label}</Text>
      <Text numberOfLines={1} className="flex-1 text-right text-sm font-medium">{value || '-'}</Text>
    </View>
  )
}

export default function Settings() {
  const { session, profile, signOut } = useAuth()
  const router = useRouter()
  const [notice, setNotice] = useState('')
  const [memories, setMemories] = useState([])
  const [memoryError, setMemoryError] = useState('')

  useEffect(() => {
    let cancelled = false
    getMemories(profile.id)
      .then((rows) => !cancelled && setMemories(rows))
      .catch((err) => !cancelled && setMemoryError(err.message))
    return () => {
      cancelled = true
    }
  }, [profile.id])

  const forget = async (id) => {
    const previous = memories
    setMemories((rows) => rows.filter((r) => r.id !== id))
    try {
      await deleteMemory(id)
    } catch (err) {
      setMemories(previous)
      setMemoryError(err.message)
    }
  }

  const handleCheckout = async () => {
    const result = await startCheckout()
    setNotice(result.message)
    setTimeout(() => setNotice(''), 5000)
  }

  const rows = [
    [t.settings.name, profile.name],
    [t.settings.email, session.user.email],
    [t.settings.age, profile.age],
    [t.settings.weight, profile.weight ? `${profile.weight} kg` : null],
    [t.settings.level, t.settings.levels[profile.fitness_level]],
    [t.settings.goal, goalLabel(profile)],
    [t.settings.maxHr, maxHeartRate(profile.age) ? `${maxHeartRate(profile.age)} bpm` : null],
  ]

  return (
    <Screen>
      <Text className="text-[28px] font-bold">{t.settings.title}</Text>

      <Card className="mt-6">
        <Text className="mb-4 text-base font-semibold">{t.settings.profile}</Text>
        {rows.map(([label, value], i) => (
          <Row key={label} label={label} value={value} last={i === rows.length - 1} />
        ))}
      </Card>

      <Pressable
        onPress={() => router.push('/health')}
        className="mt-4 min-h-[56px] flex-row items-center gap-3 rounded-card border border-surface-line bg-surface px-5 py-4 active:opacity-80"
      >
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.zinc400} />
        <Text className="flex-1 text-base font-semibold">{t.settings.health.title}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.zinc500} />
      </Pressable>

      <NotificationSettings />

      <Card className="mt-4">
        <Text className="mb-1 text-base font-semibold">{t.settings.memoryTitle}</Text>
        <Text className="mb-4 text-sm leading-5 text-zinc-500">{t.settings.memoryBody}</Text>
        {memories.length === 0 ? (
          <Text className="text-sm text-zinc-500">{t.settings.memoryEmpty}</Text>
        ) : (
          <View className="gap-2">
            {memories.map((m) => (
              <View key={m.id} className="flex-row items-start gap-3 rounded-xl bg-canvas/70 p-3">
                <View className="mt-0.5 rounded-md bg-primary-faint px-1.5 py-0.5">
                  <Text className="text-[11px] font-semibold text-primary-light">{t.settings.memoryCategories[m.category] || m.category}</Text>
                </View>
                <Text className="flex-1 text-sm leading-5 text-zinc-200">{m.content}</Text>
                <Pressable
                  onPress={() => forget(m.id)}
                  accessibilityLabel={t.settings.forget}
                  hitSlop={6}
                  className="-m-1.5 h-10 w-10 items-center justify-center rounded-full active:bg-rose-500/10"
                >
                  <Ionicons name="close" size={18} color={colors.zinc500} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
        {!!memoryError && <Text className="mt-3 text-sm text-rose-300">{memoryError}</Text>}
      </Card>

      <Card className="mt-4">
        <Text className="mb-1 text-base font-semibold">{t.settings.planTitle}</Text>
        <Text className="mb-4 text-sm leading-5 text-zinc-500">{t.settings.planBody}</Text>
        <Button title={t.settings.createNewPlan} onPress={() => router.push({ pathname: '/onboarding', params: { rebuild: '1' } })} />
      </Card>

      <Card className="mt-4">
        <Text className="mb-4 text-base font-semibold">{t.settings.subscription}</Text>
        {hasActiveSubscription(profile) ? (
          <Text className="text-sm">
            <Text className="text-sm font-semibold text-primary-light">{t.subscription.planName}</Text> · {t.settings.premiumActive}
          </Text>
        ) : isTrialActive(profile) ? (
          <>
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="font-semibold">{t.settings.trial}</Text>
                <Text className="text-sm text-zinc-400">{t.settings.trialDaysLeft(trialDaysLeft(profile))}</Text>
              </View>
              <View className="rounded-md bg-primary-faint px-2 py-1">
                <Text className="text-[11px] font-semibold text-primary-light">TRIAL</Text>
              </View>
            </View>
            <Button variant="ghost" className="mt-4" title={t.settings.subscribeEarly} onPress={handleCheckout} />
          </>
        ) : (
          <>
            <Text className="text-sm text-zinc-400">{t.settings.trialEnded}</Text>
            <Button className="mt-4" title={t.settings.upgrade} onPress={handleCheckout} />
          </>
        )}
        {!!notice && <Text className="mt-3 text-center text-xs text-primary-light">{notice}</Text>}
      </Card>

      <Pressable
        onPress={signOut}
        className="mt-6 min-h-[48px] items-center justify-center rounded-full border border-white/10 bg-surface-raised px-6 py-3 active:bg-rose-500/10"
      >
        <Text className="font-semibold text-rose-300">{t.settings.signOut}</Text>
      </Pressable>

      <Text className="mt-8 text-center text-xs text-zinc-600">{t.settings.version}</Text>
    </Screen>
  )
}
