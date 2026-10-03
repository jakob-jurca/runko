import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../core/supabase'
import { getProfile } from '../core/db'
import { parseAuthUrl, failedLinkTarget, recoveryClaimHolds } from '../core/auth-url'
import { isDeadSessionError, signOutHere } from '../core/auth-flows'
import { fetchAccess, finishCheckout } from '../core/subscription'

/**
 * AuthContext — holds the Supabase session, the Runko profile row and the
 * runner's access (core/subscription.js fetchAccess: tier, limits).
 * profile === null while logged in means onboarding hasn't been completed
 * (and `profileError` means we could not find out: see below).
 *
 * Password recovery needs special handling. Clicking the emailed link gives
 * the user a REAL session, so without intercepting it they would sail past
 * the auth guards straight into the dashboard and never be asked for a new
 * password. When Supabase fires PASSWORD_RECOVERY we raise a flag, and the
 * route guards in App.jsx divert to /reset-password until it is cleared.
 */
const AuthContext = createContext(null)

/**
 * The flag is persisted because PASSWORD_RECOVERY fires exactly once, when
 * the SDK parses the link out of the URL. It lives in localStorage, next to
 * the Supabase session it describes: the recovery session is shared by every
 * tab and survives a browser restart, so the flag must too. With a tab-scoped
 * flag, opening the app in a second tab (or reopening the browser) found a
 * valid session, no flag, and walked the user into the dashboard on their old
 * password. Cleared on success, on sign-out, and whenever there is no session.
 */
const RECOVERY_KEY = 'runko_password_recovery'

/** Same key as pages/Onboarding.jsx: an in-progress onboarding draft. */
const ONBOARDING_DRAFT_KEY = 'runko_onboarding_v1'

/** Whose data this browser last held, to notice an account switch. */
const LAST_USER_KEY = 'runko_last_user'

/**
 * A rejected email link (expired, already used) comes back as
 * #error=…&error_code=otp_expired. If Supabase's Redirect URLs allowlist does
 * not include /reset-password it falls back to the Site URL, so the error
 * lands on "/" — where the guards bounce to /auth and drop the hash, leaving
 * the runner on a login screen with no idea why. Move it to /reset-password,
 * which explains and offers a fresh link. Must run before the router reads
 * the URL (see main.jsx).
 */
export function routeFailedAuthLink() {
  try {
    const target = failedLinkTarget(window.location)
    if (target) window.history.replaceState(null, '', target)
  } catch {
    /* no history API — the runner still lands on the login screen */
  }
}

function readStoredRecoveryFlag() {
  try {
    return localStorage.getItem(RECOVERY_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * True if the URL we were opened with is a working recovery link.
 *
 * Belt and braces for a real race: the Supabase client parses the URL while
 * it initialises, which can fire PASSWORD_RECOVERY *before* the listener
 * below is attached. Reading the link directly means a missed event cannot
 * strand the user on the login screen. The claim is checked against the
 * session once there is one (recoveryClaimHolds), because this screen sets a
 * password without asking for the current one.
 */
function urlClaimsRecovery() {
  try {
    return parseAuthUrl(window.location).recoveryLink
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
    /* no history API — the stored flag still governs */
  }
}

function writeRecoveryFlag(on) {
  try {
    if (on) localStorage.setItem(RECOVERY_KEY, '1')
    else localStorage.removeItem(RECOVERY_KEY)
  } catch {
    /* private mode — the in-memory flag still covers the common path */
  }
}

/**
 * Back from Stripe Checkout (?checkout=success&session_id=cs_...): the
 * session id, or null when this is an ordinary load.
 */
function checkoutReturn() {
  try {
    const params = new URLSearchParams(window.location.search)
    return params.get('checkout') === 'success' ? params.get('session_id') || '' : null
  } catch {
    return null
  }
}

/** Drop the Checkout parameters, so a reload does not finish it twice. */
function cleanCheckoutUrl() {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('checkout')) return
    url.searchParams.delete('checkout')
    url.searchParams.delete('session_id')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  } catch {
    /* no history API: the parameters only cause one extra sync */
  }
}

/** Was anyone signed in here when the page loaded? (supabase-js key: sb-<ref>-auth-token) */
function hasStoredSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      if (/^sb-.+-auth-token$/.test(localStorage.key(i) ?? '')) return true
    }
  } catch {
    /* storage blocked: nothing is stored either */
  }
  return false
}

