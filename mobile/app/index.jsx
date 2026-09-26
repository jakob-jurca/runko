import { Redirect } from 'expo-router'
import { useAuth } from '../context/AuthContext'
import { FullScreenSpinner } from '../components/ui'

/** Entry: sends the runner to the right place. Recovery always wins. */
export default function Index() {
  const { session, profile, loading, recovery } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (recovery) return <Redirect href="/reset-password" />
  if (!session) return <Redirect href="/auth" />
  if (!profile) return <Redirect href="/onboarding" />
  return <Redirect href="/(tabs)" />
}
