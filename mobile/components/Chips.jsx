import { Pressable, View } from 'react-native'
import { Text } from './ui'

/** A 44 px pill choice. */
export function Chip({ label, selected, onPress, className = '' }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      className={`min-h-[44px] items-center justify-center rounded-full px-4 py-2 active:opacity-80 ${
        selected ? 'bg-primary' : 'border border-white/10 bg-surface-raised'
      } ${className}`}
    >
      <Text className={`text-sm font-medium ${selected ? 'text-white' : 'text-zinc-300'}`}>{label}</Text>
    </Pressable>
  )
}

/** A question with pill answers. Tapping the chosen answer again clears it (optional fields). */
export function Choice({ label, value, onChange, options }) {
  return (
    <View>
      <Text className="text-sm font-medium leading-5 text-zinc-200">{label}</Text>
      <View className="mt-2 flex-row flex-wrap gap-2">
        {options.map((o) => (
          <Chip
            key={String(o.value)}
            label={o.label}
            selected={value === o.value}
            onPress={() => onChange(value === o.value ? null : o.value)}
          />
        ))}
      </View>
    </View>
  )
}
