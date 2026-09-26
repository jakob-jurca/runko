import { useAuth } from '../context/AuthContext'
import HealthProfile from '../components/HealthProfile'
import BackBar from '../components/ScreenHeader'
import { Screen } from '../components/ui'
import { t } from '../../src/core/strings'

/** Zdravstveni profil: its own screen, opened from Settings. */
export default function HealthScreen() {
  const { profile, refreshProfile } = useAuth()
  if (!profile) return null
  return (
    <Screen edges={['top', 'bottom']}>
      <BackBar title={t.settings.health.title} />
      <HealthProfile profile={profile} onChanged={refreshProfile} />
    </Screen>
  )
}
