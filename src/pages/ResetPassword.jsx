import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../core/supabase'
import Spinner from '../components/Spinner'
import { t } from '../core/strings'
import { RESET_REDIRECT_PATH } from './Auth'

const MIN_LENGTH = 6

/**
 * Supabase error from updateUser → something a Slovenian runner can act on.
 * Matched on the stable `code` first; the message check covers older servers
 * that send only English text.
 */
function describeUpdateError(err) {
  const code = err?.code || ''
  const msg = err?.message || ''
  if (code === 'same_password' || /different from the old/i.test(msg)) return t.reset.samePassword
  if (code === 'weak_password' || /weak/i.test(msg)) return t.reset.weakPassword
  if (err?.name === 'AuthSessionMissingError' || code === 'session_not_found' || /session/i.test(msg)) {
    return t.reset.sessionGone
  }
  if (err?.status === 429 || /rate limit/i.test(msg)) return t.reset.rateLimited
  return t.reset.genericError
}

/**
 * Where the emailed recovery link lands.
 *
 * Supabase puts the recovery token in the URL fragment; the client parses it
 * (detectSessionInUrl), creates a session and fires PASSWORD_RECOVERY, which
 * AuthContext turns into a flag that routes the user here. So by the time
 * this renders there is normally a valid session — the user is technically
 * signed in, just not finished, and every other route bounces back here
 * until they either set a password or cancel (which ends the session).
 *
 * The link can also fail: expired, already used, or opened after a newer one
 * was sent. Supabase then returns an error in the URL instead of a session,
 * and this screen says so and lets the runner request a fresh link on the
 * spot rather than showing a form that cannot work.
 */
export default function ResetPassword() {
  const { session, clearRecovery, cancelRecovery, loading } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [linkFailed, setLinkFailed] = useState(false)

  // Request-a-new-link form, shown when the link did not work.
  const [email, setEmail] = useState('')
  const [resendInfo, setResendInfo] = useState('')
  const [resendError, setResendError] = useState('')

  // Supabase reports a bad link as error / error_code / error_description, in
  // the hash for the implicit flow and the query string for PKCE. Read both;
  // the English description is not shown, only the fact that it failed.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const query = new URLSearchParams(window.location.search)
    const code = hash.get('error_code') || query.get('error_code')
    const failed = code || hash.get('error') || query.get('error')
    if (failed) {
      console.warn('[reset] Recovery link rejected:', code, hash.get('error_description') || query.get('error_description'))
      setLinkFailed(true)
    }
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < MIN_LENGTH) {
      setError(t.reset.tooShort(MIN_LENGTH))
      return
    }
    if (password !== confirm) {
      setError(t.reset.mismatch)
      return
    }

    setBusy(true)
    try {
      const userEmail = session?.user?.email
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      // Swap the recovery session for an ordinary one by signing in with the
      // password just set — which also proves it works. If this fails the
      // password is still changed and the current session still valid, so
      // carry on rather than alarm the runner.
      if (userEmail) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: userEmail,
          password,
        })
        if (signInError) {
          console.warn('[reset] Password changed but re-login failed:', signInError.message)
        } else {
          // Revoke every other session: the recovery one, and anything still
          // signed in elsewhere on the old password. No event fires for this.
          await supabase.auth.signOut({ scope: 'others' }).catch(() => {})
        }
      }

      // Drop the recovery flag so the guards stop diverting, and let them in.
      clearRecovery()
      setDone(true)
      // A beat so the confirmation is actually readable.
      setTimeout(() => navigate('/', { replace: true }), 900)
    } catch (err) {
      setError(describeUpdateError(err))
      setBusy(false)
    }
  }

  const requestNewLink = async (e) => {
    e.preventDefault()
    setResendError('')
    setResendInfo('')
    setBusy(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${RESET_REDIRECT_PATH}`,
      })
      if (resetError) throw resetError
      // Same answer whether or not the address exists, as on the login page.
      setResendInfo(t.reset.newSent)
    } catch (err) {
      setResendError(err?.status === 429 || /rate limit/i.test(err?.message || '')
        ? t.reset.rateLimited
        : t.reset.genericError)
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    await cancelRecovery()
    navigate('/auth', { replace: true })
  }

  // `done` first: the re-login above reloads the profile, and the spinner
  // would otherwise hide the confirmation.
  if (loading && !done) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    )
  }

  // The link was rejected, or there is no session to change a password on.
  const brokenLink = !done && (linkFailed || !session)

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-10 text-center">
          <img src="/runko.svg" alt="" className="mx-auto mb-4 h-16 w-16" />
          <h1 className="text-3xl font-extrabold tracking-tight">
            {brokenLink ? t.reset.expiredTitle : t.reset.title}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {brokenLink ? t.reset.expiredSubtitle : t.reset.subtitle}
          </p>
        </div>

        {brokenLink ? (
          <form onSubmit={requestNewLink} className="card space-y-4">
            <p className="text-sm leading-relaxed text-zinc-400">{t.reset.expiredBody}</p>
            <div>
              <label className="label">{t.auth.email}</label>
              <input
                type="email"
                required
                autoComplete="email"
                className="input"
                placeholder={t.auth.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {resendError && <p className="text-sm text-rose-400">{resendError}</p>}
            {resendInfo && <p className="text-sm text-emerald-400">{resendInfo}</p>}

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? <Spinner className="h-5 w-5 text-white" /> : t.reset.requestNew}
            </button>

            <Link
              to="/auth"
              replace
              className="block pt-1 text-center text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-300"
            >
              {t.reset.backToLogin}
            </Link>
          </form>
        ) : done ? (
          <div className="card text-center">
            <p className="text-3xl">✅</p>
            <p className="mt-3 font-semibold">{t.reset.doneTitle}</p>
            <p className="mt-1 text-sm text-zinc-400">{t.reset.doneBody}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">{t.reset.newPassword}</label>
              <input
                type="password"
                required
                minLength={MIN_LENGTH}
                autoFocus
                autoComplete="new-password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="label">{t.reset.confirmPassword}</label>
              <input
                type="password"
                required
                minLength={MIN_LENGTH}
                autoComplete="new-password"
                className="input"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? <Spinner className="h-5 w-5 text-white" /> : t.reset.submit}
            </button>

            {/* Leaving must end the recovery session, not just the screen —
                a plain link to /auth would bounce straight back here. */}
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="block w-full pt-1 text-center text-xs text-zinc-600 underline underline-offset-4 hover:text-zinc-400"
            >
              {t.reset.cancel}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
