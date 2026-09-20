import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../core/supabase'
import { getProfile } from '../core/db'

/**
 * AuthContext — holds the Supabase session and the Runko profile row.
 * profile === null while logged in means onboarding hasn't been completed.
 *
 * Password recovery needs special handling. Clicking the emailed link gives
 * the user a REAL session, so without intercepting it they would sail past
 * the auth guards straight into the dashboard and never be asked for a new
 * password. When Supabase fires PASSWORD_RECOVERY we raise a flag, and the
 * route guards in App.jsx divert to /reset-password until it is cleared.
 */
const AuthContext = createContext(null)

/**
 * The flag is mirrored into sessionStorage because PASSWORD_RECOVERY fires
 * exactly once, when the SDK parses the link out of the URL. A reload (or
 * React refreshing the tree) during the reset would otherwise drop the flag
 * and let the half-finished recovery through. Cleared on success and on
 * sign-out; scoped to the tab, so it cannot linger.
 */
const RECOVERY_KEY = 'runko_password_recovery'

/**
 * True if the URL we were opened with is a recovery link.
 *
 * Belt and braces for a real race: the Supabase client parses the URL while
 * it initialises, which can fire PASSWORD_RECOVERY *before* the listener
 * below is attached. Reading the link directly means a missed event cannot
 * strand the user on the login screen — the bug being fixed here.
 */
function urlIsRecoveryLink() {
  try {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const query = new URLSearchParams(window.location.search)
    return hash.get('type') === 'recovery' || query.get('type') === 'recovery'
  } catch {
    return false
  }
}

function readRecoveryFlag() {
  if (urlIsRecoveryLink()) {
    writeRecoveryFlag(true)
    return true
  }
  try {
    return sessionStorage.getItem(RECOVERY_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Drop the recovery token from the address bar.
 *
 * Called only when FINISHING a recovery, never at startup — stripping it
 * early would race the Supabase client, which is still reading the same URL
 * to build the session. Doing it here stops a reload from re-detecting the
 * link and looping the user back into reset mode, and gets the token out of
 * browser history while we are at it.
 */
function cleanRecoveryUrl() {
  try {
    if (!window.location.hash && !window.location.search) return
    window.history.replaceState(null, '', window.location.pathname)
  } catch {
    /* no history API — the sessionStorage flag still governs */
  }
}

function writeRecoveryFlag(on) {
  try {
    if (on) sessionStorage.setItem(RECOVERY_KEY, '1')
    else sessionStorage.removeItem(RECOVERY_KEY)
  } catch {
    /* private mode — the in-memory flag still covers the common path */
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(readRecoveryFlag)

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
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Not a normal login: this session exists only so the user can set a
        // new password. App.jsx diverts every route to /reset-password while
        // this is true.
        writeRecoveryFlag(true)
        setRecovery(true)
      } else if (event === 'SIGNED_OUT') {
        writeRecoveryFlag(false)
        setRecovery(false)
      }
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

  /** Called once the new password is saved, so the app stops diverting. */
  const clearRecovery = useCallback(() => {
    writeRecoveryFlag(false)
    cleanRecoveryUrl()
    setRecovery(false)
  }, [])

  const signOut = useCallback(() => {
    // Drop any in-progress onboarding draft (same key as pages/Onboarding.jsx)
    // so the next account on this browser doesn't inherit it.
    localStorage.removeItem('runko_onboarding_v1')
    writeRecoveryFlag(false)
    cleanRecoveryUrl()
    setRecovery(false)
    return supabase.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, recovery, clearRecovery, refreshProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
