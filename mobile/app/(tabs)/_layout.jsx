import { Redirect, Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { t } from '../../../src/core/strings'
import { useAuth } from '../../context/AuthContext'
import { FullScreenSpinner } from '../../components/ui'
import { colors } from '../../lib/theme'

/** Signed-in area. Same guard as the web's <Protected>: recovery, session, profile. */
export default function TabsLayout() {
  const { session, profile, loading, recovery } = useAuth()
  const insets = useSafeAreaInsets()
  if (loading) return <FullScreenSpinner />
  if (recovery) return <Redirect href="/reset-password" />
  if (!session) return <Redirect href="/auth" />
  if (!profile) return <Redirect href="/onboarding" />

  const icon = (name) =>
    function TabIcon({ color, focused }) {
      return <Ionicons name={focused ? name : `${name}-outline`} size={24} color={color} />
    }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.zinc500,
        tabBarLabelStyle: { fontFamily: 'Geist_500Medium', fontSize: 11 },
        tabBarStyle: {
          backgroundColor: colors.canvas,
          borderTopColor: colors.line,
          height: 56 + insets.bottom,
          paddingTop: 6,
        },
        sceneStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t.nav.home, tabBarIcon: icon('home') }} />
      <Tabs.Screen name="chat" options={{ title: t.nav.coach, tabBarIcon: icon('chatbubble-ellipses') }} />
      <Tabs.Screen name="log" options={{ title: t.nav.log, tabBarIcon: icon('add-circle') }} />
      <Tabs.Screen name="settings" options={{ title: t.nav.settings, tabBarIcon: icon('settings') }} />
      <Tabs.Screen name="plan" options={{ href: null }} />
    </Tabs>
  )
}
