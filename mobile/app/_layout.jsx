import '../global.css'
import { useEffect } from 'react'
import { View } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import {
  useFonts,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  Geist_800ExtraBold,
} from '@expo-google-fonts/geist'
import { AuthProvider } from '../context/AuthContext'
import { isSupabaseConfigured } from '../../src/core/supabase'
import { t } from '../../src/core/strings'
import { Text } from '../components/ui'
import { colors } from '../lib/theme'

SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    Geist_800ExtraBold,
  })
  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {})
  }, [loaded, error])
  if (!loaded && !error) return null

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          {!isSupabaseConfigured && (
            <View className="bg-amber-400 px-4 pb-2 pt-10">
              <Text className="text-center text-sm font-medium text-black">{t.errors.supabaseMissing}</Text>
            </View>
          )}
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
