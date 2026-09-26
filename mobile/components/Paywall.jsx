import { useState } from 'react'
import { View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { PLANS, startCheckout } from '../../src/core/subscription'
import { t } from '../../src/core/strings'
import { Button, Card, Text } from './ui'
import { colors } from '../lib/theme'

/**
 * Shown when the trial has expired and a premium feature is opened. UI only:
 * who has premium is decided by core/subscription.js and enforced server-side
 * by the ai-proxy Edge Function. The subscribe button is a "coming soon"
 * (startCheckout returns that message until RevenueCat/Stripe is wired in).
 */
export default function Paywall({ feature = t.paywall.featureDefault }) {
  const plan = PLANS[0]
  const [notice, setNotice] = useState('')

  const handleCheckout = async () => {
    const result = await startCheckout(plan.id)
    setNotice(result.message)
  }

  return (
    <View className="px-1 py-6">
      <View className="mb-6 h-14 w-14 items-center justify-center rounded-2xl bg-primary-faint">
        <Ionicons name="lock-closed-outline" size={28} color={colors.primary} />
      </View>
      <Text className="text-2xl font-bold">{t.paywall.title}</Text>
      <Text className="mt-2 leading-6 text-zinc-400">{t.paywall.body(feature, plan.name)}</Text>

      <Card className="mt-8">
        <View className="flex-row items-baseline justify-between">
          <Text className="font-semibold">{plan.name}</Text>
          <Text className="text-lg font-semibold tabular-nums text-primary-light">{plan.price}</Text>
        </View>
        <View className="mt-4 gap-2">
          {plan.features.map((f) => (
            <View key={f} className="flex-row items-start gap-2.5">
              <Ionicons name="checkmark" size={16} color={colors.primary} style={{ marginTop: 3 }} />
              <Text className="flex-1 text-sm leading-5 text-zinc-300">{f}</Text>
            </View>
          ))}
        </View>
        <Button className="mt-6" title={t.paywall.subscribe} onPress={handleCheckout} />
        {notice ? (
          <Text className="mt-3 text-center text-xs text-primary-light">{notice}</Text>
        ) : (
          <Text className="mt-3 text-center text-xs text-zinc-500">{t.paywall.freeNote}</Text>
        )}
      </Card>
    </View>
  )
}
