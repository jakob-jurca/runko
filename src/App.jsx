import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { isSupabaseConfigured } from './core/supabase'
import { t } from './core/strings'
import Auth from './pages/Auth'
import ResetPassword from './pages/ResetPassword'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Plan from './pages/Plan'
import Chat from './pages/Chat'
import Log from './pages/Log'
import Settings from './pages/Settings'
import NavBar from './components/NavBar'
import { FullScreenSpinner } from './components/Spinner'

// Only reached when the app booted for a guest on "/" (a stale saved session,
// or a stray URL redirected home). Normally main.jsx serves the landing page
// without the app at all.
const Landing = lazy(() => import('./landing/Landing'))

/** Requires a session AND a completed onboarding profile. */
function Protected({ children }) {
  const { session, profile, loading, recovery } = useAuth()
  if (loading) return <FullScreenSpinner />
  // A recovery session is a real session, so this guard would otherwise wave
  // the user straight through without them ever setting a new password.
  if (recovery) return <Navigate to="/reset-password" replace />
  if (!session) return <Navigate to="/auth" replace />
  if (!profile) return <Navigate to="/onboarding" replace />
  return (
    <div className="min-h-[100dvh] pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-60">
      <NavBar />
      {children}
    </div>
  )
}

/**
 * "/" is the dashboard for a signed-in runner and the landing page for
 * everyone else. Recovery still wins: Protected diverts it to /reset-password.
 */
function Home() {
  const { session, loading, recovery } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (!session && !recovery) {
    return (
      <Suspense fallback={<FullScreenSpinner />}>
        <Landing />
      </Suspense>
    )
  }
  return (
    <Protected>
      <Dashboard />
    </Protected>
  )
}

/**
 * The onboarding flow itself. Open to anyone without a profile (first run),
 * and to existing users who deliberately came back to build a plan —
 * "Create my plan" on the dashboard and "Create new plan" in Settings both
 * link to /onboarding?rebuild=1. Without that flag a finished user is sent
 * home, so a stray /onboarding URL can't wipe their setup.
 */
function OnboardingGate({ children }) {
  const { session, profile, loading, recovery } = useAuth()
  const [params] = useSearchParams()
  if (loading) return <FullScreenSpinner />
  if (recovery) return <Navigate to="/reset-password" replace />
  if (!session) return <Navigate to="/auth" replace />
  if (profile && params.get('rebuild') !== '1') return <Navigate to="/" replace />
  return children
}

/**
 * The login screen. Diverts to /reset-password mid-recovery — the emailed
 * link can land here (it is where an unauthenticated user is sent), and
 * showing a login form at that point is exactly the bug this fixes.
 */
function AuthGate() {
  const { recovery, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (recovery) return <Navigate to="/reset-password" replace />
  return <Auth />
}

function ConfigBanner() {
  if (isSupabaseConfigured) return null
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-amber-400 px-4 py-2 text-center text-sm font-medium text-black">
      {t.errors.supabaseMissing}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ConfigBanner />
        <Routes>
          <Route path="/auth" element={<AuthGate />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/onboarding"
            element={
              <OnboardingGate>
                <Onboarding />
              </OnboardingGate>
            }
          />
          <Route path="/" element={<Home />} />
          <Route
            path="/plan"
            element={
              <Protected>
                <Plan />
              </Protected>
            }
          />
          <Route
            path="/chat"
            element={
              <Protected>
                <Chat />
              </Protected>
            }
          />
          <Route
            path="/log"
            element={
              <Protected>
                <Log />
              </Protected>
            }
          />
          <Route
            path="/settings"
            element={
              <Protected>
                <Settings />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
