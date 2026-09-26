import { useState } from 'react'
import { Platform, Pressable, View } from 'react-native'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { Input, Text } from './ui'
import { colors } from '../lib/theme'

const iso = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const fromIso = (s) => {
  const d = new Date(`${s}T00:00:00`)
  return Number.isNaN(d.getTime()) ? new Date() : d
}
const pretty = (s) => fromIso(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

/**
 * A date as YYYY-MM-DD. Native date picker on iOS and Android, capped at
 * `max` (today: a run cannot be logged in the future); a plain text field in
 * the browser preview, where the native picker does not exist.
 */
export default function DateField({ value, onChange, max, min }) {
  const [showIos, setShowIos] = useState(false)
  const maxDate = max ? fromIso(max) : undefined
  const minDate = min ? fromIso(min) : undefined

  if (Platform.OS === 'web') {
    return <Input value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" autoCapitalize="none" />
  }

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fromIso(value),
        maximumDate: maxDate,
        minimumDate: minDate,
        mode: 'date',
        onChange: (_, d) => d && onChange(iso(d)),
      })
    } else {
      setShowIos((s) => !s)
    }
  }

  return (
    <View>
      <Pressable
        onPress={open}
        className="min-h-[48px] flex-row items-center justify-between rounded-xl border border-white/10 bg-surface-raised px-4 py-3 active:opacity-80"
      >
        <Text className="text-base">{pretty(value)}</Text>
        <Ionicons name="calendar-outline" size={20} color={colors.zinc400} />
      </Pressable>
      {Platform.OS === 'ios' && showIos && (
        <DateTimePicker
          value={fromIso(value)}
          mode="date"
          display="inline"
          maximumDate={maxDate}
          minimumDate={minDate}
          themeVariant="dark"
          accentColor={colors.primary}
          onChange={(_, d) => d && onChange(iso(d))}
        />
      )}
    </View>
  )
}
