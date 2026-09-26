import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import * as Linking from 'expo-linking'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../src/core/supabase'
import { getProfile } from '../../src/core/db'
import { parseAuthLink } from '../lib/auth-link'

/**
 * AuthContext (mobile) — same contract as the web AuthContext.
 *
 * Recovery protection: the emailed link gives a REAL session, so the app must
 * not let it in until the password is changed. The recovery flag is written
 * BEFORE the session from the link is set, persisted (a cold start with a
 * recovery session still finds it), and cleared only on success, cancel or
 * sign-out. Native has no URL for supabase-js to parse (detectSessionInUrl is
 * off), so the link is read here and turned into a session with setSession.
 */
const AuthContext = createContext(null)

const RECOVERY_KEY = 'runko_password_recovery'
const ONBOARDING_DRAFT_KEY = 'runko_onboarding_v1'

async function writeRecoveryFlag(on) {
  try {
    if (on) await AsyncStorage.setItem(RECOVERY_KEY, '1')
    else await AsyncStorage.removeItem(RECOVERY_KEY)
  } catch { /* the in-memory flag still covers the session */ }
}

/** Where the reset email should send the runner back to (runko:// in a build, exp:// in Expo Go). */
export const resetRedirectUrl = () => Linking.createURL('reset-password')

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)
  const [linkFailed, setLinkFailed] = useState(false)
  const handled = useRef(new Set())

  const consumeLink = useCallback(async (url) => {
    const link = parseAuthLink(url)
    if (link.kind === null || handled.current.has(url)) return
    handled.current.add(url)
    if (link.kind === 'error') {
      console.warn('[reset] Recovery link rejected:', link.errorCode)
      setLinkFailed(true)
      return
    }
    setLinkFailed(false)
    await writeRecoveryFlag(true)
    setRecovery(true)
    const { error } = await supabase.auth.setSession({
      access_token: link.accessToken,
      refresh_token: link.refreshToken,
    })
    if (error) {
      console.warn('[reset] Could not start recovery session:', error.message)
      await writeRecoveryFlag(false)
      setRecovery(false)
      setLinkFailed(true)
    }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const flag = (await AsyncStorage.getItem(RECOVERY_KEY).catch(() => null)) === '1'
      const initialUrl = await Linking.getInitialURL().catch(() => null)
      if (initialUrl) await consumeLink(initialUrl)
      const { data } = await supabase.auth.getSession()
      if (!alive) return
      if (data.session) {
        // getSession() only reads storage; validate with the auth server so a
        // deleted user or revoked refresh token lands on the login screen.
        const { error } = await supabase.auth.getUser()
        if (error) {
          console.warn('[auth] Stored session is no longer valid — clearing it:', error.message)
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
          await writeRecoveryFlag(false)
          setRecovery(false)
          setSession(null)
          setLoading(false)
          return
        }
        if (flag) setRecovery(true)
        setSession(data.session)
      } else {
        // A leftover flag with no session behind it has nothing left to protect.
        await writeRecoveryFlag(false)
        setRecovery(false)
        setLoading(false)
      }
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        writeRecoveryFlag(true)
        setRecovery(true)
      } else if (event === 'SIGNED_OUT') {
        writeRecoveryFlag(false)
        setRecovery(false)
      }
      setSession(newSession)
    })
    const linkSub = Linking.addEventListener('url', ({ url }) => consumeLink(url))
    return () => {
      alive = false
      sub.subscription.unsubscribe()
      linkSub.remove()
    }
  }, [consumeLink])

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

  const clearRecovery = useCallback(async () => {
    await writeRecoveryFlag(false)
    setRecovery(false)
    setLinkFailed(false)
  }, [])

  const cancelRecovery = useCallback(async () => {
    await writeRecoveryFlag(false)
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    setRecovery(false)
    setLinkFailed(false)
  }, [])

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(ONBOARDING_DRAFT_KEY).catch(() => {})
    await writeRecoveryFlag(false)
    setRecovery(false)
    return supabase.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, recovery, linkFailed, clearRecovery, cancelRecovery, refreshProfile, signOut }}
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
