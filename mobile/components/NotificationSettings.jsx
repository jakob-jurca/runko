import { useEffect, useState } from 'react'
import { Platform, Pressable, Switch, View } from 'react-native'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { useAuth } from '../context/AuthContext'
import { getHydratedPlans } from '../../src/core/plan'
import { t } from '../../src/core/strings'
import { Card, Input, Text } from './ui'
import { loadReminderSettings, saveReminderSettings, ensurePermission, rescheduleReminders } from '../lib/notifications'
import { DEFAULT_REMINDERS, parseTime, formatTime } from '../lib/reminders'
import { colors } from '../lib/theme'

const asDate = (hhmm) => {
  const { hour, minute } = parseTime(hhmm)
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d
}
const fromDate = (d) => formatTime({ hour: d.getHours(), minute: d.getMinutes() })

/** Time of day: native picker on the phone, an HH:MM field in the browser preview. */
function TimeField({ value, onChange }) {
  if (Platform.OS === 'web') return <Input className="w-28" value={value} onChangeText={onChange} placeholder="07:30" />
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={asDate(value)}
        mode="time"
        display="compact"
        themeVariant="dark"
        accentColor={colors.primary}
        onChange={(_, d) => d && onChange(fromDate(d))}
      />
    )
  }
  return (
    <Pressable
      onPress={() =>
        DateTimePickerAndroid.open({ value: asDate(value), mode: 'time', is24Hour: true, onChange: (_, d) => d && onChange(fromDate(d)) })
      }
      className="min-h-[44px] justify-center rounded-xl border border-white/10 bg-surface-raised px-4"
    >
      <Text className="text-base tabular-nums">{value}</Text>
    </Pressable>
  )
}

/**
 * "Opomniki": morning reminder with today's workout at a time the runner
 * picks, and an evening-before reminder for long runs and quality sessions.
 * Both start OFF; turning one on asks for the notification permission.
 */
export default function NotificationSettings() {
  const { profile } = useAuth()
  const [settings, setSettings] = useState(DEFAULT_REMINDERS)
  const [loaded, setLoaded] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadReminderSettings().then((s) => {
      setSettings(s)
      setLoaded(true)
    })
  }, [])

  const apply = async (next) => {
    setSettings(next)
    await saveReminderSettings(next)
    try {
      await rescheduleReminders(await getHydratedPlans(profile), next)
    } catch {
      /* no plan yet: nothing to schedule */
    }
  }

  const toggle = async (key, on) => {
    setMessage('')
    if (on) {
      const permission = await ensurePermission()
      if (permission !== 'granted') {
        setMessage(permission === 'denied' ? t.reminders.denied : t.reminders.unavailable)
        return
      }
    }
    await apply({ ...settings, [key]: on })
  }

  if (!loaded) return null
  const R = t.reminders
  return (
    <Card className="mt-4">
      <Text className="mb-1 text-base font-semibold">{R.title}</Text>
      <Text className="mb-4 text-sm leading-5 text-zinc-500">{R.body}</Text>

      <View className="flex-row items-center justify-between gap-4">
        <View className="flex-1">
          <Text className="font-medium">{R.morning}</Text>
          <Text className="mt-0.5 text-sm leading-5 text-zinc-500">{R.morningHint}</Text>
        </View>
        <Switch value={settings.morning} onValueChange={(v) => toggle('morning', v)} trackColor={{ false: '#3F3F46', true: colors.primary }} thumbColor="#fff" />
      </View>
      {settings.morning && (
        <View className="mt-3 flex-row items-center justify-between">
          <Text className="text-sm text-zinc-400">{R.time}</Text>
          <TimeField value={settings.morningTime} onChange={(v) => apply({ ...settings, morningTime: v })} />
        </View>
      )}

      <View className="mt-5 flex-row items-center justify-between gap-4 border-t border-surface-line pt-5">
        <View className="flex-1">
          <Text className="font-medium">{R.evening}</Text>
          <Text className="mt-0.5 text-sm leading-5 text-zinc-500">{R.eveningHint}</Text>
        </View>
        <Switch value={settings.evening} onValueChange={(v) => toggle('evening', v)} trackColor={{ false: '#3F3F46', true: colors.primary }} thumbColor="#fff" />
      </View>

      {!!message && <Text className="mt-3 text-sm text-amber-300">{message}</Text>}
    </Card>
  )
}
