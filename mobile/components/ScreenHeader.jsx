import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { t } from '../../src/core/strings'
import { Text } from './ui'

/** Back button row for screens outside the tab bar. */
export default function BackBar({ title }) {
  const router = useRouter()
  return (
    <View className="mb-2 flex-row items-center gap-1">
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        accessibilityLabel={t.common.back}
        hitSlop={8}
        className="h-11 w-11 items-center justify-center rounded-full active:bg-surface-raised"
      >
        <Ionicons name="chevron-back" size={22} color="#E4E4E7" />
      </Pressable>
      {!!title && <Text className="text-lg font-semibold">{title}</Text>}
    </View>
  )
}