/** Last resort for a sign-out the server could not be told about. */
function dropStoredSession() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i))
    for (const key of keys) if (/^sb-.+-auth-token/.test(key ?? '')) localStorage.removeItem(key)
  } catch {
    /* nothing stored, nothing to drop */
  }
}

function dropOnboardingDraft() {
  try {
    localStorage.removeItem(ONBOARDING_DRAFT_KEY)
  } catch {
    /* private mode */
  }
}

/**
 * A different account than last time in this browser (a recovery link opened
 * while someone else was signed in, or a second person on a shared laptop):
 * the previous runner's onboarding draft must not become the new one's.
 */
function noteUser(userId) {
  if (!userId) return
  try {
    const previous = localStorage.getItem(LAST_USER_KEY)
    if (previous && previous !== userId) dropOnboardingDraft()
    localStorage.setItem(LAST_USER_KEY, userId)
  } catch {
    /* private mode */
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  // The profile row together with whose it is: a row is only ever shown for
  // the user it was loaded for, so an account switch cannot show the last
  // runner's profile for even one render.
  const [loaded, setLoaded] = useState({ userId: null, profile: null })
  // Until the stored session (or its absence) is known.
  const [booting, setBooting] = useState(true)
  const [recovery, setRecovery] = useState(() => readStoredRecoveryFlag() || urlClaimsRecovery())
  // The profile could not be read (offline, server error). Without this a
  // failed read looked like "no profile" and sent a runner with a finished
  // setup back into onboarding.
  const [profileError, setProfileError] = useState(false)
  const [profileAttempt, setProfileAttempt] = useState(0)
  // What the server says this runner may use, with whose it is (as for the
  // profile). Read from the entitlement function, never computed here.
  const [accessState, setAccessState] = useState({ userId: null, access: null })
  const [accessError, setAccessError] = useState(false)
  // The session ended without the runner asking: expired, revoked, or signed
  // out in another tab. The login screen says so instead of just appearing.
  const [sessionEnded, setSessionEnded] = useState(false)

  const askedToSignOut = useRef(false)
  const hadSession = useRef(hasStoredSession())
  const recoveryEventSeen = useRef(false)

  useEffect(() => {
    // Only a link nobody has vouched for yet needs checking against the session.
    const unverifiedClaim = urlClaimsRecovery() && !readStoredRecoveryFlag()

    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        // A leftover flag with no session behind it (recovery session expired,
        // or signed out elsewhere) has nothing left to protect.
        writeRecoveryFlag(false)
        setRecovery(false)
        setSession(null)
        setBooting(false)
        return
      }
      noteUser(data.session.user.id)
      if (unverifiedClaim && !recoveryEventSeen.current) {
        if (recoveryClaimHolds(data.session)) writeRecoveryFlag(true)
        else setRecovery(false)
      }
      setSession(data.session)
      setBooting(false)

      // getSession() only reads localStorage; validate the token with the
      // auth server. A deleted user or revoked refresh token leaves a dead
      // session behind (403 on /auth/v1/user, 400 on token refresh) — clear
      // it so the app lands on the login screen instead of half-working.
      // A request that got NO answer (offline, flaky network) proves nothing:
      // the session stays, and the SDK refreshes it when it can.
      const { error } = await supabase.auth.getUser()
      if (error && isDeadSessionError(error)) {
        console.warn('[auth] Stored session is no longer valid — clearing it:', error.message)
        askedToSignOut.current = true // our doing; the reason is given below
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
        askedToSignOut.current = false
        dropStoredSession()
        writeRecoveryFlag(false)
        setRecovery(false)
        setSession(null)
        setSessionEnded(true)
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Not a normal login: this session exists only so the user can set a
        // new password. App.jsx diverts every route to /reset-password while
        // this is true.
        recoveryEventSeen.current = true
        writeRecoveryFlag(true)
        setRecovery(true)
      } else if (event === 'SIGNED_OUT') {
        writeRecoveryFlag(false)
        setRecovery(false)
        if (!askedToSignOut.current && hadSession.current) setSessionEnded(true)
        askedToSignOut.current = false
      } else if (event === 'SIGNED_IN') {
        setSessionEnded(false)
      }
      hadSession.current = Boolean(newSession)
      noteUser(newSession?.user?.id)
      setSession(newSession)
    })
    // Keep other open tabs in step: a recovery started (or finished) in one
    // tab must lock (or release) the app in all of them, since they share
    // the session.
    const onStorage = (e) => {
      if (e.key === RECOVERY_KEY) setRecovery(e.newValue === '1')
    }
    window.addEventListener('storage', onStorage)
    return () => {
      sub.subscription.unsubscribe()
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  // Load the profile row when the signed-in USER changes. Keyed on the id,
  // not the session object: the SDK hands out a new session on every token
  // refresh and every time the tab regains focus, and reloading on each of
  // those put a full-screen spinner over the app and threw away whatever the
  // runner was typing.
  const userId = session?.user?.id ?? null
  useEffect(() => {
    let cancelled = false
    setProfileError(false)
    if (!userId) return
    setLoaded({ userId: null, profile: null })
    getProfile(userId)
      .then((p) => !cancelled && setLoaded({ userId, profile: p }))
      .catch((err) => {
        console.error('Failed to load profile:', err.message)
        if (!cancelled) setProfileError(true)
      })
    return () => {
      cancelled = true
    }
  }, [userId, profileAttempt])

  // Load the access alongside the profile, on the same key.
  useEffect(() => {
    let cancelled = false
    setAccessError(false)
    if (!userId) return
    setAccessState({ userId: null, access: null })
    // Straight back from Checkout, the webhook may not have arrived yet:
    // finishCheckout asks the server to read the session, then waits a moment.
    const sessionId = checkoutReturn()
    const load = sessionId === null ? fetchAccess() : finishCheckout(sessionId).finally(cleanCheckoutUrl)
    load
      .then((a) => !cancelled && setAccessState({ userId, access: a }))
      .catch((err) => {
        console.error('Failed to load access:', err.message)
        if (!cancelled) setAccessError(true)
      })
    return () => {
      cancelled = true
    }
  }, [userId, profileAttempt])

  const profileKnown = userId !== null && loaded.userId === userId
  const profile = profileKnown ? loaded.profile : null
  const accessKnown = userId !== null && accessState.userId === userId
  const access = accessKnown ? accessState.access : null
  // Waiting on the session, or on the profile and access of whoever is signed in.
  const loading =
    booting ||
    (userId !== null && !profileKnown && !profileError) ||
    (userId !== null && !accessKnown && !accessError)

  const refreshProfile = useCallback(async () => {
    if (!userId) return null
    const p = await getProfile(userId)
    setLoaded({ userId, profile: p })
    return p
  }, [userId])

  /**
   * Re-read the access, e.g. after a chat message (the count moved) or a
   * return from Stripe Checkout. Keeps the old value on screen meanwhile.
   */
  const refreshAccess = useCallback(async () => {
    if (!userId) return null
    const a = await fetchAccess()
    setAccessState({ userId, access: a })
    return a
  }, [userId])

  /** Try the profile and access reads again (the button on the "could not load" screen). */
  const retryProfile = useCallback(() => setProfileAttempt((n) => n + 1), [])

  /** Called once the new password is saved, so the app stops diverting. */
  const clearRecovery = useCallback(() => {
    writeRecoveryFlag(false)
    cleanRecoveryUrl()
    setRecovery(false)
  }, [])

  /**
   * The runner backed out of the reset. The recovery session must not
   * outlive the screen that justified it, so end it here (this device only —
   * backing out is not a reason to log them out everywhere).
   */
  const cancelRecovery = useCallback(async () => {
    askedToSignOut.current = true
    writeRecoveryFlag(false)
    cleanRecoveryUrl()
    const result = await signOutHere(supabase)
    if (!result.ok) dropStoredSession()
    setRecovery(false)
    if (!result.ok) window.location.replace('/auth')
  }, [])

  /**
   * Sign out of this browser. Other tabs follow (the SDK tells them); other
   * devices stay signed in.
   */
  const signOut = useCallback(async () => {
    askedToSignOut.current = true
    // Drop any in-progress onboarding draft so the next account on this
    // browser doesn't inherit it.
    dropOnboardingDraft()
    writeRecoveryFlag(false)
    cleanRecoveryUrl()
    setRecovery(false)
    const result = await signOutHere(supabase)
    if (!result.ok) {
      // The server could not be reached, and the SDK keeps the session when
      // that happens. Signing out must work offline too: forget the session
      // here and start clean.
      dropStoredSession()
      window.location.replace('/auth')
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        recovery,
        profileError,
        access,
        accessError,
        sessionEnded,
        retryProfile,
        refreshAccess,
        clearRecovery,
        cancelRecovery,
        refreshProfile,
        signOut,
      }}
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
