import Paywall from '../components/Paywall'
import BackBar from '../components/ScreenHeader'
import { Screen } from '../components/ui'
import { t } from '../../src/core/strings'

export default function PaywallScreen() {
  return (
    <Screen edges={['top', 'bottom']}>
      <BackBar />
      <Paywall feature={t.paywall.featureChat} />
    </Screen>
  )
}
