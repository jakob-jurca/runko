import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { isSupabaseConfigured } from './core/supabase'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Plan from './pages/Plan'
import Chat from './pages/Chat'
import Log from './pages/Log'
import Settings from './pages/Settings'
import NavBar from './components/NavBar'
import { FullScreenSpinner } from './components/Spinner'

/** Requires a session AND a completed onboarding profile. */
function Protected({ children }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (!session) return <Navigate to="/auth" replace />
  if (!profile) return <Navigate to="/onboarding" replace />
  return (
    <div className="min-h-screen pb-24 md:pb-0 md:pl-60">
      <NavBar />
      {children}
    </div>
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
  const { session, profile, loading } = useAuth()
  const [params] = useSearchParams()
  if (loading) return <FullScreenSpinner />
  if (!session) return <Navigate to="/auth" replace />
  if (profile && params.get('rebuild') !== '1') return <Navigate to="/" replace />
  return children
}

function ConfigBanner() {
  if (isSupabaseConfigured) return null
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-amber-500/90 px-4 py-2 text-center text-sm font-medium text-black">
      Supabase is not configured — copy <code>.env.example</code> to <code>.env</code> and fill in
      your keys, then restart the dev server.
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ConfigBanner />
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route
            path="/onboarding"
            element={
              <OnboardingGate>
                <Onboarding />
              </OnboardingGate>
            }
          />
          <Route
            path="/"
            element={
              <Protected>
                <Dashboard />
              </Protected>
            }
          />
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
