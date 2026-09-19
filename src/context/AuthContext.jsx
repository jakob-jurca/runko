import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../core/supabase'
import { getProfile } from '../core/db'

/**
 * AuthContext — holds the Supabase session and the Runko profile row.
 * profile === null while logged in means onboarding hasn't been completed.
 */
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        // getSession() only reads localStorage; validate the token with the
        // auth server. A deleted user or revoked refresh token leaves a dead
        // session behind (403 on /auth/v1/user, 400 on token refresh) — clear
        // it so the app lands on the login screen instead of half-working.
        const { error } = await supabase.auth.getUser()
        if (error) {
          console.warn('[auth] Stored session is no longer valid — clearing it:', error.message)
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
          setSession(null)
          setLoading(false)
          return
        }
      }
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Load the profile row whenever the session changes.
  useEffect(() => {
    let cancelled = false
    if (!session) {
      setProfile(null)
      return
    }
    setLoading(true)
    getProfile(session.user.id)
      .then((p) => !cancelled && setProfile(p))
      .catch((err) => console.error('Failed to load profile:', err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [session])

  const refreshProfile = useCallback(async () => {
    if (!session) return null
    const p = await getProfile(session.user.id)
    setProfile(p)
    return p
  }, [session])

  const signOut = useCallback(() => {
    // Drop any in-progress onboarding draft (same key as pages/Onboarding.jsx)
    // so the next account on this browser doesn't inherit it.
    localStorage.removeItem('runko_onboarding_v1')
    return supabase.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
