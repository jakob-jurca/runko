import '../global.css'
import { Stack } from 'expo-router'
import { t } from '../../src/core/strings'

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
