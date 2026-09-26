import { View, Text } from 'react-native'
import { t } from '../../src/core/strings'
import { vdotFromRace } from '../../src/core/periodization'
import { isSupabaseConfigured } from '../../src/core/supabase'
import { allDocuments } from '../../src/core/knowledge'

export default function Home() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <Text className="text-white text-2xl">{t.app?.name ?? 'Runko'}</Text>
      <Text className="text-primary">core ok: VDOT {vdotFromRace(5, 25).toFixed(1)}, supabase {String(isSupabaseConfigured)}, docs {allDocuments().length}</Text>
    </View>
  )
}
